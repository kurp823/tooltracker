'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

module.exports = async function (context, req) {
  const user   = requireAuth(context, req)
  if (!user) return

  const id     = context.bindingData.id
  const method = req.method.toUpperCase()

  if (!id && method === 'GET') {
    const rows = await query(
      `SELECT s.SupplierID, s.SupplierName, s.ContactName, s.Email, s.Phone,
              s.Country, s.IsActive,
              (SELECT COUNT(*) FROM tbl_Tools WHERE SupplierID = s.SupplierID) AS ToolCount
         FROM tbl_Suppliers s
        ORDER BY s.SupplierName`,
      []
    )
    return jsonResponse(context, 200, rows)
  }

  if (id && method === 'GET') {
    const rows = await query(
      'SELECT * FROM tbl_Suppliers WHERE SupplierID = @id',
      [{ name: 'id', value: Number(id) }]
    )
    if (!rows.length) return jsonResponse(context, 404, { error: 'Not found' })
    return jsonResponse(context, 200, rows[0])
  }

  if (!id && method === 'POST') {
    if (!['Admin'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Admin only' })
    const b = req.body
    if (!b.SupplierName) return jsonResponse(context, 400, { error: 'SupplierName required' })
    const r = await query(
      `INSERT INTO tbl_Suppliers (SupplierName, ContactName, Email, Phone, Country, IsActive)
       OUTPUT INSERTED.SupplierID
       VALUES (@name, @contact, @email, @phone, @country, 1)`,
      [
        { name: 'name',    value: b.SupplierName   },
        { name: 'contact', value: b.ContactName || null },
        { name: 'email',   value: b.Email || null   },
        { name: 'phone',   value: b.Phone || null   },
        { name: 'country', value: b.Country || null  },
      ]
    )
    return jsonResponse(context, 201, { SupplierID: r[0].SupplierID })
  }

  if (id && method === 'PUT') {
    if (!['Admin'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Admin only' })
    const b = req.body
    await query(
      `UPDATE tbl_Suppliers
          SET SupplierName = @name, ContactName = @contact, Email = @email,
              Phone = @phone, Country = @country, IsActive = @active
        WHERE SupplierID = @id`,
      [
        { name: 'id',      value: Number(id)          },
        { name: 'name',    value: b.SupplierName       },
        { name: 'contact', value: b.ContactName || null },
        { name: 'email',   value: b.Email || null       },
        { name: 'phone',   value: b.Phone || null       },
        { name: 'country', value: b.Country || null     },
        { name: 'active',  value: b.IsActive ?? 1       },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
