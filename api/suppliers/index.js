'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

// Real tbl_Suppliers columns (confirmed via INFORMATION_SCHEMA):
//   id, supplierCode, supplierName, supplierType, contactName,
//   contactEmail, contactPhone, address, vatNumber, paymentTerms,
//   currency, notes, active, createdBy, createdAt, updatedAt
// (No SupplierID/Email/Phone/Country/IsActive — those don't exist.
// tbl_Inventory links suppliers by the free-text `Supplier` column
// (a name), not a numeric SupplierID FK, so the tool-count join matches
// on supplierName. SQL aliases output back to the PascalCase names the
// frontend already expects.)

module.exports = async function (context, req) {
  const user   = requireAuth(context, req)
  if (!user) return

  const id     = context.bindingData.id
  const method = req.method.toUpperCase()

  if (!id && method === 'GET') {
    const result = await query(
      `SELECT s.id AS SupplierID, s.supplierName AS SupplierName, s.contactName AS ContactName,
              s.contactEmail AS Email, s.contactPhone AS Phone,
              NULL AS Country, s.active AS IsActive,
              (SELECT COUNT(*) FROM tbl_Inventory WHERE Supplier = s.supplierName) AS ToolCount
         FROM tbl_Suppliers s
        ORDER BY s.supplierName`,
      []
    )
    return jsonResponse(context, 200, result.recordset)
  }

  if (id && method === 'GET') {
    const result = await query(
      `SELECT id AS SupplierID, supplierCode AS SupplierCode, supplierName AS SupplierName,
              supplierType AS SupplierType, contactName AS ContactName,
              contactEmail AS Email, contactPhone AS Phone, address AS Address,
              vatNumber AS VatNumber, paymentTerms AS PaymentTerms, currency AS Currency,
              notes AS Notes, active AS IsActive
         FROM tbl_Suppliers WHERE id = @id`,
      [{ name: 'id', value: Number(id) }]
    )
    if (!result.recordset.length) return jsonResponse(context, 404, { error: 'Not found' })
    return jsonResponse(context, 200, result.recordset[0])
  }

  if (!id && method === 'POST') {
    if (!['Admin'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Admin only' })
    const b = req.body
    if (!b.SupplierName) return jsonResponse(context, 400, { error: 'SupplierName required' })

    const code = b.SupplierName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)

    const r = await query(
      `INSERT INTO tbl_Suppliers (supplierCode, supplierName, contactName, contactEmail, contactPhone, active, createdBy, createdAt)
       OUTPUT INSERTED.id
       VALUES (@code, @name, @contact, @email, @phone, 1, @by, GETDATE())`,
      [
        { name: 'code',    value: code },
        { name: 'name',    value: b.SupplierName   },
        { name: 'contact', value: b.ContactName || null },
        { name: 'email',   value: b.Email || null   },
        { name: 'phone',   value: b.Phone || null   },
        { name: 'by',      value: user.Username      },
      ]
    )
    return jsonResponse(context, 201, { SupplierID: r.recordset[0].id })
  }

  if (id && method === 'PUT') {
    if (!['Admin'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Admin only' })
    const b = req.body
    await query(
      `UPDATE tbl_Suppliers
          SET supplierName = @name, contactName = @contact, contactEmail = @email,
              contactPhone = @phone, active = @active, updatedAt = GETDATE()
        WHERE id = @id`,
      [
        { name: 'id',      value: Number(id)          },
        { name: 'name',    value: b.SupplierName       },
        { name: 'contact', value: b.ContactName || null },
        { name: 'email',   value: b.Email || null       },
        { name: 'phone',   value: b.Phone || null       },
        { name: 'active',  value: b.IsActive ?? 1       },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
