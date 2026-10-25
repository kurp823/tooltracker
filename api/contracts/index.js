/**
 * Contracts API
 * GET  /api/contracts             — list
 * POST /api/contracts             — create
 * PUT  /api/contracts/{id}        — update
 * GET  /api/contracts/{id}/rates  — rate lines for a contract
 * POST /api/contracts/{id}/rates  — add rate line
 *
 * Real tbl_Contracts columns (confirmed via INFORMATION_SCHEMA):
 *   ContractID (varchar PK), Client, ContractRef, PONumber, Currency,
 *   StartDate, EndDate, Status, Notes, ContractValue, PBGNumber,
 *   PBGValue, PBGIssueDate, PBGExpiryDate, InvoicedToDate
 * Real tbl_ContractRates columns:
 *   RateID, ContractCode, ContractName, ContractRef, Category,
 *   EMDADShortDesc, Size, HoleSection, OpsRate, StandbyRate, RunCharges,
 *   Redress, Currency, Notes, ActiveFlag
 * (No ContractNumber/ClientID/Description/IsActive on tbl_Contracts —
 * Client is already a plain text name, not an FK. Rates link to a
 * contract by ContractCode text, not a numeric ContractID. SQL aliases
 * output back to the PascalCase names the frontend already expects.)
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
        `SELECT c.ContractID, c.ContractRef AS ContractNumber,
                c.Client + ' - ' + c.ContractRef AS ContractName,
                NULL AS ClientID, c.Client AS ClientName,
                c.StartDate, c.EndDate, c.Status, c.Currency,
                c.Notes AS Description,
                CASE WHEN c.Status = 'Active' THEN 1 ELSE 0 END AS IsActive
         FROM   tbl_Contracts c
         ORDER  BY c.ContractRef`
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
        `SELECT r.RateID, r.ContractCode AS ContractID, r.EMDADShortDesc AS Description,
                r.Category AS ItemCode, r.OpsRate AS UnitPrice, r.Currency,
                r.Size AS UOM, r.ActiveFlag AS IsActive
         FROM   tbl_ContractRates r
         WHERE  r.ContractCode = @id
         ORDER  BY r.Category`,
        [{ name: 'id', value: id }]
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

    const newId = `CT-${b.ContractNumber}`

    try {
      await query(
        `INSERT INTO tbl_Contracts
           (ContractID, Client, ContractRef, Currency, StartDate, EndDate, Status, Notes)
         VALUES (@id, @client, @ref, @currency, @start, @end, @status, @desc)`,
        [
          { name: 'id',       type: sql.VarChar,  value: newId },
          { name: 'client',   type: sql.VarChar,  value: b.ClientName || b.ContractName || '' },
          { name: 'ref',      type: sql.VarChar,  value: b.ContractNumber },
          { name: 'currency', type: sql.VarChar,  value: b.Currency       || 'USD' },
          { name: 'start',    type: sql.Date,     value: b.StartDate      ? new Date(b.StartDate) : null },
          { name: 'end',      type: sql.Date,     value: b.EndDate        ? new Date(b.EndDate)   : null },
          { name: 'status',   type: sql.VarChar,  value: b.Status         || 'Active' },
          { name: 'desc',     type: sql.VarChar,  value: b.Description    || null },
        ]
      )
      return jsonResponse(context, 201, { success: true, ContractID: newId })
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
           Client = @client, StartDate = @start, EndDate = @end,
           Status = @status, Currency = @currency, Notes = @desc
         WHERE ContractID = @id`,
        [
          { name: 'id',       type: sql.VarChar,  value: id },
          { name: 'client',   type: sql.VarChar,  value: b.ClientName     || '' },
          { name: 'start',    type: sql.Date,     value: b.StartDate      ? new Date(b.StartDate) : null },
          { name: 'end',      type: sql.Date,     value: b.EndDate        ? new Date(b.EndDate)   : null },
          { name: 'status',   type: sql.VarChar,  value: b.Status         || 'Active' },
          { name: 'currency', type: sql.VarChar,  value: b.Currency       || 'USD' },
          { name: 'desc',     type: sql.VarChar,  value: b.Description    || null },
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
        `INSERT INTO tbl_ContractRates (ContractCode, ContractRef, Category, EMDADShortDesc, Size, OpsRate, Currency, Notes, ActiveFlag)
         VALUES (@cid, @cid, @code, @desc, @uom, @price, @currency, NULL, 1)`,
        [
          { name: 'cid',      type: sql.VarChar,  value: id },
          { name: 'desc',     type: sql.VarChar,  value: b.Description || null },
          { name: 'code',     type: sql.VarChar,  value: b.ItemCode    || null },
          { name: 'price',    type: sql.Decimal,  value: b.UnitPrice   || 0 },
          { name: 'currency', type: sql.VarChar,  value: b.Currency    || 'USD' },
          { name: 'uom',      type: sql.VarChar,  value: b.UOM         || null },
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
