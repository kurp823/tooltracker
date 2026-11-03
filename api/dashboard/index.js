/**
 * GET /api/dashboard/stats
 *
 * Each stat runs as its OWN query with an independent try/catch, so one bad
 * table/column can never 500 the whole dashboard — that stat just reports 0
 * and the reason is collected under `_schemaIssues`. This is deliberate: the
 * live DB schema has drifted from what some endpoints assume, and a single
 * combined SELECT meant one invalid column blanked the entire page.
 */
const { query, jsonResponse, requireAuth, safe } = require('../db')

/** Run a scalar COUNT query; never throws. Returns { value, error }. */
async function scalar(sqlText) {
  try {
    const r = await query(sqlText)
    const row = r.recordset[0] || {}
    const first = Object.values(row)[0]
    return { value: typeof first === 'number' ? first : Number(first) || 0, error: null }
  } catch (err) {
    return { value: 0, error: err.message }
  }
}

module.exports = safe(async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const issues = {}

  const defs = {
    activeJobs:      `SELECT COUNT(*) FROM tbl_Jobs WHERE Status = 'Ongoing'`,
    openJobs:        `SELECT COUNT(*) FROM tbl_Jobs WHERE Status = 'Open'`,
    // Real statuses in tbl_Jobs (confirmed from the live data):
    //   Completed 3675, Ongoing 55, JobCompleted 47,
    //   'Draft Invoice Submitted' 42, Open 4, 'Waiting on Signed Docs' 1.
    // 'JobCompleted' is a finished job too and must not count as active.
    totalActiveJobs: `SELECT COUNT(*) FROM tbl_Jobs WHERE Status NOT IN ('Completed','JobCompleted','Cancelled')`,
    totalJobs:       `SELECT COUNT(*) FROM tbl_Jobs`,
    totalInventory:  `SELECT COUNT(*) FROM tbl_Inventory`,
    pendingInspections: `SELECT COUNT(*) FROM tbl_InspectionRecords WHERE status = 'Pending'`,
    pendingMaintenance: `SELECT COUNT(*) FROM tbl_MaintenanceJobs WHERE status IN ('Open','In Progress')`,
    pendingInvoices:    `SELECT COUNT(*) FROM tbl_Invoices WHERE status IN ('Draft','Submitted')`,
    // "In field" = a tool serial sent out on a delivery ticket with no matching
    // receiving-ticket line for the same job. Real schema: lines carry
    // serial + dtNumber/rtNumber; headers carry dtNumber/rtNumber + jobNumber.
    inFieldTools: `
      SELECT COUNT(DISTINCT dtl.serial)
      FROM   tbl_DeliveryTicketLines dtl
      JOIN   tbl_DeliveryTickets     dt ON dtl.dtNumber = dt.dtNumber
      WHERE  NULLIF(dtl.serial, '') IS NOT NULL
        AND  NOT EXISTS (
               SELECT 1
               FROM   tbl_ReceivingTicketLines rtl
               JOIN   tbl_ReceivingTickets     rt ON rtl.rtNumber = rt.rtNumber
               WHERE  rt.jobNumber = dt.jobNumber
                 AND  rtl.serial   = dtl.serial
             )`,
  }

  const stats = {}
  await Promise.all(
    Object.entries(defs).map(async ([key, sqlText]) => {
      const { value, error } = await scalar(sqlText)
      stats[key] = value
      if (error) issues[key] = error
    })
  )

  // Recent jobs (last 10) — independent, never fatal.
  let recentJobs = []
  try {
    const r = await query(`
      SELECT TOP 10 JobID, Client, Rig, Well, MobDate, DemobDate, Status
      FROM   tbl_Jobs
      ORDER  BY CreatedDate DESC
    `)
    recentJobs = r.recordset
  } catch (err) {
    issues.recentJobs = err.message
  }

  // Jobs by client / by service - the two benchmark charts of the old
  // dashboard. Blank Client falls back to the contract's client; names are
  // folded to the operator ("ADNOC DRILLING - FISHING" -> ADNOC Drilling)
  // exactly as the old app's getCanonicalOperator did.
  const canon = (raw) => {
    const c = String(raw || '').trim()
    if (!c) return 'Not recorded'
    const u = c.toUpperCase().replace(/[_-]/g, ' ')
    if (u.includes('ADNOC') && /OFF ?SHORE/.test(u)) return 'ADNOC Offshore'
    if (u.includes('ADNOC') && /ON ?SHORE/.test(u)) return 'ADNOC Onshore'
    if (u.includes('ADNOC') && u.includes('DRILLING')) return 'ADNOC Drilling'
    if (u.includes('TURNWELL')) return 'Turnwell'
    if (u.includes('CHURCHILL') || u.includes('CHRUCHILL') || u.includes('CORETRAX')) return 'Churchill'
    if (u.includes('BUNDUQ')) return 'Bunduq'
    if (u.includes('COSMO')) return 'Cosmo'
    if (u.includes('NABORS') || /\bITS\b/.test(u)) return 'ITS (Nabors)'
    return c
  }
  let jobsByClient = [], jobsByService = [], activeRigs = 0
  try {
    const r = await query(`
      SELECT COALESCE(NULLIF(LTRIM(RTRIM(j.Client)), ''), NULLIF(LTRIM(RTRIM(c.Client)), ''), '') AS name,
             COUNT(*) AS jobs
      FROM   tbl_Jobs j
      LEFT JOIN tbl_Contracts c ON c.ContractID = j.Contract
      GROUP  BY COALESCE(NULLIF(LTRIM(RTRIM(j.Client)), ''), NULLIF(LTRIM(RTRIM(c.Client)), ''), '')`)
    const m = {}
    r.recordset.forEach(x => { const k = canon(x.name); m[k] = (m[k] || 0) + x.jobs })
    jobsByClient = Object.entries(m).map(([name, jobs]) => ({ name, jobs }))
      .sort((a, b) => b.jobs - a.jobs).slice(0, 12)
  } catch (err) { issues.jobsByClient = err.message }
  try {
    const r = await query(`
      SELECT TOP 15 COALESCE(NULLIF(UPPER(LTRIM(RTRIM(ServiceType))), ''), 'NOT RECORDED') AS name, COUNT(*) AS jobs
      FROM   tbl_Jobs
      GROUP  BY COALESCE(NULLIF(UPPER(LTRIM(RTRIM(ServiceType))), ''), 'NOT RECORDED')
      ORDER  BY COUNT(*) DESC`)
    jobsByService = r.recordset
  } catch (err) { issues.jobsByService = err.message }
  try {
    const r = await query(`
      SELECT COUNT(DISTINCT UPPER(LTRIM(RTRIM(Rig)))) AS n FROM tbl_Jobs
      WHERE Status NOT IN ('Completed','JobCompleted','Cancelled','Closed') AND NULLIF(LTRIM(RTRIM(Rig)), '') IS NOT NULL`)
    activeRigs = r.recordset[0].n || 0
  } catch (err) { issues.activeRigs = err.message }

  const body = { ...stats, recentJobs, jobsByClient, jobsByService, activeRigs }
  if (Object.keys(issues).length) body._schemaIssues = issues

  return jsonResponse(context, 200, body)
})
