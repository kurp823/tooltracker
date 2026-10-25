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
                l.serial AS SerialNumber, l.toolDescription AS ToolDescription,
                l.qty AS Quantity, l.condition AS Condition,
                l.usedStatus AS UsedStatus, l.routedTo AS RoutedTo, l.remarks AS Notes
           FROM tbl_ReceivingTicketLines l
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
          { name: 'serial', value: b.Serial          || null },
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
    const result = await query(
      `SELECT r.id AS RTID, r.rtNumber AS RTNumber, r.jobNumber AS JobID,
              r.receivingDate AS RTDate, r.status AS Status,
              r.createdAt AS CreatedDate, r.createdBy AS CreatedBy,
              c.clientName AS Client,
              (SELECT COUNT(*) FROM tbl_ReceivingTicketLines WHERE rtNumber = r.rtNumber) AS LineCount
         FROM tbl_ReceivingTickets r
         LEFT JOIN tbl_Clients c ON r.clientCode = c.clientCode
        ORDER BY r.createdAt DESC`,
      []
    )
    return jsonResponse(context, 200, result.recordset)
  }

  // ── GET single ───────────────────────────────────────────────────────────
  if (id && !sub && method === 'GET') {
    const result = await query(
      `SELECT r.id AS RTID, r.rtNumber AS RTNumber, r.jobNumber AS JobID,
              r.receivingDate AS RTDate, r.rig AS Rig, r.well AS Well,
              r.linkedDtNumber AS LinkedDT, r.manifestNumber AS ManifestNumber,
              r.status AS Status, r.notes AS Notes,
              r.createdAt AS CreatedDate, r.createdBy AS CreatedBy,
              r.updatedAt AS UpdatedDate,
              c.clientName AS Client
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

    const yr = new Date().getFullYear()
    const lastRow = await query(
      `SELECT TOP 1 rtNumber FROM tbl_ReceivingTickets
        WHERE rtNumber LIKE 'RT-${yr}-%'
        ORDER BY rtNumber DESC`, []
    )
    let seq = 1
    if (lastRow.recordset.length) {
      const parts = lastRow.recordset[0].rtNumber.split('-')
      seq = parseInt(parts[parts.length - 1], 10) + 1
    }
    const RTNumber = `RT-${yr}-${String(seq).padStart(5, '0')}`

    const r = await query(
      `INSERT INTO tbl_ReceivingTickets (rtNumber, jobNumber, receivingDate, status, notes, createdBy, createdAt)
       OUTPUT INSERTED.id
       VALUES (@num, @job, @date, 'Draft', @notes, @by, GETDATE())`,
      [
        { name: 'num',   value: RTNumber },
        { name: 'job',   value: b.JobID  },
        { name: 'date',  value: b.RTDate || new Date().toISOString().split('T')[0] },
        { name: 'notes', value: b.Notes || null },
        { name: 'by',    value: user.Username },
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
      `UPDATE tbl_ReceivingTickets
          SET receivingDate = @date, status = @status, notes = @notes, updatedAt = GETDATE()
        WHERE id = @id`,
      [
        { name: 'id',     value: Number(id) },
        { name: 'date',   value: b.RTDate   || null },
        { name: 'status', value: b.Status   || null },
        { name: 'notes',  value: b.Notes    || null },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
