'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

// Real tbl_ReceivingTickets columns (confirmed via INFORMATION_SCHEMA):
//   id, rtNumber, jobNumber, linkedDtNumber, clientCode, receivingDate,
//   rig, well, manifestNumber, clientRef, vehicleVessel, emdadRep,
//   emdadSignDate, clientSignedBy, clientSignDate, status, notes,
//   attachmentRef, createdBy, createdAt, updatedAt, lockStage, lockedAt, lockedBy
// Real tbl_ReceivingTicketLines columns:
//   id, rtNumber, itemNo, serial, toolDescription, qty, usedStatus,
//   condition, remarks, routedTo, routedAt, routedBy
//
// `serial` is used as the join key back to tbl_Inventory.SystemID — on
// create we store the tool's SystemID there, and on read we resolve the
// live AssetNo via a join (same pattern as delivery-tickets lines).

/** Undefined -> null (leave the column alone); '' -> '' (clear it). */
const nz = (v) => (v === undefined ? null : v === '' ? '' : v)

/**
 * The old app's rule, taken from JobDossierView.tsx verbatim: the condition a
 * tool comes back in decides where it goes, so the receiving clerk sets one
 * value and the routing follows. There is no separate routing decision.
 *
 *   USED     -> condition 'Inspection',    routedTo 'Inspection Bay'
 *   NOT USED -> condition 'Available',     routedTo 'Available Inventory'
 *   LIH      -> condition 'Lost in Hole',  routedTo 'Lost in Hole'
 */
const USED_STATES = ['USED', 'NOT USED', 'LIH']

function routeFor(usedStatus) {
  const u = String(usedStatus || '').trim().toUpperCase()
  if (u === 'LIH') {
    // Lost in hole: the tool is gone. It does not come back to base and must
    // leave the available catalogue entirely, or it stays pickable forever.
    return { condition: 'Lost in Hole', routedTo: 'Lost in Hole', invStatus: 'Lost in Hole', location: null }
  }
  if (u === 'USED') {
    return { condition: 'Inspection', routedTo: 'Inspection Bay', invStatus: 'Inspection', location: 'Emdad Base' }
  }
  return { condition: 'Available', routedTo: 'Available Inventory', invStatus: 'Good', location: 'Emdad Base' }
}

/**
 * Where a returned tool is routed decides the status it carries in inventory.
 * Anything needing a workshop step is NOT 'Good', so it shows on the tool
 * picker as needing attention rather than as ready to mobilise.
 */
function routedStatus(routedTo) {
  const r = String(routedTo || '').trim().toLowerCase()
  if (!r || r.includes('available') || r.includes('inventory')) return 'Good'
  if (r.includes('inspection')) return 'Inspection'
  if (r.includes('workshop') || r.includes('repair') || r.includes('redress')) return 'Maintenance'
  if (r.includes('scrap') || r.includes('dbr')) return 'DBR'
  return 'Good'
}

/**
 * Set a tool's status/location by whichever key the ticket line carries.
 * Ticket lines hold the AssetNo about as often as the SystemID, so match on
 * either. Best-effort: a ticket line must still save if this fails.
 */
