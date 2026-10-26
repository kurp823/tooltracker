'use strict'
const { sql, query, jsonResponse, requireAuth, jobKey } = require('../db')

/**
 * /api/import-dtrt — ingest and check a corrected DT/RT sheet. Admin only.
 *
 * The sheet is the operator's own reconciliation of what went out and what came
 * back: one row per dispatched tool, carrying the return ticket if it returned.
 * Where a row has no return ticket the tool is still on a rig.
 *
 * Nothing here writes to the live tables. Rows land in tbl_ImportDTRT and the
 * preview compares them against tbl_DeliveryTicketLines and
 * tbl_ReceivingTicketLines, so the differences are visible and countable before
 * a single live row is touched. Applying the result is a separate endpoint.
 *
 *   POST /api/import-dtrt/rows      { batchId, rows: [...] }   append a chunk
 *   POST /api/import-dtrt/reset     { batchId }                clear a batch
 *   GET  /api/import-dtrt/preview?batchId=...                  compare, read-only
 */

// The sheet is uploaded in chunks: a single request carrying 46,000 rows would
// pass neither the body limit nor the 45-second function cap.
const MAX_ROWS_PER_CALL = 2000

const COLUMNS = ['rowNo', 'jobNum', 'dtNo', 'dtDate', 'sNo', 'partNum',
                 'partDesc', 'rtNo', 'rtDate', 'remark', 'rig', 'well']

