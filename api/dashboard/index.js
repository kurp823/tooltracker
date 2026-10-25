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
        (SELECT COUNT(*) FROM tbl_Jobs WHERE Status = 'Ongoing')   AS activeJobs,
        (SELECT COUNT(*) FROM tbl_Jobs WHERE Status = 'Open')      AS openJobs,
        (SELECT COUNT(*) FROM tbl_Jobs WHERE Status NOT IN ('Completed','Cancelled')) AS totalActiveJobs,
        (SELECT COUNT(*) FROM tbl_Jobs)                            AS totalJobs,
        (SELECT COUNT(*) FROM tbl_Inventory WHERE IsActive = 1)    AS totalInventory,
        (SELECT COUNT(*) FROM tbl_InspectionRecords WHERE status = 'Pending') AS pendingInspections,
        (SELECT COUNT(*) FROM tbl_MaintenanceJobs WHERE status IN ('Open','In Progress')) AS pendingMaintenance,
        (SELECT COUNT(*) FROM tbl_Invoices WHERE status IN ('Draft','Submitted'))       AS pendingInvoices,
        (
          -- "In field" = a tool serial that went out on a delivery ticket and
          -- has NOT come back on a receiving ticket for the same job.
          -- Real schema (see api/delivery-tickets & api/receiving-tickets):
          --   lines carry  serial  + dtNumber/rtNumber
          --   headers carry dtNumber/rtNumber + jobNumber
          -- There is no SerialNumber/AssetNo/DTID/JobID column on these tables.
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
                 )
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
