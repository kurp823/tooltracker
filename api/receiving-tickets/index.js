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
      return jsonResponse(context, 201, { LineID: r.recordset[0].id })
    }

    if (method === 'DELETE' && subId) {
      if (!['Admin','Operations'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })
      await query('DELETE FROM tbl_ReceivingTicketLines WHERE id = @lid',
        [{ name: 'lid', value: Number(subId) }])
      return jsonResponse(context, 200, { ok: true })
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
