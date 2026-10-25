/**
 * GET /api/dashboard/stats
 */
const { query, jsonResponse } = require('../db')

module.exports = async function (context, req) {
  // --- INLINE AUTH (bypass db.js to eliminate module-cache issues) ---
  const jwt = require('jsonwebtoken')
  const SECRET = 'tt-secret-key-change-in-prod'
  const header = req.headers['authorization'] || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return jsonResponse(context, 401, { error: 'Unauthorized', _reason: 'no_token' })
  }

  let user
  try {
    user = jwt.verify(token, SECRET)
  } catch (err) {
    return jsonResponse(context, 401, {
      error: 'Unauthorized',
      _reason: err.message,
      _tokenLen: token.length,
      _secretUsed: SECRET.length,
      _tokenStart: token.substring(0, 20),
    })
  }
  // --- END INLINE AUTH ---

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
          -- "In field" = tool on an Approved delivery ticket for a job,
          -- with no matching receiving-ticket line (by Serial/AssetNo) for
          -- that same job yet. tbl_DeliveryTicketLines/tbl_ReceivingTicketLines
          -- store Serial/AssetNo directly (freeform, no SystemID FK, no
          -- ReturnedDate column) — see api/delivery-tickets and
          -- api/receiving-tickets for the confirmed real schema.
          SELECT COUNT(DISTINCT COALESCE(NULLIF(dtl.SerialNumber, ''), NULLIF(dtl.AssetNo, '')))
          FROM   tbl_DeliveryTicketLines dtl
          JOIN   tbl_DeliveryTickets     dt ON dtl.DTID = dt.DTID
          WHERE  dt.Status = 'Approved'
            AND  COALESCE(NULLIF(dtl.SerialNumber, ''), NULLIF(dtl.AssetNo, '')) IS NOT NULL
            AND  NOT EXISTS (
                   SELECT 1
                   FROM   tbl_ReceivingTicketLines rtl
                   JOIN   tbl_ReceivingTickets     rt ON rtl.RTID = rt.RTID
                   WHERE  rt.JobID = dt.JobID
                     AND  (
                            (NULLIF(rtl.SerialNumber, '') IS NOT NULL AND rtl.SerialNumber = dtl.SerialNumber)
                         OR (NULLIF(rtl.AssetNo, '')      IS NOT NULL AND rtl.AssetNo      = dtl.AssetNo)
                          )
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
