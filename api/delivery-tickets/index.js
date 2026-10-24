'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const id    = context.bindingData.id
  const sub   = context.bindingData.sub
  const subId = context.bindingData.subId
  const method = req.method.toUpperCase()

  // ── /delivery-tickets/{id}/lines ────────────────────────────────────────
  if (id && sub === 'lines') {
    if (method === 'GET') {
      // Select line columns directly — SerialNumber/AssetNo/ToolDescription/Size
      // are stored directly in the line row (old-app freeform style)
      const rows = await query(
        `SELECT l.LineID, l.DTID, l.LineNumber,
                l.SerialNumber, l.AssetNo, l.ToolDescription, l.Size AS SizeName,
                l.Quantity, l.UnitRate, l.LineAmount, l.Condition, l.Notes
           FROM tbl_DeliveryTicketLines l
          WHERE l.DTID = @id
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
        `INSERT INTO tbl_DeliveryTicketLines
           (DTID, LineNumber, SerialNumber, AssetNo, ToolDescription, Size, Quantity, Condition, Notes)
         OUTPUT INSERTED.LineID
         VALUES (
           @dtid,
           COALESCE((SELECT MAX(LineNumber) FROM tbl_DeliveryTicketLines WHERE DTID=@dtid),0)+1,
           @serial, @asset, @desc, @size, @qty, @cond, @notes
         )`,
        [
          { name: 'dtid',   value: Number(id)           },
          { name: 'serial', value: b.Serial         || null },
          { name: 'asset',  value: b.AssetNo        || null },
          { name: 'desc',   value: b.ToolDescription|| null },
          { name: 'size',   value: b.SizeName       || null },
          { name: 'qty',    value: b.Quantity        || 1   },
          { name: 'cond',   value: b.Condition      || null },
          { name: 'notes',  value: b.Notes          || null },
        ]
      )
      return jsonResponse(context, 201, { LineID: r[0].LineID })
    }

    if (method === 'DELETE' && subId) {
      if (!['Admin','Operations'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })
      await query('DELETE FROM tbl_DeliveryTicketLines WHERE LineID = @lid',
        [{ name: 'lid', value: Number(subId) }])
      return jsonResponse(context, 200, { ok: true })
    }
  }

  // ── /delivery-tickets (list) ─────────────────────────────────────────────
  if (!id && method === 'GET') {
    const rows = await query(
      `SELECT d.DTID, d.DTNumber, d.JobID, d.DTDate, d.Status,
              d.CreatedDate, d.CreatedBy,
              j.ClientID,
              c.ClientName AS Client,
              (SELECT COUNT(*) FROM tbl_DeliveryTicketLines WHERE DTID = d.DTID) AS LineCount
         FROM tbl_DeliveryTickets d
         LEFT JOIN tbl_Jobs j ON d.JobID = j.JobID
         LEFT JOIN tbl_Clients c ON j.ClientID = c.ClientID
        ORDER BY d.CreatedDate DESC`,
      []
    )
    return jsonResponse(context, 200, rows)
  }

  // ── /delivery-tickets/:id (single) ───────────────────────────────────────
  if (id && !sub && method === 'GET') {
    const rows = await query(
      `SELECT d.*, c.ClientName AS Client
         FROM tbl_DeliveryTickets d
         LEFT JOIN tbl_Jobs j ON d.JobID = j.JobID
         LEFT JOIN tbl_Clients c ON j.ClientID = c.ClientID
        WHERE d.DTID = @id`,
      [{ name: 'id', value: Number(id) }]
    )
    if (!rows.length) return jsonResponse(context, 404, { error: 'Not found' })
    return jsonResponse(context, 200, rows[0])
  }

  // ── POST /delivery-tickets (create) ─────────────────────────────────────
  if (!id && method === 'POST') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    if (!b.JobID) return jsonResponse(context, 400, { error: 'JobID required' })

    // Generate next DT number: DT-YYYY-NNNNN
    const yr = new Date().getFullYear()
    const lastRow = await query(
      `SELECT TOP 1 DTNumber FROM tbl_DeliveryTickets
        WHERE DTNumber LIKE 'DT-${yr}-%'
        ORDER BY DTNumber DESC`, []
    )
    let seq = 1
    if (lastRow.length) {
      const parts = lastRow[0].DTNumber.split('-')
      seq = parseInt(parts[parts.length - 1], 10) + 1
    }
    const DTNumber = `DT-${yr}-${String(seq).padStart(5, '0')}`

    const r = await query(
      `INSERT INTO tbl_DeliveryTickets (DTNumber, JobID, DTDate, Status, Notes, CreatedBy, CreatedDate)
       OUTPUT INSERTED.DTID
       VALUES (@num, @job, @date, 'Draft', @notes, @by, GETDATE())`,
      [
        { name: 'num',   value: DTNumber },
        { name: 'job',   value: b.JobID  },
        { name: 'date',  value: b.DTDate || new Date().toISOString().split('T')[0] },
        { name: 'notes', value: b.Notes || null },
        { name: 'by',    value: user.Username },
      ]
    )
    return jsonResponse(context, 201, { DTID: r[0].DTID, DTNumber })
  }

  // ── PUT /delivery-tickets/:id (update) ──────────────────────────────────
  if (id && !sub && method === 'PUT') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })
    const b = req.body
    await query(
      `UPDATE tbl_DeliveryTickets
          SET DTDate = @date, Status = @status, Notes = @notes, UpdatedBy = @by, UpdatedDate = GETDATE()
        WHERE DTID = @id`,
      [
        { name: 'id',     value: Number(id) },
        { name: 'date',   value: b.DTDate   || null },
        { name: 'status', value: b.Status   || null },
        { name: 'notes',  value: b.Notes    || null },
        { name: 'by',     value: user.Username },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
