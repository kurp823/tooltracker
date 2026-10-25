'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

// NOTE: the real database table is `tbl_GatePass` (singular) + `tbl_GatePassLines`,
// NOT `tbl_GatePasses`/`tbl_GatePassItems` as originally assumed. Its actual
// columns are: GatePassID (varchar PK), GPNumber, Supplier, GPDate,
// PreparedBy, AuthorizedBy, Notes — a SUPPLIER-based gate pass, with no
// JobID, Direction (In/Out), or Status column at all. This is a different
// business object than what the UI currently assumes (job-linked, directional,
// status-tracked). This endpoint has been adapted to the real columns so it
// no longer 500s, but the Direction/Status/JobID concepts the frontend
// filters on don't exist in this table — flagged separately for a product
// decision on what Gate Pass should actually represent.

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
      const result = await query(
        `SELECT gi.LineID AS ItemID, gi.GatePassID, gi.Serial AS SerialNumber,
                gi.AssetNo, gi.ShortDesc AS ToolDescription, gi.Size,
                gi.Qty AS Quantity, gi.Condition
           FROM tbl_GatePassLines gi
          WHERE gi.GatePassID = @id
          ORDER BY gi.LineID`,
        [{ name: 'id', value: id }]
      )
      return jsonResponse(context, 200, result.recordset)
    }

    if (method === 'POST') {
      if (!['Admin','Operations'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })
      const b = req.body
      const r = await query(
        `INSERT INTO tbl_GatePassLines (GatePassID, Serial, AssetNo, ShortDesc, Size, Qty, Condition)
         OUTPUT INSERTED.LineID
         VALUES (@gid, @serial, @asset, @desc, @size, @qty, @cond)`,
        [
          { name: 'gid',    value: id },
          { name: 'serial', value: b.Serial          || null },
          { name: 'asset',  value: b.AssetNo          || null },
          { name: 'desc',   value: b.ToolDescription  || null },
          { name: 'size',   value: b.Size             || null },
          { name: 'qty',    value: b.Quantity          || 1   },
          { name: 'cond',   value: b.Condition         || null },
        ]
      )
      return jsonResponse(context, 201, { ItemID: r.recordset[0].LineID })
    }

    if (method === 'DELETE' && subId) {
      if (!['Admin','Operations'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })
      await query('DELETE FROM tbl_GatePassLines WHERE LineID = @lid',
        [{ name: 'lid', value: Number(subId) }])
      return jsonResponse(context, 200, { ok: true })
    }
  }

  // ── GET list ─────────────────────────────────────────────────────────────
  if (!id && method === 'GET') {
    const result = await query(
      `SELECT g.GatePassID, g.GPNumber AS GatePassNumber, g.Supplier,
              g.GPDate AS PassDate, g.PreparedBy, g.AuthorizedBy, g.Notes,
              (SELECT COUNT(*) FROM tbl_GatePassLines WHERE GatePassID = g.GatePassID) AS ItemCount
         FROM tbl_GatePass g
        ORDER BY g.GPDate DESC`,
      []
    )
    return jsonResponse(context, 200, result.recordset)
  }

  // ── GET single ───────────────────────────────────────────────────────────
  if (id && !sub && method === 'GET') {
    const result = await query(
      `SELECT g.GatePassID, g.GPNumber AS GatePassNumber, g.Supplier,
              g.GPDate AS PassDate, g.PreparedBy, g.AuthorizedBy, g.Notes
         FROM tbl_GatePass g WHERE g.GatePassID = @id`,
      [{ name: 'id', value: id }]
    )
    if (!result.recordset.length) return jsonResponse(context, 404, { error: 'Not found' })
    return jsonResponse(context, 200, result.recordset[0])
  }

  // ── POST create ──────────────────────────────────────────────────────────
  if (!id && method === 'POST') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    if (!b.Supplier)
      return jsonResponse(context, 400, { error: 'Supplier required' })

    const yr = new Date().getFullYear()
    const lastRow = await query(
      `SELECT TOP 1 GPNumber FROM tbl_GatePass
        WHERE GPNumber LIKE 'GP-${yr}-%'
        ORDER BY GPNumber DESC`, []
    )
    let seq = 1
    if (lastRow.recordset.length) {
      const parts = lastRow.recordset[0].GPNumber.split('-')
      seq = parseInt(parts[parts.length - 1], 10) + 1
    }
    const GPNumber = `GP-${yr}-${String(seq).padStart(5, '0')}`

    await query(
      `INSERT INTO tbl_GatePass (GatePassID, GPNumber, Supplier, GPDate, PreparedBy, AuthorizedBy, Notes)
       VALUES (@id, @num, @supplier, @date, @prepared, @authorized, @notes)`,
      [
        { name: 'id',         value: GPNumber },
        { name: 'num',        value: GPNumber },
        { name: 'supplier',   value: b.Supplier },
        { name: 'date',       value: b.PassDate || new Date().toISOString().split('T')[0] },
        { name: 'prepared',   value: user.FullName || user.Username },
        { name: 'authorized', value: b.AuthorizedBy || null },
        { name: 'notes',      value: b.Notes || null },
      ]
    )
    return jsonResponse(context, 201, { GatePassID: GPNumber, GatePassNumber: GPNumber })
  }

  // ── PUT update ───────────────────────────────────────────────────────────
  if (id && !sub && method === 'PUT') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })
    const b = req.body
    await query(
      `UPDATE tbl_GatePass
          SET GPDate = @date, AuthorizedBy = @authorized, Notes = @notes
        WHERE GatePassID = @id`,
      [
        { name: 'id',         value: id },
        { name: 'date',       value: b.PassDate     || null },
        { name: 'authorized', value: b.AuthorizedBy || null },
        { name: 'notes',      value: b.Notes        || null },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
