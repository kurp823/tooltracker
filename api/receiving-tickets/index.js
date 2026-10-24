'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

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
      // Freeform fields stored directly in the line row (same pattern as DT lines)
      const rows = await query(
        `SELECT l.LineID, l.RTID, l.LineNumber,
                l.SerialNumber, l.AssetNo, l.ToolDescription, l.Size AS SizeName,
                l.Quantity, l.Condition, l.UsedStatus, l.RoutedTo, l.Notes
           FROM tbl_ReceivingTicketLines l
          WHERE l.RTID = @id
          ORDER BY l.LineNumber`,
        [{ name: 'id', value: Number(id) }]
      )
      return jsonResponse(context, 200, rows)
    }

    if (method === 'POST') {
      if (!['Admin','Operations'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })
      const b = req.body
      const r = await query(
        `INSERT INTO tbl_ReceivingTicketLines
           (RTID, LineNumber, SerialNumber, AssetNo, ToolDescription, Size, Quantity, Condition, UsedStatus, Notes)
         OUTPUT INSERTED.LineID
         VALUES (
           @rtid,
           COALESCE((SELECT MAX(LineNumber) FROM tbl_ReceivingTicketLines WHERE RTID=@rtid),0)+1,
           @serial, @asset, @desc, @size, @qty, @cond, @used, @notes
         )`,
        [
          { name: 'rtid',   value: Number(id)            },
          { name: 'serial', value: b.Serial         || null },
          { name: 'asset',  value: b.AssetNo        || null },
          { name: 'desc',   value: b.ToolDescription|| null },
          { name: 'size',   value: b.SizeName       || null },
          { name: 'qty',    value: b.Quantity        || 1   },
          { name: 'cond',   value: b.Condition      || null },
          { name: 'used',   value: b.UsedStatus     || null },
          { name: 'notes',  value: b.Notes          || null },
        ]
      )
      return jsonResponse(context, 201, { LineID: r[0].LineID })
    }

    if (method === 'DELETE' && subId) {
      if (!['Admin','Operations'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })
      await query('DELETE FROM tbl_ReceivingTicketLines WHERE LineID = @lid',
        [{ name: 'lid', value: Number(subId) }])
      return jsonResponse(context, 200, { ok: true })
    }
  }

  // ── GET list ─────────────────────────────────────────────────────────────
  if (!id && method === 'GET') {
    const rows = await query(
      `SELECT r.RTID, r.RTNumber, r.JobID, r.RTDate, r.Status,
              r.CreatedDate, r.CreatedBy,
              c.ClientName AS Client,
              (SELECT COUNT(*) FROM tbl_ReceivingTicketLines WHERE RTID = r.RTID) AS LineCount
         FROM tbl_ReceivingTickets r
         LEFT JOIN tbl_Jobs j ON r.JobID = j.JobID
         LEFT JOIN tbl_Clients c ON j.ClientID = c.ClientID
        ORDER BY r.CreatedDate DESC`,
      []
    )
    return jsonResponse(context, 200, rows)
  }

  // ── GET single ───────────────────────────────────────────────────────────
  if (id && !sub && method === 'GET') {
    const rows = await query(
      `SELECT r.*, c.ClientName AS Client
         FROM tbl_ReceivingTickets r
         LEFT JOIN tbl_Jobs j ON r.JobID = j.JobID
         LEFT JOIN tbl_Clients c ON j.ClientID = c.ClientID
        WHERE r.RTID = @id`,
      [{ name: 'id', value: Number(id) }]
    )
    if (!rows.length) return jsonResponse(context, 404, { error: 'Not found' })
    return jsonResponse(context, 200, rows[0])
  }

  // ── POST create ──────────────────────────────────────────────────────────
  if (!id && method === 'POST') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    if (!b.JobID) return jsonResponse(context, 400, { error: 'JobID required' })

    const yr = new Date().getFullYear()
    const lastRow = await query(
      `SELECT TOP 1 RTNumber FROM tbl_ReceivingTickets
        WHERE RTNumber LIKE 'RT-${yr}-%'
        ORDER BY RTNumber DESC`, []
    )
    let seq = 1
    if (lastRow.length) {
      const parts = lastRow[0].RTNumber.split('-')
      seq = parseInt(parts[parts.length - 1], 10) + 1
    }
    const RTNumber = `RT-${yr}-${String(seq).padStart(5, '0')}`

    const r = await query(
      `INSERT INTO tbl_ReceivingTickets (RTNumber, JobID, RTDate, Status, Notes, CreatedBy, CreatedDate)
       OUTPUT INSERTED.RTID
       VALUES (@num, @job, @date, 'Draft', @notes, @by, GETDATE())`,
      [
        { name: 'num',   value: RTNumber },
        { name: 'job',   value: b.JobID  },
        { name: 'date',  value: b.RTDate || new Date().toISOString().split('T')[0] },
        { name: 'notes', value: b.Notes || null },
        { name: 'by',    value: user.Username },
      ]
    )
    return jsonResponse(context, 201, { RTID: r[0].RTID, RTNumber })
  }

  // ── PUT update ───────────────────────────────────────────────────────────
  if (id && !sub && method === 'PUT') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })
    const b = req.body
    await query(
      `UPDATE tbl_ReceivingTickets
          SET RTDate = @date, Status = @status, Notes = @notes, UpdatedBy = @by, UpdatedDate = GETDATE()
        WHERE RTID = @id`,
      [
        { name: 'id',     value: Number(id) },
        { name: 'date',   value: b.RTDate   || null },
        { name: 'status', value: b.Status   || null },
        { name: 'notes',  value: b.Notes    || null },
        { name: 'by',     value: user.Username },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
