'use strict'
/**
 * Month-end close — the monthly report's accrual method, worked out from the
 * app's own data and stored so a closed month never moves.
 *
 * Per job, for the month P (all figures in AED at the invoice.aedRate setting):
 *   E  job value to date      = value of every day marked up to the end of P
 *   D  previous accrual       = the job's closing accrual at the end of P-1
 *   no legal invoice in P:    removal 0, diff 0, new accrual L = E - D
 *   legal invoice in P:       removal = D, diff K = invoice - D,
 *                             new accrual L = value of days after the invoice period
 *   closing accrual           = D - removal + L
 *   costAccrued               = this month's sub-contract hire cost on the job
 *   closingCost               = prevCost + costAccrued - supplier invoices recorded in P
 *
 * Month: revenue = sum K + sum L; ledger opening = sum D, removed = sum removal,
 * monthAccrual = sum L, closing = opening - removed + monthAccrual; cost by GL
 * line from the live P&L (sub-contract, maintenance, expense grid); net profit
 * = revenue - cost excluding the report's excluded lines.
 *
 * Written into tbl_ActualMonth / tbl_ActualGl / tbl_ActualJobs - the same
 * tables the imported Excel months use - with source 'Month close (app)'.
 * Reopening deletes the month's rows; only the latest closed month can be
 * reopened, so the chain of openings stays intact.
 */
const { sql, query, jobKey, jobKeyOf } = require('./db')

const EXCL_FROM_REPORT_PROFIT = ['Direct - Salary and allowances', "Cost of FY'25"]
const SOURCE = 'Month close (app)'

const monthEnd = (p) => { const [y, m] = p.split('-').map(Number); return new Date(Date.UTC(y, m, 1)) } // first day of next month
const prevPeriod = (p) => { const [y, m] = p.split('-').map(Number); const d = new Date(Date.UTC(y, m - 2, 1)); return d.toISOString().slice(0, 7) }
const aed = (rate, cur, v) => {
  const c = String(cur || 'USD').toUpperCase()
  return c === 'AED' ? Number(v || 0) : c === 'USD' ? Number(v || 0) * rate : null
}
const LINE_OF = (svc) => {
  const s = String(svc || '').toUpperCase()
  if (s.includes('FISH')) return 'Fishing'
  if (s.includes('WHIP')) return 'Whipstock'
  if (s.includes('RENT')) return 'Rentals'
  return null
}
const closingOf = (r) => {
  if (!r) return 0
  if (Number(r.removal || 0) > 0) return Number(r.newAccrual || 0)
  return r.jobValue != null ? Number(r.jobValue) : Number(r.prevAccrual || 0) + Number(r.newAccrual || 0)
}
const closingCostOf = (r) => (r && r.closingCost != null ? Number(r.closingCost) : 0)

async function closedPeriods() {
  const r = await query(`SELECT period, source FROM tbl_ActualMonth ORDER BY period`, [])
  return r.recordset
}

/**
 * Work the month out. Returns { month, gl, jobs, warnings } without saving.
 * `deps` carries glRange / subMonthRows / rateAed from monthly-expenses so the
 * GL side is exactly what the P&L screen shows.
 */
