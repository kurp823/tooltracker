'use strict'
const { sql, query, jsonResponse, requireAuth, safe, jobKey, jobKeyOf } = require('../db')
const { ensureLines, ownerSql, sheetApply, amountSql } = require('../sub-lines')

/**
 * Revenue vs cost for each job.
 *
 *   GET /api/job-profitability          one row per job
 *   GET /api/job-profitability/{jobId}  the cost lines behind one job
 *
 * Revenue  = the value of the days marked on the utilization grid (rate stamped on each day).
 * Costs    = sub-contract hire (rate sheet / agreed line x days), maintenance & redress
 *            (tbl_MaintenanceJobs.cost), and every job-linked monthly expense
 *            (engineer bonus, third-party repairs, ...). Nothing is estimated: a job with
 *            a hired-in tool that has no rate yet is flagged "unpriced", not costed at zero.
 * Currencies are not converted; each job is reported in its own job currency.
 */
const VIEWERS = ['Admin', 'Billing', 'Finance', 'CostController', 'Executive', 'Operations']

module.exports = safe(async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  if (!VIEWERS.includes(user.Role)) return jsonResponse(context, 403, { error: 'Forbidden' })
  await ensureLines()
  const id = context.bindingData.id

  // ── detail for one job ───────────────────────────────────────────────────
  if (id) {
    const k = [{ name: 'k', type: sql.NVarChar, value: jobKeyOf(id) }]
    const [exp, mnt, subs] = await Promise.all([
      query(`SELECT period, category, supplierName, invoiceRef, amount, currency, notes
               FROM tbl_MonthlyExpenses WHERE ${jobKey('jobId')} = @k ORDER BY period, category`, k),
      query(`SELECT jobCardNumber, serial, jobType, supplierName, status, completedDate, cost
               FROM tbl_MaintenanceJobs WHERE ${jobKey('jobNumber')} = @k ORDER BY dateIn`, k),
      query(`SELECT x.tool, x.supplier, x.days, x.amount, x.cur AS currency FROM (
               SELECT t.tool, t.supplier, t.days, ${amountSql('t.days')} AS amount,
                      COALESCE(l.currency, sh.sheetCurrency) AS cur
                 FROM (
                   SELECT d.JobID AS jobId, d.ToolSerial AS tool, COUNT(*) AS days,
                          ${ownerSql('i')} AS supplier, i.ShortDesc AS category, i.Size AS size, j.Contract AS contract
                     FROM tbl_DailyFieldLogs d
                     JOIN tbl_Inventory i ON i.SystemID = d.ToolSerial AND i.IsEmdad = 0
                      AND NOT (UPPER(COALESCE(i.Ownership, '')) = 'EMDAD' AND UPPER(COALESCE(i.Supplier, '')) IN ('EMDAD', ''))
                     LEFT JOIN tbl_Jobs j ON j.JobID = d.JobID
                    WHERE d.StatusType IN ('1','S') AND ${jobKey('d.JobID')} = @k
                    GROUP BY d.JobID, d.ToolSerial, i.Ownership, i.Supplier, i.ShortDesc, i.Size, j.Contract
                 ) t
                 LEFT JOIN tbl_SubContractLines l ON l.jobId = t.jobId AND l.toolSerial = t.tool
                 ${sheetApply('t.supplier', 't.category', 't.size', 't.contract')}
             ) x ORDER BY x.supplier, x.tool`, k),
    ])
    return jsonResponse(context, 200, { expenses: exp.recordset, maintenance: mnt.recordset, subcontract: subs.recordset })
  }

  // ── one row per job ──────────────────────────────────────────────────────
  const r = await query(
    `WITH rev AS (
       SELECT ${jobKey('JobID')} AS k, MAX(JobID) AS jobId,
              SUM(ISNULL(RateCharged,0)) AS revenue,
              SUM(CASE WHEN StatusType='1' THEN 1 ELSE 0 END) AS opsDays,
              SUM(CASE WHEN StatusType='S' THEN 1 ELSE 0 END) AS standbyDays
         FROM tbl_DailyFieldLogs WHERE StatusType IN ('1','S') GROUP BY ${jobKey('JobID')}),
     sub AS (
       SELECT ${jobKey('x.jobId')} AS k, SUM(ISNULL(x.amount,0)) AS cost,
              SUM(CASE WHEN x.amount IS NULL THEN 1 ELSE 0 END) AS unpriced
         FROM (
           SELECT t.jobId, ${amountSql('t.days')} AS amount
             FROM (
               SELECT d.JobID AS jobId, d.ToolSerial AS tool, COUNT(*) AS days,
                      ${ownerSql('i')} AS supplier, i.ShortDesc AS category, i.Size AS size, j.Contract AS contract
                 FROM tbl_DailyFieldLogs d
                 JOIN tbl_Inventory i ON i.SystemID = d.ToolSerial AND i.IsEmdad = 0
                  AND NOT (UPPER(COALESCE(i.Ownership, '')) = 'EMDAD' AND UPPER(COALESCE(i.Supplier, '')) IN ('EMDAD', ''))
                 LEFT JOIN tbl_Jobs j ON j.JobID = d.JobID
                WHERE d.StatusType IN ('1','S')
                GROUP BY d.JobID, d.ToolSerial, i.Ownership, i.Supplier, i.ShortDesc, i.Size, j.Contract
             ) t
             LEFT JOIN tbl_SubContractLines l ON l.jobId = t.jobId AND l.toolSerial = t.tool
             ${sheetApply('t.supplier', 't.category', 't.size', 't.contract')}
         ) x GROUP BY ${jobKey('x.jobId')}),
     mnt AS (
       SELECT ${jobKey('jobNumber')} AS k, SUM(ISNULL(cost,0)) AS cost
         FROM tbl_MaintenanceJobs WHERE NULLIF(LTRIM(RTRIM(jobNumber)),'') IS NOT NULL GROUP BY ${jobKey('jobNumber')}),
     exp AS (
       SELECT ${jobKey('jobId')} AS k, SUM(ISNULL(amount,0)) AS cost
         FROM tbl_MonthlyExpenses WHERE NULLIF(LTRIM(RTRIM(jobId)),'') IS NOT NULL GROUP BY ${jobKey('jobId')})
     SELECT rev.jobId AS jobId, j.Client AS client, j.Rig AS rig, j.Well AS well, j.Status AS status,
            COALESCE(NULLIF(LTRIM(RTRIM(j.Currency)),''),'USD') AS currency,
            rev.opsDays, rev.standbyDays, rev.revenue,
            ISNULL(sub.cost,0) AS subCost, ISNULL(sub.unpriced,0) AS unpricedTools,
            ISNULL(mnt.cost,0) AS maintCost, ISNULL(exp.cost,0) AS otherCost
       FROM rev
       LEFT JOIN tbl_Jobs j ON ${jobKey('j.JobID')} = rev.k
       LEFT JOIN sub ON sub.k = rev.k
       LEFT JOIN mnt ON mnt.k = rev.k
       LEFT JOIN exp ON exp.k = rev.k
      ORDER BY rev.revenue DESC`, [])
  return jsonResponse(context, 200, r.recordset)
})
