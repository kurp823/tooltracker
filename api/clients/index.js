/**
 * Clients API
 * GET  /api/clients       — list
 * POST /api/clients       — create
 * PUT  /api/clients/{id}  — update
 */
const { sql, query, jsonResponse, requireAuth } = require('../db')

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const method = req.method.toUpperCase()
  const id     = context.bindingData.id

  if (method === 'GET') {
    try {
      const result = await query(
        `SELECT ClientID, ClientName, ShortName, Country, Address,
                ContactPerson, ContactEmail, ContactPhone, IsActive
         FROM   tbl_Clients
         ORDER  BY ClientName`
      )
      return jsonResponse(context, 200, result.recordset)
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to load clients' })
    }
  }

  if (method === 'POST') {
    if (!['Admin', 'Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Insufficient permissions' })
    const b = req.body || {}
    if (!b.ClientName)
      return jsonResponse(context, 400, { error: 'ClientName required' })
    try {
      await query(
        `INSERT INTO tbl_Clients (ClientName, ShortName, Country, Address, ContactPerson, ContactEmail, ContactPhone, IsActive)
         VALUES (@name, @short, @country, @addr, @contact, @email, @phone, 1)`,
        [
          { name: 'name',    type: sql.NVarChar, value: b.ClientName },
          { name: 'short',   type: sql.NVarChar, value: b.ShortName      || null },
          { name: 'country', type: sql.NVarChar, value: b.Country        || null },
          { name: 'addr',    type: sql.NVarChar, value: b.Address        || null },
          { name: 'contact', type: sql.NVarChar, value: b.ContactPerson  || null },
          { name: 'email',   type: sql.NVarChar, value: b.ContactEmail   || null },
          { name: 'phone',   type: sql.NVarChar, value: b.ContactPhone   || null },
        ]
      )
      return jsonResponse(context, 201, { success: true })
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to create client' })
    }
  }

  if (method === 'PUT' && id) {
    if (!['Admin', 'Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Insufficient permissions' })
    const b = req.body || {}
    try {
      await query(
        `UPDATE tbl_Clients SET
           ClientName = @name, ShortName = @short, Country = @country,
           Address = @addr, ContactPerson = @contact,
           ContactEmail = @email, ContactPhone = @phone, IsActive = @active
         WHERE ClientID = @id`,
        [
          { name: 'id',      type: sql.Int,      value: parseInt(id) },
          { name: 'name',    type: sql.NVarChar, value: b.ClientName },
          { name: 'short',   type: sql.NVarChar, value: b.ShortName      || null },
          { name: 'country', type: sql.NVarChar, value: b.Country        || null },
          { name: 'addr',    type: sql.NVarChar, value: b.Address        || null },
          { name: 'contact', type: sql.NVarChar, value: b.ContactPerson  || null },
          { name: 'email',   type: sql.NVarChar, value: b.ContactEmail   || null },
          { name: 'phone',   type: sql.NVarChar, value: b.ContactPhone   || null },
          { name: 'active',  type: sql.Bit,      value: b.IsActive ? 1 : 0 },
        ]
      )
      return jsonResponse(context, 200, { success: true })
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to update client' })
    }
  }

  jsonResponse(context, 405, { error: 'Method not allowed' })
}
