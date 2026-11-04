'use strict'
const { sql, query, jsonResponse, requireAuth, safe } = require('../db')

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


// ── GL layout (Sub-division wise P&L) ──────────────────────────────────────
const { ensureLines, ownerSql, sheetApply, amountSql } = require('../sub-lines')
const { jobKey } = require('../db')

// Master P&L lines as they appear on the monthly report. Seeded into the
// ExpenseCategory list (added if missing, never re-added once an Admin removes
// or renames one is NOT guaranteed - only absent names are inserted).
const GL_LINES = [
  'Cost of Materials', 'Cost of Materials - From EEI', 'Cost of Service', 'Direct - Accommodation',
  'Repair And Maintenance', 'Lease Rental-LPV', 'Lease Rental-HV', 'Lease Rental-Equipment',
  'HSE Expenses', 'Bank Guarantee Charges', 'Freight & Courier Exp', 'Machining/Calibration',
  'Inspection/Testing', 'Dep P&M', 'Training & Professional Development',
  'Office/Warehouse/Accommodation Space Rental', 'Vehicle Rep & Maint', 'Vehicle Petrol',
  'Vehicle Insurance & Registration', 'Vehicle Rental AUH-GHQ', 'Office Exp',
  'Intellectual Property Rights', 'Communication Allowance', 'Dep Intellectual Property Rights',
  'Asset Clearance',
]
const SUB_GL = 'Lease Rental-Equipment'   // fed by sub-contract hire cost on jobs
const MNT_GL = 'Repair And Maintenance'   // fed by maintenance & redress cost on jobs
const LINES = ['Fishing', 'Whipstock', 'Rentals']

let glReady = null
function ensureGl() {
  if (!glReady) {
    glReady = (async () => {
      await query(`IF COL_LENGTH('dbo.tbl_MonthlyExpenses','productLine') IS NULL
                     ALTER TABLE dbo.tbl_MonthlyExpenses ADD productLine nvarchar(30) NULL`, [])
      for (let i = 0; i < GL_LINES.length; i++) {
        await query(
          `IF NOT EXISTS (SELECT 1 FROM dbo.tbl_Lists WHERE ListName='ExpenseCategory' AND Value=@v)
             INSERT INTO dbo.tbl_Lists (ListName, Value, Label, SortOrder, ActiveFlag, IsSystem, UpdatedAt, UpdatedBy)
             VALUES ('ExpenseCategory', @v, @v, @o, 1, 0, GETDATE(), 'system')`,
          [{ name: 'v', type: sql.NVarChar, value: GL_LINES[i] }, { name: 'o', type: sql.Int, value: 100 + i }])
      }
      await query(`IF OBJECT_ID('tbl_AppSettings') IS NULL
                     CREATE TABLE tbl_AppSettings (settingKey NVARCHAR(100) PRIMARY KEY, settingValue NVARCHAR(1000) NULL, updatedAt DATETIME NULL, updatedBy NVARCHAR(100) NULL)`, [])
    })().catch(e => { glReady = null; throw e })
  }
  return glReady
}

// service type -> product line (SQL)
const LINE_SQL = (col) => `CASE WHEN UPPER(${col}) LIKE '%FISH%' THEN 'Fishing'
                                WHEN UPPER(${col}) LIKE '%WHIP%' THEN 'Whipstock'
                                WHEN UPPER(${col}) LIKE '%RENT%' THEN 'Rentals' ELSE 'Unallocated' END`

