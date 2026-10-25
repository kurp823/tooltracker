/**
 * Clients API
 * GET  /api/clients       — list
 * POST /api/clients       — create
 * PUT  /api/clients/{id}  — update
 *
 * Real tbl_Clients columns (confirmed via INFORMATION_SCHEMA):
 *   id, clientCode, clientName, invoicingType, standbyCapDays, currency,
 *   requiresDraftApproval, contactName, contactEmail, contactPhone,
 *   address, notes, active, createdBy, createdAt, updatedAt
 * (No ClientID/ShortName/Country/ContactPerson/IsActive — those don't
 * exist. SQL aliases output back to the PascalCase names the frontend
 * already expects, so no frontend changes are needed. "Country" has no
 * real counterpart and comes back null; "ShortName" is mapped to the
 * real clientCode column.)
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
        `SELECT id AS ClientID, clientName AS ClientName, clientCode AS ShortName,
                NULL AS Country, address AS Address,
                contactName AS ContactPerson, contactEmail AS ContactEmail,
                contactPhone AS ContactPhone, active AS IsActive
         FROM   tbl_Clients
         ORDER  BY clientName`
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

    const code = (b.ShortName || b.ClientName).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)

    try {
      await query(
        `INSERT INTO tbl_Clients (clientCode, clientName, address, contactName, contactEmail, contactPhone, currency, active, createdBy, createdAt)
         VALUES (@code, @name, @addr, @contact, @email, @phone, @currency, 1, @by, GETDATE())`,
        [
          { name: 'code',     type: sql.NVarChar, value: code },
          { name: 'name',     type: sql.NVarChar, value: b.ClientName },
          { name: 'addr',     type: sql.NVarChar, value: b.Address        || null },
          { name: 'contact',  type: sql.NVarChar, value: b.ContactPerson  || null },
          { name: 'email',    type: sql.NVarChar, value: b.ContactEmail   || null },
          { name: 'phone',    type: sql.NVarChar, value: b.ContactPhone   || null },
          { name: 'currency', type: sql.NVarChar, value: b.Country        || 'USD' },
          { name: 'by',       type: sql.NVarChar, value: user.Username },
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
           clientName = @name, address = @addr, contactName = @contact,
           contactEmail = @email, contactPhone = @phone, active = @active,
           updatedAt = GETDATE()
         WHERE id = @id`,
        [
          { name: 'id',      type: sql.Int,      value: parseInt(id) },
          { name: 'name',    type: sql.NVarChar, value: b.ClientName },
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
