'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

/**
 * Tool revenue and utilization.
 *
 *   GET /api/tool-revenue?from=YYYY-MM-DD&to=YYYY-MM-DD[&groupBy=category]
 *                        [&contract=][&jobId=][&rig=]
 *
 * groupBy: category (default) | contract | job | rig | tool | month
 *
 * Built on tbl_DailyFieldLogs, one row per tool per day, which is the only
 * record of what was actually on hire. StatusType '1' is an operating day
 * and 'S' a standby day; they are charged at different rates.
 *
 * ── Unpriced days are reported, not hidden ─────────────────────────────
 * RateCharged is only written when a day is marked, and nothing wrote it
 * before the rate engine existed, so historical days carry days but no
 * money. Treating those as zero revenue would quietly understate every
 * total and nobody would know which figures to trust. Every response
 * therefore carries the count of unpriced days beside the money, and the
 * screen shows it.
 */

const ALLOWED_ROLES = ['Admin', 'Operations', 'Finance', 'Billing', 'CostController']

// groupBy -> the SQL expression and its label. A fixed map, not string
// interpolation of whatever the caller sent, so the parameter cannot reach
// the query text.
const GROUPS = {
  category: { expr: `COALESCE(NULLIF(LTRIM(RTRIM(i.ShortDesc)), ''), '(uncategorised)')`, label: 'Category' },
  contract: { expr: `COALESCE(NULLIF(LTRIM(RTRIM(j.Contract)), ''), '(no contract)')`,    label: 'Contract' },
  job:      { expr: `d.JobID`,                                                            label: 'Job' },
  rig:      { expr: `COALESCE(NULLIF(LTRIM(RTRIM(j.Rig)), ''), '(no rig)')`,              label: 'Rig' },
  tool:     { expr: `COALESCE(NULLIF(LTRIM(RTRIM(i.AssetNo)), ''), d.ToolSerial)`,        label: 'Tool' },
  month:    { expr: `CONVERT(char(7), d.LogDate, 126)`,                                   label: 'Month' },
}

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  if (!ALLOWED_ROLES.includes(user.Role))
    return jsonResponse(context, 403, { error: 'Forbidden' })

  const qs = req.query || {}
  const groupKey = GROUPS[String(qs.groupBy || 'category')] ? String(qs.groupBy || 'category') : 'category'
  const g = GROUPS[groupKey]

  // Default to the current month rather than the whole table: 47,000 rows
  // of history is not what someone opening this screen is asking for.
  const now  = new Date()
  const from = qs.from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const to   = qs.to   || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

  const params = [
    { name: 'from', value: from },
    { name: 'to',   value: to   },
    { name: 'contract', value: qs.contract || null },
    { name: 'jobId',    value: qs.jobId    || null },
    { name: 'rig',      value: qs.rig      || null },
  ]

  const where = `
      WHERE d.LogDate >= @from AND d.LogDate <= @to
        AND d.StatusType IN ('1','S')
        AND (@contract IS NULL OR j.Contract = @contract)
        AND (@jobId    IS NULL OR d.JobID    = @jobId)
        AND (@rig      IS NULL OR j.Rig      = @rig)`

  // Money and days in one pass. COUNT of unpriced days sits beside the
  // SUMs so a total can always be read together with how complete it is.
  const measures = `
         SUM(CASE WHEN d.StatusType = '1' THEN 1 ELSE 0 END)                        AS OpsDays,
         SUM(CASE WHEN d.StatusType = 'S' THEN 1 ELSE 0 END)                        AS StandbyDays,
         SUM(CASE WHEN d.StatusType = '1' THEN COALESCE(d.RateCharged,0) ELSE 0 END) AS OpsAmount,
         SUM(CASE WHEN d.StatusType = 'S' THEN COALESCE(d.RateCharged,0) ELSE 0 END) AS StandbyAmount,
         SUM(CASE WHEN d.RateCharged IS NULL THEN 1 ELSE 0 END)                      AS UnpricedDays,
         SUM(CASE WHEN d.RateSource  = 'Edited' THEN 1 ELSE 0 END)                   AS EditedDays,
         COUNT(DISTINCT d.ToolSerial)                                                AS Tools,
         COUNT(DISTINCT d.JobID)                                                     AS Jobs,
         -- Sub-contractor cost. A hired-in tool earns at the client contract
         -- rate like any other, but it also costs us the rate we pay its
         -- owner, and that difference is the only margin figure in the app.
         SUM(CASE WHEN i.IsEmdad = 0 THEN 1 ELSE 0 END)                              AS SubDays,
         SUM(CASE WHEN i.IsEmdad = 0 THEN COALESCE(ri.dayRate, 0) ELSE 0 END)        AS CostAmount,
         -- Two separate holes, counted apart because they need different
         -- fixes: a hire that nobody has priced yet, and a sub-contracted
         -- tool with no inward record at all to price.
         SUM(CASE WHEN i.IsEmdad = 0 AND ri.id IS NOT NULL AND ri.dayRate IS NULL
                  THEN 1 ELSE 0 END)                                                 AS UnpricedSubDays,
         SUM(CASE WHEN i.IsEmdad = 0 AND ri.id IS NULL THEN 1 ELSE 0 END)             AS SubDaysNoHireRecord`

  // The hire that covered this tool on this day.
  //
  // OUTER APPLY with TOP 1 rather than a LEFT JOIN: a tool can be hired in
  // more than once, and a plain join would multiply the day across every
  // hire and double-count both days and money.
  //
  // The rate is read here rather than stored on the log, because pricing
  // happens after the fact - Stores receive the tool, Billing sets the rate
  // days or weeks later. A cost written when the day was marked would be
  // null for almost every row and would never correct itself; read this way,
  // setting a rate prices all of that tool's past days at once.
  const joins = `
        FROM tbl_DailyFieldLogs d
        LEFT JOIN tbl_Inventory i ON i.SystemID = d.ToolSerial
        LEFT JOIN tbl_Jobs      j ON j.JobID    = d.JobID
        OUTER APPLY (
          SELECT TOP 1 r.id, r.dayRate
            FROM tbl_RentalInward r
           WHERE (r.systemId = d.ToolSerial
                  OR r.assetNo   = d.ToolSerial
                  OR r.oemSerial = d.ToolSerial)
             AND d.LogDate >= r.dateIn
             AND (r.dateOut IS NULL OR d.LogDate <= r.dateOut)
           ORDER BY r.dateIn DESC
        ) ri`

  try {
    const [rows, totals, currencies] = await Promise.all([
      query(`SELECT TOP 500 ${g.expr} AS GroupValue, ${measures} ${joins} ${where}
              GROUP BY ${g.expr}
              ORDER BY SUM(COALESCE(d.RateCharged,0)) DESC, COUNT(*) DESC`, params),

      query(`SELECT ${measures} ${joins} ${where}`, params),

      // Rates are not all in one currency - the ADNOC sheets are USD, others
      // AED - so a single total would be meaningless without saying so.
      query(`SELECT COALESCE(NULLIF(LTRIM(RTRIM(j.Currency)), ''), '(unset)') AS Currency,
                    COUNT(*) AS Days, SUM(COALESCE(d.RateCharged,0)) AS Amount
               ${joins} ${where}
              GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(j.Currency)), ''), '(unset)')
              ORDER BY SUM(COALESCE(d.RateCharged,0)) DESC`, params),
    ])

    const t = totals.recordset[0] || {}
    const num = (v) => (v == null ? 0 : Number(v))

    return jsonResponse(context, 200, {
      from, to,
      groupBy: groupKey,
      groupLabel: g.label,
      rows: rows.recordset.map(r => ({
        group:         r.GroupValue,
        opsDays:       num(r.OpsDays),
        standbyDays:   num(r.StandbyDays),
        opsAmount:     num(r.OpsAmount),
        standbyAmount: num(r.StandbyAmount),
        amount:        num(r.OpsAmount) + num(r.StandbyAmount),
        unpricedDays:  num(r.UnpricedDays),
        editedDays:    num(r.EditedDays),
        subDays:       num(r.SubDays),
        cost:          num(r.CostAmount),
        margin:        num(r.OpsAmount) + num(r.StandbyAmount) - num(r.CostAmount),
        unpricedSubDays:     num(r.UnpricedSubDays),
        subDaysNoHireRecord: num(r.SubDaysNoHireRecord),
        tools:         num(r.Tools),
        jobs:          num(r.Jobs),
      })),
      totals: {
        opsDays:       num(t.OpsDays),
        standbyDays:   num(t.StandbyDays),
        opsAmount:     num(t.OpsAmount),
        standbyAmount: num(t.StandbyAmount),
        amount:        num(t.OpsAmount) + num(t.StandbyAmount),
        unpricedDays:  num(t.UnpricedDays),
        editedDays:    num(t.EditedDays),
        tools:         num(t.Tools),
        jobs:          num(t.Jobs),
        days:          num(t.OpsDays) + num(t.StandbyDays),
        subDays:       num(t.SubDays),
        cost:          num(t.CostAmount),
        margin:        num(t.OpsAmount) + num(t.StandbyAmount) - num(t.CostAmount),
        unpricedSubDays:     num(t.UnpricedSubDays),
        subDaysNoHireRecord: num(t.SubDaysNoHireRecord),
      },
      currencies: currencies.recordset.map(c => ({
        currency: c.Currency, days: num(c.Days), amount: num(c.Amount),
      })),
    })
  } catch (err) {
    context.log.error('Tool revenue error:', err)
    return jsonResponse(context, 500, { error: 'Failed to load tool revenue', detail: err.message })
  }
}