async function glRange(fromP, toP, rate) {
  const fromD = fromP + '-01'
  const toD = `CONVERT(date, DATEADD(month, 1, @to + '-01'))`
  const P = [{ name: 'from', type: sql.Char(7), value: fromP }, { name: 'to', type: sql.Char(7), value: toP }]
  const toAed = (cur, v) => {
    const c = String(cur || 'USD').toUpperCase()
    if (c === 'AED') return Number(v)
    if (c === 'USD') return Number(v) * rate
    return null
  }
  const warn = new Set()
  const add = (mat, gl, line, cur, v) => {
    const a = toAed(cur, v)
    if (a == null) { warn.add(cur); return }
    mat[gl] = mat[gl] || { Fishing: 0, Whipstock: 0, Rentals: 0, Unallocated: 0 }
    mat[gl][line] += a
  }
  const rev = { Fishing: 0, Whipstock: 0, Rentals: 0, Unallocated: 0 }
  const cost = {}

  // Revenue: value of the days marked in the period, by the job's product line
  const rv = await query(
    `SELECT ${LINE_SQL('j.ServiceType')} AS line, COALESCE(NULLIF(LTRIM(RTRIM(j.Currency)),''),'USD') AS cur,
            SUM(ISNULL(d.RateCharged,0)) AS amt
       FROM tbl_DailyFieldLogs d LEFT JOIN tbl_Jobs j ON j.JobID = d.JobID
      WHERE d.StatusType IN ('1','S') AND d.LogDate >= CONVERT(date, @from + '-01') AND d.LogDate < ${toD}
      GROUP BY ${LINE_SQL('j.ServiceType')}, COALESCE(NULLIF(LTRIM(RTRIM(j.Currency)),''),'USD')`, P)
  for (const r of rv.recordset) { const a = toAed(r.cur, r.amt); if (a == null) warn.add(r.cur); else rev[r.line] += a }

  // Sub-contract hire: each tool's cost shared across the months by days worked
  const sc = await query(
    `SELECT ${LINE_SQL('t.stype')} AS line, t.cur AS cur,
            SUM(CASE WHEN t.days = 0 OR t.amount IS NULL THEN 0 ELSE t.amount * t.mdays / t.days END) AS amt,
            SUM(CASE WHEN t.amount IS NULL THEN 1 ELSE 0 END) AS unpriced
       FROM (
         SELECT x.stype, x.days, x.mdays, ${amountSql('x.days')} AS amount,
                COALESCE(l.currency, sh.sheetCurrency, x.jcur, 'USD') AS cur
           FROM (
             SELECT d.JobID AS jobId, d.ToolSerial AS tool, COUNT(*) AS days,
                    SUM(CASE WHEN d.LogDate >= CONVERT(date, @from + '-01') AND d.LogDate < ${toD} THEN 1 ELSE 0 END) AS mdays,
                    ${ownerSql('i')} AS supplier, i.ShortDesc AS category, i.Size AS size, j.Contract AS contract,
                    MAX(j.ServiceType) AS stype, MAX(j.Currency) AS jcur
               FROM tbl_DailyFieldLogs d
               JOIN tbl_Inventory i ON i.SystemID = d.ToolSerial AND i.IsEmdad = 0
                AND NOT (UPPER(COALESCE(i.Ownership, '')) = 'EMDAD' AND UPPER(COALESCE(i.Supplier, '')) IN ('EMDAD', ''))
               LEFT JOIN tbl_Jobs j ON j.JobID = d.JobID
              WHERE d.StatusType IN ('1','S')
              GROUP BY d.JobID, d.ToolSerial, i.Ownership, i.Supplier, i.ShortDesc, i.Size, j.Contract
           ) x
           LEFT JOIN tbl_SubContractLines l ON l.jobId = x.jobId AND l.toolSerial = x.tool
           ${sheetApply('x.supplier', 'x.category', 'x.size', 'x.contract')}
          WHERE x.mdays > 0
       ) t GROUP BY ${LINE_SQL('t.stype')}, t.cur`, P)
  let unpriced = 0
  for (const r of sc.recordset) { add(cost, SUB_GL, r.line, r.cur, r.amt || 0); unpriced += Number(r.unpriced || 0) }

  // Maintenance & redress on a job: by completion month (date in when not finished)
  const mt = await query(
    `SELECT ${LINE_SQL('j.ServiceType')} AS line, COALESCE(NULLIF(LTRIM(RTRIM(j.Currency)),''),'USD') AS cur,
            SUM(ISNULL(m.cost,0)) AS amt
       FROM tbl_MaintenanceJobs m LEFT JOIN tbl_Jobs j ON ${jobKey('j.JobID')} = ${jobKey('m.jobNumber')}
      WHERE NULLIF(LTRIM(RTRIM(m.jobNumber)),'') IS NOT NULL
        AND COALESCE(m.completedDate, m.dateIn) >= CONVERT(date, @from + '-01')
        AND COALESCE(m.completedDate, m.dateIn) < ${toD}
      GROUP BY ${LINE_SQL('j.ServiceType')}, COALESCE(NULLIF(LTRIM(RTRIM(j.Currency)),''),'USD')`, P)
  for (const r of mt.recordset) add(cost, MNT_GL, r.line, r.cur, r.amt)

  // Manual entries per GL line: the job's product line, else the entry's own
  const ex = await query(
    `SELECT e.category AS gl, COALESCE(${LINE_SQL('j.ServiceType')}, 'Unallocated') AS jline,
            e.productLine AS eline, COALESCE(NULLIF(LTRIM(RTRIM(e.currency)),''),'AED') AS cur, SUM(ISNULL(e.amount,0)) AS amt
       FROM tbl_MonthlyExpenses e LEFT JOIN tbl_Jobs j ON ${jobKey('j.JobID')} = ${jobKey('e.jobId')}
      WHERE e.period BETWEEN @from AND @to
      GROUP BY e.category, ${LINE_SQL('j.ServiceType')}, e.productLine, COALESCE(NULLIF(LTRIM(RTRIM(e.currency)),''),'AED')`, P)
  for (const r of ex.recordset) {
    const line = LINES.includes(r.eline) ? r.eline : (r.jline !== 'Unallocated' ? r.jline : 'Unallocated')
    add(cost, r.gl, line, r.cur, r.amt)
  }
  return { rev, cost, warnCurrencies: [...warn], unpricedTools: unpriced }
}

