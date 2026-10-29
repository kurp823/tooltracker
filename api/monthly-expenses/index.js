'use strict'
const { sql, query, jsonResponse, requireAuth } = require('../db')

/**
 * Monthly expenses, and the P&L they complete.
 *
 *   GET    /api/monthly-expenses?period=YYYY-MM   the month's costs
 *   GET    /api/monthly-expenses/pl?from=&to=     revenue against cost
 *   POST   /api/monthly-expenses                  add a cost
 *   PUT    /api/monthly-expenses/{id}             edit
 *   DELETE /api/monthly-expenses/{id}             remove
 *
 * Revenue already exists in tbl_Invoices, so only the cost side was
 * missing. A null jobId means overhead rather than job cost, which is the
 * distinction the P&L turns on.
 *
 * ── On the margin figure ───────────────────────────────────────────────
 * Invoices and expenses are each held in their own currency and this does
 * not convert between them — there is no rate table to convert with, and
 * inventing one would produce a confident number that is wrong. The P&L
 * therefore reports per currency and says so where a period mixes them.
 */

const EDITORS = ['Admin', 'Finance', 'Billing']
const VIEWERS = ['Admin', 'Finance', 'Billing', 'Operations', 'CostController']

const thisPeriod = () => new Date().toISOString().slice(0, 7)

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  if (!VIEWERS.includes(user.Role))
    return jsonResponse(context, 403, { error: 'Forbidden' })

  const method = req.method.toUpperCase()
  const id     = context.bindingData.id
  const qs     = req.query || {}

  try {
    // ── GET the P&L ────────────────────────────────────────────────────────
    if (method === 'GET' && id === 'pl') {
      const from = qs.from || thisPeriod()
      const to   = qs.to   || thisPeriod()

      // Revenue by month from the invoices already in the system. Invoice
      // date is used rather than period dates, because periodFrom/To are
      // blank on most rows while invoiceDate is not.
      const revenue = await query(
        `SELECT CONVERT(char(7), COALESCE(i.invoiceDate, i.createdAt), 126) AS period,
                COALESCE(NULLIF(LTRIM(RTRIM(i.currency)), ''), '(unset)')   AS currency,
                COUNT(*)                        AS invoices,
                COALESCE(SUM(i.totalAmount), 0) AS amount
           FROM tbl_Invoices i
          WHERE COALESCE(i.invoiceDate, i.createdAt) IS NOT NULL
            AND CONVERT(char(7), COALESCE(i.invoiceDate, i.createdAt), 126) BETWEEN @from AND @to
            AND COALESCE(i.status, '') <> 'Cancelled'
          GROUP BY CONVERT(char(7), COALESCE(i.invoiceDate, i.createdAt), 126),
                   COALESCE(NULLIF(LTRIM(RTRIM(i.currency)), ''), '(unset)')`,
        [{ name: 'from', type: sql.Char(7), value: from },
         { name: 'to',   type: sql.Char(7), value: to }]
      )

      const cost = await query(
        `SELECT e.period,
                COALESCE(NULLIF(LTRIM(RTRIM(e.currency)), ''), '(unset)') AS currency,
                e.category,
                CASE WHEN e.jobId IS NULL OR LTRIM(RTRIM(e.jobId)) = ''
                     THEN 'Overhead' ELSE 'Job cost' END AS kind,
                COUNT(*)                   AS entries,
                COALESCE(SUM(e.amount), 0) AS amount
           FROM tbl_MonthlyExpenses e
          WHERE e.period BETWEEN @from AND @to
          GROUP BY e.period,
                   COALESCE(NULLIF(LTRIM(RTRIM(e.currency)), ''), '(unset)'),
                   e.category,
                   CASE WHEN e.jobId IS NULL OR LTRIM(RTRIM(e.jobId)) = ''
                        THEN 'Overhead' ELSE 'Job cost' END
          ORDER BY e.period, SUM(e.amount) DESC`,
        [{ name: 'from', type: sql.Char(7), value: from },
         { name: 'to',   type: sql.Char(7), value: to }]
      )

      // Per period AND per currency, so nothing is added that should not be.
      const byPeriod = {}
      const put = (p, cur, field, v) => {
        const k = `${p}|${cur}`
        byPeriod[k] = byPeriod[k] || { period: p, currency: cur, revenue: 0, cost: 0 }
        byPeriod[k][field] += Number(v)
      }
      revenue.recordset.forEach(r => put(r.period, r.currency, 'revenue', r.amount))
      cost.recordset.forEach(r => put(r.period, r.currency, 'cost', r.amount))

      const periods = Object.values(byPeriod)
        .map(p => ({ ...p, margin: p.revenue - p.cost,
                     marginPct: p.revenue ? ((p.revenue - p.cost) / p.revenue) * 100 : null }))
        .sort((a, b) => a.period.localeCompare(b.period) || a.currency.localeCompare(b.currency))

      const currencies = [...new Set(periods.map(p => p.currency))]

      return jsonResponse(context, 200, {
        from, to, periods,
        byCategory: cost.recordset,
        mixedCurrency: currencies.length > 1,
        currencies,
      })
    }

    // ── GET the month's entries ────────────────────────────────────────────
    if (method === 'GET' && !id) {
      const period = qs.period || thisPeriod()
      const r = await query(
        `SELECT * FROM tbl_MonthlyExpenses
          WHERE period = @p
            AND (@job IS NULL OR jobId = @job)
          ORDER BY category, id`,
        [{ name: 'p',   type: sql.Char(7), value: period },
         { name: 'job', type: sql.NVarChar, value: qs.jobId || null }]
      )
      return jsonResponse(context, 200, r.recordset)
    }

    // ── POST add ───────────────────────────────────────────────────────────
    if (method === 'POST' && !id) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const b = req.body || {}
      const period = String(b.period || '').trim()
      // Checked here rather than left to the column: char(7) would silently
      // pad or truncate anything else and the month would quietly be wrong.
      if (!/^\d{4}-\d{2}$/.test(period))
        return jsonResponse(context, 400, { error: 'Period must be YYYY-MM' })
      if (!String(b.category || '').trim())
        return jsonResponse(context, 400, { error: 'Category is required' })
      const amount = Number(b.amount)
      if (!Number.isFinite(amount))
        return jsonResponse(context, 400, { error: 'Amount must be a number' })

      const r = await query(
        `INSERT INTO tbl_MonthlyExpenses
           (period, category, jobId, supplierName, invoiceRef, amount, currency, notes, createdBy)
         OUTPUT INSERTED.id
         VALUES (@p, @cat, @job, @sup, @inv, @amt, @cur, @notes, @by)`,
        [
          { name: 'p',    type: sql.Char(7),  value: period },
          { name: 'cat',  type: sql.NVarChar, value: String(b.category).trim() },
          { name: 'job',  type: sql.NVarChar, value: b.jobId || null },
          { name: 'sup',  type: sql.NVarChar, value: b.supplierName || null },
          { name: 'inv',  type: sql.NVarChar, value: b.invoiceRef || null },
          { name: 'amt',  type: sql.Decimal(18, 2), value: amount },
          { name: 'cur',  type: sql.NVarChar, value: b.currency || null },
          { name: 'notes',type: sql.NVarChar, value: b.notes || null },
          { name: 'by',   type: sql.NVarChar, value: user.Username || null },
        ]
      )
      return jsonResponse(context, 201, { id: r.recordset[0].id })
    }

    // ── PUT edit ───────────────────────────────────────────────────────────
    if (method === 'PUT' && id) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const b = req.body || {}
      const amount = Number(b.amount)
      if (!Number.isFinite(amount))
        return jsonResponse(context, 400, { error: 'Amount must be a number' })

      await query(
        `UPDATE tbl_MonthlyExpenses
            SET category = @cat, jobId = @job, supplierName = @sup,
                invoiceRef = @inv, amount = @amt, currency = @cur,
                notes = @notes, updatedAt = GETDATE()
          WHERE id = @id`,
        [
          { name: 'id',   type: sql.Int,      value: Number(id) },
          { name: 'cat',  type: sql.NVarChar, value: b.category || null },
          { name: 'job',  type: sql.NVarChar, value: b.jobId || null },
          { name: 'sup',  type: sql.NVarChar, value: b.supplierName || null },
          { name: 'inv',  type: sql.NVarChar, value: b.invoiceRef || null },
          { name: 'amt',  type: sql.Decimal(18, 2), value: amount },
          { name: 'cur',  type: sql.NVarChar, value: b.currency || null },
          { name: 'notes',type: sql.NVarChar, value: b.notes || null },
        ]
      )
      return jsonResponse(context, 200, { ok: true })
    }

    // ── DELETE ─────────────────────────────────────────────────────────────
    if (method === 'DELETE' && id) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })
      await query(`DELETE FROM tbl_MonthlyExpenses WHERE id = @id`,
        [{ name: 'id', type: sql.Int, value: Number(id) }])
      return jsonResponse(context, 200, { ok: true })
    }

    return jsonResponse(context, 405, { error: 'Method not allowed' })
  } catch (err) {
    context.log.error('Monthly expenses error:', err)
    return jsonResponse(context, 500, { error: 'Monthly expenses operation failed', detail: err.message })
  }
}
