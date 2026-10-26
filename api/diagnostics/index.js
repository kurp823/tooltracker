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
    /*
     * The question that decides whether the duplicates can be deleted: within
     * a duplicated (ticket, serial) group, is every row the same, or do the
     * rows differ in a field that carries real information?
     *
     * 'identical'  — every row in the group agrees on description, qty and
     *                remarks, so all but one are safely redundant.
     * 'differing'  — at least one field varies, so the rows may be separate
     *                real entries (two of the same tool at different
     *                quantities, or with different remarks) and deleting them
     *                would destroy manifest detail.
     */
    name: 'duplicateShapeDT',
    sql: `WITH g AS (
            SELECT dtNumber, serial,
                   COUNT(*) AS n,
                   COUNT(DISTINCT CAST(CONCAT(
                     LEFT(COALESCE(CAST(toolDescription AS NVARCHAR(4000)), '~'), 200), '|',
                     COALESCE(CAST(qty AS NVARCHAR(20)), '~'), '|',
                     LEFT(COALESCE(CAST(remarks AS NVARCHAR(4000)), '~'), 200)
                   ) AS NVARCHAR(500))) AS distinctShapes
              FROM tbl_DeliveryTicketLines
             WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL
             GROUP BY dtNumber, serial
            HAVING COUNT(*) > 1
          )
          SELECT
            COUNT(*)                                            AS duplicateGroups,
            SUM(CASE WHEN distinctShapes = 1 THEN 1 ELSE 0 END) AS identicalGroups,
            SUM(CASE WHEN distinctShapes > 1 THEN 1 ELSE 0 END) AS differingGroups,
            SUM(CASE WHEN distinctShapes = 1 THEN n - 1 ELSE 0 END) AS safelyRedundantRows,
            SUM(CASE WHEN distinctShapes > 1 THEN n - 1 ELSE 0 END) AS rowsNeedingReview
          FROM g`,
  },
  {
    name: 'duplicateShapeRT',
    sql: `WITH g AS (
            SELECT rtNumber, serial,
                   COUNT(*) AS n,
                   COUNT(DISTINCT CAST(CONCAT(
                     LEFT(COALESCE(CAST(toolDescription AS NVARCHAR(4000)), '~'), 150), '|',
                     COALESCE(CAST(qty AS NVARCHAR(20)), '~'), '|',
                     COALESCE(usedStatus, '~'), '|',
                     LEFT(COALESCE(CAST(condition AS NVARCHAR(4000)), '~'), 80), '|',
                     COALESCE(routedTo, '~'), '|',
                     LEFT(COALESCE(CAST(remarks AS NVARCHAR(4000)), '~'), 150)
                   ) AS NVARCHAR(700))) AS distinctShapes
              FROM tbl_ReceivingTicketLines
             WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL
             GROUP BY rtNumber, serial
            HAVING COUNT(*) > 1
          )
          SELECT
            COUNT(*)                                            AS duplicateGroups,
            SUM(CASE WHEN distinctShapes = 1 THEN 1 ELSE 0 END) AS identicalGroups,
            SUM(CASE WHEN distinctShapes > 1 THEN 1 ELSE 0 END) AS differingGroups,
            SUM(CASE WHEN distinctShapes = 1 THEN n - 1 ELSE 0 END) AS safelyRedundantRows,
            SUM(CASE WHEN distinctShapes > 1 THEN n - 1 ELSE 0 END) AS rowsNeedingReview
          FROM g`,
  },
  {
    // Concrete examples of groups whose rows genuinely differ, so the
    // difference can be judged rather than assumed.
    name: 'differingDuplicateSamplesRT',
    sql: `WITH g AS (
            SELECT TOP 4 rtNumber, serial
              FROM tbl_ReceivingTicketLines
             WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL
             GROUP BY rtNumber, serial
            HAVING COUNT(*) > 1
               AND COUNT(DISTINCT CAST(CONCAT(
                     COALESCE(CAST(qty AS NVARCHAR(20)), '~'), '|',
                     COALESCE(usedStatus, '~'), '|',
                     LEFT(COALESCE(CAST(remarks AS NVARCHAR(4000)), '~'), 150)
                   ) AS NVARCHAR(300))) > 1
             ORDER BY rtNumber DESC
          )
          SELECT l.rtNumber, l.itemNo, l.serial, l.qty, l.usedStatus,
                 LEFT(COALESCE(CAST(l.condition AS NVARCHAR(MAX)), ''), 30) AS cond,
                 LEFT(COALESCE(CAST(l.remarks AS NVARCHAR(MAX)), ''), 40)   AS remarks
            FROM tbl_ReceivingTicketLines l
            JOIN g ON g.rtNumber = l.rtNumber AND g.serial = l.serial
           ORDER BY l.rtNumber, l.serial, l.itemNo`,
  },
  {
    /*
     * The sampled 'differing' groups differed only in `remarks`: one row blank,
     * its twin echoing the usedStatus ('Used' / 'Not Used') back into remarks.
     * That is not a second real entry, it is the same line imported twice with
     * the usage string copied into a second column.
     *
     * This measures that across the whole table instead of from a sample:
     *   differOnlyByRemarks  — identical on description, qty, usage, condition
     *                          and routing; only remarks vary.
     *   echoPattern          — of those, groups whose remarks values are only
     *                          ever blank or a copy of usedStatus.
     * A group matching echoPattern carries no information in the extra rows.
     */
    name: 'differingOnlyByRemarksRT',
    sql: `WITH g AS (
            SELECT rtNumber, serial,
                   COUNT(*) AS n,
                   COUNT(DISTINCT CAST(CONCAT(
                     LEFT(COALESCE(CAST(toolDescription AS NVARCHAR(4000)), '~'), 150), '|',
                     COALESCE(CAST(qty AS NVARCHAR(20)), '~'), '|',
                     COALESCE(usedStatus, '~'), '|',
                     LEFT(COALESCE(CAST(condition AS NVARCHAR(4000)), '~'), 80), '|',
                     COALESCE(routedTo, '~')
                   ) AS NVARCHAR(500))) AS shapesIgnoringRemarks,
                   COUNT(DISTINCT LEFT(COALESCE(CAST(remarks AS NVARCHAR(4000)), '~'), 150)) AS remarkVariants,
                   SUM(CASE
                         WHEN NULLIF(LTRIM(RTRIM(CAST(remarks AS NVARCHAR(4000)))), '') IS NULL
                           OR LTRIM(RTRIM(CAST(remarks AS NVARCHAR(4000)))) = LTRIM(RTRIM(COALESCE(usedStatus, '')))
                         THEN 0 ELSE 1 END) AS rowsWithRealRemarks
              FROM tbl_ReceivingTicketLines
             WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL
             GROUP BY rtNumber, serial
            HAVING COUNT(*) > 1
          )
          SELECT
            COUNT(*) AS duplicateGroups,
            SUM(CASE WHEN shapesIgnoringRemarks = 1 AND remarkVariants > 1 THEN 1 ELSE 0 END) AS differOnlyByRemarks,
            SUM(CASE WHEN shapesIgnoringRemarks = 1 AND remarkVariants > 1 AND rowsWithRealRemarks = 0
                     THEN 1 ELSE 0 END) AS echoPatternGroups,
            SUM(CASE WHEN shapesIgnoringRemarks = 1 AND remarkVariants > 1 AND rowsWithRealRemarks = 0
                     THEN n - 1 ELSE 0 END) AS echoPatternRedundantRows,
            SUM(CASE WHEN shapesIgnoringRemarks > 1 THEN 1 ELSE 0 END) AS genuinelyDifferentGroups,
            SUM(CASE WHEN shapesIgnoringRemarks > 1 THEN n - 1 ELSE 0 END) AS genuinelyDifferentRedundantRows
          FROM g`,
  },
  {
    /*
     * The 256 groups that genuinely differ, classified by WHICH field differs.
     * 620 individual rows is too many to eyeball; what matters is whether the
     * difference is a quantity (likely two real entries), a usage or condition
     * (a judgement someone recorded), or a description (probably the same tool
     * written two ways). The category decides the handling, not the row.
     */
    name: 'reviewGroupBreakdown',
    sql: `WITH g AS (
            SELECT 'RT' AS side, rtNumber AS ticket, serial, COUNT(*) AS n,
                   COUNT(DISTINCT CAST(qty AS NVARCHAR(20)))                                  AS qtyVariants,
                   COUNT(DISTINCT COALESCE(usedStatus, '~'))                                  AS usageVariants,
                   COUNT(DISTINCT LEFT(COALESCE(CAST(condition AS NVARCHAR(4000)), '~'), 80))  AS condVariants,
                   COUNT(DISTINCT COALESCE(routedTo, '~'))                                    AS routeVariants,
                   COUNT(DISTINCT LEFT(COALESCE(CAST(toolDescription AS NVARCHAR(4000)), '~'), 150)) AS descVariants
              FROM tbl_ReceivingTicketLines
             WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL
             GROUP BY rtNumber, serial
            HAVING COUNT(*) > 1
               AND COUNT(DISTINCT CAST(CONCAT(
                     LEFT(COALESCE(CAST(toolDescription AS NVARCHAR(4000)), '~'), 150), '|',
                     COALESCE(CAST(qty AS NVARCHAR(20)), '~'), '|',
                     COALESCE(usedStatus, '~'), '|',
                     LEFT(COALESCE(CAST(condition AS NVARCHAR(4000)), '~'), 80), '|',
                     COALESCE(routedTo, '~')
                   ) AS NVARCHAR(500))) > 1
            UNION ALL
            SELECT 'DT', dtNumber, serial, COUNT(*),
                   COUNT(DISTINCT CAST(qty AS NVARCHAR(20))), 1, 1, 1,
                   COUNT(DISTINCT LEFT(COALESCE(CAST(toolDescription AS NVARCHAR(4000)), '~'), 150))
              FROM tbl_DeliveryTicketLines
             WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL
             GROUP BY dtNumber, serial
            HAVING COUNT(*) > 1
               AND COUNT(DISTINCT CAST(CONCAT(
                     LEFT(COALESCE(CAST(toolDescription AS NVARCHAR(4000)), '~'), 150), '|',
                     COALESCE(CAST(qty AS NVARCHAR(20)), '~')
                   ) AS NVARCHAR(400))) > 1
          )
          SELECT side,
                 SUM(CASE WHEN qtyVariants  > 1 THEN 1 ELSE 0 END) AS qtyDiffers,
                 SUM(CASE WHEN usageVariants> 1 THEN 1 ELSE 0 END) AS usageDiffers,
                 SUM(CASE WHEN condVariants > 1 THEN 1 ELSE 0 END) AS conditionDiffers,
                 SUM(CASE WHEN routeVariants> 1 THEN 1 ELSE 0 END) AS routingDiffers,
                 SUM(CASE WHEN descVariants > 1 THEN 1 ELSE 0 END) AS descriptionDiffers,
                 COUNT(*)      AS groups,
                 SUM(n) - COUNT(*) AS redundantRows
            FROM g
           GROUP BY side`,
  },
  {
    // A handful of real rows from each kind of difference, to sanity-check the
    // classification above rather than trust it.
    name: 'reviewSamples',
    sql: `WITH g AS (
            SELECT TOP 6 rtNumber, serial
              FROM tbl_ReceivingTicketLines
             WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL
             GROUP BY rtNumber, serial
            HAVING COUNT(*) > 1
               AND (COUNT(DISTINCT CAST(qty AS NVARCHAR(20))) > 1
                 OR COUNT(DISTINCT COALESCE(usedStatus, '~')) > 1)
             ORDER BY rtNumber DESC
          )
          SELECT l.rtNumber, l.itemNo, l.serial, l.qty, l.usedStatus,
                 LEFT(COALESCE(CAST(l.condition AS NVARCHAR(MAX)), ''), 30) AS cond,
                 LEFT(COALESCE(CAST(l.remarks AS NVARCHAR(MAX)), ''), 40)   AS remarks
            FROM tbl_ReceivingTicketLines l
            JOIN g ON g.rtNumber = l.rtNumber AND g.serial = l.serial
           ORDER BY l.rtNumber, l.serial, l.itemNo`,
  },
  {
    /*
     * Every row in a group that could NOT be classified as safely redundant.
     * These are handed to the user to judge: the rows differ on something that
     * may carry real meaning (quantity, usage, condition, routing, or the
     * description), so no rule should decide them.
     */
    name: 'reviewRowsFull',
    sql: `WITH g AS (
            SELECT rtNumber, serial
              FROM tbl_ReceivingTicketLines
             WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL
             GROUP BY rtNumber, serial
            HAVING COUNT(*) > 1
               AND COUNT(DISTINCT CAST(CONCAT(
                     LEFT(COALESCE(CAST(toolDescription AS NVARCHAR(4000)), '~'), 150), '|',
                     COALESCE(CAST(qty AS NVARCHAR(20)), '~'), '|',
                     COALESCE(usedStatus, '~'), '|',
                     LEFT(COALESCE(CAST(condition AS NVARCHAR(4000)), '~'), 80), '|',
                     COALESCE(routedTo, '~')
                   ) AS NVARCHAR(500))) > 1
          )
          SELECT 'RT' AS side, l.rtNumber AS ticket, h.jobNumber AS job, l.itemNo, l.serial,
                 LEFT(COALESCE(CAST(l.toolDescription AS NVARCHAR(MAX)), ''), 80) AS descr,
                 l.qty, l.usedStatus,
                 LEFT(COALESCE(CAST(l.condition AS NVARCHAR(MAX)), ''), 40) AS cond,
                 l.routedTo,
                 LEFT(COALESCE(CAST(l.remarks AS NVARCHAR(MAX)), ''), 60) AS remarks
            FROM tbl_ReceivingTicketLines l
            JOIN g ON g.rtNumber = l.rtNumber AND g.serial = l.serial
            LEFT JOIN tbl_ReceivingTickets h ON h.rtNumber = l.rtNumber
          UNION ALL
          SELECT 'DT', l.dtNumber, h.jobNumber, l.itemNo, l.serial,
                 LEFT(COALESCE(CAST(l.toolDescription AS NVARCHAR(MAX)), ''), 80),
                 l.qty, NULL, NULL, NULL,
                 LEFT(COALESCE(CAST(l.remarks AS NVARCHAR(MAX)), ''), 60)
            FROM tbl_DeliveryTicketLines l
            JOIN (
              SELECT dtNumber, serial
                FROM tbl_DeliveryTicketLines
               WHERE NULLIF(LTRIM(RTRIM(serial)), '') IS NOT NULL
               GROUP BY dtNumber, serial
              HAVING COUNT(*) > 1
                 AND COUNT(DISTINCT CAST(CONCAT(
                       LEFT(COALESCE(CAST(toolDescription AS NVARCHAR(4000)), '~'), 150), '|',
                       COALESCE(CAST(qty AS NVARCHAR(20)), '~'), '|',
                       LEFT(COALESCE(CAST(remarks AS NVARCHAR(4000)), '~'), 150)
                     ) AS NVARCHAR(500))) > 1
            ) gd ON gd.dtNumber = l.dtNumber AND gd.serial = l.serial
            LEFT JOIN tbl_DeliveryTickets h ON h.dtNumber = l.dtNumber
           ORDER BY side, ticket, serial, itemNo`,
  },
  {
    // Are the duplicates and the orphans the same rows, or separate problems?
    name: 'duplicateVsOrphanOverlap',
    sql: `SELECT
            (SELECT COUNT(*) FROM tbl_ReceivingTicketLines l
              WHERE NOT EXISTS (SELECT 1 FROM tbl_ReceivingTickets t WHERE t.rtNumber = l.rtNumber)
                AND EXISTS (SELECT 1 FROM tbl_ReceivingTicketLines d
                             WHERE d.rtNumber = l.rtNumber AND d.serial = l.serial AND d.id <> l.id)
            ) AS rtLinesBothOrphanAndDuplicated,
            (SELECT COUNT(*) FROM tbl_DeliveryTicketLines l
              WHERE NOT EXISTS (SELECT 1 FROM tbl_DeliveryTickets t WHERE t.dtNumber = l.dtNumber)
                AND EXISTS (SELECT 1 FROM tbl_DeliveryTicketLines d
                             WHERE d.dtNumber = l.dtNumber AND d.serial = l.serial AND d.id <> l.id)
            ) AS dtLinesBothOrphanAndDuplicated`,
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