// ── FY matrix (months across) and cell drill-down ──────────────────────────
async function rateAed() {
  const rs = await query(`SELECT settingValue FROM tbl_AppSettings WHERE settingKey='invoice.aedRate'`, [])
  return Number(rs.recordset[0]?.settingValue) || 3.6725
}
const aedOf = (rate, cur, v) => {
  const c = String(cur || 'USD').toUpperCase()
  return c === 'AED' ? Number(v) : c === 'USD' ? Number(v) * rate : null
}
let budReady = null
function ensureBudget() {
  if (!budReady) budReady = query(`IF OBJECT_ID('dbo.tbl_MonthlyBudget') IS NULL
      CREATE TABLE dbo.tbl_MonthlyBudget (period char(7) NOT NULL PRIMARY KEY, amountAed decimal(18,2) NOT NULL,
        updatedBy nvarchar(100) NULL, updatedAt datetime NULL)`, []).catch(e => { budReady = null; throw e })
  return budReady
}

// One row per hired-in tool, job and month: that month's share of the tool's cost.
async function subMonthRows(fromD, toD, ymFrom, ymTo) {
  const r = await query(
    `SELECT m.ym, x.jobId, x.tool, x.supplier, x.stype, x.days, m.md AS mdays,
            ${amountSql('x.days')} AS amount, COALESCE(l.currency, sh.sheetCurrency, x.jcur, 'USD') AS cur
       FROM (
         SELECT d.JobID AS jobId, d.ToolSerial AS tool, COUNT(*) AS days,
                ${ownerSql('i')} AS supplier, i.ShortDesc AS category, i.Size AS size, j.Contract AS contract,
                MAX(j.ServiceType) AS stype, MAX(j.Currency) AS jcur
           FROM tbl_DailyFieldLogs d
           JOIN tbl_Inventory i ON i.SystemID = d.ToolSerial AND i.IsEmdad = 0
            AND NOT (UPPER(COALESCE(i.Ownership, '')) = 'EMDAD' AND UPPER(COALESCE(i.Supplier, '')) IN ('EMDAD', ''))
           LEFT JOIN tbl_Jobs j ON j.JobID = d.JobID
          WHERE d.StatusType IN ('1','S')
          GROUP BY d.JobID, d.ToolSerial, i.Ownership, i.Supplier, i.ShortDesc, i.Size, j.Contract
       ) x
       JOIN (
         SELECT d.JobID AS jobId, d.ToolSerial AS tool, CONVERT(char(7), d.LogDate, 126) AS ym, COUNT(*) AS md
           FROM tbl_DailyFieldLogs d
          WHERE d.StatusType IN ('1','S') AND d.LogDate >= @fromD AND d.LogDate < @toD
          GROUP BY d.JobID, d.ToolSerial, CONVERT(char(7), d.LogDate, 126)
       ) m ON m.jobId = x.jobId AND m.tool = x.tool
       LEFT JOIN tbl_SubContractLines l ON l.jobId = x.jobId AND l.toolSerial = x.tool
       ${sheetApply('x.supplier', 'x.category', 'x.size', 'x.contract')}`,
    [{ name: 'fromD', type: sql.Date, value: new Date(fromD) }, { name: 'toD', type: sql.Date, value: new Date(toD) }])
  return r.recordset
}

