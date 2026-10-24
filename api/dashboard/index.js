/**
 * GET /api/dashboard/stats
 */
const { query, jsonResponse, requireAuth } = require('../db')

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  try {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM tbl_Jobs WHERE Status = 'Active')    AS activeJobs,
        (SELECT COUNT(*) FROM tbl_Jobs WHERE Status = 'Open')      AS openJobs,
        (SELECT COUNT(*) FROM tbl_Jobs WHERE Status NOT IN ('Completed','Cancelled')) AS totalActiveJobs,
        (SELECT COUNT(*) FROM tbl_Jobs)                            AS totalJobs,
        (SELECT COUNT(*) FROM tbl_Inventory WHERE IsActive = 1)    AS totalInventory,
        (SELECT COUNT(*) FROM tbl_Inspections WHERE Status = 'Pending') AS pendingInspections,
        (SELECT COUNT(*) FROM tbl_MaintenanceJobs WHERE Status IN ('Open','In Progress')) AS pendingMaintenance,
        (SELECT COUNT(*) FROM tbl_Invoices WHERE Status IN ('Draft','Submitted'))       AS pendingInvoices,
        (
          SELECT COUNT(DISTINCT il.SystemID)
          FROM   tbl_DeliveryTicketLines dtl
          JOIN   tbl_DeliveryTickets     dt  ON dtl.DTID   = dt.DTID
          JOIN   tbl_Inventory           il  ON dtl.SystemID = il.SystemID
          WHERE  dtl.ReturnedDate IS NULL
            AND  dt.Status = 'Approved'
        ) AS inFieldTools
    `)

    const stats = result.recordset[0]

    // Recent jobs (last 10)
    const recentResult = await query(`
      SELECT TOP 10
        JobID, Client, Rig, Well, MobDate, DemobDate, Status
      FROM   tbl_Jobs
      ORDER  BY CreatedDate DESC
    `)

    return jsonResponse(context, 200, {
      ...stats,
      recentJobs: recentResult.recordset,
    })
  } catch (err) {
    context.log.error('Dashboard stats error:', err)
    return jsonResponse(context, 500, { error: 'Failed to load dashboard stats' })
  }
}
