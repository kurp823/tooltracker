/**
 * Inventory API
 * GET  /api/inventory          — list all (with optional filters)
 * POST /api/inventory          — create item
 * GET  /api/inventory/{id}     — single item
 * PUT  /api/inventory/{id}     — update item
 */
const { sql, query, jsonResponse, requireAuth } = require('../db')

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const method = req.method.toUpperCase()
  const id     = context.bindingData.id

  // ── GET list ───────────────────────────────────────────────────────────────
  if (method === 'GET' && !id) {
    const { search, category, owner } = req.query || {}
    try {
      let where = ['1=1']
      const params = []

      if (search) {
        where.push(`(i.SystemID LIKE @s OR i.Serial LIKE @s OR i.AssetNo LIKE @s OR i.ShortDesc LIKE @s)`)
        params.push({ name: 's', type: sql.NVarChar, value: `%${search}%` })
      }
      if (category) {
        where.push(`i.CategoryID = @cat`)
        params.push({ name: 'cat', type: sql.Int, value: parseInt(category) })
      }
      if (owner === 'own')  {
        where.push(`i.IsEmdad = 1`)
      } else if (owner === 'sub') {
        where.push(`i.IsEmdad = 0`)
      }

      const result = await query(
        `SELECT i.SystemID, i.Serial, i.AssetNo, i.ShortDesc,
                i.CategoryID, c.CategoryName, i.SizeID, s.SizeName,
                i.IsEmdad, i.Condition, i.Location, i.IsActive,
                i.SupplierID, sup.SupplierName,
                i.PurchaseDate, i.PurchaseCost, i.Notes
         FROM   tbl_Inventory i
         LEFT   JOIN tbl_ToolCategories c ON i.CategoryID = c.CategoryID
         LEFT   JOIN tbl_ToolSizes      s ON i.SizeID     = s.SizeID
         LEFT   JOIN tbl_Suppliers    sup ON i.SupplierID = sup.SupplierID
         WHERE  ${where.join(' AND ')}
         ORDER  BY i.CategoryID, i.ShortDesc`,
        params
      )
      return jsonResponse(context, 200, result.recordset)
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to load inventory' })
    }
  }

  // ── GET single ─────────────────────────────────────────────────────────────
  if (method === 'GET' && id) {
    try {
      const result = await query(
        `SELECT i.*, c.CategoryName, s.SizeName, sup.SupplierName
         FROM   tbl_Inventory i
         LEFT   JOIN tbl_ToolCategories c   ON i.CategoryID = c.CategoryID
         LEFT   JOIN tbl_ToolSizes      s   ON i.SizeID     = s.SizeID
         LEFT   JOIN tbl_Suppliers      sup ON i.SupplierID = sup.SupplierID
         WHERE  i.SystemID = @id`,
        [{ name: 'id', type: sql.NVarChar, value: id }]
      )
      if (!result.recordset.length)
        return jsonResponse(context, 404, { error: 'Item not found' })
      return jsonResponse(context, 200, result.recordset[0])
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to load item' })
    }
  }

  // ── POST create ────────────────────────────────────────────────────────────
  if (method === 'POST') {
    if (!['Admin', 'Operations'].includes(user.Role)) {
      return jsonResponse(context, 403, { error: 'Insufficient permissions' })
    }
    const b = req.body || {}
    if (!b.SystemID || !b.ShortDesc)
      return jsonResponse(context, 400, { error: 'SystemID and ShortDesc required' })
    try {
      await query(
        `INSERT INTO tbl_Inventory
           (SystemID, Serial, AssetNo, ShortDesc, CategoryID, SizeID,
            IsEmdad, Condition, Location, IsActive, SupplierID,
            PurchaseDate, PurchaseCost, Notes)
         VALUES
           (@id, @serial, @asset, @desc, @cat, @size,
            @isemdad, @cond, @loc, 1, @sup,
            @pdate, @pcost, @notes)`,
        [
          { name: 'id',      type: sql.NVarChar, value: b.SystemID },
          { name: 'serial',  type: sql.NVarChar, value: b.Serial       || null },
          { name: 'asset',   type: sql.NVarChar, value: b.AssetNo      || null },
          { name: 'desc',    type: sql.NVarChar, value: b.ShortDesc },
          { name: 'cat',     type: sql.Int,      value: b.CategoryID   || null },
          { name: 'size',    type: sql.Int,      value: b.SizeID       || null },
          { name: 'isemdad', type: sql.Bit,      value: b.IsEmdad ? 1 : 0 },
          { name: 'cond',    type: sql.NVarChar, value: b.Condition    || null },
          { name: 'loc',     type: sql.NVarChar, value: b.Location     || null },
          { name: 'sup',     type: sql.Int,      value: b.SupplierID   || null },
          { name: 'pdate',   type: sql.Date,     value: b.PurchaseDate ? new Date(b.PurchaseDate) : null },
          { name: 'pcost',   type: sql.Decimal,  value: b.PurchaseCost || null },
          { name: 'notes',   type: sql.NVarChar, value: b.Notes        || null },
        ]
      )
      return jsonResponse(context, 201, { success: true, SystemID: b.SystemID })
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to create inventory item' })
    }
  }

  // ── PUT update ─────────────────────────────────────────────────────────────
  if (method === 'PUT' && id) {
    if (!['Admin', 'Operations'].includes(user.Role)) {
      return jsonResponse(context, 403, { error: 'Insufficient permissions' })
    }
    const b = req.body || {}
    try {
      await query(
        `UPDATE tbl_Inventory SET
           Serial = @serial, AssetNo = @asset, ShortDesc = @desc,
           CategoryID = @cat, SizeID = @size, IsEmdad = @isemdad,
           Condition = @cond, Location = @loc, IsActive = @active,
           SupplierID = @sup, PurchaseDate = @pdate,
           PurchaseCost = @pcost, Notes = @notes
         WHERE SystemID = @id`,
        [
          { name: 'id',      type: sql.NVarChar, value: id },
          { name: 'serial',  type: sql.NVarChar, value: b.Serial       || null },
          { name: 'asset',   type: sql.NVarChar, value: b.AssetNo      || null },
          { name: 'desc',    type: sql.NVarChar, value: b.ShortDesc    || null },
          { name: 'cat',     type: sql.Int,      value: b.CategoryID   || null },
          { name: 'size',    type: sql.Int,      value: b.SizeID       || null },
          { name: 'isemdad', type: sql.Bit,      value: b.IsEmdad ? 1 : 0 },
          { name: 'cond',    type: sql.NVarChar, value: b.Condition    || null },
          { name: 'loc',     type: sql.NVarChar, value: b.Location     || null },
          { name: 'active',  type: sql.Bit,      value: b.IsActive ? 1 : 0 },
          { name: 'sup',     type: sql.Int,      value: b.SupplierID   || null },
          { name: 'pdate',   type: sql.Date,     value: b.PurchaseDate ? new Date(b.PurchaseDate) : null },
          { name: 'pcost',   type: sql.Decimal,  value: b.PurchaseCost || null },
          { name: 'notes',   type: sql.NVarChar, value: b.Notes        || null },
        ]
      )
      return jsonResponse(context, 200, { success: true })
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to update item' })
    }
  }

  jsonResponse(context, 405, { error: 'Method not allowed' })
}