async function glYear(year) {
  const rate = await rateAed()
  const fromD = `${year}-01-01`, toD = `${Number(year) + 1}-01-01`
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const idx = ym => months.indexOf(ym)
  const revenue = Array(12).fill(0), lines = {}, warn = new Set()
  let unpriced = 0
  const put = (gl, ym, cur, v) => {
    const i = idx(ym); if (i < 0) return
    const a = aedOf(rate, cur, v); if (a == null) { warn.add(cur); return }
    lines[gl] = lines[gl] || Array(12).fill(0); lines[gl][i] += a
  }
  const P = [{ name: 'fromD', type: sql.Date, value: new Date(fromD) }, { name: 'toD', type: sql.Date, value: new Date(toD) }]

  const rv = await query(
    `SELECT CONVERT(char(7), d.LogDate, 126) AS ym, COALESCE(NULLIF(LTRIM(RTRIM(j.Currency)),''),'USD') AS cur, SUM(ISNULL(d.RateCharged,0)) AS amt
       FROM tbl_DailyFieldLogs d LEFT JOIN tbl_Jobs j ON j.JobID = d.JobID
      WHERE d.StatusType IN ('1','S') AND d.LogDate >= @fromD AND d.LogDate < @toD
      GROUP BY CONVERT(char(7), d.LogDate, 126), COALESCE(NULLIF(LTRIM(RTRIM(j.Currency)),''),'USD')`, P)
  for (const r of rv.recordset) { const a = aedOf(rate, r.cur, r.amt); if (a == null) warn.add(r.cur); else if (idx(r.ym) >= 0) revenue[idx(r.ym)] += a }

  for (const r of await subMonthRows(fromD, toD)) {
    if (r.amount == null) { unpriced++; continue }
    put(SUB_GL, r.ym, r.cur, Number(r.amount) * Number(r.mdays) / Number(r.days))
  }
  const mt = await query(
    `SELECT CONVERT(char(7), COALESCE(m.completedDate, m.dateIn), 126) AS ym,
            COALESCE(NULLIF(LTRIM(RTRIM(j.Currency)),''),'USD') AS cur, SUM(ISNULL(m.cost,0)) AS amt
       FROM tbl_MaintenanceJobs m LEFT JOIN tbl_Jobs j ON ${jobKey('j.JobID')} = ${jobKey('m.jobNumber')}
      WHERE NULLIF(LTRIM(RTRIM(m.jobNumber)),'') IS NOT NULL
        AND COALESCE(m.completedDate, m.dateIn) >= @fromD AND COALESCE(m.completedDate, m.dateIn) < @toD
      GROUP BY CONVERT(char(7), COALESCE(m.completedDate, m.dateIn), 126), COALESCE(NULLIF(LTRIM(RTRIM(j.Currency)),''),'USD')`, P)
  for (const r of mt.recordset) put(MNT_GL, r.ym, r.cur, r.amt)
  const ex = await query(
    `SELECT e.period AS ym, e.category AS gl, COALESCE(NULLIF(LTRIM(RTRIM(e.currency)),''),'AED') AS cur, SUM(ISNULL(e.amount,0)) AS amt
       FROM tbl_MonthlyExpenses e WHERE e.period BETWEEN @a AND @b GROUP BY e.period, e.category,
            COALESCE(NULLIF(LTRIM(RTRIM(e.currency)),''),'AED')`,
    [{ name: 'a', type: sql.Char(7), value: months[0] }, { name: 'b', type: sql.Char(7), value: months[11] }])
  for (const r of ex.recordset) put(r.gl, r.ym, r.cur, r.amt)

  await ensureBudget()
  const bd = await query(`SELECT period, amountAed FROM tbl_MonthlyBudget WHERE period BETWEEN @a AND @b`,
    [{ name: 'a', type: sql.Char(7), value: months[0] }, { name: 'b', type: sql.Char(7), value: months[11] }])
  const budget = Array(12).fill(null)
  bd.recordset.forEach(r => { if (idx(r.period) >= 0) budget[idx(r.period)] = Number(r.amountAed) })

  const order = await query(`SELECT Value FROM tbl_Lists WHERE ListName='ExpenseCategory' AND ActiveFlag=1 ORDER BY SortOrder, Value`, [])
  const names = order.recordset.map(r => r.Value)
  Object.keys(lines).forEach(k => { if (!names.includes(k)) names.push(k) })
  const outLines = names.map(gl => ({ gl, values: lines[gl] || Array(12).fill(0),
    source: gl === SUB_GL ? 'Sub-Rental Hub' : gl === MNT_GL ? 'Maintenance orders' : 'Expense grid' }))
    .filter(l => l.values.some(v => v) || GL_LINES.includes(l.gl))
  return { year: Number(year), months, rate, revenue, budget, lines: outLines,
           warnCurrencies: [...warn], unpricedTools: unpriced }
}

