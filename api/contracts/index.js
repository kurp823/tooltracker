/**
 * Contracts API
 * GET  /api/contracts             — list
 * POST /api/contracts             — create
 * PUT  /api/contracts/{id}        — update
 * GET  /api/contracts/{id}/rates  — rate lines for a contract
 * POST /api/contracts/{id}/rates  — add rate line
 * PUT  /api/contracts/{id}/rates/{rid} — update rate line
 */
const { sql, query, jsonResponse, requireAuth } = require('../db')

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const method = req.method.toUpperCase()
  const id     = context.bindingData.id
  const sub    = context.bindingData.sub   // 'rates'
  const subId  = context.bindingData.subId // rate ID

  // ── GET /api/contracts ────────────────────────────────────────────────────
  if (method === 'GET' && !id) {
    try {
      const result = await query(
        `SELECT c.ContractID, c.ContractNumber, c.ContractName,
                c.ClientID, cl.ClientName,
                c.StartDate, c.EndDate, c.Status, c.Currency,
                c.Description, c.IsActive
         FROM   tbl_Contracts c
         LEFT   JOIN tbl_Clients cl ON c.ClientID = cl.ClientID
         ORDER  BY c.ContractNumber`
      )
      return jsonResponse(context, 200, result.recordset)
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to load contracts' })
    }
  }

  // ── GET /api/contracts/{id}/rates ─────────────────────────────────────────
  if (method === 'GET' && id && sub === 'rates') {
    try {
      const result = await query(
        `SELECT r.RateID, r.ContractID, r.Description, r.ItemCode,
                r.UnitPrice, r.Currency, r.UOM, r.IsActive
         FROM   tbl_ContractRates r
         WHERE  r.ContractID = @id
         ORDER  BY r.ItemCode`,
        [{ name: 'id', type: sql.Int, value: parseInt(id) }]
      )
      return jsonResponse(context, 200, result.recordset)
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to load rates' })
    }
  }

  // ── POST /api/contracts ───────────────────────────────────────────────────
  if (method === 'POST' && !id) {
    if (!['Admin', 'Operations', 'Finance'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Insufficient permissions' })
    const b = req.body || {}
    if (!b.ContractNumber)
      return jsonResponse(context, 400, { error: 'ContractNumber required' })
    try {
      await query(
        `INSERT INTO tbl_Contracts
           (ContractNumber, ContractName, ClientID, StartDate, EndDate, Status, Currency, Description, IsActive)
         VALUES (@num, @name, @client, @start, @end, @status, @currency, @desc, 1)`,
        [
          { name: 'num',      type: sql.NVarChar, value: b.ContractNumber },
          { name: 'name',     type: sql.NVarChar, value: b.ContractName   || null },
          { name: 'client',   type: sql.Int,      value: b.ClientID       || null },
          { name: 'start',    type: sql.Date,     value: b.StartDate      ? new Date(b.StartDate) : null },
          { name: 'end',      type: sql.Date,     value: b.EndDate        ? new Date(b.EndDate)   : null },
          { name: 'status',   type: sql.NVarChar, value: b.Status         || 'Active' },
          { name: 'currency', type: sql.NVarChar, value: b.Currency       || 'USD' },
          { name: 'desc',     type: sql.NVarChar, value: b.Description    || null },
        ]
      )
      return jsonResponse(context, 201, { success: true })
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to create contract' })
    }
  }

  // ── PUT /api/contracts/{id} ───────────────────────────────────────────────
  if (method === 'PUT' && id && !sub) {
    if (!['Admin', 'Operations', 'Finance'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Insufficient permissions' })
    const b = req.body || {}
    try {
      await query(
        `UPDATE tbl_Contracts SET
           ContractName = @name, ClientID = @client,
           StartDate = @start, EndDate = @end,
           Status = @status, Currency = @currency,
           Description = @desc, IsActive = @active
         WHERE ContractID = @id`,
        [
          { name: 'id',       type: sql.Int,      value: parseInt(id) },
          { name: 'name',     type: sql.NVarChar, value: b.ContractName   || null },
          { name: 'client',   type: sql.Int,      value: b.ClientID       || null },
          { name: 'start',    type: sql.Date,     value: b.StartDate      ? new Date(b.StartDate) : null },
          { name: 'end',      type: sql.Date,     value: b.EndDate        ? new Date(b.EndDate)   : null },
          { name: 'status',   type: sql.NVarChar, value: b.Status         || 'Active' },
          { name: 'currency', type: sql.NVarChar, value: b.Currency       || 'USD' },
          { name: 'desc',     type: sql.NVarChar, value: b.Description    || null },
          { name: 'active',   type: sql.Bit,      value: b.IsActive ? 1 : 0 },
        ]
      )
      return jsonResponse(context, 200, { success: true })
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to update contract' })
    }
  }

  // ── POST /api/contracts/{id}/rates ────────────────────────────────────────
  if (method === 'POST' && id && sub === 'rates') {
    if (!['Admin', 'Finance', 'Billing'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Insufficient permissions' })
    const b = req.body || {}
    try {
      await query(
        `INSERT INTO tbl_ContractRates (ContractID, Description, ItemCode, UnitPrice, Currency, UOM, IsActive)
         VALUES (@cid, @desc, @code, @price, @currency, @uom, 1)`,
        [
          { name: 'cid',      type: sql.Int,      value: parseInt(id) },
          { name: 'desc',     type: sql.NVarChar, value: b.Description || null },
          { name: 'code',     type: sql.NVarChar, value: b.ItemCode    || null },
          { name: 'price',    type: sql.Decimal,  value: b.UnitPrice   || 0 },
          { name: 'currency', type: sql.NVarChar, value: b.Currency    || 'USD' },
          { name: 'uom',      type: sql.NVarChar, value: b.UOM         || null },
        ]
      )
      return jsonResponse(context, 201, { success: true })
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to add rate' })
    }
  }

  jsonResponse(context, 405, { error: 'Method not allowed' })
}
