'use strict'
const { query, jsonResponse, requireAuth, safe } = require('../db')
const R = require('../rates')

// Real tbl_ToolCategories columns (confirmed via INFORMATION_SCHEMA):
//   CategoryID (int, identity), CategoryName, ToolFamily, InInventory (bit),
//   IsRentalTool (bit), RequiresInspection (bit), ActiveFlag (bit),
//   SortOrder (int), Notes

module.exports = safe(async function (context, req) {
  const user   = requireAuth(context, req)
  if (!user) return

  const id     = context.bindingData.id
  const sub    = context.bindingData.sub
  const method = req.method.toUpperCase()

  // ── /categories/map — inventory name -> contract category ────────────────
  // Decision from the go-live review: a mapping table, nothing renamed and
  // nothing coded. The rate resolver consults it when a tool's own category
  // has no rate on the contract (rates.js effectiveCategory).
  if (id === 'map') {
    await R.loadCategoryMap()   // creates the table on first use

    if (method === 'GET') {
      const [maps, unmatched, contractCats] = await Promise.all([
        query(`SELECT m.InventoryCategory, m.ContractCategory, m.Notes, m.UpdatedBy, m.UpdatedAt,
                      (SELECT COUNT(*) FROM tbl_Inventory i
                        WHERE UPPER(LTRIM(RTRIM(i.ShortDesc))) = UPPER(LTRIM(RTRIM(m.InventoryCategory)))) AS Tools,
                      CASE WHEN EXISTS (SELECT 1 FROM tbl_ContractRates r
                                         WHERE r.ActiveFlag = 1
                                           AND UPPER(LTRIM(RTRIM(r.Category))) = UPPER(LTRIM(RTRIM(m.ContractCategory))))
                           THEN 1 ELSE 0 END AS ContractHasRates
                 FROM tbl_CategoryMap m
                ORDER BY m.InventoryCategory`, []),
        // Inventory names with tools that no contract prices and no mapping covers.
        query(`SELECT i.ShortDesc AS InventoryCategory, COUNT(*) AS Tools
                 FROM tbl_Inventory i
                WHERE NULLIF(LTRIM(RTRIM(i.ShortDesc)), '') IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM tbl_ContractRates r
                                   WHERE r.ActiveFlag = 1
                                     AND UPPER(LTRIM(RTRIM(r.Category))) = UPPER(LTRIM(RTRIM(i.ShortDesc))))
                  AND NOT EXISTS (SELECT 1 FROM tbl_CategoryMap m
                                   WHERE UPPER(LTRIM(RTRIM(m.InventoryCategory))) = UPPER(LTRIM(RTRIM(i.ShortDesc))))
                GROUP BY i.ShortDesc
                ORDER BY COUNT(*) DESC, i.ShortDesc`, []),
        query(`SELECT Category, COUNT(DISTINCT ContractCode) AS Contracts
                 FROM tbl_ContractRates WHERE ActiveFlag = 1
                  AND NULLIF(LTRIM(RTRIM(Category)), '') IS NOT NULL
                GROUP BY Category ORDER BY Category`, []),
      ])
      return jsonResponse(context, 200, {
        mappings: maps.recordset,
        unmatched: unmatched.recordset,
        contractCategories: contractCats.recordset,
      })
    }

    if (method === 'POST' || method === 'PUT') {
      if (user.Role !== 'Admin') return jsonResponse(context, 403, { error: 'Admin only' })
      const b = req.body || {}
      const inv = String(b.InventoryCategory || '').trim()
      const to  = String(b.ContractCategory || '').trim()
      if (!inv || !to) return jsonResponse(context, 400, { error: 'InventoryCategory and ContractCategory required' })
      if (R.norm(inv) === R.norm(to)) return jsonResponse(context, 400, { error: 'A category does not need mapping to itself' })
      await query(
        `MERGE tbl_CategoryMap AS t
         USING (SELECT @inv AS InventoryCategory) s ON UPPER(LTRIM(RTRIM(t.InventoryCategory))) = UPPER(LTRIM(RTRIM(s.InventoryCategory)))
         WHEN MATCHED THEN UPDATE SET ContractCategory = @to, Notes = @notes, UpdatedBy = @by, UpdatedAt = GETDATE()
         WHEN NOT MATCHED THEN INSERT (InventoryCategory, ContractCategory, Notes, UpdatedBy, UpdatedAt)
              VALUES (@inv, @to, @notes, @by, GETDATE());`,
        [{ name: 'inv', value: inv }, { name: 'to', value: to },
         { name: 'notes', value: b.Notes || null }, { name: 'by', value: user.Username }]
      )
      return jsonResponse(context, 200, { ok: true, InventoryCategory: inv, ContractCategory: to })
    }

    if (method === 'DELETE') {
      if (user.Role !== 'Admin') return jsonResponse(context, 403, { error: 'Admin only' })
      const inv = String((req.query || {}).inventoryCategory || sub || '').trim()
      if (!inv) return jsonResponse(context, 400, { error: 'inventoryCategory required' })
      const r = await query(`DELETE FROM tbl_CategoryMap WHERE UPPER(LTRIM(RTRIM(InventoryCategory))) = @inv`,
        [{ name: 'inv', value: R.norm(inv) }])
      return jsonResponse(context, 200, { ok: true, removed: r.rowsAffected[0] })
    }
    return jsonResponse(context, 405, { error: 'Method not allowed' })
  }

  // ── GET list ─────────────────────────────────────────────────────────────
  if (!id && method === 'GET') {
    const result = await query(
      /*
       * ToolCount is NULL because there is nothing to count it from.
       *
       * tbl_Inventory has no category column at all (its columns are SystemID,
       * AssetNo, Size, ShortDesc, Description, Qty, Location, Status,
       * Ownership, IsEmdad, OEMSerial, Supplier and the audit fields), so no
       * tool is linked to a category.
       *
       * This read `(SELECT COUNT(*) FROM tbl_Inventory WHERE CategoryID =
       * c.CategoryID)`. Because tbl_Inventory has no CategoryID, SQL Server
       * bound that unqualified name to the OUTER query instead of raising an
       * error, so the predicate was c.CategoryID = c.CategoryID - always true.
       * Every category therefore reported the entire inventory: 8,775 tools
       * each, on all 131 rows, with no error anywhere to give it away.
       *
       * NULL renders as a dash. A real count needs a category column on
       * tbl_Inventory first; until then, no number here can be honest.
       */
      `SELECT CategoryID, CategoryName, ToolFamily, InInventory, IsRentalTool,
              RequiresInspection, ActiveFlag, SortOrder, Notes,
              CAST(NULL AS INT) AS ToolCount
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
})