// What sits behind one cell: gl '__REVENUE__' or a GL line, for one month.
async function glDetail(period, gl) {
  const rate = await rateAed()
  const [y, m] = period.split('-').map(Number)
  const fromD = `${period}-01`, toD = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  const P = [{ name: 'fromD', type: sql.Date, value: new Date(fromD) }, { name: 'toD', type: sql.Date, value: new Date(toD) }]
  const rows = []
  const push = (o) => { const a = aedOf(rate, o.currency, o.amount); rows.push({ ...o, amountAed: a == null ? null : Math.round(a * 100) / 100 }) }

  if (gl === '__REVENUE__') {
    const r = await query(
      `SELECT d.JobID AS ref, MAX(j.Client) AS party, MAX(j.Rig) AS asset, COUNT(*) AS qty,
              COALESCE(NULLIF(LTRIM(RTRIM(MAX(j.Currency))),''),'USD') AS currency, SUM(ISNULL(d.RateCharged,0)) AS amount
         FROM tbl_DailyFieldLogs d LEFT JOIN tbl_Jobs j ON j.JobID = d.JobID
        WHERE d.StatusType IN ('1','S') AND d.LogDate >= @fromD AND d.LogDate < @toD
        GROUP BY d.JobID HAVING SUM(ISNULL(d.RateCharged,0)) <> 0 ORDER BY SUM(ISNULL(d.RateCharged,0)) DESC`, P)
    r.recordset.forEach(x => push({ kind: 'Job utilization', ref: x.ref, date: null, party: x.party,
      description: `${x.qty} day(s) marked on the utilization grid`, asset: x.asset, qty: `${x.qty} days`, currency: x.currency, amount: x.amount }))
    return { period, gl, rows }
  }
  if (gl === SUB_GL) {
    for (const x of await subMonthRows(fromD, toD)) {
      push({ kind: 'Sub-contract hire', ref: x.jobId, date: null, party: x.supplier,
        description: x.amount == null ? 'NO RATE SET – not costed' : `Hire share for ${x.mdays} of ${x.days} day(s)`,
        asset: x.tool, qty: `${x.mdays} days`, currency: x.cur,
        amount: x.amount == null ? 0 : Number(x.amount) * Number(x.mdays) / Number(x.days) })
    }
  }
  if (gl === MNT_GL) {
    const r = await query(
      `SELECT m.jobCardNumber AS ref, COALESCE(m.completedDate, m.dateIn) AS dt, m.supplierName AS party,
              CONCAT(m.jobType, ' – ', m.description) AS descr, m.serial AS asset, m.jobNumber AS job,
              COALESCE(NULLIF(LTRIM(RTRIM(j.Currency)),''),'USD') AS cur, ISNULL(m.cost,0) AS amt
         FROM tbl_MaintenanceJobs m LEFT JOIN tbl_Jobs j ON ${jobKey('j.JobID')} = ${jobKey('m.jobNumber')}
        WHERE NULLIF(LTRIM(RTRIM(m.jobNumber)),'') IS NOT NULL
          AND COALESCE(m.completedDate, m.dateIn) >= @fromD AND COALESCE(m.completedDate, m.dateIn) < @toD
        ORDER BY m.cost DESC`, P)
    r.recordset.forEach(x => push({ kind: 'Maintenance order', ref: x.ref, date: x.dt, party: x.party, description: x.descr,
      asset: [x.asset, x.job].filter(Boolean).join(' · '), qty: '', currency: x.cur, amount: x.amt }))
  }
  const ex = await query(
    `SELECT e.id, e.invoiceRef, e.supplierName, e.jobId, e.notes, e.amount, e.productLine,
            COALESCE(NULLIF(LTRIM(RTRIM(e.currency)),''),'AED') AS cur
       FROM tbl_MonthlyExpenses e WHERE e.period = @p AND e.category = @c ORDER BY e.amount DESC`,
    [{ name: 'p', type: sql.Char(7), value: period }, { name: 'c', type: sql.NVarChar, value: gl }])
  ex.recordset.forEach(x => push({ kind: 'Expense entry', ref: x.invoiceRef || `EXP-${x.id}`, date: null, party: x.supplierName,
    description: x.notes || '', asset: x.jobId || x.productLine || 'Overhead', qty: '', currency: x.cur, amount: x.amount }))
  return { period, gl, rows }
}

