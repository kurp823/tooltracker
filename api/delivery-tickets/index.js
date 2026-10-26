'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

// Real tbl_DeliveryTickets columns (confirmed via INFORMATION_SCHEMA):
//   id, dtNumber, jobNumber, clientCode, deliveryDate, rig, well, poNumber,
//   clientRef, vehicleVessel, driverName, emdadRep, emdadSignDate,
//   clientSignedBy, clientSignDate, status, notes, attachmentRef,
//   createdBy, createdAt, updatedAt, calloutRef, lockStage, lockedAt, lockedBy
// Real tbl_DeliveryTicketLines columns:
//   id, dtNumber, itemNo, serial, toolDescription, qty, remarks
// (No AssetNo/Size/UnitRate/LineAmount/Condition columns on lines — those
// fields don't exist in this schema.)
//
// `serial` is used as the join key back to tbl_Inventory.SystemID — on
// create we store the tool's SystemID there (not its human AssetNo/Serial,
// which can be edited later), and on read we resolve the *live* AssetNo via
// a join so the displayed asset number always matches Inventory. Rows whose
// `serial` doesn't match any SystemID (manual/free-text/legacy entries)
// fall back to showing the raw stored value instead of nothing.
//
// SQL columns are aliased back to the PascalCase names the frontend already
// expects, so no frontend changes are needed.

/**
 * Undefined -> null (leave the column alone); '' -> '' (clear it deliberately).
 * Without this an omitted field and a cleared field look identical.
 */
const nz = (v) => (v === undefined ? null : v === '' ? '' : v)

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

