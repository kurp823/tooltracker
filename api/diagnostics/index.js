'use strict'
const { query, jsonResponse, requireAuth, jobKey } = require('../db')

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
    /*
     * ---------------------------------------------------------------------
     * Row-level sets behind the review workbook.
     *
     * The counts tell you how big each problem is; these tell you which tool,
     * which job and which ticket, which is what you need to act on one.
     * All read-only.
     * ---------------------------------------------------------------------
     *
     * (1) Outstanding on a LIVE job and present in inventory. The ones
     *     reading 'Good' are offerable to a second job right now.
     */
    name: 'reviewOnRigLive',
    sql: `WITH jobs AS (
            SELECT JobID, Status, Client, Rig, Well, ServiceType,
                   ${jobKey('JobID')} AS jobKey
              FROM tbl_Jobs
          ),
          dtl AS (
            SELECT ${jobKey('t.jobNumber')} AS jobKey,
                   t.jobNumber, t.dtNumber, t.deliveryDate, t.rig, t.well, t.clientCode,
                   l.serial, l.toolDescription, l.qty
              FROM tbl_DeliveryTicketLines l
              JOIN tbl_DeliveryTickets t ON t.dtNumber = l.dtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          ),
          rtl AS (
            SELECT DISTINCT
                   ${jobKey('t.jobNumber')} AS jobKey,
                   l.serial
              FROM tbl_ReceivingTicketLines l
              JOIN tbl_ReceivingTickets t ON t.rtNumber = l.rtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          ),
          outstanding AS (
            SELECT d.*,
                   ROW_NUMBER() OVER (PARTITION BY d.jobKey, d.serial
                                          ORDER BY d.deliveryDate DESC, d.dtNumber DESC) AS rn
              FROM dtl d
             WHERE NULLIF(d.jobKey, '') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM rtl
                                WHERE rtl.jobKey = d.jobKey AND rtl.serial = d.serial)
          ),
          LIVE_SET AS (SELECT 1 AS x)
          SELECT COALESCE(i.AssetNo, o.serial)   AS AssetNo,
                 i.SystemID                      AS SystemID,
                 COALESCE(i.ShortDesc, '')       AS Category,
                 COALESCE(i.Size, '')            AS Size,
                 COALESCE(i.Description, CAST(o.toolDescription AS NVARCHAR(400))) AS Description,
                 i.Status                        AS CurrentInvStatus,
                 COALESCE(i.Location, '')        AS CurrentLocation,
                 COALESCE(i.Supplier, '')        AS Supplier,
                 j.JobID                         AS JobNo,
                 j.Status                        AS JobStatus,
                 COALESCE(j.Client, o.clientCode, '') AS Client,
                 COALESCE(o.rig, j.Rig, '')      AS Rig,
                 COALESCE(o.well, j.Well, '')    AS Well,
                 o.dtNumber                      AS DTNo,
                 CONVERT(VARCHAR(10), o.deliveryDate, 23) AS DTDate,
                 o.qty                           AS Qty
            FROM outstanding o
            JOIN jobs j ON j.jobKey = o.jobKey
            JOIN tbl_Inventory i ON i.SystemID = o.serial OR i.AssetNo = o.serial
           WHERE o.rn = 1
             AND j.Status IN ('Ongoing', 'Draft Invoice Submitted', 'Open', 'Waiting on Signed Docs')
           ORDER BY i.Status, o.jobNumber, COALESCE(i.AssetNo, o.serial)`,
  },
  {
    // (2) Outstanding on a LIVE job but no inventory record at all. These are
    //     the tools the catalogue does not know exist.
    name: 'reviewNotInInventory',
    sql: `WITH jobs AS (
            SELECT JobID, Status, Client, Rig, Well, ServiceType,
                   ${jobKey('JobID')} AS jobKey
              FROM tbl_Jobs
          ),
          dtl AS (
            SELECT ${jobKey('t.jobNumber')} AS jobKey,
                   t.jobNumber, t.dtNumber, t.deliveryDate, t.rig, t.well, t.clientCode,
                   l.serial, l.toolDescription, l.qty
              FROM tbl_DeliveryTicketLines l
              JOIN tbl_DeliveryTickets t ON t.dtNumber = l.dtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          ),
          rtl AS (
            SELECT DISTINCT
                   ${jobKey('t.jobNumber')} AS jobKey,
                   l.serial
              FROM tbl_ReceivingTicketLines l
              JOIN tbl_ReceivingTickets t ON t.rtNumber = l.rtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          ),
          outstanding AS (
            SELECT d.*,
                   ROW_NUMBER() OVER (PARTITION BY d.jobKey, d.serial
                                          ORDER BY d.deliveryDate DESC, d.dtNumber DESC) AS rn
              FROM dtl d
             WHERE NULLIF(d.jobKey, '') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM rtl
                                WHERE rtl.jobKey = d.jobKey AND rtl.serial = d.serial)
          ),
          LIVE_SET AS (SELECT 1 AS x)
          SELECT o.serial                        AS AssetNo,
                 CAST(o.toolDescription AS NVARCHAR(400)) AS DescriptionOnTicket,
                 j.JobID                         AS JobNo,
                 j.Status                        AS JobStatus,
                 COALESCE(j.Client, o.clientCode, '') AS Client,
                 COALESCE(o.rig, j.Rig, '')      AS Rig,
                 COALESCE(o.well, j.Well, '')    AS Well,
                 o.dtNumber                      AS DTNo,
                 CONVERT(VARCHAR(10), o.deliveryDate, 23) AS DTDate,
                 o.qty                           AS Qty
            FROM outstanding o
            JOIN jobs j ON j.jobKey = o.jobKey
           WHERE o.rn = 1
             AND j.Status IN ('Ongoing', 'Draft Invoice Submitted', 'Open', 'Waiting on Signed Docs')
             AND NOT EXISTS (SELECT 1 FROM tbl_Inventory i
                              WHERE i.SystemID = o.serial OR i.AssetNo = o.serial)
           ORDER BY j.JobID, o.serial`,
  },
  {
    // (3) Outstanding on a job that is already CLOSED — one row per job, so
    //     you can see at a glance which jobs were closed without a return.
    name: 'reviewClosedJobsSummary',
    sql: `WITH jobs AS (
            SELECT JobID, Status, Client, Rig, Well, ServiceType,
                   ${jobKey('JobID')} AS jobKey
              FROM tbl_Jobs
          ),
          dtl AS (
            SELECT ${jobKey('t.jobNumber')} AS jobKey,
                   t.jobNumber, t.dtNumber, t.deliveryDate, t.rig, t.well, t.clientCode,
                   l.serial, l.toolDescription, l.qty
              FROM tbl_DeliveryTicketLines l
              JOIN tbl_DeliveryTickets t ON t.dtNumber = l.dtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          ),
          rtl AS (
            SELECT DISTINCT
                   ${jobKey('t.jobNumber')} AS jobKey,
                   l.serial
              FROM tbl_ReceivingTicketLines l
              JOIN tbl_ReceivingTickets t ON t.rtNumber = l.rtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          ),
          outstanding AS (
            SELECT d.*,
                   ROW_NUMBER() OVER (PARTITION BY d.jobKey, d.serial
                                          ORDER BY d.deliveryDate DESC, d.dtNumber DESC) AS rn
              FROM dtl d
             WHERE NULLIF(d.jobKey, '') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM rtl
                                WHERE rtl.jobKey = d.jobKey AND rtl.serial = d.serial)
          ),
          LIVE_SET AS (SELECT 1 AS x),
          rtCount AS (
            SELECT ${jobKey('t.jobNumber')} AS jobKey,
                   COUNT(DISTINCT t.rtNumber) AS rtTickets,
                   COUNT(l.id)                AS rtLines,
                   MAX(CASE WHEN t.rtNumber LIKE 'DUMMY%' THEN 1 ELSE 0 END) AS hasDummy
              FROM tbl_ReceivingTickets t
              LEFT JOIN tbl_ReceivingTicketLines l ON l.rtNumber = t.rtNumber
             GROUP BY ${jobKey('t.jobNumber')}
          )
          SELECT j.JobID                         AS JobNo,
                 j.Status                        AS JobStatus,
                 COALESCE(j.Client, '')          AS Client,
                 COALESCE(j.Rig, '')             AS Rig,
                 COALESCE(j.Well, '')            AS Well,
                 COUNT(*)                        AS ToolsOutstanding,
                 COALESCE(c.rtTickets, 0)        AS RTTicketsOnJob,
                 COALESCE(c.rtLines, 0)          AS RTLinesOnJob,
                 CASE WHEN COALESCE(c.hasDummy, 0) = 1 THEN 'Yes' ELSE 'No' END AS ClosedWithDummyRT
            FROM outstanding o
            JOIN jobs j ON j.jobKey = o.jobKey
            LEFT JOIN rtCount c ON c.jobKey = o.jobKey
           WHERE o.rn = 1
             AND j.Status NOT IN ('Ongoing', 'Draft Invoice Submitted', 'Open', 'Waiting on Signed Docs')
           GROUP BY j.JobID, j.Status, j.Client, j.Rig, j.Well,
                    c.rtTickets, c.rtLines, c.hasDummy
           ORDER BY COUNT(*) DESC`,
  },
  {
    // (4) The same closed-job set, tool by tool.
    name: 'reviewClosedJobsDetail',
    sql: `WITH jobs AS (
            SELECT JobID, Status, Client, Rig, Well, ServiceType,
                   ${jobKey('JobID')} AS jobKey
              FROM tbl_Jobs
          ),
          dtl AS (
            SELECT ${jobKey('t.jobNumber')} AS jobKey,
                   t.jobNumber, t.dtNumber, t.deliveryDate, t.rig, t.well, t.clientCode,
                   l.serial, l.toolDescription, l.qty
              FROM tbl_DeliveryTicketLines l
              JOIN tbl_DeliveryTickets t ON t.dtNumber = l.dtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          ),
          rtl AS (
            SELECT DISTINCT
                   ${jobKey('t.jobNumber')} AS jobKey,
                   l.serial
              FROM tbl_ReceivingTicketLines l
              JOIN tbl_ReceivingTickets t ON t.rtNumber = l.rtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          ),
          outstanding AS (
            SELECT d.*,
                   ROW_NUMBER() OVER (PARTITION BY d.jobKey, d.serial
                                          ORDER BY d.deliveryDate DESC, d.dtNumber DESC) AS rn
              FROM dtl d
             WHERE NULLIF(d.jobKey, '') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM rtl
                                WHERE rtl.jobKey = d.jobKey AND rtl.serial = d.serial)
          ),
          LIVE_SET AS (SELECT 1 AS x)
          SELECT COALESCE(i.AssetNo, o.serial)   AS AssetNo,
                 COALESCE(i.ShortDesc, '')       AS Category,
                 COALESCE(i.Size, '')            AS Size,
                 COALESCE(i.Description, CAST(o.toolDescription AS NVARCHAR(400))) AS Description,
                 CASE WHEN i.SystemID IS NULL THEN 'Not in inventory'
                      ELSE COALESCE(i.Status, '') END AS CurrentInvStatus,
                 j.JobID                         AS JobNo,
                 j.Status                        AS JobStatus,
                 COALESCE(j.Client, o.clientCode, '') AS Client,
                 COALESCE(o.rig, j.Rig, '')      AS Rig,
                 o.dtNumber                      AS DTNo,
                 CONVERT(VARCHAR(10), o.deliveryDate, 23) AS DTDate,
                 o.qty                           AS Qty
            FROM outstanding o
            JOIN jobs j ON j.jobKey = o.jobKey
            LEFT JOIN tbl_Inventory i ON i.SystemID = o.serial OR i.AssetNo = o.serial
           WHERE o.rn = 1
             AND j.Status NOT IN ('Ongoing', 'Draft Invoice Submitted', 'Open', 'Waiting on Signed Docs')
           ORDER BY j.JobID, COALESCE(i.AssetNo, o.serial)`,
  },
  {
    // (5) Every job status string actually in use, with how many jobs carry
    //     it. 'JobCompleted' and 'Completed' are the same thing spelt twice.
    /*
     * Closing rules, taking tbl_Jobs as the authority rather than the tickets.
     *
     *   Completed + legal invoice number -> close with a DUMMY ticket
     *   JobCompleted                      -> raise a real RT and close
     *   Ongoing / Open / Draft            -> leave alone, still running
     *
     * This bucket count says how many jobs and how much outstanding kit sit
     * in each rule, so the scale of each action is known before any of it runs.
     */
    name: 'jobCloseBuckets',
    sql: `WITH jobs AS (
            SELECT JobID, Status, Rig, Well,
                   CASE WHEN NULLIF(LTRIM(RTRIM(LegalInvoiceNumber)), '') IS NOT NULL
                        THEN 'Has legal invoice' ELSE 'No legal invoice' END AS invoiced,
                   ${jobKey('JobID')} AS jobKey
              FROM tbl_Jobs
          ),
          dtl AS (
            SELECT ${jobKey('t.jobNumber')} AS jobKey, l.serial
              FROM tbl_DeliveryTicketLines l
              JOIN tbl_DeliveryTickets t ON t.dtNumber = l.dtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          ),
          rtl AS (
            SELECT DISTINCT ${jobKey('t.jobNumber')} AS jobKey, l.serial
              FROM tbl_ReceivingTicketLines l
              JOIN tbl_ReceivingTickets t ON t.rtNumber = l.rtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          ),
          outstanding AS (
            SELECT DISTINCT d.jobKey, d.serial
              FROM dtl d
             WHERE NOT EXISTS (SELECT 1 FROM rtl
                                WHERE rtl.jobKey = d.jobKey AND rtl.serial = d.serial)
          )
          SELECT j.Status, j.invoiced,
                 COUNT(DISTINCT j.JobID)                                AS Jobs,
                 COUNT(DISTINCT CASE WHEN o.jobKey IS NOT NULL THEN j.JobID END) AS JobsWithToolsOut,
                 COUNT(o.serial)                                        AS ToolsOutstanding
            FROM jobs j
            LEFT JOIN outstanding o ON o.jobKey = j.jobKey
           GROUP BY j.Status, j.invoiced
           ORDER BY COUNT(o.serial) DESC`,
  },
  {
    /*
     * Ravi's check before closing a completed job: the delivery ticket should
     * carry the SAME rig and well as the job. One that does not is a ticket
     * attached to the wrong job.
     *
     * Compared two ways, because the strings are not written consistently --
     * 'AD-137(JORDAN)' vs 'AD 137', say. Exact tells you how messy the text is;
     * Loose ignores case, spaces, dashes, brackets and dots and is the figure
     * to act on. Only a LOOSE mismatch is evidence of a wrong attachment.
     */
    name: 'rigWellMismatch',
    sql: `WITH jobs AS (
            SELECT JobID, Status, Rig, Well, ${jobKey('JobID')} AS jobKey
              FROM tbl_Jobs
             WHERE Status = 'Completed'
               AND NULLIF(LTRIM(RTRIM(LegalInvoiceNumber)), '') IS NOT NULL
          ),
          dt AS (
            SELECT t.dtNumber, t.jobNumber, t.rig, t.well, ${jobKey('t.jobNumber')} AS jobKey,
                   (SELECT COUNT(*) FROM tbl_DeliveryTicketLines l WHERE l.dtNumber = t.dtNumber) AS Lines
              FROM tbl_DeliveryTickets t
          ),
          m AS (
            SELECT d.dtNumber, d.Lines,
                   CASE WHEN UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(j.Rig)), ''),' ',''),'-',''),'(',''),')',''),'.','')) = UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(d.rig)), ''),' ',''),'-',''),'(',''),')',''),'.','')) THEN 1 ELSE 0 END AS rigLoose,
                   CASE WHEN UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(j.Well)), ''),' ',''),'-',''),'(',''),')',''),'.','')) = UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(d.well)), ''),' ',''),'-',''),'(',''),')',''),'.','')) THEN 1 ELSE 0 END AS wellLoose,
                   CASE WHEN LTRIM(RTRIM(COALESCE(j.Rig, ''))) = LTRIM(RTRIM(COALESCE(d.rig, ''))) THEN 1 ELSE 0 END AS rigExact,
                   CASE WHEN LTRIM(RTRIM(COALESCE(j.Well, ''))) = LTRIM(RTRIM(COALESCE(d.well, ''))) THEN 1 ELSE 0 END AS wellExact,
                   CASE WHEN NULLIF(LTRIM(RTRIM(d.rig)), '') IS NULL
                          OR NULLIF(LTRIM(RTRIM(d.well)), '') IS NULL THEN 1 ELSE 0 END AS dtBlank
              FROM dt d
              JOIN jobs j ON j.jobKey = d.jobKey
          )
          SELECT COUNT(*)                                             AS DTsOnCompletedInvoicedJobs,
                 SUM(Lines)                                           AS LinesOnThoseDTs,
                 SUM(CASE WHEN rigExact = 1 AND wellExact = 1 THEN 1 ELSE 0 END)  AS BothMatchExactly,
                 SUM(CASE WHEN rigLoose = 1 AND wellLoose = 1 THEN 1 ELSE 0 END)  AS BothMatchLoosely,
                 SUM(CASE WHEN rigLoose = 0 AND wellLoose = 1 THEN 1 ELSE 0 END)  AS RigDiffersOnly,
                 SUM(CASE WHEN rigLoose = 1 AND wellLoose = 0 THEN 1 ELSE 0 END)  AS WellDiffersOnly,
                 SUM(CASE WHEN rigLoose = 0 AND wellLoose = 0 THEN 1 ELSE 0 END)  AS BothDiffer,
                 SUM(CASE WHEN dtBlank = 1 THEN 1 ELSE 0 END)                     AS DTRigOrWellBlank,
                 SUM(CASE WHEN rigLoose = 0 OR wellLoose = 0 THEN Lines ELSE 0 END) AS LinesOnMismatchedDTs
            FROM m`,
  },
  {
    // The mismatched tickets themselves, job rig/well beside ticket rig/well,
    // so the pattern can be read before anything is removed.
    name: 'rigWellMismatchRows',
    sql: `WITH jobs AS (
            SELECT JobID, Status, Rig, Well, LegalInvoiceNumber, ${jobKey('JobID')} AS jobKey
              FROM tbl_Jobs
             WHERE Status = 'Completed'
               AND NULLIF(LTRIM(RTRIM(LegalInvoiceNumber)), '') IS NOT NULL
          ),
          dt AS (
            SELECT t.dtNumber, t.jobNumber, t.rig, t.well, t.deliveryDate,
                   ${jobKey('t.jobNumber')} AS jobKey,
                   (SELECT COUNT(*) FROM tbl_DeliveryTicketLines l WHERE l.dtNumber = t.dtNumber) AS Lines
              FROM tbl_DeliveryTickets t
          )
          SELECT j.JobID                              AS JobNo,
                 j.LegalInvoiceNumber                 AS LegalInvoiceNo,
                 COALESCE(j.Rig, '')                  AS JobRig,
                 COALESCE(j.Well, '')                 AS JobWell,
                 d.dtNumber                           AS DTNo,
                 COALESCE(d.rig, '')                  AS DTRig,
                 COALESCE(d.well, '')                 AS DTWell,
                 CONVERT(VARCHAR(10), d.deliveryDate, 23) AS DTDate,
                 d.Lines                              AS DTLines,
                 CASE WHEN UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(j.Rig)), ''),' ',''),'-',''),'(',''),')',''),'.','')) <> UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(d.rig)), ''),' ',''),'-',''),'(',''),')',''),'.',''))
                       AND UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(j.Well)), ''),' ',''),'-',''),'(',''),')',''),'.','')) <> UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(d.well)), ''),' ',''),'-',''),'(',''),')',''),'.','')) THEN 'Rig and well differ'
                      WHEN UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(j.Rig)), ''),' ',''),'-',''),'(',''),')',''),'.','')) <> UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(d.rig)), ''),' ',''),'-',''),'(',''),')',''),'.','')) THEN 'Rig differs'
                      ELSE 'Well differs' END         AS Differs
            FROM dt d
            JOIN jobs j ON j.jobKey = d.jobKey
           WHERE UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(j.Rig)), ''),' ',''),'-',''),'(',''),')',''),'.','')) <> UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(d.rig)), ''),' ',''),'-',''),'(',''),')',''),'.',''))
              OR UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(j.Well)), ''),' ',''),'-',''),'(',''),')',''),'.','')) <> UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(LTRIM(RTRIM(d.well)), ''),' ',''),'-',''),'(',''),')',''),'.',''))
           ORDER BY d.Lines DESC, j.JobID`,
  },
  {
    name: 'reviewJobNumberFormats',
    sql: `SELECT TRANSLATE(JobID, '0123456789', '##########') AS Shape,
                 COUNT(*)   AS Jobs,
                 MIN(JobID) AS ExampleJob,
                 MAX(JobID) AS ExampleJob2
            FROM tbl_Jobs
           GROUP BY TRANSLATE(JobID, '0123456789', '##########')
           ORDER BY COUNT(*) DESC`,
  },
  {
    // (5b) How badly the old trailing-sequence key was broken: how many jobs
    //      share a trailing sequence with at least one other job.
    name: 'reviewSequenceCollisions',
    sql: `WITH s AS (
            SELECT JobID,
                   TRY_CAST(RIGHT(JobID, CHARINDEX('-', REVERSE(JobID) + '-') - 1) AS INT) AS trailingSeq
              FROM tbl_Jobs
          ),
          g AS (
            SELECT trailingSeq, COUNT(*) AS jobsSharingIt
              FROM s GROUP BY trailingSeq
          )
          SELECT (SELECT COUNT(*) FROM s)                               AS TotalJobs,
                 (SELECT COUNT(*) FROM g)                               AS DistinctTrailingSequences,
                 (SELECT COUNT(*) FROM g WHERE jobsSharingIt > 1)       AS SequencesSharedByManyJobs,
                 (SELECT SUM(jobsSharingIt) FROM g WHERE jobsSharingIt > 1) AS JobsAffected,
                 (SELECT MAX(jobsSharingIt) FROM g)                     AS WorstCase`,
  },
  {
    name: 'reviewJobStatusVocabulary',
    sql: `SELECT COALESCE(NULLIF(LTRIM(RTRIM(Status)), ''), '(blank)') AS JobStatus,
                 COUNT(*) AS Jobs,
                 MIN(JobID) AS ExampleJob,
                 CONVERT(VARCHAR(10), MIN(CreatedDate), 23) AS EarliestCreated,
                 CONVERT(VARCHAR(10), MAX(CreatedDate), 23) AS LatestCreated
            FROM tbl_Jobs
           GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(Status)), ''), '(blank)')
           ORDER BY COUNT(*) DESC`,
  },
  {
    // (6) Received against a job it was never dispatched on. Often legitimate
    //     (kit moves rig to rig) but it is also where mis-keyed job numbers
    //     surface, so it is worth an eye.
    name: 'reviewReceivedNoDispatch',
    sql: `WITH dtl AS (
            SELECT DISTINCT
                   ${jobKey('t.jobNumber')} AS jobKey,
                   l.serial
              FROM tbl_DeliveryTicketLines l
              JOIN tbl_DeliveryTickets t ON t.dtNumber = l.dtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          ),
          rtl AS (
            SELECT ${jobKey('t.jobNumber')} AS jobKey,
                   t.jobNumber, t.rtNumber, t.receivingDate, t.rig,
                   l.serial, l.toolDescription, l.usedStatus, l.routedTo,
                   ROW_NUMBER() OVER (PARTITION BY
                        ${jobKey('t.jobNumber')},
                        l.serial ORDER BY t.receivingDate DESC, l.id DESC) AS rn
              FROM tbl_ReceivingTicketLines l
              JOIN tbl_ReceivingTickets t ON t.rtNumber = l.rtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          )
          SELECT COALESCE(i.AssetNo, r.serial)   AS AssetNo,
                 COALESCE(i.ShortDesc, '')       AS Category,
                 COALESCE(i.Description, CAST(r.toolDescription AS NVARCHAR(400))) AS Description,
                 COALESCE(j.JobID, r.jobNumber)  AS ReceivedOnJob,
                 j.Status                        AS JobStatus,
                 r.rtNumber                      AS RTNo,
                 CONVERT(VARCHAR(10), r.receivingDate, 23) AS RTDate,
                 COALESCE(r.rig, '')             AS Rig,
                 COALESCE(r.usedStatus, '')      AS UsedStatus,
                 COALESCE(r.routedTo, '')        AS RoutedTo
            FROM rtl r
            LEFT JOIN tbl_Jobs j ON ${jobKey('j.JobID')} = r.jobKey
            LEFT JOIN tbl_Inventory i ON i.SystemID = r.serial OR i.AssetNo = r.serial
           WHERE r.rn = 1
             AND NULLIF(r.jobKey, '') IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM dtl WHERE dtl.jobKey = r.jobKey AND dtl.serial = r.serial)
           ORDER BY COALESCE(j.JobID, r.jobNumber), COALESCE(i.AssetNo, r.serial)`,
  },
  {
    /*
     * The live-job slice of stillOnRig, resolved against the catalogue.
     *
     * This is the set a backfill would touch, so it reports current inventory
     * status: only rows reading 'Good' are safe to move to 'On Rig'. A tool
     * already marked DBR, Inspection, Maintenance or Lost in Hole is in
     * someone else's workflow and must be left alone.
     */
    name: 'stillOnRigLive',
    sql: `WITH live AS (
            SELECT ${jobKey('JobID')} AS jobKey
              FROM tbl_Jobs
             WHERE Status IN ('Ongoing', 'Draft Invoice Submitted', 'Open', 'Waiting on Signed Docs')
          ),
          dt AS (
            SELECT ${jobKey('t.jobNumber')} AS jobKey,
                   l.serial, t.rig
              FROM tbl_DeliveryTicketLines l
              JOIN tbl_DeliveryTickets t ON t.dtNumber = l.dtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          ),
          rt AS (
            SELECT DISTINCT
                   ${jobKey('t.jobNumber')} AS jobKey,
                   l.serial
              FROM tbl_ReceivingTicketLines l
              JOIN tbl_ReceivingTickets t ON t.rtNumber = l.rtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          ),
          outstanding AS (
            SELECT DISTINCT dt.serial
              FROM dt
             WHERE dt.jobKey IN (SELECT jobKey FROM live WHERE NULLIF(jobKey, '') IS NOT NULL)
               AND NOT EXISTS (SELECT 1 FROM rt
                                WHERE rt.jobKey = dt.jobKey AND rt.serial = dt.serial)
          )
          SELECT COALESCE(i.Status, '(not in inventory)') AS invStatus,
                 COUNT(*) AS assets
            FROM outstanding o
            LEFT JOIN tbl_Inventory i
                   ON i.SystemID = o.serial OR i.AssetNo = o.serial
           GROUP BY COALESCE(i.Status, '(not in inventory)')
           ORDER BY COUNT(*) DESC`,
  },
  {
    /*
     * What is actually still on a rig.
     *
     * The raw gap between the two line tables does NOT answer this: orphan
     * lines belong to no job at all, and a tool can go out on one job and come
     * back on another, so the difference of 96 rows is not a count of
     * outstanding equipment.
     *
     * The real measure is per job: a dispatch line with no receiving line for
     * the same job and the same serial. Split by whether the job is still live,
     * because equipment showing as outstanding on a CLOSED job is a data
     * problem, not kit on a rig.
     */
    name: 'stillOnRig',
    sql: `WITH dt AS (
            SELECT DISTINCT
                   ${jobKey('t.jobNumber')} AS jobKey,
                   l.serial
              FROM tbl_DeliveryTicketLines l
              JOIN tbl_DeliveryTickets t ON t.dtNumber = l.dtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          ),
          rt AS (
            SELECT DISTINCT
                   ${jobKey('t.jobNumber')} AS jobKey,
                   l.serial
              FROM tbl_ReceivingTicketLines l
              JOIN tbl_ReceivingTickets t ON t.rtNumber = l.rtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          ),
          outstanding AS (
            SELECT dt.jobKey, dt.serial
              FROM dt
             WHERE NULLIF(dt.jobKey, '') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM rt
                                WHERE rt.jobKey = dt.jobKey AND rt.serial = dt.serial)
          ),
          jobs AS (
            SELECT ${jobKey('JobID')} AS jobKey,
                   MAX(Status) AS Status
              FROM tbl_Jobs
             GROUP BY ${jobKey('JobID')}
          )
          SELECT COALESCE(j.Status, '(no matching job)') AS jobStatus,
                 COUNT(*)                     AS toolsOutstanding,
                 COUNT(DISTINCT o.jobKey)     AS jobsAffected
            FROM outstanding o
            LEFT JOIN jobs j ON j.jobKey = o.jobKey
           GROUP BY COALESCE(j.Status, '(no matching job)')
           ORDER BY COUNT(*) DESC`,
  },
  {
    // The reverse: received on a job it was never dispatched on. A tool can
    // legitimately come back on a different job, so this is context for the
    // number above rather than an error on its own.
    name: 'receivedWithoutDispatchOnSameJob',
    sql: `WITH dt AS (
            SELECT DISTINCT
                   ${jobKey('t.jobNumber')} AS jobKey,
                   l.serial
              FROM tbl_DeliveryTicketLines l
              JOIN tbl_DeliveryTickets t ON t.dtNumber = l.dtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          ),
          rt AS (
            SELECT DISTINCT
                   ${jobKey('t.jobNumber')} AS jobKey,
                   l.serial
              FROM tbl_ReceivingTicketLines l
              JOIN tbl_ReceivingTickets t ON t.rtNumber = l.rtNumber
             WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
          )
          SELECT COUNT(*) AS receivedWithNoDispatchOnThatJob
            FROM rt
           WHERE NULLIF(rt.jobKey, '') IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM dt
                              WHERE dt.jobKey = rt.jobKey AND dt.serial = rt.serial)`,
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