const EDITORS = ['Admin', 'Finance', 'Billing']
const VIEWERS = ['Admin', 'Finance', 'Billing', 'Operations', 'CostController']

const thisPeriod = () => new Date().toISOString().slice(0, 7)

module.exports = safe(async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  if (!VIEWERS.includes(user.Role))
    return jsonResponse(context, 403, { error: 'Forbidden' })

  const method = req.method.toUpperCase()
  const id     = context.bindingData.id
  const qs     = req.query || {}

  try {


    // ── FY matrix, drill-down and budget ───────────────────────────────────
    if (method === 'GET' && id === 'gl-year') {
      await ensureLines(); await ensureGl()
      const y = /^\d{4}$/.test(qs.year || '') ? qs.year : String(new Date().getFullYear())
      return jsonResponse(context, 200, await glYear(y))
    }
    if (method === 'GET' && id === 'gl-detail') {
      await ensureLines(); await ensureGl()
      if (!/^\d{4}-\d{2}$/.test(qs.period || '') || !qs.gl) return jsonResponse(context, 400, { error: 'period and gl required' })
      return jsonResponse(context, 200, await glDetail(qs.period, qs.gl))
    }
    if (method === 'PUT' && id === 'budget') {
      if (!EDITORS.includes(user.Role)) return jsonResponse(context, 403, { error: 'Insufficient permissions' })
      await ensureBudget()
      const b = req.body || {}
      if (!/^\d{4}-\d{2}$/.test(b.period || '') || !Number.isFinite(Number(b.amount)))
        return jsonResponse(context, 400, { error: 'period (YYYY-MM) and amount required' })
      await query(`MERGE tbl_MonthlyBudget AS t USING (SELECT @p AS p) s ON t.period = s.p
                   WHEN MATCHED THEN UPDATE SET amountAed=@a, updatedBy=@u, updatedAt=GETDATE()
                   WHEN NOT MATCHED THEN INSERT (period, amountAed, updatedBy, updatedAt) VALUES (@p,@a,@u,GETDATE());`,
        [{ name: 'p', type: sql.Char(7), value: b.period }, { name: 'a', type: sql.Decimal(18, 2), value: Number(b.amount) },
         { name: 'u', type: sql.NVarChar, value: user.Username || null }])
      return jsonResponse(context, 200, { ok: true })
    }

    // ── GET the GL-layout P&L: month and year-to-date ──────────────────────
    if (method === 'GET' && id === 'gl-pl') {
      await ensureLines(); await ensureGl()
      const period = /^\d{4}-\d{2}$/.test(qs.period || '') ? qs.period : thisPeriod()
      const rs = await query(`SELECT settingValue FROM tbl_AppSettings WHERE settingKey='invoice.aedRate'`, [])
      const rate = Number(rs.recordset[0]?.settingValue) || 3.6725
      const [m, y] = await Promise.all([glRange(period, period, rate), glRange(period.slice(0, 4) + '-01', period, rate)])
      const order = await query(`SELECT Value FROM tbl_Lists WHERE ListName='ExpenseCategory' AND ActiveFlag=1 ORDER BY SortOrder, Value`, [])
      const names = order.recordset.map(r => r.Value)
      for (const mat of [m.cost, y.cost]) for (const k of Object.keys(mat)) if (!names.includes(k)) names.push(k)
      const zero = { Fishing: 0, Whipstock: 0, Rentals: 0, Unallocated: 0 }
      const lines = names.map(gl => ({ gl, month: m.cost[gl] || zero, ytd: y.cost[gl] || zero }))
        .filter(l => [...Object.values(l.month), ...Object.values(l.ytd)].some(v => v) || GL_LINES.includes(l.gl))
      return jsonResponse(context, 200, {
        period, rate, revenue: { month: m.rev, ytd: y.rev }, lines,
        warnCurrencies: [...new Set([...m.warnCurrencies, ...y.warnCurrencies])],
        unpricedTools: y.unpricedTools,
      })
    }

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

      await ensureGl()
      const r = await query(
        `INSERT INTO tbl_MonthlyExpenses
           (period, category, jobId, supplierName, invoiceRef, amount, currency, notes, createdBy, productLine)
         OUTPUT INSERTED.id
         VALUES (@p, @cat, @job, @sup, @inv, @amt, @cur, @notes, @by, @pl)`,
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
          { name: 'pl',   type: sql.NVarChar, value: b.productLine || null },
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

      await ensureGl()
      await query(
        `UPDATE tbl_MonthlyExpenses
            SET category = @cat, jobId = @job, supplierName = @sup,
                invoiceRef = @inv, amount = @amt, currency = @cur,
                notes = @notes, productLine = @pl, updatedAt = GETDATE()
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
          { name: 'pl',   type: sql.NVarChar, value: b.productLine || null },
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
})