/** Trim to text; undefined, null and the strings Excel leaves behind all -> ''. */
function text(v) {
  if (v === undefined || v === null) return ''
  const s = String(v).trim()
  return (s === 'nan' || s === 'NaN' || s === 'undefined' || s === 'null') ? '' : s
}

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  if (user.Role !== 'Admin') return jsonResponse(context, 403, { error: 'Admin only' })

  const sub = String((context.bindingData && context.bindingData.sub) || '').toLowerCase()
  const method = (req.method || 'GET').toUpperCase()

  // ----------------------------------------------------------- append rows ---
  if (sub === 'rows' && method === 'POST') {
    const b = req.body || {}
    const batchId = text(b.batchId)
    const rows = Array.isArray(b.rows) ? b.rows : []
    if (!batchId) return jsonResponse(context, 400, { error: 'batchId is required' })
    if (!rows.length) return jsonResponse(context, 400, { error: 'rows is empty' })
    if (rows.length > MAX_ROWS_PER_CALL) {
      return jsonResponse(context, 400, {
        error: `Send at most ${MAX_ROWS_PER_CALL} rows per call`, sent: rows.length,
      })
    }

    try {
      /*
       * The chunk travels as ONE json parameter and is expanded by OPENJSON.
       *
       * The obvious shape - a multi-row VALUES list with a parameter per cell -
       * cannot work here: SQL Server caps a request at 2,100 parameters, and
       * 2,000 rows of twelve columns asks for 24,000. Dropping the chunk size
       * to fit would mean a request per 170 rows, so the whole sheet would take
       * 270 round trips. OPENJSON keeps it at three parameters whatever the
       * chunk size.
       */
      await query(
        `INSERT INTO tbl_ImportDTRT
           (batchId, ${COLUMNS.join(', ')}, uploadedBy)
         SELECT @batchId, ${COLUMNS.map((c) => `j.${c}`).join(', ')}, @by
           FROM OPENJSON(@rows)
           WITH (
             rowNo    INT            '$.rowNo',
             jobNum   NVARCHAR(60)   '$.jobNum',
             dtNo     NVARCHAR(60)   '$.dtNo',
             dtDate   NVARCHAR(40)   '$.dtDate',
             sNo      NVARCHAR(20)   '$.sNo',
             partNum  NVARCHAR(120)  '$.partNum',
             partDesc NVARCHAR(400)  '$.partDesc',
             rtNo     NVARCHAR(60)   '$.rtNo',
             rtDate   NVARCHAR(40)   '$.rtDate',
             remark   NVARCHAR(120)  '$.remark',
             rig      NVARCHAR(120)  '$.rig',
             well     NVARCHAR(120)  '$.well'
           ) j`,
        [
          { name: 'batchId', type: sql.NVarChar, value: batchId },
          { name: 'by', type: sql.NVarChar, value: user.Username || '' },
          {
            name: 'rows',
            type: sql.NVarChar(sql.MAX),
            value: JSON.stringify(rows.map((r) => ({
              rowNo: Number.isFinite(Number(r.rowNo)) ? Number(r.rowNo) : null,
              jobNum: text(r.jobNum).slice(0, 60),
              dtNo: text(r.dtNo).slice(0, 60),
              dtDate: text(r.dtDate).slice(0, 40),
              sNo: text(r.sNo).slice(0, 20),
              partNum: text(r.partNum).slice(0, 120),
              partDesc: text(r.partDesc).slice(0, 400),
              rtNo: text(r.rtNo).slice(0, 60),
              rtDate: text(r.rtDate).slice(0, 40),
              remark: text(r.remark).slice(0, 120),
              rig: text(r.rig).slice(0, 120),
              well: text(r.well).slice(0, 120),
            }))),
          },
        ])

      const n = await query(
        'SELECT COUNT(*) AS n FROM tbl_ImportDTRT WHERE batchId = @b',
        [{ name: 'b', type: sql.NVarChar, value: batchId }])

      return jsonResponse(context, 200, {
        accepted: rows.length, batchTotal: n.recordset[0].n,
      })
    } catch (err) {
      context.log.error('import rows error:', err)
      return jsonResponse(context, 500, {
        error: `Failed to stage rows — ${String(err.message || err)}`,
      })
    }
  }

  // ---------------------------------------------------------- clear a batch ---
  if (sub === 'reset' && method === 'POST') {
    const batchId = text((req.body || {}).batchId)
    if (!batchId) return jsonResponse(context, 400, { error: 'batchId is required' })
    try {
      const r = await query(
        'DELETE FROM tbl_ImportDTRT WHERE batchId = @b',
        [{ name: 'b', type: sql.NVarChar, value: batchId }])
      return jsonResponse(context, 200, { cleared: r.rowsAffected ? r.rowsAffected[0] : 0 })
    } catch (err) {
      context.log.error('import reset error:', err)
      return jsonResponse(context, 500, { error: 'Failed to clear the batch' })
    }
  }

  // --------------------------------------------------------------- preview ---
  if (sub === 'preview' && method === 'GET') {
    const batchId = text((req.query || {}).batchId)
    if (!batchId) return jsonResponse(context, 400, { error: 'batchId is required' })
    const p = [{ name: 'b', type: sql.NVarChar, value: batchId }]

    try {
      // Nothing staged: the comparisons below would still scan the live tables
      // to prove it, which is a slow way to say zero.
      const staged = await query(
        'SELECT COUNT(*) AS n FROM tbl_ImportDTRT WHERE batchId = @b', p)
      if (!staged.recordset[0].n) {
        return jsonResponse(context, 200, { batchId, empty: true, rowsStaged: 0 })
      }
      /*
       * One pass over the staged batch, de-duplicated the same way the live
       * tables were: a sheet exported from Excel repeats rows, and counting
       * those as real would overstate everything downstream.
       */
      const shape = await query(
        `WITH s AS (
           SELECT DISTINCT dtNo, partNum, rtNo, jobNum, rig, well,
                  ${jobKey('jobNum')} AS jobK
             FROM tbl_ImportDTRT
            WHERE batchId = @b AND NULLIF(LTRIM(RTRIM(dtNo)), '') IS NOT NULL
         )
         SELECT (SELECT COUNT(*) FROM tbl_ImportDTRT WHERE batchId = @b) AS RowsUploaded,
                COUNT(*)                                        AS RowsDeduped,
                COUNT(DISTINCT dtNo)                            AS DeliveryTickets,
                COUNT(DISTINCT jobK)                            AS Jobs,
                COUNT(DISTINCT partNum)                         AS Assets,
                SUM(CASE WHEN NULLIF(LTRIM(RTRIM(rtNo)), '') IS NULL
                         THEN 1 ELSE 0 END)                     AS LinesWithNoRT,
                SUM(CASE WHEN rtNo LIKE '%DUMMY%' THEN 1 ELSE 0 END) AS LinesOnDummyRT,
                SUM(CASE WHEN NULLIF(LTRIM(RTRIM(rtNo)), '') IS NOT NULL
                          AND rtNo NOT LIKE '%DUMMY%' THEN 1 ELSE 0 END) AS LinesWithRealRT
           FROM s`, p)

      /*
       * What the sheet says is still on a rig, and whether the app agrees about
       * the job it sits on. The sheet is the authority on the kit; the job table
       * is the authority on the job, so a disagreement here is a status to fix
       * rather than a row to doubt.
       */
      const onRig = await query(
        `WITH s AS (
           SELECT DISTINCT ${jobKey('jobNum')} AS jobK, jobNum, partNum, dtNo, rig
             FROM tbl_ImportDTRT
            WHERE batchId = @b
              AND NULLIF(LTRIM(RTRIM(dtNo)), '') IS NOT NULL
              AND NULLIF(LTRIM(RTRIM(rtNo)), '') IS NULL
         ),
         j AS (SELECT ${jobKey('JobID')} AS jobK, JobID, Status, LegalInvoiceNumber FROM tbl_Jobs)
         SELECT COALESCE(j.Status, '(job not in the app)') AS JobStatus,
                CASE WHEN NULLIF(LTRIM(RTRIM(j.LegalInvoiceNumber)), '') IS NOT NULL
                     THEN 'invoiced' ELSE 'not invoiced' END AS Invoiced,
                COUNT(*)                   AS LinesStillOut,
                COUNT(DISTINCT s.jobK)     AS Jobs,
                COUNT(DISTINCT s.partNum)  AS Assets
           FROM s LEFT JOIN j ON j.jobK = s.jobK
          GROUP BY COALESCE(j.Status, '(job not in the app)'),
                   CASE WHEN NULLIF(LTRIM(RTRIM(j.LegalInvoiceNumber)), '') IS NOT NULL
                        THEN 'invoiced' ELSE 'not invoiced' END
          ORDER BY COUNT(*) DESC`, p)

      /*
       * The delivery side: does the app hold the same dispatch lines? Matched on
       * (ticket, asset), resolving the asset through inventory because a ticket
       * line stores the SystemID while the sheet carries the human AssetNo.
       */
      const dt = await query(
        `WITH s AS (
           SELECT DISTINCT dtNo, partNum FROM tbl_ImportDTRT
            WHERE batchId = @b AND NULLIF(LTRIM(RTRIM(dtNo)), '') IS NOT NULL
              AND NULLIF(LTRIM(RTRIM(partNum)), '') IS NOT NULL
         ),
         tix AS (
           SELECT DISTINCT dtNo FROM tbl_ImportDTRT
            WHERE batchId = @b AND NULLIF(LTRIM(RTRIM(dtNo)), '') IS NOT NULL
         ),
         live AS (
           SELECT DISTINCT l.dtNumber AS dtNo,
                  COALESCE(NULLIF(i.AssetNo, ''), l.serial) AS partNum
             FROM tbl_DeliveryTicketLines l
             JOIN tix ON tix.dtNo = l.dtNumber
             LEFT JOIN tbl_Inventory i
                    ON i.SystemID = l.serial OR i.AssetNo = l.serial
            WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
         )
         SELECT (SELECT COUNT(*) FROM s)    AS InSheet,
                (SELECT COUNT(*) FROM live) AS InApp,
                (SELECT COUNT(*) FROM s INNER JOIN live
                   ON live.dtNo = s.dtNo AND live.partNum = s.partNum) AS Both,
                (SELECT COUNT(*) FROM s WHERE NOT EXISTS
                   (SELECT 1 FROM live WHERE live.dtNo = s.dtNo
                     AND live.partNum = s.partNum))                    AS SheetOnly,
                (SELECT COUNT(*) FROM live WHERE NOT EXISTS
                   (SELECT 1 FROM s WHERE s.dtNo = live.dtNo
                     AND s.partNum = live.partNum))                    AS AppOnlyOnSheetsTickets`, p)

      /* The return side, same comparison. This is where the two diverge. */
      const rt = await query(
        `WITH s AS (
           SELECT DISTINCT rtNo, partNum FROM tbl_ImportDTRT
            WHERE batchId = @b
              AND NULLIF(LTRIM(RTRIM(rtNo)), '') IS NOT NULL
              AND rtNo NOT LIKE '%DUMMY%'
              AND NULLIF(LTRIM(RTRIM(partNum)), '') IS NOT NULL
         ),
         tix AS (
           SELECT DISTINCT rtNo FROM tbl_ImportDTRT
            WHERE batchId = @b AND NULLIF(LTRIM(RTRIM(rtNo)), '') IS NOT NULL
              AND rtNo NOT LIKE '%DUMMY%'
         ),
         live AS (
           SELECT DISTINCT l.rtNumber AS rtNo,
                  COALESCE(NULLIF(i.AssetNo, ''), l.serial) AS partNum
             FROM tbl_ReceivingTicketLines l
             JOIN tix ON tix.rtNo = l.rtNumber
             LEFT JOIN tbl_Inventory i
                    ON i.SystemID = l.serial OR i.AssetNo = l.serial
            WHERE NULLIF(LTRIM(RTRIM(l.serial)), '') IS NOT NULL
         )
         SELECT (SELECT COUNT(*) FROM s)    AS InSheet,
                (SELECT COUNT(*) FROM live) AS InApp,
                (SELECT COUNT(*) FROM s INNER JOIN live
                   ON live.rtNo = s.rtNo AND live.partNum = s.partNum) AS Both,
                (SELECT COUNT(*) FROM s WHERE NOT EXISTS
                   (SELECT 1 FROM live WHERE live.rtNo = s.rtNo
                     AND live.partNum = s.partNum))                    AS SheetOnly,
                (SELECT COUNT(*) FROM live WHERE NOT EXISTS
                   (SELECT 1 FROM s WHERE s.rtNo = live.rtNo
                     AND s.partNum = live.partNum))                    AS AppOnlyOnSheetsTickets`, p)

      /* Tickets and jobs named in the sheet that the app has never heard of. */
      const unknown = await query(
        `WITH s AS (SELECT DISTINCT jobNum, ${jobKey('jobNum')} AS jobK, dtNo, rtNo
                      FROM tbl_ImportDTRT WHERE batchId = @b)
         SELECT 'Job'            AS Kind, MIN(jobNum) AS Example, COUNT(*) AS Count
           FROM (SELECT DISTINCT jobNum, jobK FROM s
                  WHERE NULLIF(LTRIM(RTRIM(jobNum)), '') IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM tbl_Jobs j
                                     WHERE ${jobKey('j.JobID')} = s.jobK)) x
         UNION ALL
         SELECT 'Delivery ticket', MIN(dtNo), COUNT(*)
           FROM (SELECT DISTINCT dtNo FROM s
                  WHERE NULLIF(LTRIM(RTRIM(dtNo)), '') IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM tbl_DeliveryTickets t
                                     WHERE t.dtNumber = s.dtNo)) y
         UNION ALL
         SELECT 'Return ticket', MIN(rtNo), COUNT(*)
           FROM (SELECT DISTINCT rtNo FROM s
                  WHERE NULLIF(LTRIM(RTRIM(rtNo)), '') IS NOT NULL
                    AND rtNo NOT LIKE '%DUMMY%'
                    AND NOT EXISTS (SELECT 1 FROM tbl_ReceivingTickets t
                                     WHERE t.rtNumber = s.rtNo)) z`, p)

      /*
       * Everything the apply step would have to touch beyond the two ticket
       * tables, so the full extent of the write is visible first.
       *
       * Ticket lines store the inventory SystemID in `serial`, while the sheet
       * carries the human AssetNo, so every row has to resolve through
       * tbl_Inventory - and an asset with no inventory record cannot be linked
       * to anything until one is created.
       *
       * tbl_JobTools is the tool list shown on the job file and tbl_DailyFieldLogs
       * is what the revenue rollup joins on, keyed (ToolSerial, DTNumber). Both
       * are separate from the ticket lines and both go stale if an import writes
       * tickets alone. Tool history and job history need nothing of their own:
       * they are derived from the ticket tables plus the field logs, so they
       * follow once those are right.
       */
      const linkage = await query(
        `WITH s AS (
           SELECT DISTINCT ${jobKey('jobNum')} AS jobK, jobNum, dtNo, partNum
             FROM tbl_ImportDTRT
            WHERE batchId = @b
              AND NULLIF(LTRIM(RTRIM(partNum)), '') IS NOT NULL
         ),
         res AS (
           SELECT s.*, (SELECT TOP 1 i.SystemID FROM tbl_Inventory i
                         WHERE i.AssetNo = s.partNum OR i.SystemID = s.partNum
                         ORDER BY CASE WHEN i.AssetNo = s.partNum THEN 0 ELSE 1 END) AS SystemID
             FROM s
         )
         SELECT 'Assets resolving to an inventory record' AS Item,
                COUNT(DISTINCT partNum) AS Count
           FROM res WHERE SystemID IS NOT NULL
         UNION ALL
         SELECT 'Assets with NO inventory record (must be created first)',
                COUNT(DISTINCT partNum) FROM res WHERE SystemID IS NULL
         UNION ALL
         SELECT 'Job tool-list rows to add to tbl_JobTools',
                COUNT(*) FROM (
                  SELECT DISTINCT r.jobK, r.SystemID FROM res r
                   WHERE r.SystemID IS NOT NULL
                     AND NOT EXISTS (SELECT 1 FROM tbl_JobTools jt
                                      WHERE ${jobKey('jt.JobID')} = r.jobK
                                        AND jt.SystemID = r.SystemID)) a
         UNION ALL
         SELECT 'Utilization rows missing from tbl_DailyFieldLogs',
                COUNT(*) FROM (
                  SELECT DISTINCT r.dtNo, r.SystemID FROM res r
                   WHERE r.SystemID IS NOT NULL
                     AND NULLIF(LTRIM(RTRIM(r.dtNo)), '') IS NOT NULL
                     AND NOT EXISTS (SELECT 1 FROM tbl_DailyFieldLogs d
                                      WHERE d.DTNumber = r.dtNo
                                        AND d.ToolSerial = r.SystemID)) c`, p)

      return jsonResponse(context, 200, {
        batchId,
        shape: shape.recordset[0],
        stillOnRigByJobStatus: onRig.recordset,
        deliveryLines: dt.recordset[0],
        returnLines: rt.recordset[0],
        notKnownToTheApp: unknown.recordset,
        linkedTables: linkage.recordset,
      })
    } catch (err) {
      context.log.error('import preview error:', err)
      return jsonResponse(context, 500, {
        error: `Failed to build the preview — ${String(err.message || err)}`,
      })
    }
  }

  return jsonResponse(context, 404, { error: 'Unknown import-dtrt route' })
}
