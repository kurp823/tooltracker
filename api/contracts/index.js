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
        // Returns the real tbl_Contracts columns. This previously selected
        // invented aliases (ContractName built as "Client - Ref", a ClientID
        // that does not exist on the table) and silently dropped PBGNumber,
        // PBGValue, PBGIssueDate, PBGExpiryDate, ContractValue, PONumber and
        // InvoicedToDate — so the register had no PBG details even though
        // 13 contracts carry them.
        // MonthlyCharges added: column exists on tbl_Contracts but was
        // missing from this SELECT, so it never reached the frontend.
        `SELECT c.ContractID,
                c.ContractRef      AS ContractNumber,
                c.Client           AS ClientName,
                c.PONumber,
                c.Currency,
                c.StartDate,
                c.EndDate,
                c.Status,
                c.Notes            AS Description,
                c.ContractValue,
                c.MonthlyCharges,
                c.InvoicedToDate,
                c.PBGNumber,
                c.PBGValue,
                c.PBGIssueDate,
                c.PBGExpiryDate,
                CASE WHEN c.Status = 'Active' THEN 1 ELSE 0 END AS IsActive
         FROM   tbl_Contracts c
         ORDER  BY CASE WHEN c.Status = 'Active' THEN 0
                        WHEN c.Status = 'Closed' THEN 1
                        ELSE 2 END,
                  c.ContractRef`
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
        // Previously returned 7 old PascalCase aliases that didn't match the
        // ContractRateItem frontend type and dropped HoleSection, StandbyRate,
        // RunCharges and Redress entirely. Now returns all rate fields using
        // the camelCase keys the frontend ContractRateItem type expects.
        // monthlyCharges lives on tbl_Contracts (not on tbl_ContractRates) so
        // it is NULL here; the contracts GET endpoint returns it on the
        // parent contract object.
        `SELECT r.RateID          AS no,
                r.ContractRef     AS contractRef,
                r.Category        AS category,
                r.EMDADShortDesc  AS shortDesc,
                r.Size            AS size,
                r.HoleSection     AS holeSection,
                r.OpsRate         AS opsRate,
                r.StandbyRate     AS standbyRate,
                r.RunCharges      AS runCharges,
                NULL              AS monthlyCharges,
                r.Redress         AS redress,
                r.Currency        AS currency,
                r.ActiveFlag      AS isActive
         FROM   tbl_ContractRates r
         WHERE  r.ContractCode = @id
         ORDER  BY r.Category, r.HoleSection, r.Size`,
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
      // Look up ContractRef from tbl_Contracts so we can store the human-
      // readable ref (e.g. "ADNOC-4700024608-SCH2") alongside the ContractCode
      // (the PK "CT-ADNOC-4700024608-SCH2"). Fall back to b.contractRef if
      // the body already carries it, or to the raw id as a last resort.
      let contractRef = b.contractRef || id
      if (!b.contractRef) {
        try {
          const refRow = await query(
            `SELECT TOP 1 ContractRef FROM tbl_Contracts WHERE ContractID = @id`,
            [{ name: 'id', type: sql.VarChar, value: id }]
          )
          if (refRow.recordset[0]?.ContractRef) contractRef = refRow.recordset[0].ContractRef
        } catch (_) { /* non-fatal — fall back to id */ }
      }

      // Previously wrote only 7 of 15 columns using old PascalCase body field
      // aliases (Description, ItemCode, UnitPrice, UOM). Frontend now sends
      // camelCase matching ContractRateItem. All rate columns now written.
      await query(
        `INSERT INTO tbl_ContractRates
           (ContractCode, ContractRef, Category, EMDADShortDesc, Size,
            HoleSection, OpsRate, StandbyRate, RunCharges, Redress,
            Currency, Notes, ActiveFlag)
         VALUES
           (@cid, @ref, @category, @shortDesc, @size,
            @holeSection, @opsRate, @standbyRate, @runCharges, @redress,
            @currency, NULL, 1)`,
        [
          { name: 'cid',         type: sql.VarChar,  value: id },
          { name: 'ref',         type: sql.VarChar,  value: contractRef },
          { name: 'category',    type: sql.VarChar,  value: b.category    || null },
          { name: 'shortDesc',   type: sql.VarChar,  value: b.shortDesc   || null },
          { name: 'size',        type: sql.VarChar,  value: b.size        || null },
          { name: 'holeSection', type: sql.VarChar,  value: b.holeSection || null },
          { name: 'opsRate',     type: sql.Decimal,  value: b.opsRate     ?? 0 },
          { name: 'standbyRate', type: sql.Decimal,  value: b.standbyRate ?? null },
          { name: 'runCharges',  type: sql.Decimal,  value: b.runCharges  ?? null },
          { name: 'redress',     type: sql.Decimal,  value: b.redress     ?? null },
          { name: 'currency',    type: sql.VarChar,  value: b.currency    || 'USD' },
        ]
      )
      return jsonResponse(context, 201, { success: true })
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to add rate' })
    }
  }

  // ── DELETE /api/contracts/{id} ───────────────────────────────────────────
  // Removing a contract created in error. Guarded: a contract that any job is
  // booked against is never deleted, because that would leave those jobs
  // pointing at nothing and silently break their billing lineage. Rates
  // belonging to the contract go with it.
  if (method === 'DELETE' && id && !sub) {
    if (user.Role !== 'Admin')
      return jsonResponse(context, 403, { error: 'Admin only' })

    try {
      // tbl_Contracts has ContractID and ContractRef; 'ContractNumber' is only
      // an alias in this file's SELECT, so referencing it here threw.
      // tbl_Jobs.Contract holds either the id or the ref depending on vintage.
      const inUse = await query(
        `SELECT COUNT(*) AS n FROM tbl_Jobs
          WHERE Contract = @id
             OR Contract = (SELECT TOP 1 ContractRef FROM tbl_Contracts WHERE ContractID = @id)`,
        [{ name: 'id', type: sql.VarChar, value: id }]
      )
      const n = Number(inUse.recordset[0]?.n || 0)
      if (n > 0) {
        return jsonResponse(context, 409, {
          error: `Cannot delete: ${n} job${n === 1 ? ' is' : 's are'} booked against this contract`,
          jobsAffected: n,
        })
      }

      await query('DELETE FROM tbl_ContractRates WHERE ContractCode = @id OR ContractRef = @id',
        [{ name: 'id', type: sql.VarChar, value: id }])
      const r = await query('DELETE FROM tbl_Contracts WHERE ContractID = @id',
        [{ name: 'id', type: sql.VarChar, value: id }])

      return jsonResponse(context, 200, { ok: true, deleted: r.rowsAffected?.[0] ?? 0 })
    } catch (err) {
      context.log.error('Contract delete error:', err)
      return jsonResponse(context, 500, { error: 'Failed to delete contract', detail: err.message })
    }
  }

  jsonResponse(context, 405, { error: 'Method not allowed' })
}