async function setInventoryStatus(key, status, location) {
  const k = String(key || '').trim()
  if (!k) return
  try {
    await query(
      `UPDATE tbl_Inventory
          SET Status = @status,
              Location = COALESCE(@loc, Location),
              LastUpdated = GETDATE()
        WHERE SystemID = @k OR AssetNo = @k`,
      [
        { name: 'k',      value: k },
        { name: 'status', value: status },
        { name: 'loc',    value: location || null },
      ]
    )
  } catch (err) {
    // Deliberately swallowed — never fail the ticket over the status mirror.
  }
}

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const id    = context.bindingData.id
  const sub   = context.bindingData.sub
  const subId = context.bindingData.subId
  const method = req.method.toUpperCase()

  // ── /receiving-tickets/{id}/lines ───────────────────────────────────────
  if (id && sub === 'lines') {
    if (method === 'GET') {
      const result = await query(
        `SELECT l.id AS LineID, l.rtNumber AS RTID, l.itemNo AS LineNumber,
                l.serial AS SerialNumber, COALESCE(i.AssetNo, l.serial) AS AssetNo,
                l.toolDescription AS ToolDescription,
                l.qty AS Quantity, l.condition AS Condition,
                l.usedStatus AS UsedStatus, l.routedTo AS RoutedTo, l.remarks AS Notes,
                i.[Size] AS SizeName,
                i.ShortDesc AS CategoryName,
                -- The sub-contractor's own name, never a generic label.
                CASE WHEN i.IsEmdad = 1 THEN 'EMDAD'
                     ELSE COALESCE(NULLIF(i.Ownership, ''), NULLIF(i.Supplier, '')) END AS Supplier
           FROM tbl_ReceivingTicketLines l
           OUTER APPLY (
             -- 'serial' on ticket lines mostly holds the ASSET NUMBER, not the
             -- SystemID (inventory: SystemID 'EMD-5794' / AssetNo 'STB578-01';
             -- line serials read 'STB578-09'). Joining on SystemID alone missed
             -- ~72% of lines. Match any key, prefer SystemID, take one row.
             SELECT TOP 1 i2.AssetNo, i2.ShortDesc, i2.[Size], i2.IsEmdad,
                          i2.Supplier, i2.Ownership
             FROM   tbl_Inventory i2
             WHERE  i2.SystemID = l.serial
                OR  i2.AssetNo  = l.serial
                OR  NULLIF(i2.OEMSerial, '') = l.serial
             ORDER BY CASE WHEN i2.SystemID = l.serial THEN 0
                           WHEN i2.AssetNo  = l.serial THEN 1
                           ELSE 2 END
           ) i
          WHERE l.rtNumber = (SELECT rtNumber FROM tbl_ReceivingTickets WHERE id = @id)
          ORDER BY l.itemNo`,
        [{ name: 'id', value: Number(id) }]
      )
      return jsonResponse(context, 200, result.recordset)
    }

    if (method === 'POST') {
      if (!['Admin','Operations'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })
      const b = req.body
      const r = await query(
        `INSERT INTO tbl_ReceivingTicketLines (rtNumber, itemNo, serial, toolDescription, qty, condition, usedStatus, remarks)
         OUTPUT INSERTED.id
         VALUES (
           (SELECT rtNumber FROM tbl_ReceivingTickets WHERE id = @id),
           COALESCE((SELECT MAX(itemNo) FROM tbl_ReceivingTicketLines WHERE rtNumber=(SELECT rtNumber FROM tbl_ReceivingTickets WHERE id = @id)),0)+1,
           @serial, @desc, @qty, @cond, @used, @notes
         )`,
        [
          { name: 'id',     value: Number(id) },
          { name: 'serial', value: b.SystemID || b.Serial || null },
          { name: 'desc',   value: b.ToolDescription || null },
          { name: 'qty',    value: b.Quantity         || 1   },
          { name: 'cond',   value: b.Condition        || null },
          { name: 'used',   value: b.UsedStatus       || null },
          { name: 'notes',  value: b.Notes            || null },
        ]
      )

      // Bring the tool back into inventory with the status its routing implies.
      // Nothing wrote tbl_Inventory.Status before, so a tool sent to the
      // inspection bay still read 'Good' in the catalogue and a tool out on a
      // rig did too — which is why the only statuses in 5,094 rows were 'Good'
      // and 'DBR', and why the tool picker could not show where anything was.
      await setInventoryStatus(b.SystemID || b.Serial, routedStatus(b.RoutedTo), 'Emdad Base')

      return jsonResponse(context, 201, { LineID: r.recordset[0].id })
    }

    // PUT /receiving-tickets/{id}/lines/{lineId} — set USED / NOT USED / LIH.
    // Condition, routing and the tool's inventory status all follow from it.
    if (method === 'PUT' && subId) {
      if (!['Admin','Operations'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })

      const b = req.body || {}
      const used = String(b.UsedStatus || '').trim().toUpperCase()
      if (!USED_STATES.includes(used))
        return jsonResponse(context, 400, { error: `UsedStatus must be one of ${USED_STATES.join(', ')}` })

      const route = routeFor(used)
      const r = await query(
        `UPDATE tbl_ReceivingTicketLines
            SET usedStatus = @used,
                condition  = @cond,
                routedTo   = @routed,
                routedAt   = GETDATE(),
                routedBy   = @by,
                remarks    = COALESCE(@notes, remarks)
          OUTPUT INSERTED.serial
          WHERE id = @lid`,
        [
          { name: 'lid',    value: Number(subId) },
          { name: 'used',   value: used === 'LIH' ? 'LIH' : (used === 'USED' ? 'Used' : 'Not Used') },
          { name: 'cond',   value: route.condition },
          { name: 'routed', value: route.routedTo },
          { name: 'by',     value: user.Username },
          { name: 'notes',  value: b.Notes === undefined ? null : String(b.Notes) },
        ]
      )
      const serial = r.recordset[0] && r.recordset[0].serial
      if (serial) await setInventoryStatus(serial, route.invStatus, route.location)

      return jsonResponse(context, 200, { ok: true, ...route })
    }

    if (method === 'DELETE' && subId) {
      if (!['Admin','Operations'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })
      await query('DELETE FROM tbl_ReceivingTicketLines WHERE id = @lid',
        [{ name: 'lid', value: Number(subId) }])
      return jsonResponse(context, 200, { ok: true })
    }
  }

  /*
   * GET /receiving-tickets/{id}/pending
   *   Equipment dispatched on this ticket's job and not yet on ANY receiving
   *   ticket — the backload pool the clerk ticks from. Mirrors the old app's
   *   `unreturnedDTs` / `rgtDTToolsToReturn`: lines of the job's delivery
   *   tickets minus anything already received.
   */
  if (id && sub === 'pending' && method === 'GET') {
    try {
      const result = await query(
        `DECLARE @job NVARCHAR(50) = (SELECT TOP 1 jobNumber FROM tbl_ReceivingTickets WHERE id = @id);
         DECLARE @seq INT = TRY_CAST(RIGHT(@job, CHARINDEX('-', REVERSE(@job) + '-') - 1) AS INT);

         SELECT dt.dtNumber        AS TicketNo,
                dt.deliveryDate    AS DateOut,
                dtl.itemNo         AS ItemNo,
                dtl.serial         AS Serial,
                COALESCE(NULLIF(i.AssetNo, ''), dtl.serial) AS AssetNo,
                COALESCE(NULLIF(dtl.toolDescription, ''), i.ShortDesc) AS Description,
                i.[Size]           AS [Size],
                dtl.qty            AS Qty
           FROM tbl_DeliveryTickets     dt
           JOIN tbl_DeliveryTicketLines dtl ON dtl.dtNumber = dt.dtNumber
           OUTER APPLY (
             SELECT TOP 1 a.AssetNo, a.ShortDesc, a.[Size]
               FROM tbl_Inventory a
              WHERE a.SystemID = dtl.serial OR a.AssetNo = dtl.serial
              ORDER BY CASE WHEN a.SystemID = dtl.serial THEN 0 ELSE 1 END
           ) i
          WHERE TRY_CAST(RIGHT(dt.jobNumber, CHARINDEX('-', REVERSE(dt.jobNumber) + '-') - 1) AS INT) = @seq
            -- Already received on any RT for this job, matched on serial.
            AND NOT EXISTS (
              SELECT 1
                FROM tbl_ReceivingTicketLines rl
                JOIN tbl_ReceivingTickets     rh ON rh.rtNumber = rl.rtNumber
               WHERE rl.serial = dtl.serial
                 AND TRY_CAST(RIGHT(rh.jobNumber, CHARINDEX('-', REVERSE(rh.jobNumber) + '-') - 1) AS INT) = @seq
            )
          ORDER BY dt.dtNumber, dtl.itemNo`,
        [{ name: 'id', value: Number(id) }]
      )
      return jsonResponse(context, 200, result.recordset)
    } catch (err) {
      context.log.error('Pending returns error:', err)
      return jsonResponse(context, 500, { error: 'Failed to load pending returns', detail: err.message })
    }
  }

  /*
   * POST /receiving-tickets/{id}/receive
   *   Move the ticked tools onto this ticket in one call. The old flow receives
   *   whole manifests — 274 lines on RT-03170 — and one request per line would
   *   be 274 round trips.
   *   Body: { serials: [..], dateIn?, dtNumber? }
   *   Lines land as 'Not Used' (back to inventory); the clerk then marks the
   *   ones that were used, which routes those to inspection.
   */
  if (id && sub === 'receive' && method === 'POST') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body || {}
    const serials = Array.isArray(b.serials) ? b.serials.filter(Boolean) : []
    if (!serials.length) return jsonResponse(context, 400, { error: 'No tools selected' })
    if (serials.length > 500) return jsonResponse(context, 400, { error: 'Too many tools in one call (max 500)' })

    try {
      const route = routeFor('NOT USED')
      // One statement, one pass: pull description/qty from the dispatch line so
      // the RT mirrors what actually went out.
      const list = serials.map((s, idx) => ({ name: `s${idx}`, value: String(s) }))
      const names = list.map(p => `@${p.name}`).join(', ')

      const r = await query(
        `DECLARE @rt NVARCHAR(50) = (SELECT TOP 1 rtNumber FROM tbl_ReceivingTickets WHERE id = @id);
         DECLARE @next INT = COALESCE((SELECT MAX(itemNo) FROM tbl_ReceivingTicketLines WHERE rtNumber = @rt), 0);

         INSERT INTO tbl_ReceivingTicketLines
           (rtNumber, itemNo, serial, toolDescription, qty, condition, usedStatus, routedTo, routedAt, routedBy)
         OUTPUT INSERTED.id
         SELECT @rt,
                @next + ROW_NUMBER() OVER (ORDER BY src.serial),
                src.serial, src.descr, src.qty,
                @cond, @used, @routed, GETDATE(), @by
           FROM (
             SELECT DISTINCT dtl.serial,
                    MAX(dtl.toolDescription) AS descr,
                    MAX(COALESCE(dtl.qty, 1)) AS qty
               FROM tbl_DeliveryTicketLines dtl
              WHERE dtl.serial IN (${names})
              GROUP BY dtl.serial
           ) src
          WHERE NOT EXISTS (
            SELECT 1 FROM tbl_ReceivingTicketLines x
             WHERE x.rtNumber = @rt AND x.serial = src.serial
          )`,
        [
          { name: 'id',     value: Number(id) },
          { name: 'cond',   value: route.condition },
          { name: 'used',   value: 'Not Used' },
          { name: 'routed', value: route.routedTo },
          { name: 'by',     value: user.Username },
          ...list,
        ]
      )

      // Put each one back in the catalogue as available; marking it USED later
      // moves it to inspection.
      for (const s of serials) await setInventoryStatus(s, route.invStatus, route.location)

      if (b.dateIn) {
        await query('UPDATE tbl_ReceivingTickets SET receivingDate = @d, updatedAt = GETDATE() WHERE id = @id',
          [{ name: 'id', value: Number(id) }, { name: 'd', value: b.dateIn }])
      }
      if (b.dtNumber) {
        await query(
          `UPDATE tbl_ReceivingTickets
              SET linkedDtNumber = COALESCE(NULLIF(linkedDtNumber, ''), @dt), updatedAt = GETDATE()
            WHERE id = @id`,
          [{ name: 'id', value: Number(id) }, { name: 'dt', value: b.dtNumber }]
        )
      }

      return jsonResponse(context, 201, { received: r.recordset.length })
    } catch (err) {
      context.log.error('Receive error:', err)
      return jsonResponse(context, 500, { error: 'Failed to receive tools', detail: err.message })
    }
  }

  /*
   * POST /receiving-tickets/{id}/lock — confirm the manifest.
   * tbl_ReceivingTickets already carries lockStage/lockedAt/lockedBy and
   * nothing used them, so a ticket could be edited forever after signing.
   */
  if (id && sub === 'lock' && method === 'POST') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })
    try {
      const unmarked = await query(
        `SELECT COUNT(*) AS n
           FROM tbl_ReceivingTicketLines
          WHERE rtNumber = (SELECT TOP 1 rtNumber FROM tbl_ReceivingTickets WHERE id = @id)
            AND NULLIF(LTRIM(RTRIM(usedStatus)), '') IS NULL`,
        [{ name: 'id', value: Number(id) }]
      )
      if (Number(unmarked.recordset[0]?.n || 0) > 0) {
        return jsonResponse(context, 409, {
          error: `${unmarked.recordset[0].n} line(s) have no usage marked yet`,
        })
      }
      await query(
        `UPDATE tbl_ReceivingTickets
            SET lockStage = 'Processed', status = 'Processed',
                lockedAt = GETDATE(), lockedBy = @by, updatedAt = GETDATE()
          WHERE id = @id`,
        [{ name: 'id', value: Number(id) }, { name: 'by', value: user.Username }]
      )
      return jsonResponse(context, 200, { ok: true, lockStage: 'Processed' })
    } catch (err) {
      context.log.error('RT lock error:', err)
      return jsonResponse(context, 500, { error: 'Failed to lock ticket', detail: err.message })
    }
  }

  // ── GET list ─────────────────────────────────────────────────────────────
  if (!id && method === 'GET') {
    const jobQ = String((req.query || {}).job || '').trim()
    const listParams = []
    let jobFilter = ''
    if (jobQ) {
      jobFilter = `WHERE TRY_CAST(RIGHT(r.jobNumber, CHARINDEX('-', REVERSE(r.jobNumber) + '-') - 1) AS INT) = @jobseq`
      listParams.push({ name: 'jobseq', value: Number(String(jobQ).replace(/.*-/, '')) || -1 })
    }
    const result = await query(
      `SELECT r.id AS RTID, r.rtNumber AS RTNumber, r.jobNumber AS JobID,
              r.receivingDate AS RTDate, r.status AS Status,
              r.rig AS Rig, r.well AS Well, r.manifestNumber AS ManifestNumber,
              r.linkedDtNumber AS LinkedDT,
              r.createdAt AS CreatedDate, r.createdBy AS CreatedBy,
              COALESCE(c.clientName, NULLIF(r.clientCode, '')) AS Client,
              (SELECT COUNT(*) FROM tbl_ReceivingTicketLines WHERE rtNumber = r.rtNumber) AS LineCount
         FROM tbl_ReceivingTickets r
         LEFT JOIN tbl_Clients c ON r.clientCode = c.clientCode
        -- Newest first by receiving date; createdAt is NULL on imported history.
        -- ?job= filters server-side. The job file previously pulled every
        -- ticket in the table to find the handful on one job. Matched on the
        -- trailing sequence because job numbers are stored in two formats.
        ${jobFilter}
        ORDER BY r.receivingDate DESC, r.rtNumber DESC`,
      listParams
    )
    return jsonResponse(context, 200, result.recordset)
  }

  // ── GET single ───────────────────────────────────────────────────────────
  if (id && !sub && method === 'GET') {
    const result = await query(
      `SELECT r.id AS RTID, r.rtNumber AS RTNumber, r.jobNumber AS JobID,
              r.receivingDate AS RTDate, r.rig AS Rig, r.well AS Well,
              r.linkedDtNumber AS LinkedDT, r.manifestNumber AS ManifestNumber,
              r.clientCode AS ClientCode, r.clientRef AS ClientRef,
              r.vehicleVessel AS VehicleVessel,
              r.emdadRep AS EmdadRep, r.emdadSignDate AS EmdadSignDate,
              r.clientSignedBy AS ClientSignedBy, r.clientSignDate AS ClientSignDate,
              r.attachmentRef AS AttachmentRef, r.lockStage AS LockStage,
              r.status AS Status, r.notes AS Notes,
              r.createdAt AS CreatedDate, r.createdBy AS CreatedBy,
              r.updatedAt AS UpdatedDate,
              COALESCE(c.clientName, NULLIF(r.clientCode, '')) AS Client
         FROM tbl_ReceivingTickets r
         LEFT JOIN tbl_Clients c ON r.clientCode = c.clientCode
        WHERE r.id = @id`,
      [{ name: 'id', value: Number(id) }]
    )
    if (!result.recordset.length) return jsonResponse(context, 404, { error: 'Not found' })
    return jsonResponse(context, 200, result.recordset[0])
  }

  // ── POST create ──────────────────────────────────────────────────────────
  if (!id && method === 'POST') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    if (!b.JobID) return jsonResponse(context, 400, { error: 'JobID required' })

    // Continue the single historic RT-NNNNN series. Only plain 5-digit numbers
    // count towards the next sequence; placeholder and TEST rows are left as
    // they are and excluded here so they can never shift the numbering.
    const lastRow = await query(
      `SELECT MAX(TRY_CAST(SUBSTRING(rtNumber, 4, 10) AS INT)) AS maxSeq
         FROM tbl_ReceivingTickets
        WHERE rtNumber LIKE 'RT-[0-9][0-9][0-9][0-9][0-9]'`, []
    )
    const seq = Number(lastRow.recordset[0]?.maxSeq || 0) + 1
    const RTNumber = `RT-${String(seq).padStart(5, '0')}`

    const r = await query(
      // Customer / rig / well carried over from the job, as the old screen
      // pre-filled them. Status starts blank: 'Draft' appears nowhere in the
      // 3,451 real tickets (only 'Processed' and 'Closed' do).
      `INSERT INTO tbl_ReceivingTickets
         (rtNumber, jobNumber, linkedDtNumber, clientCode, receivingDate,
          rig, well, status, notes, createdBy, createdAt)
       OUTPUT INSERTED.id
       SELECT @num, @job, @linkdt, COALESCE(j.Client, ''), @date,
              j.Rig, j.Well, '', @notes, @by, GETDATE()
         FROM   (SELECT 1 AS one) seed
         LEFT JOIN tbl_Jobs j ON j.JobID = @job`,
      [
        { name: 'num',    value: RTNumber },
        { name: 'job',    value: b.JobID  },
        { name: 'linkdt', value: b.LinkedDT || null },
        { name: 'date',   value: b.RTDate || new Date().toISOString().split('T')[0] },
        { name: 'notes',  value: b.Notes || null },
        { name: 'by',     value: user.Username },
      ]
    )
    return jsonResponse(context, 201, { RTID: r.recordset[0].id, RTNumber })
  }

  // ── PUT update ───────────────────────────────────────────────────────────
  if (id && !sub && method === 'PUT') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })
    const b = req.body
    await query(
      // Every editable column, not just three. COALESCE(@x, col) leaves a
      // field untouched when the caller omits it, so a partial save can't
      // blank the rest of the ticket.
      `UPDATE tbl_ReceivingTickets
          SET receivingDate  = COALESCE(@date, receivingDate),
              linkedDtNumber = COALESCE(@linkdt, linkedDtNumber),
              rig            = COALESCE(@rig, rig),
              well           = COALESCE(@well, well),
              manifestNumber = COALESCE(@manifest, manifestNumber),
              clientRef      = COALESCE(@cref, clientRef),
              vehicleVessel  = COALESCE(@veh, vehicleVessel),
              emdadRep       = COALESCE(@rep, emdadRep),
              emdadSignDate  = COALESCE(@repdate, emdadSignDate),
              clientSignedBy = COALESCE(@csb, clientSignedBy),
              clientSignDate = COALESCE(@csd, clientSignDate),
              status         = COALESCE(@status, status),
              notes          = COALESCE(@notes, notes),
              updatedAt      = GETDATE()
        WHERE id = @id`,
      [
        { name: 'id',       value: Number(id) },
        { name: 'date',     value: nz(b.RTDate) },
        { name: 'linkdt',   value: nz(b.LinkedDT) },
        { name: 'rig',      value: nz(b.Rig) },
        { name: 'well',     value: nz(b.Well) },
        { name: 'manifest', value: nz(b.ManifestNumber) },
        { name: 'cref',     value: nz(b.ClientRef) },
        { name: 'veh',      value: nz(b.VehicleVessel) },
        { name: 'rep',      value: nz(b.EmdadRep) },
        { name: 'repdate',  value: nz(b.EmdadSignDate) },
        { name: 'csb',      value: nz(b.ClientSignedBy) },
        { name: 'csd',      value: nz(b.ClientSignDate) },
        { name: 'status',   value: b.Status === undefined ? null : String(b.Status) },
        { name: 'notes',    value: b.Notes  === undefined ? null : String(b.Notes) },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
