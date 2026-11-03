'use strict'
const { sql, query, jsonResponse, requireAuth, jobKey, jobKeyOf, safe } = require('../db')
const { ensureLines, ownerSql, sheetApply } = require('../sub-lines')

/**
 * Sub-contractor rate sheets.
 *
 *   GET    /api/sub-rates                  every rate (?supplier=)
 *   GET    /api/sub-rates?resolve=<job>    each hired-in tool on a job, with the sheet rate that applies
 *   PUT    /api/sub-rates                  add or change one rate
 *   POST   /api/sub-rates                  import many ({ rows: [...] })
 *   DELETE /api/sub-rates/{id}
 *
 * The sheet is the supplier's agreement: category, size, how it is charged
 * (day / month / lump sum) and the rate, for every contract or one. A job
 * picks its rates from here; only the exceptions are typed on the job.
 */

const VIEWERS = ['Admin', 'Operations', 'Billing', 'Finance', 'CostController', 'Executive']
const EDITORS = ['Admin', 'Billing', 'Finance', 'CostController']

const clean = v => (v == null ? '' : String(v).trim())

function normalise(b) {
  const supplierName = clean(b.supplierName), category = clean(b.category)
  const basis = clean(b.basis), rate = Number(b.rate)
  if (!supplierName) return { error: 'Supplier is required' }
  if (!category)     return { error: 'Category is required' }
  if (!basis)        return { error: 'How it is charged is required' }
  if (b.rate === '' || b.rate == null || !(rate >= 0)) return { error: 'Rate must be a number' }
  return { v: { supplierName, category, size: clean(b.size), contractCode: clean(b.contractCode),
                basis, rate, currency: clean(b.currency) || null, notes: clean(b.notes) || null } }
}

async function upsert(v, by) {
  await query(
    `MERGE tbl_SubContractRates AS t
      USING (SELECT @sup AS supplierName, @cat AS category, @size AS size, @con AS contractCode) AS s
         ON UPPER(t.supplierName) = UPPER(s.supplierName) AND UPPER(t.category) = UPPER(s.category)
        AND UPPER(t.size) = UPPER(s.size) AND UPPER(t.contractCode) = UPPER(s.contractCode)
      WHEN MATCHED THEN UPDATE SET basis = @basis, rate = @rate, currency = @cur, notes = @notes,
           active = 1, updatedBy = @by, updatedAt = GETDATE()
      WHEN NOT MATCHED THEN INSERT (supplierName, category, size, contractCode, basis, rate, currency, notes, updatedBy)
           VALUES (@sup, @cat, @size, @con, @basis, @rate, @cur, @notes, @by);`,
    [
      { name: 'sup',   type: sql.NVarChar, value: v.supplierName },
      { name: 'cat',   type: sql.NVarChar, value: v.category },
      { name: 'size',  type: sql.NVarChar, value: v.size },
      { name: 'con',   type: sql.NVarChar, value: v.contractCode },
      { name: 'basis', type: sql.NVarChar, value: v.basis },
      { name: 'rate',  type: sql.Decimal(18, 2), value: v.rate },
      { name: 'cur',   type: sql.NVarChar, value: v.currency },
      { name: 'notes', type: sql.NVarChar, value: v.notes },
      { name: 'by',    type: sql.NVarChar, value: by || null },
    ])
}

module.exports = safe(async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  if (!VIEWERS.includes(user.Role)) return jsonResponse(context, 403, { error: 'Forbidden' })
  await ensureLines()

  const method = req.method.toUpperCase()
  const id = context.bindingData.id
  const qs = req.query || {}

  if (method === 'GET') {
    // Hired-in tools on a job (from its delivery tickets) with the sheet rate that applies.
    if (qs.resolve) {
      const r = await query(
        `SELECT DISTINCT i.SystemID AS toolSerial, i.AssetNo AS assetNo, i.ShortDesc AS category, i.Size AS size,
                ${ownerSql('i')} AS supplier, j.Contract AS contract,
                sh.sheetId, sh.sheetBasis, sh.sheetRate, sh.sheetCurrency
           FROM tbl_DeliveryTicketLines dl
           JOIN tbl_DeliveryTickets d ON d.dtNumber = dl.dtNumber
           JOIN tbl_Inventory i ON (i.SystemID = dl.serial OR i.AssetNo = dl.serial) AND i.IsEmdad = 0
           LEFT JOIN tbl_Jobs j ON ${jobKey('j.JobID')} = ${jobKey('d.jobNumber')}
           ${sheetApply(ownerSql('i'), 'i.ShortDesc', 'i.Size', 'j.Contract')}
          WHERE ${jobKey('d.jobNumber')} = @jk
            AND NOT (UPPER(COALESCE(i.Ownership, '')) = 'EMDAD' AND UPPER(COALESCE(i.Supplier, '')) IN ('EMDAD', ''))`,
        [{ name: 'jk', type: sql.NVarChar, value: jobKeyOf(qs.resolve) }])
      return jsonResponse(context, 200, r.recordset)
    }
    const sup = clean(qs.supplier)
    const r = await query(
      `SELECT id, supplierName, category, size, contractCode, basis, rate, currency, notes, active, updatedBy, updatedAt
         FROM tbl_SubContractRates WHERE (@sup = '' OR supplierName = @sup)
        ORDER BY supplierName, category, size, contractCode`,
      [{ name: 'sup', type: sql.NVarChar, value: sup }])
    return jsonResponse(context, 200, r.recordset)
  }

  if (!EDITORS.includes(user.Role))
    return jsonResponse(context, 403, { error: 'Only Admin, Billing, Finance or Cost Control can change a rate sheet' })

  if (method === 'PUT') {
    const n = normalise(req.body || {})
    if (n.error) return jsonResponse(context, 400, { error: n.error })
    await upsert(n.v, user.Username)
    return jsonResponse(context, 200, { ok: true })
  }

  if (method === 'POST') {
    const rows = Array.isArray((req.body || {}).rows) ? req.body.rows : []
    if (!rows.length) return jsonResponse(context, 400, { error: 'No rows to import' })
    if (rows.length > 3000) return jsonResponse(context, 400, { error: 'Import up to 3,000 rows at a time' })
    const bad = []
    let done = 0
    for (let i = 0; i < rows.length; i++) {
      const n = normalise(rows[i])
      if (n.error) { bad.push({ row: i + 1, error: n.error }); continue }
      await upsert(n.v, user.Username); done++
    }
    return jsonResponse(context, 200, { ok: true, imported: done, rejected: bad.slice(0, 50), rejectedCount: bad.length })
  }

  if (method === 'DELETE' && id) {
    await query(`DELETE FROM tbl_SubContractRates WHERE id = @id`, [{ name: 'id', type: sql.Int, value: Number(id) }])
    return jsonResponse(context, 200, { ok: true })
  }
  return jsonResponse(context, 405, { error: 'Method not allowed' })
})
