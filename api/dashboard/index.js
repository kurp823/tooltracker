/**
 * GET /api/dashboard/stats
 *
 * Each stat runs as its OWN query with an independent try/catch, so one bad
 * table/column can never 500 the whole dashboard — that stat just reports 0
 * and the reason is collected under `_schemaIssues`. This is deliberate: the
 * live DB schema has drifted from what some endpoints assume, and a single
 * combined SELECT meant one invalid column blanked the entire page.
 */
const { query, jsonResponse, requireAuth } = require('../db')

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

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const issues = {}

  const defs = {
    activeJobs:      `SELECT COUNT(*) FROM tbl_Jobs WHERE Status = 'Ongoing'`,
    openJobs:        `SELECT COUNT(*) FROM tbl_Jobs WHERE Status = 'Open'`,
    totalActiveJobs: `SELECT COUNT(*) FROM tbl_Jobs WHERE Status NOT IN ('Completed','Cancelled')`,
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

  const body = { ...stats, recentJobs }
  if (Object.keys(issues).length) body._schemaIssues = issues

  return jsonResponse(context, 200, body)
}
