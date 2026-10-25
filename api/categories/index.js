'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

// Real tbl_ToolCategories columns (confirmed via INFORMATION_SCHEMA):
//   CategoryID (int, identity), CategoryName, ToolFamily, InInventory (bit),
//   IsRentalTool (bit), RequiresInspection (bit), ActiveFlag (bit),
//   SortOrder (int), Notes

module.exports = async function (context, req) {
  const user   = requireAuth(context, req)
  if (!user) return

  const id     = context.bindingData.id
  const method = req.method.toUpperCase()

  // ── GET list ─────────────────────────────────────────────────────────────
  if (!id && method === 'GET') {
    const result = await query(
      `SELECT CategoryID, CategoryName, ToolFamily, InInventory, IsRentalTool,
              RequiresInspection, ActiveFlag, SortOrder, Notes,
              (SELECT COUNT(*) FROM tbl_Inventory WHERE CategoryID = c.CategoryID) AS ToolCount
         FROM tbl_ToolCategories c
        ORDER BY SortOrder, CategoryName`,
      []
    )
    return jsonResponse(context, 200, result.recordset)
  }

  // ── POST create ──────────────────────────────────────────────────────────
  if (!id && method === 'POST') {
    if (!['Admin'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Admin only' })
    const b = req.body
    if (!b.CategoryName) return jsonResponse(context, 400, { error: 'CategoryName required' })

    const r = await query(
      `INSERT INTO tbl_ToolCategories
         (CategoryName, ToolFamily, InInventory, IsRentalTool, RequiresInspection, ActiveFlag, SortOrder, Notes)
       OUTPUT INSERTED.CategoryID
       VALUES (@name, @family, @inInv, @rental, @inspect, 1, @sort, @notes)`,
      [
        { name: 'name',    value: b.CategoryName },
        { name: 'family',  value: b.ToolFamily || null },
        { name: 'inInv',   value: b.InInventory ? 1 : 0 },
        { name: 'rental',  value: b.IsRentalTool ? 1 : 0 },
        { name: 'inspect', value: b.RequiresInspection ? 1 : 0 },
        { name: 'sort',    value: b.SortOrder != null ? Number(b.SortOrder) : null },
        { name: 'notes',   value: b.Notes || null },
      ]
    )
    return jsonResponse(context, 201, { CategoryID: r.recordset[0].CategoryID })
  }

  // ── PUT update ───────────────────────────────────────────────────────────
  if (id && method === 'PUT') {
    if (!['Admin'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Admin only' })
    const b = req.body
    await query(
      `UPDATE tbl_ToolCategories
          SET CategoryName = @name, ToolFamily = @family, InInventory = @inInv,
              IsRentalTool = @rental, RequiresInspection = @inspect,
              ActiveFlag = @active, SortOrder = @sort, Notes = @notes
        WHERE CategoryID = @id`,
      [
        { name: 'id',      value: Number(id) },
        { name: 'name',    value: b.CategoryName },
        { name: 'family',  value: b.ToolFamily || null },
        { name: 'inInv',   value: b.InInventory ? 1 : 0 },
        { name: 'rental',  value: b.IsRentalTool ? 1 : 0 },
        { name: 'inspect', value: b.RequiresInspection ? 1 : 0 },
        { name: 'active',  value: b.ActiveFlag ?? 1 },
        { name: 'sort',    value: b.SortOrder != null ? Number(b.SortOrder) : null },
        { name: 'notes',   value: b.Notes || null },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
