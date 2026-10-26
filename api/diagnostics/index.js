'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

/**
 * GET /api/diagnostics — read-only integrity counts. Admin only.
 *
 * Written to answer a specific contradiction: tbl_ReceivingTicketLines holds
 * 58,392 rows against tbl_DeliveryTicketLines' 47,106. Nothing can be received
 * that was never dispatched, so either receiving lines are duplicated, or they
 * carry items that never went out on a delivery ticket, or dispatch lines are
 * missing. These counts separate those cases instead of guessing between them.
 *
 * Every statement is a SELECT. Nothing here writes.
 */
const CHECKS = [
  {
    name: 'lineTotals',
    sql: `SELECT
            (SELECT COUNT(*) FROM tbl_DeliveryTicketLines)  AS dtLines,
            (SELECT COUNT(*) FROM tbl_ReceivingTicketLines) AS rtLines,
            (SELECT COUNT(*) FROM tbl_DeliveryTickets)      AS dtHeaders,
            (SELECT COUNT(*) FROM tbl_ReceivingTickets)     AS rtHeaders`,
  },
  {
    // A line whose ticket number matches no header is unreachable from the app.
    name: 'orphanLines',
    sql: `SELECT
            (SELECT COUNT(*) FROM tbl_DeliveryTicketLines l
              WHERE NOT EXISTS (SELECT 1 FROM tbl_DeliveryTickets t WHERE t.dtNumber = l.dtNumber))  AS dtOrphans,
            (SELECT COUNT(*) FROM tbl_ReceivingTicketLines l
              WHERE NOT EXISTS (SELECT 1 FROM tbl_ReceivingTickets t WHERE t.rtNumber = l.rtNumber)) AS rtOrphans`,
  },
  {
    // The same tool listed twice on one ticket.
    name: 'duplicateLinesWithinTicket',
    sql: `SELECT
            (SELECT COUNT(*) FROM (
               SELECT dtNumber, serial FROM tbl_DeliveryTicketLines
                WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL
                GROUP BY dtNumber, serial HAVING COUNT(*) > 1) d)  AS dtDupPairs,
            (SELECT COUNT(*) FROM (
               SELECT rtNumber, serial FROM tbl_ReceivingTicketLines
                WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL
                GROUP BY rtNumber, serial HAVING COUNT(*) > 1) r)  AS rtDupPairs,
            (SELECT COUNT(*) - COUNT(DISTINCT CONCAT(dtNumber, '|', serial)) FROM tbl_DeliveryTicketLines
              WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL)   AS dtExcessRows,
            (SELECT COUNT(*) - COUNT(DISTINCT CONCAT(rtNumber, '|', serial)) FROM tbl_ReceivingTicketLines
              WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL)   AS rtExcessRows`,
  },
  {
    // Received but never dispatched anywhere — slings, baskets and other
    // non-invoiced manifest items would land here, as would bad data.
    name: 'receivedNeverDispatched',
    sql: `SELECT COUNT(*) AS rtLinesWithNoDtAnywhere
            FROM tbl_ReceivingTicketLines rl
           WHERE NULLIF(LTRIM(RTRIM(rl.serial)), '') IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM tbl_DeliveryTicketLines dl WHERE dl.serial = rl.serial)`,
  },
  {
    // Split by ticket kind: the DUMMY placeholders were created to close jobs
    // that never had real paperwork, so compare what each kind carries.
    name: 'linesByTicketKind',
    sql: `SELECT 'DT' AS side,
                 CASE WHEN t.dtNumber LIKE 'DT-DUMMY%' THEN 'DUMMY'
                      WHEN t.dtNumber LIKE 'DT-[0-9][0-9][0-9][0-9][0-9]' THEN 'series'
                      ELSE 'other' END AS kind,
                 COUNT(DISTINCT t.dtNumber) AS tickets,
                 COUNT(l.id) AS lines
            FROM tbl_DeliveryTickets t
            LEFT JOIN tbl_DeliveryTicketLines l ON l.dtNumber = t.dtNumber
           GROUP BY CASE WHEN t.dtNumber LIKE 'DT-DUMMY%' THEN 'DUMMY'
                         WHEN t.dtNumber LIKE 'DT-[0-9][0-9][0-9][0-9][0-9]' THEN 'series'
                         ELSE 'other' END
          UNION ALL
          SELECT 'RT',
                 CASE WHEN t.rtNumber LIKE 'RT-DUMMY%' THEN 'DUMMY'
                      WHEN t.rtNumber LIKE 'RT-CLOSE%' THEN 'CLOSE'
                      WHEN t.rtNumber LIKE 'RT-[0-9][0-9][0-9][0-9][0-9]' THEN 'series'
                      ELSE 'other' END,
                 COUNT(DISTINCT t.rtNumber),
                 COUNT(l.id)
            FROM tbl_ReceivingTickets t
            LEFT JOIN tbl_ReceivingTicketLines l ON l.rtNumber = t.rtNumber
           GROUP BY CASE WHEN t.rtNumber LIKE 'RT-DUMMY%' THEN 'DUMMY'
                         WHEN t.rtNumber LIKE 'RT-CLOSE%' THEN 'CLOSE'
                         WHEN t.rtNumber LIKE 'RT-[0-9][0-9][0-9][0-9][0-9]' THEN 'series'
                         ELSE 'other' END`,
  },
  {
    // Distinct tools on each side: if a tool comes back on several tickets the
    // row counts diverge even though the tool list does not.
    name: 'distinctSerials',
    sql: `SELECT
            (SELECT COUNT(DISTINCT serial) FROM tbl_DeliveryTicketLines
              WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL) AS dtDistinctTools,
            (SELECT COUNT(DISTINCT serial) FROM tbl_ReceivingTicketLines
              WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL) AS rtDistinctTools`,
  },
  {
    // How often one serial appears across multiple receiving tickets.
    name: 'serialsOnManyRTs',
    sql: `SELECT TOP 10 serial, COUNT(DISTINCT rtNumber) AS rtCount, COUNT(*) AS lineCount
            FROM tbl_ReceivingTicketLines
           WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL
           GROUP BY serial
          HAVING COUNT(DISTINCT rtNumber) > 1
           ORDER BY COUNT(DISTINCT rtNumber) DESC`,
  },
  {
    // The headers currently carrying two merged line sets, from the renumber.
    name: 'ticketsWithDuplicateItemNos',
    sql: `SELECT TOP 20 dtNumber, COUNT(*) AS lines, COUNT(DISTINCT itemNo) AS distinctItemNos
            FROM tbl_DeliveryTicketLines
           GROUP BY dtNumber
          HAVING COUNT(*) > COUNT(DISTINCT itemNo)
           ORDER BY COUNT(*) - COUNT(DISTINCT itemNo) DESC`,
  },
]

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  if (user.Role !== 'Admin') return jsonResponse(context, 403, { error: 'Admin only' })
  if (req.method.toUpperCase() !== 'GET') return jsonResponse(context, 405, { error: 'Method not allowed' })

  const only = String((req.query || {}).only || '').trim()
  const results = {}

  for (const c of CHECKS) {
    if (only && c.name !== only) continue
    try {
      const r = await query(c.sql, [])
      results[c.name] = r.recordset.length === 1 ? r.recordset[0] : r.recordset
    } catch (err) {
      context.log.error(`Diagnostic ${c.name} failed:`, err)
      results[c.name] = { error: err.message }
    }
  }

  return jsonResponse(context, 200, results)
}