async function computeMonth(period, deps) {
  const rate = await deps.rateAed()
  const end = monthEnd(period)
  const start = new Date(`${period}-01T00:00:00Z`)
  const prev = prevPeriod(period)
  const warnings = []
  const P = [{ name: 'start', type: sql.Date, value: start }, { name: 'end', type: sql.Date, value: end }]

  // 1. Previous month's per-job rows (closing accrual and closing cost per job).
  const pr = await query(`SELECT jobNumber, prevAccrual, jobValue, removal, newAccrual, closingCost FROM tbl_ActualJobs WHERE period = @p`,
    [{ name: 'p', type: sql.Char(7), value: prev }])
  const prevRows = new Map(pr.recordset.map(r => [jobKeyOf(r.jobNumber), r]))

  // 1b. Opening accruals typed by Finance for jobs the app never priced
  //     (their accrual sits in the Excel months' balance, not per job).
  await query(`IF OBJECT_ID('dbo.tbl_AccrualOpening','U') IS NULL
                 CREATE TABLE dbo.tbl_AccrualOpening (jobNumber nvarchar(40) NOT NULL PRIMARY KEY, prevAccrual decimal(18,2) NOT NULL,
                   prevCost decimal(18,2) NULL, note nvarchar(300) NULL, updatedBy nvarchar(100) NULL, updatedAt datetime NULL)`, [])
  const ov = await query(`SELECT jobNumber, prevAccrual, prevCost FROM tbl_AccrualOpening`, [])
  const openings = new Map(ov.recordset.map(r => [jobKeyOf(r.jobNumber), r]))

  // 2. One pass over the field logs: value to date, value in P, unpriced days, per job.
  // Aggregate the logs by their raw JobID first, then normalise the few
  // hundred distinct ids and join the job header on the normalised key -
  // never the five-REPLACE normalisation per log row, which took 25 s.
  const val = await query(
    `WITH agg AS (
       SELECT d.JobID AS jobId,
              SUM(ISNULL(d.RateCharged,0)) AS total,
              SUM(CASE WHEN d.LogDate >= @start THEN ISNULL(d.RateCharged,0) ELSE 0 END) AS inMonth,
              SUM(CASE WHEN d.RateCharged IS NULL THEN 1 ELSE 0 END) AS unpriced,
              SUM(CASE WHEN d.LogDate >= @start AND d.RateCharged IS NULL THEN 1 ELSE 0 END) AS unpricedInMonth,
              MIN(d.LogDate) AS firstDay
         FROM tbl_DailyFieldLogs d
        WHERE d.StatusType IN ('1','S') AND d.LogDate < @end
        GROUP BY d.JobID),
     jk AS (SELECT JobID, Client, Contract, Rig, Well, ServiceType, Currency, ${jobKey('JobID')} AS k FROM tbl_Jobs)
     SELECT a.jobId, j.JobID AS canonical, j.Client AS client, j.Contract AS contract, j.Rig AS rig, j.Well AS well,
            j.ServiceType AS svc, COALESCE(NULLIF(LTRIM(RTRIM(j.Currency)),''),'USD') AS cur,
            a.total, a.inMonth, a.unpriced, a.unpricedInMonth, a.firstDay
       FROM agg a
       LEFT JOIN jk j ON j.k = ${jobKey('a.jobId')}`, P)
  const byJob = new Map()
  const mk = (k, x) => ({ key: k, jobId: x.JobID || x.canonical || x.jobId || x.jobNumber, client: x.Client ?? x.client ?? null,
                          contract: x.Contract ?? x.contract ?? null, rig: x.Rig ?? x.rig ?? null, well: x.Well ?? x.well ?? null,
                          line: LINE_OF(x.ServiceType ?? x.svc), cur: x.Currency ?? x.cur ?? 'USD', E: 0, V: 0, unpriced: 0, unpricedInMonth: 0, firstDay: null })
  for (const r of val.recordset) {
    const k = jobKeyOf(r.jobId)
    const cur = byJob.get(k) || mk(k, r)
    const a = aed(rate, r.cur, r.total), v = aed(rate, r.cur, r.inMonth)
    if (a == null) warnings.push(`${r.jobId}: currency ${r.cur} cannot be converted`)
    else { cur.E += a; cur.V += v || 0 }
    cur.unpriced += Number(r.unpriced || 0); cur.unpricedInMonth += Number(r.unpricedInMonth || 0)
    if (r.firstDay && (!cur.firstDay || r.firstDay < cur.firstDay)) cur.firstDay = r.firstDay
    byJob.set(k, cur)
  }

  // 3. Legal invoices dated in P: app invoices and legacy jobs.
  const inv = await query(
    `SELECT jobNumber, legalInvoiceNumber AS no, legalInvoiceDate AS d, totalAmount AS amt, currency AS cur, periodTo
       FROM tbl_Invoices
      WHERE NULLIF(LTRIM(RTRIM(legalInvoiceNumber)),'') IS NOT NULL AND legalInvoiceDate >= @start AND legalInvoiceDate < @end
     UNION ALL
     SELECT j.JobID, j.LegalInvoiceNumber, j.FinalInvoicedDate, j.InvoiceAmount, j.Currency, NULL
       FROM tbl_Jobs j
      WHERE NULLIF(LTRIM(RTRIM(j.LegalInvoiceNumber)),'') IS NOT NULL
        AND j.FinalInvoicedDate >= @start AND j.FinalInvoicedDate < @end
        AND NOT EXISTS (SELECT 1 FROM tbl_Invoices x WHERE x.jobNumber = j.JobID AND x.legalInvoiceNumber = j.LegalInvoiceNumber)`, P)
  const invByJob = new Map()
  for (const r of inv.recordset) {
    const k = jobKeyOf(r.jobNumber)
    const a = aed(rate, r.cur, r.amt)
    if (a == null) { warnings.push(`${r.jobNumber}: invoice ${r.no} currency ${r.cur} cannot be converted`); continue }
    const cur = invByJob.get(k) || { amount: 0, nos: [], date: null, periodTo: null }
    cur.amount += a; cur.nos.push(r.no); cur.date = r.d
    if (r.periodTo && (!cur.periodTo || r.periodTo > cur.periodTo)) cur.periodTo = r.periodTo
    invByJob.set(k, cur)
  }

  // 4. Jobs known only from a carried accrual or an invoice: fetch their header in one go.
  const need = new Set()
  for (const [k, r] of prevRows) if (!byJob.has(k) && (closingOf(r) !== 0 || closingCostOf(r) !== 0)) need.add(k)
  for (const k of invByJob.keys()) if (!byJob.has(k)) need.add(k)
  if (need.size) {
    const keys = [...need]
    const params = keys.map((k, i) => ({ name: `k${i}`, value: k }))
    const r = await query(
      `SELECT JobID, Client, Contract, Rig, Well, ServiceType, Currency, ${jobKey('JobID')} AS k FROM tbl_Jobs
        WHERE ${jobKey('JobID')} IN (${params.map(p => '@' + p.name).join(',')})`, params)
    const found = new Map(r.recordset.map(x => [x.k, x]))
    for (const k of keys) {
      const x = found.get(k) || { JobID: (prevRows.get(k) || {}).jobNumber || k }
      byJob.set(k, mk(k, x))
    }
  }

  // 5. Value of days after an invoice's period end (uninvoiced new work in P), only for invoiced jobs.
  async function valueAfter(k, cur, after) {
    const r = await query(
      `SELECT SUM(ISNULL(RateCharged,0)) AS v FROM tbl_DailyFieldLogs
        WHERE ${jobKey('JobID')} = @k AND StatusType IN ('1','S') AND LogDate > @after AND LogDate < @end`,
      [{ name: 'k', value: k }, { name: 'after', type: sql.Date, value: after }, { name: 'end', type: sql.Date, value: end }])
    return aed(rate, cur, r.recordset[0]?.v || 0) || 0
  }

  // 6. Sub-contract cost accrued this month per job, and supplier invoices recorded in P per job.
  const fromD = `${period}-01`, toD = end.toISOString().slice(0, 10)
  const subRows = await deps.subMonthRows(fromD, toD)
  const costByJob = new Map()
  for (const r of subRows) {
    if (r.amount == null) continue
    const k = jobKeyOf(r.jobId)
    const a = aed(rate, r.cur, Number(r.amount) * Number(r.mdays) / Number(r.days))
    if (a == null) continue
    costByJob.set(k, (costByJob.get(k) || 0) + a)
  }
  let supInv = { recordset: [] }
  try {
    supInv = await query(
      `SELECT jobId, SUM(ISNULL(invoiceAmount,0)) AS amt, MAX(currency) AS cur FROM tbl_SubContractPOs
        WHERE invoiceDate >= @start AND invoiceDate < @end GROUP BY jobId`, P)
  } catch { /* table not created yet */ }
  const supByJob = new Map(supInv.recordset.map(r => [jobKeyOf(r.jobId), aed(rate, r.cur, r.amt) || 0]))

  // 7. Per-job rows.
  //
  // The transition rule. Months up to the first app close were accrued in the
  // Excel workbook, where "job value to date" was known. The app only knows a
  // value for days it priced, and 47,000 historical days carry no rate - so
  // for a job carried from a previous close the new accrual is the value of
  // the days marked IN this month (new work), never "app value to date minus
  // the carried accrual", which would read every legacy job as a reversal.
  // A job with no carried accrual and no typed opening is new to the app: its
  // accrual is everything it has been priced for to date.
  const jobs = []
  let legacyInvoiced = 0
  for (const j of byJob.values()) {
    const p = prevRows.get(j.key)
    const o = openings.get(j.key)
    const carried = !!p || !!o
    const D = p ? closingOf(p) : (o ? Number(o.prevAccrual || 0) : 0)
    const prevCost = p ? closingCostOf(p) : (o && o.prevCost != null ? Number(o.prevCost) : 0)
    const iv = invByJob.get(j.key)
    const isLegacy = !carried && j.firstDay && new Date(j.firstDay) < start && j.unpriced > 0
    let removal = 0, K = 0, L, E
    if (iv) {
      removal = D
      K = iv.amount - D
      L = iv.periodTo ? await valueAfter(j.key, j.cur, iv.periodTo) : 0
      E = D + L
      if (!carried && isLegacy) legacyInvoiced++
    } else if (carried) {
      L = j.V
      E = D + L
    } else {
      L = j.E
      E = j.E
    }
    const costAccrued = costByJob.get(j.key) || 0
    const closingCost = prevCost + costAccrued - (supByJob.get(j.key) || 0)
    const closing = D - removal + L
    if (!iv && Math.abs(L) < 0.005 && Math.abs(D) < 0.005 && Math.abs(costAccrued) < 0.005 && Math.abs(closingCost) < 0.005) continue
    jobs.push({
      jobNumber: j.jobId, contract: j.contract, client: j.client, rig: j.rig, well: j.well, productLine: j.line,
      prevAccrual: r2(D), jobValue: r2(E), invoiceNo: iv ? iv.nos.join(', ') : null, invoiceValue: iv ? r2(iv.amount) : null,
      invoiceDate: iv ? iv.date : null, removal: r2(removal), diffAmt: r2(K), newAccrual: r2(L), closing: r2(closing),
      prevCost: r2(prevCost), costAccrued: r2(costAccrued), closingCost: r2(closingCost),
      unpricedDays: j.unpricedInMonth, carried, legacy: !!isLegacy,
      notes: [j.unpricedInMonth ? `${j.unpricedInMonth} unpriced day(s) this month` : null,
              isLegacy && iv ? 'legacy job invoiced with no carried accrual - set its opening accrual' : null].filter(Boolean).join('; ') || null,
    })
  }
  jobs.sort((a, b) => (b.newAccrual + b.diffAmt) - (a.newAccrual + a.diffAmt))
  if (legacyInvoiced)
    warnings.push(`${legacyInvoiced} job(s) invoiced this month have no carried accrual: the whole invoice counts as revenue unless you set their opening accrual (click the job's Prev accrual)`)

  // 8. GL cost for the month from the live P&L.
  const g = await deps.glRange(period, period, rate)
  const gl = Object.entries(g.cost).map(([name, m]) => ({
    gl: name, fishing: r2(m.Fishing || 0), whipstock: r2(m.Whipstock || 0), rentals: r2(m.Rentals || 0),
    total: r2((m.Fishing || 0) + (m.Whipstock || 0) + (m.Rentals || 0) + (m.Unallocated || 0)),
  })).filter(x => x.total !== 0)
  const totalCost = gl.filter(x => !EXCL_FROM_REPORT_PROFIT.includes(x.gl)).reduce((a, x) => a + x.total, 0)

  const sum = (f) => r2(jobs.reduce((a, x) => a + (x[f] || 0), 0))
  const prevMonth = await query(`SELECT closing FROM tbl_ActualMonth WHERE period = @p`, [{ name: 'p', type: sql.Char(7), value: prev }])
  // The ledger opening is last month's closing balance. Per-job carries can be
  // less than that when earlier months were closed in the workbook - the rest
  // of the balance belongs to jobs the workbook did not list by name.
  const opening = prevMonth.recordset.length ? r2(Number(prevMonth.recordset[0].closing || 0)) : sum('prevAccrual')
  const unnamed = r2(opening - sum('prevAccrual'))
  if (prevMonth.recordset.length && Math.abs(unnamed) > 1)
    warnings.push(`${unnamed.toFixed(2)} AED of the opening balance is not carried by a named job (accrued in the workbook months). It stays in the balance until those jobs are invoiced; set an opening accrual on a job to move part of it there.`)
  const month = {
    period, prev, rate,
    revenue: r2(sum('diffAmt') + sum('newAccrual')),
    newAccrual: sum('newAccrual'), diffAmt: sum('diffAmt'),
    opening, removed: sum('removal'), monthAccrual: sum('newAccrual'),
    closing: r2(opening - sum('removal') + sum('newAccrual')),
    unnamedOpening: unnamed,
    costAccrual: sum('costAccrued'), totalCost: r2(totalCost),
    netProfit: r2(sum('diffAmt') + sum('newAccrual') - totalCost),
    jobsWithUnpricedDays: jobs.filter(x => x.unpricedDays).length,
  }
  for (const c of g.warnCurrencies || []) warnings.push(`Costs in ${c} could not be converted`)
  return { month, gl, jobs, warnings }
}

