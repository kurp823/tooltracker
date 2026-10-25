/**
 * Inventory API
 * GET  /api/inventory          — list all (with optional filters)
 * POST /api/inventory          — create item
 * GET  /api/inventory/{id}     — single item
 * PUT  /api/inventory/{id}     — update item
 *
 * Real tbl_Inventory columns (confirmed via INFORMATION_SCHEMA):
 *   SystemID, AssetNo, Size, ShortDesc, Description, Qty, Location, Status,
 *   Ownership, IsEmdad, OEMSerial, Supplier, AddedDate, AddedBy,
 *   LastUpdated, LastUpdatedBy, rowver
 *
 * This endpoint previously selected Serial / CategoryID / SizeID / Condition /
 * IsActive / SupplierID / PurchaseDate / PurchaseCost / Notes and joined
 * tbl_ToolCategories, tbl_ToolSizes and tbl_Suppliers on FK columns — none of
 * which exist here. Every list request therefore failed with
 * "Invalid column name 'IsActive'", hiding all 5,094 rows behind a 500.
 *
 * Note: Size and Supplier are plain text on this table, not foreign keys, so
 * there is nothing to join. There is no category column at all.
 */
const { sql, query, jsonResponse, requireAuth } = require('../db')

// The frontend's InventoryItem type expects `Serial`; the column is OEMSerial.
const SELECT_COLS = `
  i.SystemID,
  i.AssetNo,
  i.Size,
  i.ShortDesc,
  i.Description,
  i.Qty,
  i.Location,
  i.Status,
  i.Ownership,
  i.IsEmdad,
  i.OEMSerial AS Serial,
  i.Supplier,
  i.AddedDate,
  i.LastUpdated`

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const method = req.method.toUpperCase()
  const id     = context.bindingData.id

  // ── GET list ───────────────────────────────────────────────────────────────
  if (method === 'GET' && !id) {
    const { search, owner, status, location } = req.query || {}
    try {
      const where = ['1=1']
      const params = []

      if (search) {
        where.push(`(i.SystemID LIKE @s OR i.OEMSerial LIKE @s OR i.AssetNo LIKE @s OR i.ShortDesc LIKE @s OR i.Description LIKE @s)`)
        params.push({ name: 's', type: sql.NVarChar, value: `%${search}%` })
      }
      if (status) {
        where.push(`i.Status = @st`)
        params.push({ name: 'st', type: sql.NVarChar, value: status })
      }
      if (location) {
        where.push(`i.Location = @loc`)
        params.push({ name: 'loc', type: sql.NVarChar, value: location })
      }
      if (owner === 'own')      where.push(`i.IsEmdad = 1`)
      else if (owner === 'sub') where.push(`i.IsEmdad = 0`)

      const result = await query(
        `SELECT ${SELECT_COLS}
         FROM   tbl_Inventory i
         WHERE  ${where.join(' AND ')}
         ORDER  BY i.ShortDesc, i.AssetNo`,
        params
      )
      return jsonResponse(context, 200, result.recordset)
    } catch (err) {
      context.log.error('Inventory list error:', err)
      return jsonResponse(context, 500, { error: 'Failed to load inventory', detail: err.message })
    }
  }

  // ── GET single ─────────────────────────────────────────────────────────────
  if (method === 'GET' && id) {
    try {
      const result = await query(
        `SELECT ${SELECT_COLS}
         FROM   tbl_Inventory i
         WHERE  i.SystemID = @id`,
        [{ name: 'id', type: sql.NVarChar, value: id }]
      )
      if (!result.recordset.length)
        return jsonResponse(context, 404, { error: 'Item not found' })
      return jsonResponse(context, 200, result.recordset[0])
    } catch (err) {
      context.log.error('Inventory single error:', err)
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
           (SystemID, AssetNo, Size, ShortDesc, Description, Qty, Location,
            Status, Ownership, IsEmdad, OEMSerial, Supplier,
            AddedDate, AddedBy)
         VALUES
           (@id, @asset, @size, @desc, @descr, @qty, @loc,
            @status, @own, @isemdad, @serial, @sup,
            CAST(GETDATE() AS date), @by)`,
        [
          { name: 'id',      type: sql.VarChar,  value: b.SystemID },
          { name: 'asset',   type: sql.VarChar,  value: b.AssetNo     || null },
          { name: 'size',    type: sql.VarChar,  value: b.Size        || null },
          { name: 'desc',    type: sql.VarChar,  value: b.ShortDesc },
          { name: 'descr',   type: sql.VarChar,  value: b.Description || null },
          { name: 'qty',     type: sql.Int,      value: b.Qty == null ? 1 : Number(b.Qty) },
          { name: 'loc',     type: sql.VarChar,  value: b.Location    || null },
          { name: 'status',  type: sql.VarChar,  value: b.Status      || 'Available' },
          { name: 'own',     type: sql.VarChar,  value: b.Ownership   || null },
          { name: 'isemdad', type: sql.Bit,      value: b.IsEmdad ? 1 : 0 },
          { name: 'serial',  type: sql.VarChar,  value: b.Serial      || null },
          { name: 'sup',     type: sql.VarChar,  value: b.Supplier    || null },
          { name: 'by',      type: sql.VarChar,  value: user.Username || null },
        ]
      )
      return jsonResponse(context, 201, { success: true, SystemID: b.SystemID })
    } catch (err) {
      context.log.error('Inventory create error:', err)
      return jsonResponse(context, 500, { error: 'Failed to create inventory item', detail: err.message })
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
           AssetNo     = @asset,
           Size        = @size,
           ShortDesc   = @desc,
           Description = @descr,
           Qty         = @qty,
           Location    = @loc,
           Status      = @status,
           Ownership   = @own,
           IsEmdad     = @isemdad,
           OEMSerial   = @serial,
           Supplier    = @sup,
           LastUpdated = GETDATE(),
           LastUpdatedBy = @by
         WHERE SystemID = @id`,
        [
          { name: 'id',      type: sql.VarChar,  value: id },
          { name: 'asset',   type: sql.VarChar,  value: b.AssetNo     || null },
          { name: 'size',    type: sql.VarChar,  value: b.Size        || null },
          { name: 'desc',    type: sql.VarChar,  value: b.ShortDesc   || null },
          { name: 'descr',   type: sql.VarChar,  value: b.Description || null },
          { name: 'qty',     type: sql.Int,      value: b.Qty == null ? null : Number(b.Qty) },
          { name: 'loc',     type: sql.VarChar,  value: b.Location    || null },
          { name: 'status',  type: sql.VarChar,  value: b.Status      || null },
          { name: 'own',     type: sql.VarChar,  value: b.Ownership   || null },
          { name: 'isemdad', type: sql.Bit,      value: b.IsEmdad ? 1 : 0 },
          { name: 'serial',  type: sql.VarChar,  value: b.Serial      || null },
          { name: 'sup',     type: sql.VarChar,  value: b.Supplier    || null },
          { name: 'by',      type: sql.VarChar,  value: user.Username || null },
        ]
      )
      return jsonResponse(context, 200, { success: true })
    } catch (err) {
      context.log.error('Inventory update error:', err)
      return jsonResponse(context, 500, { error: 'Failed to update item', detail: err.message })
    }
  }

  jsonResponse(context, 405, { error: 'Method not allowed' })
}
