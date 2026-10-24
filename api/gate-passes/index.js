'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const id     = context.bindingData.id
  const sub    = context.bindingData.sub
  const subId  = context.bindingData.subId
  const method = req.method.toUpperCase()

  // ── /gate-passes/{id}/items ──────────────────────────────────────────────
  if (id && sub === 'items') {
    if (method === 'GET') {
      const rows = await query(
        `SELECT gi.ItemID, gi.GatePassID, gi.LineNumber,
                gi.SerialNumber, gi.AssetNo, gi.Description AS ToolDescription,
                gi.Quantity, gi.Notes
           FROM tbl_GatePassItems gi
          WHERE gi.GatePassID = @id
          ORDER BY gi.LineNumber`,
        [{ name: 'id', value: Number(id) }]
      )
      return jsonResponse(context, 200, rows)
    }

    if (method === 'POST') {
      if (!['Admin','Operations'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })
      const b = req.body
      const r = await query(
        `INSERT INTO tbl_GatePassItems (GatePassID, LineNumber, SerialNumber, AssetNo, Description, Quantity, Notes)
         OUTPUT INSERTED.ItemID
         VALUES (@gid,
                 COALESCE((SELECT MAX(LineNumber) FROM tbl_GatePassItems WHERE GatePassID=@gid),0)+1,
                 @serial, @asset, @desc, @qty, @notes)`,
        [
          { name: 'gid',    value: Number(id)            },
          { name: 'serial', value: b.Serial         || null },
          { name: 'asset',  value: b.AssetNo        || null },
          { name: 'desc',   value: b.ToolDescription|| null },
          { name: 'qty',    value: b.Quantity        || 1   },
          { name: 'notes',  value: b.Notes           || null },
        ]
      )
      return jsonResponse(context, 201, { ItemID: r[0].ItemID })
    }

    if (method === 'DELETE' && subId) {
      if (!['Admin','Operations'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })
      await query('DELETE FROM tbl_GatePassItems WHERE ItemID = @lid',
        [{ name: 'lid', value: Number(subId) }])
      return jsonResponse(context, 200, { ok: true })
    }
  }

  // ── GET list ─────────────────────────────────────────────────────────────
  if (!id && method === 'GET') {
    const rows = await query(
      `SELECT g.GatePassID, g.GatePassNumber, g.JobID, g.Direction,
              g.PassDate, g.Status, g.CreatedDate,
              (SELECT COUNT(*) FROM tbl_GatePassItems WHERE GatePassID = g.GatePassID) AS ItemCount
         FROM tbl_GatePasses g
        ORDER BY g.CreatedDate DESC`,
      []
    )
    return jsonResponse(context, 200, rows)
  }

  // ── GET single ───────────────────────────────────────────────────────────
  if (id && !sub && method === 'GET') {
    const rows = await query(
      `SELECT g.* FROM tbl_GatePasses g WHERE g.GatePassID = @id`,
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
    if (!b.JobID || !b.Direction)
      return jsonResponse(context, 400, { error: 'JobID and Direction (In/Out) required' })
    if (!['In','Out'].includes(b.Direction))
      return jsonResponse(context, 400, { error: 'Direction must be "In" or "Out"' })

    const yr = new Date().getFullYear()
    const lastRow = await query(
      `SELECT TOP 1 GatePassNumber FROM tbl_GatePasses
        WHERE GatePassNumber LIKE 'GP-${yr}-%'
        ORDER BY GatePassNumber DESC`, []
    )
    let seq = 1
    if (lastRow.length) {
      const parts = lastRow[0].GatePassNumber.split('-')
      seq = parseInt(parts[parts.length - 1], 10) + 1
    }
    const GatePassNumber = `GP-${yr}-${String(seq).padStart(5, '0')}`

    const r = await query(
      `INSERT INTO tbl_GatePasses (GatePassNumber, JobID, Direction, PassDate, Status, Notes, CreatedBy, CreatedDate)
       OUTPUT INSERTED.GatePassID
       VALUES (@num, @job, @dir, @date, 'Open', @notes, @by, GETDATE())`,
      [
        { name: 'num',   value: GatePassNumber },
        { name: 'job',   value: b.JobID        },
        { name: 'dir',   value: b.Direction     },
        { name: 'date',  value: b.PassDate || new Date().toISOString().split('T')[0] },
        { name: 'notes', value: b.Notes || null },
        { name: 'by',    value: user.Username   },
      ]
    )
    return jsonResponse(context, 201, { GatePassID: r[0].GatePassID, GatePassNumber })
  }

  // ── PUT update ───────────────────────────────────────────────────────────
  if (id && !sub && method === 'PUT') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })
    const b = req.body
    await query(
      `UPDATE tbl_GatePasses
          SET PassDate = @date, Status = @status, Notes = @notes
        WHERE GatePassID = @id`,
      [
        { name: 'id',     value: Number(id)   },
        { name: 'date',   value: b.PassDate   || null },
        { name: 'status', value: b.Status     || null },
        { name: 'notes',  value: b.Notes      || null },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