/** The rig a delivery ticket is going to, used as the tool's location. */
async function rigOfTicket(ticketId) {
  try {
    const r = await query(
      'SELECT TOP 1 rig FROM tbl_DeliveryTickets WHERE id = @id',
      [{ name: 'id', value: ticketId }]
    )
    return (r.recordset[0] && r.recordset[0].rig) || null
  } catch {
    return null
  }
}

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const id    = context.bindingData.id
  const sub   = context.bindingData.sub
  const subId = context.bindingData.subId
  const method = req.method.toUpperCase()

  // ── /delivery-tickets/{id}/lines ────────────────────────────────────────
  // `id` here is the ticket's numeric id — lines are keyed by dtNumber, so
  // resolve id -> dtNumber first.
  if (id && sub === 'lines') {
    if (method === 'GET') {
      const result = await query(
        `SELECT l.id AS LineID, l.dtNumber AS DTID, l.itemNo AS LineNumber,
                l.serial AS SerialNumber, COALESCE(i.AssetNo, l.serial) AS AssetNo,
                l.toolDescription AS ToolDescription,
                l.qty AS Quantity, l.remarks AS Notes,
                i.[Size] AS SizeName,
                i.ShortDesc AS CategoryName,
                -- The sub-contractor's own name, never a generic label.
                CASE WHEN i.IsEmdad = 1 THEN 'EMDAD'
                     ELSE COALESCE(NULLIF(i.Ownership, ''), NULLIF(i.Supplier, '')) END AS Supplier,
                r.rtNumber AS RgtNo, r.receivingDate AS DateIn
           FROM tbl_DeliveryTicketLines l
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
           OUTER APPLY (
             -- The receiving ticket that brought this same tool back, so the
             -- grid can show RGT No / Date In against each dispatched line
             -- exactly as the printed ticket does.
             SELECT TOP 1 rh.rtNumber, rh.receivingDate
             FROM   tbl_ReceivingTicketLines rl
             JOIN   tbl_ReceivingTickets     rh ON rl.rtNumber = rh.rtNumber
             WHERE  rl.serial    = l.serial
               AND  rh.jobNumber = (SELECT jobNumber FROM tbl_DeliveryTickets WHERE id = @id)
             ORDER BY rh.receivingDate DESC
           ) r
          WHERE l.dtNumber = (SELECT dtNumber FROM tbl_DeliveryTickets WHERE id = @id)
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
        `INSERT INTO tbl_DeliveryTicketLines (dtNumber, itemNo, serial, toolDescription, qty, remarks)
         OUTPUT INSERTED.id
         VALUES (
           (SELECT dtNumber FROM tbl_DeliveryTickets WHERE id = @id),
           COALESCE((SELECT MAX(itemNo) FROM tbl_DeliveryTicketLines WHERE dtNumber=(SELECT dtNumber FROM tbl_DeliveryTickets WHERE id = @id)),0)+1,
           @serial, @desc, @qty, @notes
         )`,
        [
          { name: 'id',       value: Number(id) },
          { name: 'serial',   value: b.SystemID || b.Serial || null },
          { name: 'desc',     value: b.ToolDescription || null },
          { name: 'qty',      value: b.Quantity         || 1   },
          { name: 'notes',    value: b.Notes            || null },
        ]
      )

      // Dispatching a tool takes it out of the base catalogue. Nothing wrote
      // tbl_Inventory.Status before, so a tool sitting on a rig still read
      // 'Good' at Emdad Base and could be picked for a second job at the same
      // time. Location follows the ticket's rig so the catalogue says where
      // the tool actually is.
      await setInventoryStatus(
        b.SystemID || b.Serial,
        'On Rig',
        await rigOfTicket(Number(id))
      )

      return jsonResponse(context, 201, { LineID: r.recordset[0].id })
    }

    if (method === 'DELETE' && subId) {
      if (!['Admin','Operations'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })
      // Read the serial before deleting, so the tool can be put back in the
      // catalogue — removing a line from a ticket un-dispatches the tool, and
      // leaving it 'On Rig' would make it unpickable forever.
      const gone = await query(
        'SELECT TOP 1 serial FROM tbl_DeliveryTicketLines WHERE id = @lid',
        [{ name: 'lid', value: Number(subId) }]
      )
      await query('DELETE FROM tbl_DeliveryTicketLines WHERE id = @lid',
        [{ name: 'lid', value: Number(subId) }])

      const serial = gone.recordset[0] && gone.recordset[0].serial
      if (serial) {
        // Only undo our own 'On Rig' mark — never overwrite a DBR or a
        // workshop status someone set for a real reason.
        try {
          await query(
            `UPDATE tbl_Inventory
                SET Status = 'Good', Location = 'Emdad Base', LastUpdated = GETDATE()
              WHERE (SystemID = @k OR AssetNo = @k) AND Status = 'On Rig'`,
            [{ name: 'k', value: String(serial) }]
          )
        } catch { /* best-effort */ }
      }
      return jsonResponse(context, 200, { ok: true })
    }
  }

  // ── /delivery-tickets (list) ─────────────────────────────────────────────
  if (!id && method === 'GET') {
    const jobQ = String((req.query || {}).job || '').trim()
    const listParams = []
    let jobFilter = ''
    if (jobQ) {
      jobFilter = `WHERE TRY_CAST(RIGHT(d.jobNumber, CHARINDEX('-', REVERSE(d.jobNumber) + '-') - 1) AS INT) = @jobseq`
      listParams.push({ name: 'jobseq', value: Number(String(jobQ).replace(/.*-/, '')) || -1 })
    }
    const result = await query(
      `SELECT d.id AS DTID, d.dtNumber AS DTNumber, d.jobNumber AS JobID,
              d.deliveryDate AS DTDate, d.status AS Status,
              d.rig AS Rig, d.well AS Well, d.poNumber AS PONumber,
              d.createdAt AS CreatedDate, d.createdBy AS CreatedBy,
              COALESCE(c.clientName, NULLIF(d.clientCode, '')) AS Client,
              (SELECT COUNT(*) FROM tbl_DeliveryTicketLines WHERE dtNumber = d.dtNumber) AS LineCount
         FROM tbl_DeliveryTickets d
         LEFT JOIN tbl_Clients c ON d.clientCode = c.clientCode
        -- Newest first by delivery date; createdAt is NULL on the imported
        -- history, which DESC sorts last and pushed the real tickets down.
        -- ?job= filters server-side. The job file previously pulled every
        -- ticket in the table to find the handful on one job. Matched on the
        -- trailing sequence because job numbers are stored in two formats.
        ${jobFilter}
        ORDER BY d.deliveryDate DESC, d.dtNumber DESC`,
      listParams
    )
    return jsonResponse(context, 200, result.recordset)
  }

  // ── /delivery-tickets/:id (single) ───────────────────────────────────────
  if (id && !sub && method === 'GET') {
    const result = await query(
      `SELECT d.id AS DTID, d.dtNumber AS DTNumber, d.jobNumber AS JobID,
              d.clientCode AS ClientCode,
              d.deliveryDate AS DTDate, d.rig AS Rig, d.well AS Well,
              d.poNumber AS PONumber, d.clientRef AS ClientRef,
              d.calloutRef AS CalloutRef,
              d.vehicleVessel AS VehicleVessel, d.driverName AS DriverName,
              d.emdadRep AS EmdadRep, d.emdadSignDate AS EmdadSignDate,
              d.clientSignedBy AS ClientSignedBy, d.clientSignDate AS ClientSignDate,
              d.attachmentRef AS AttachmentRef, d.lockStage AS LockStage,
              d.status AS Status, d.notes AS Notes,
              d.createdAt AS CreatedDate, d.createdBy AS CreatedBy,
              d.updatedAt AS UpdatedDate,
              -- tbl_Clients covers only 4 of the 31 client names in use, so fall
              -- back to the stored code rather than showing an empty Customer.
              COALESCE(c.clientName, NULLIF(d.clientCode, '')) AS Client
         FROM tbl_DeliveryTickets d
         LEFT JOIN tbl_Clients c ON d.clientCode = c.clientCode
        WHERE d.id = @id`,
      [{ name: 'id', value: Number(id) }]
    )
    if (!result.recordset.length) return jsonResponse(context, 404, { error: 'Not found' })
    return jsonResponse(context, 200, result.recordset[0])
  }

  // ── POST /delivery-tickets (create) ─────────────────────────────────────
  if (!id && method === 'POST') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    if (!b.JobID) return jsonResponse(context, 400, { error: 'JobID required' })

    // Continue the single historic DT-NNNNN series (3,380 tickets up to
    // DT-03436). Only plain 5-digit numbers count towards the next sequence —
    // the 305 DT-DUMMY-* placeholders and the TEST rows are left untouched and
    // are deliberately excluded here so they can never shift the numbering.
    const lastRow = await query(
      `SELECT MAX(TRY_CAST(SUBSTRING(dtNumber, 4, 10) AS INT)) AS maxSeq
         FROM tbl_DeliveryTickets
        WHERE dtNumber LIKE 'DT-[0-9][0-9][0-9][0-9][0-9]'`, []
    )
    const seq = Number(lastRow.recordset[0]?.maxSeq || 0) + 1
    const DTNumber = `DT-${String(seq).padStart(5, '0')}`

    const r = await query(
      // Customer / rig / well / taskorder are carried over from the job, the
      // way the old ticket screen pre-fills them — they are properties of the
      // job, not things to retype per ticket.
      // Status starts blank: 'Draft' appears nowhere in the 3,700 real tickets
      // (only 'Signed' and 'Closed' do), so inventing it put every new ticket
      // into a state the rest of the system doesn't recognise.
      `INSERT INTO tbl_DeliveryTickets
         (dtNumber, jobNumber, clientCode, deliveryDate, rig, well, poNumber,
          status, notes, createdBy, createdAt)
       OUTPUT INSERTED.id
       SELECT @num, @job,
              COALESCE(j.Client, ''), @date,
              j.Rig, j.Well, j.PONumber,
              '', @notes, @by, GETDATE()
         -- LEFT JOIN, not a subquery in FROM: an unmatched job must still
         -- create the ticket with blank carry-over, not silently insert nothing.
         FROM   (SELECT 1 AS one) seed
         LEFT JOIN tbl_Jobs j ON j.JobID = @job`,
      [
        { name: 'num',   value: DTNumber },
        { name: 'job',   value: b.JobID  },
        { name: 'date',  value: b.DTDate || new Date().toISOString().split('T')[0] },
        { name: 'notes', value: b.Notes || null },
        { name: 'by',    value: user.Username },
      ]
    )
    return jsonResponse(context, 201, { DTID: r.recordset[0].id, DTNumber })
  }

  // ── PUT /delivery-tickets/:id (update) ──────────────────────────────────
  if (id && !sub && method === 'PUT') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })
    const b = req.body
    await query(
      // Every editable column on the ticket, not just the three the first cut
      // wrote. Rig, well, PO/taskorder, client ref, vehicle/vessel, driver and
      // the two signature blocks are all real columns and all appear on the
      // printed ticket, so the screen has to be able to write them.
      // COALESCE(@x, col) leaves a field untouched when the caller omits it,
      // so a partial save can't blank the rest of the ticket.
      `UPDATE tbl_DeliveryTickets
          SET deliveryDate   = COALESCE(@date, deliveryDate),
              rig            = COALESCE(@rig, rig),
              well           = COALESCE(@well, well),
              poNumber       = COALESCE(@po, poNumber),
              clientRef      = COALESCE(@cref, clientRef),
              calloutRef     = COALESCE(@callout, calloutRef),
              vehicleVessel  = COALESCE(@veh, vehicleVessel),
              driverName     = COALESCE(@driver, driverName),
              emdadRep       = COALESCE(@rep, emdadRep),
              emdadSignDate  = COALESCE(@repdate, emdadSignDate),
              clientSignedBy = COALESCE(@csb, clientSignedBy),
              clientSignDate = COALESCE(@csd, clientSignDate),
              status         = COALESCE(@status, status),
              notes          = COALESCE(@notes, notes),
              updatedAt      = GETDATE()
        WHERE id = @id`,
      [
        { name: 'id',      value: Number(id) },
        { name: 'date',    value: nz(b.DTDate) },
        { name: 'rig',     value: nz(b.Rig) },
        { name: 'well',    value: nz(b.Well) },
        { name: 'po',      value: nz(b.PONumber) },
        { name: 'cref',    value: nz(b.ClientRef) },
        { name: 'callout', value: nz(b.CalloutRef) },
        { name: 'veh',     value: nz(b.VehicleVessel) },
        { name: 'driver',  value: nz(b.DriverName) },
        { name: 'rep',     value: nz(b.EmdadRep) },
        { name: 'repdate', value: nz(b.EmdadSignDate) },
        { name: 'csb',     value: nz(b.ClientSignedBy) },
        { name: 'csd',     value: nz(b.ClientSignDate) },
        { name: 'status',  value: b.Status === undefined ? null : String(b.Status) },
        { name: 'notes',   value: b.Notes === undefined ? null : String(b.Notes) },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
