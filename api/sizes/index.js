'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

// Real tbl_ToolSizes columns (confirmed via INFORMATION_SCHEMA):
//   SizeID (int, identity), SizeLabel, SizeDecimal (decimal),
//   InInventory (bit), ActiveFlag (bit), SortOrder (int)

module.exports = async function (context, req) {
  const user   = requireAuth(context, req)
  if (!user) return

  const id     = context.bindingData.id
  const method = req.method.toUpperCase()

  // ── GET list ─────────────────────────────────────────────────────────────
  if (!id && method === 'GET') {
    const result = await query(
      /*
       * Counted on the size LABEL, not a SizeID.
       *
       * This read `WHERE SizeID = s.SizeID`, but tbl_Inventory has no SizeID -
       * it stores Size as plain text. SQL Server bound the unqualified SizeID
       * to the outer query rather than erroring, making the predicate
       * s.SizeID = s.SizeID, always true, so every size reported the whole
       * inventory: 8,775 tools on every row.
       *
       * Unlike categories this one can be counted for real, because the text
       * in tbl_Inventory.Size is the same label tbl_ToolSizes holds.
       */
      `SELECT SizeID, SizeLabel, SizeDecimal, InInventory, ActiveFlag, SortOrder,
              (SELECT COUNT(*) FROM tbl_Inventory i
                WHERE i.Size = s.SizeLabel) AS ToolCount
         FROM tbl_ToolSizes s
        ORDER BY SortOrder, SizeDecimal`,
      []
    )
    return jsonResponse(context, 200, result.recordset)
  }

  // ── POST create ──────────────────────────────────────────────────────────
  if (!id && method === 'POST') {
    if (!['Admin'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Admin only' })
    const b = req.body
    if (!b.SizeLabel) return jsonResponse(context, 400, { error: 'SizeLabel required' })

    const r = await query(
      `INSERT INTO tbl_ToolSizes (SizeLabel, SizeDecimal, InInventory, ActiveFlag, SortOrder)
       OUTPUT INSERTED.SizeID
       VALUES (@label, @dec, @inInv, 1, @sort)`,
      [
        { name: 'label', value: b.SizeLabel },
        { name: 'dec',   value: b.SizeDecimal != null ? Number(b.SizeDecimal) : null },
        { name: 'inInv', value: b.InInventory ? 1 : 0 },
        { name: 'sort',  value: b.SortOrder != null ? Number(b.SortOrder) : null },
      ]
    )
    return jsonResponse(context, 201, { SizeID: r.recordset[0].SizeID })
  }

  // ── PUT update ───────────────────────────────────────────────────────────
  if (id && method === 'PUT') {
    if (!['Admin'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Admin only' })
    const b = req.body
    await query(
      `UPDATE tbl_ToolSizes
          SET SizeLabel = @label, SizeDecimal = @dec, InInventory = @inInv,
              ActiveFlag = @active, SortOrder = @sort
        WHERE SizeID = @id`,
      [
        { name: 'id',     value: Number(id) },
        { name: 'label',  value: b.SizeLabel },
        { name: 'dec',    value: b.SizeDecimal != null ? Number(b.SizeDecimal) : null },
        { name: 'inInv',  value: b.InInventory ? 1 : 0 },
        { name: 'active', value: b.ActiveFlag ?? 1 },
        { name: 'sort',   value: b.SortOrder != null ? Number(b.SortOrder) : null },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