const r2 = (v) => Math.round(Number(v || 0) * 100) / 100

async function saveClose(period, data, user) {
  const { month, gl, jobs } = data
  await query(`DELETE FROM tbl_ActualJobs WHERE period=@p; DELETE FROM tbl_ActualGl WHERE period=@p; DELETE FROM tbl_ActualMonth WHERE period=@p;`,
    [{ name: 'p', type: sql.Char(7), value: period }])
  await query(
    `INSERT INTO tbl_ActualMonth (period, revenue, newAccrual, diffAmt, opening, removed, monthAccrual, closing, costAccrual, netProfit, source, importedBy, importedAt)
     VALUES (@p,@rev,@na,@df,@op,@rm,@ma,@cl,@ca,@np,@src,@u,GETDATE())`,
    [{ name: 'p', type: sql.Char(7), value: period },
     ...Object.entries({ rev: month.revenue, na: month.newAccrual, df: month.diffAmt, op: month.opening, rm: month.removed,
                         ma: month.monthAccrual, cl: month.closing, ca: month.costAccrual, np: month.netProfit })
       .map(([k, v]) => ({ name: k, type: sql.Decimal(18, 2), value: v })),
     { name: 'src', type: sql.NVarChar, value: SOURCE }, { name: 'u', type: sql.NVarChar, value: user.Username || null }])
  if (gl.length)
    await query(`INSERT INTO tbl_ActualGl (period, gl, fishing, whipstock, rentals, total, detail)
                 SELECT @p, gl, fishing, whipstock, rentals, total, NULL FROM OPENJSON(@j) WITH (
                   gl nvarchar(100) '$.gl', fishing decimal(18,2) '$.fishing', whipstock decimal(18,2) '$.whipstock',
                   rentals decimal(18,2) '$.rentals', total decimal(18,2) '$.total')`,
      [{ name: 'p', type: sql.Char(7), value: period }, { name: 'j', type: sql.NVarChar(sql.MAX), value: JSON.stringify(gl) }])
  if (jobs.length)
    await query(`INSERT INTO tbl_ActualJobs (period, jobNumber, contract, client, prevAccrual, jobValue, invoiceNo, invoiceValue, icv, invoiceDate,
                   removal, diffAmt, newAccrual, prevCost, costAccrued, closingCost, productLine, descr, rig, well, notes)
                 SELECT @p, jobNumber, contract, client, prevAccrual, jobValue, invoiceNo, invoiceValue, NULL, invoiceDate,
                        removal, diffAmt, newAccrual, prevCost, costAccrued, closingCost, productLine, NULL, rig, well, notes
                   FROM OPENJSON(@j) WITH (jobNumber nvarchar(40) '$.jobNumber', contract nvarchar(80) '$.contract', client nvarchar(120) '$.client',
                     prevAccrual decimal(18,2) '$.prevAccrual', jobValue decimal(18,2) '$.jobValue', invoiceNo nvarchar(60) '$.invoiceNo',
                     invoiceValue decimal(18,2) '$.invoiceValue', invoiceDate date '$.invoiceDate', removal decimal(18,2) '$.removal',
                     diffAmt decimal(18,2) '$.diffAmt', newAccrual decimal(18,2) '$.newAccrual', prevCost decimal(18,2) '$.prevCost',
                     costAccrued decimal(18,2) '$.costAccrued', closingCost decimal(18,2) '$.closingCost', productLine nvarchar(30) '$.productLine',
                     rig nvarchar(60) '$.rig', well nvarchar(60) '$.well', notes nvarchar(300) '$.notes')`,
      [{ name: 'p', type: sql.Char(7), value: period }, { name: 'j', type: sql.NVarChar(sql.MAX), value: JSON.stringify(jobs) }])
}

/** The month that can be closed next, and what is already closed. */
async function status() {
  const closed = await closedPeriods()
  const last = closed.length ? closed[closed.length - 1].period : null
  const now = new Date().toISOString().slice(0, 7)
  const next = last ? (() => { const [y, m] = last.split('-').map(Number); return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7) })() : now
  return { closed, last, next, current: now, nextIsCurrentMonth: next === now, nextIsFuture: next > now }
}

module.exports = { computeMonth, saveClose, status, closedPeriods, prevPeriod, SOURCE }
