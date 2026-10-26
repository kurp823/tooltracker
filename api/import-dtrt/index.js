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

  // --------------------------------------------------------------- batches ---
  if (sub === 'batches' && method === 'GET') {
    try {
      const r = await query(
        `SELECT TOP 20 batchId, COUNT(*) AS Rows,
                MIN(uploadedAt) AS StartedAt, MAX(uploadedBy) AS UploadedBy
           FROM tbl_ImportDTRT
          GROUP BY batchId
          ORDER BY MIN(uploadedAt) DESC`, [])
      return jsonResponse(context, 200, { batches: r.recordset })
    } catch (err) {
      context.log.error('import batches error:', err)
      return jsonResponse(context, 500, { error: `Failed to list batches — ${err.message}` })
    }
  }

  // --------------------------------------------------------------- prepare ---
  /*
   * Normalise the batch, one statement per request.
   *
   * Done as a single call this also passed the 45-second cap, so each statement
   * is its own step and reports how long it took - a slow one can then be found
   * rather than guessed at. Steps are ordered and each is safe to repeat.
   */
  if (sub === 'prepare' && method === 'POST') {
    const b = req.body || {}
    const batchId = text(b.batchId)
    const step = text(b.step) || 'clear'
    if (!batchId) return jsonResponse(context, 400, { error: 'batchId is required' })
    const p = [{ name: 'b', type: sql.NVarChar, value: batchId }]

    const STEPS = {
      clear: 'DELETE FROM tbl_ImportDTRTResolved WHERE batchId = @b',

      /*
       * De-duplicate to one row per (ticket, asset, return ticket). The sheet
       * repeats rows and counting a repeat as real overstates everything after.
       *
       * Clears first, in the same transaction, so the step is idempotent. It
       * has to be: a request that passes the 45-second platform cap still runs
       * to completion in the database - db.js allows three minutes - so the
       * caller sees a failure, retries, and without this the batch is inserted
       * twice. That is exactly what happened: 85,354 rows for a 42,000-row
       * sheet.
       */
      rows: `SET XACT_ABORT ON;
             BEGIN TRANSACTION;
             DELETE FROM tbl_ImportDTRTResolved WHERE batchId = @b;
             INSERT INTO tbl_ImportDTRTResolved
               (batchId, jobKey, jobNum, dtNo, partNum, rtNo, rig, well, remark, rtKind)
             SELECT @b, ${jobKey('MAX(jobNum)')}, MAX(jobNum), dtNo, partNum, rtNo,
                    MAX(rig), MAX(well), MAX(remark),
                    CASE WHEN NULLIF(LTRIM(RTRIM(rtNo)), '') IS NULL THEN 0
                         WHEN rtNo LIKE '%DUMMY%' THEN 2 ELSE 1 END
               FROM tbl_ImportDTRT
              WHERE batchId = @b AND NULLIF(LTRIM(RTRIM(dtNo)), '') IS NOT NULL
              GROUP BY dtNo, partNum, rtNo,
                       CASE WHEN NULLIF(LTRIM(RTRIM(rtNo)), '') IS NULL THEN 0
                            WHEN rtNo LIKE '%DUMMY%' THEN 2 ELSE 1 END;
             COMMIT;`,

      /* The sheet carries the human AssetNo; ticket lines store the SystemID.
       * Resolved as a set-based join, AssetNo first because that is what the
       * sheet means by a part number. */
      'resolve-asset': `UPDATE r SET systemId = i.SystemID
                          FROM tbl_ImportDTRTResolved r
                          JOIN tbl_Inventory i ON i.AssetNo = r.partNum
                         WHERE r.batchId = @b AND r.systemId IS NULL
                           AND NULLIF(LTRIM(RTRIM(r.partNum)), '') IS NOT NULL`,

      'resolve-system': `UPDATE r SET systemId = i.SystemID
                           FROM tbl_ImportDTRTResolved r
                           JOIN tbl_Inventory i ON i.SystemID = r.partNum
                          WHERE r.batchId = @b AND r.systemId IS NULL`,

      count: `SELECT COUNT(*) AS Rows,
                     SUM(CASE WHEN systemId IS NULL THEN 1 ELSE 0 END) AS Unresolved
                FROM tbl_ImportDTRTResolved WHERE batchId = @b`,
    }

    if (!STEPS[step]) {
      return jsonResponse(context, 400, { error: `Unknown step "${step}"`, steps: Object.keys(STEPS) })
    }

    try {
      const t0 = Date.now()
      const r = await query(STEPS[step], p)
      return jsonResponse(context, 200, {
        step, ms: Date.now() - t0,
        rowsAffected: r.rowsAffected ? r.rowsAffected[0] : undefined,
        data: r.recordset && r.recordset.length ? r.recordset[0] : undefined,
      })
    } catch (err) {
      context.log.error(`import prepare ${step} error:`, err)
      return jsonResponse(context, 500, { error: `Prepare "${step}" failed — ${err.message}` })
    }
  }

  // --------------------------------------------------------------- preview ---
  /*
   * One part per request. Run together they exceeded the 45-second cap and the
   * platform returned a bodiless 500, which reached the screen as a bare
   * "HTTP 500" with no cause.
   */
  if (sub === 'preview' && method === 'GET') {
    const q = req.query || {}
    const batchId = text(q.batchId)
    const part = text(q.part) || 'shape'
    if (!batchId) return jsonResponse(context, 400, { error: 'batchId is required' })
    const p = [{ name: 'b', type: sql.NVarChar, value: batchId }]

    const PARTS = {
      shape: `SELECT (SELECT COUNT(*) FROM tbl_ImportDTRT WHERE batchId = @b) AS RowsUploaded,
                     COUNT(*)                        AS RowsDeduped,
                     COUNT(DISTINCT dtNo)            AS DeliveryTickets,
                     COUNT(DISTINCT jobKey)          AS Jobs,
                     COUNT(DISTINCT partNum)         AS Assets,
                     SUM(CASE WHEN rtKind = 0 THEN 1 ELSE 0 END) AS LinesWithNoRT,
                     SUM(CASE WHEN rtKind = 2 THEN 1 ELSE 0 END) AS LinesOnDummyRT,
                     SUM(CASE WHEN rtKind = 1 THEN 1 ELSE 0 END) AS LinesWithRealRT
                FROM tbl_ImportDTRTResolved WHERE batchId = @b`,

      onrig: `WITH j AS (SELECT ${jobKey('JobID')} AS jobKey, Status, LegalInvoiceNumber FROM tbl_Jobs)
              SELECT COALESCE(j.Status, '(job not in the app)') AS JobStatus,
                     CASE WHEN NULLIF(LTRIM(RTRIM(j.LegalInvoiceNumber)), '') IS NOT NULL
                          THEN 'invoiced' ELSE 'not invoiced' END AS Invoiced,
                     COUNT(*) AS LinesStillOut,
                     COUNT(DISTINCT r.jobKey) AS Jobs,
                     COUNT(DISTINCT r.partNum) AS Assets
                FROM tbl_ImportDTRTResolved r
                LEFT JOIN j ON j.jobKey = r.jobKey
               WHERE r.batchId = @b AND r.rtKind = 0
               GROUP BY COALESCE(j.Status, '(job not in the app)'),
                        CASE WHEN NULLIF(LTRIM(RTRIM(j.LegalInvoiceNumber)), '') IS NOT NULL
                             THEN 'invoiced' ELSE 'not invoiced' END
               ORDER BY COUNT(*) DESC`,

      dt: `WITH s AS (SELECT DISTINCT dtNo, systemId FROM tbl_ImportDTRTResolved
                       WHERE batchId = @b AND systemId IS NOT NULL),
                live AS (SELECT DISTINCT l.dtNumber AS dtNo, l.serial AS systemId
                           FROM tbl_DeliveryTicketLines l
                          WHERE EXISTS (SELECT 1 FROM tbl_ImportDTRTResolved r
                                         WHERE r.batchId = @b AND r.dtNo = l.dtNumber))
           SELECT (SELECT COUNT(*) FROM s) AS InSheet, (SELECT COUNT(*) FROM live) AS InApp,
                  (SELECT COUNT(*) FROM s JOIN live ON live.dtNo = s.dtNo AND live.systemId = s.systemId) AS Both,
                  (SELECT COUNT(*) FROM s WHERE NOT EXISTS (SELECT 1 FROM live
                     WHERE live.dtNo = s.dtNo AND live.systemId = s.systemId)) AS SheetOnly,
                  (SELECT COUNT(*) FROM live WHERE NOT EXISTS (SELECT 1 FROM s
                     WHERE s.dtNo = live.dtNo AND s.systemId = live.systemId)) AS AppOnlyOnSheetsTickets`,

      rt: `WITH s AS (SELECT DISTINCT rtNo, systemId FROM tbl_ImportDTRTResolved
                       WHERE batchId = @b AND rtKind = 1 AND systemId IS NOT NULL),
                live AS (SELECT DISTINCT l.rtNumber AS rtNo, l.serial AS systemId
                           FROM tbl_ReceivingTicketLines l
                          WHERE EXISTS (SELECT 1 FROM tbl_ImportDTRTResolved r
                                         WHERE r.batchId = @b AND r.rtKind = 1 AND r.rtNo = l.rtNumber))
           SELECT (SELECT COUNT(*) FROM s) AS InSheet, (SELECT COUNT(*) FROM live) AS InApp,
                  (SELECT COUNT(*) FROM s JOIN live ON live.rtNo = s.rtNo AND live.systemId = s.systemId) AS Both,
                  (SELECT COUNT(*) FROM s WHERE NOT EXISTS (SELECT 1 FROM live
                     WHERE live.rtNo = s.rtNo AND live.systemId = s.systemId)) AS SheetOnly,
                  (SELECT COUNT(*) FROM live WHERE NOT EXISTS (SELECT 1 FROM s
                     WHERE s.rtNo = live.rtNo AND s.systemId = live.systemId)) AS AppOnlyOnSheetsTickets`,

      unknown: `WITH j AS (SELECT ${jobKey('JobID')} AS jobKey FROM tbl_Jobs)
                SELECT 'Job' AS Kind, MIN(x.jobNum) AS Example, COUNT(*) AS Count FROM (
                  SELECT DISTINCT r.jobKey, MIN(r.jobNum) AS jobNum
                    FROM tbl_ImportDTRTResolved r
                   WHERE r.batchId = @b AND NULLIF(LTRIM(RTRIM(r.jobNum)), '') IS NOT NULL
                     AND NOT EXISTS (SELECT 1 FROM j WHERE j.jobKey = r.jobKey)
                   GROUP BY r.jobKey) x
                UNION ALL
                SELECT 'Delivery ticket', MIN(y.dtNo), COUNT(*) FROM (
                  SELECT DISTINCT r.dtNo FROM tbl_ImportDTRTResolved r
                   WHERE r.batchId = @b
                     AND NOT EXISTS (SELECT 1 FROM tbl_DeliveryTickets t WHERE t.dtNumber = r.dtNo)) y
                UNION ALL
                SELECT 'Return ticket', MIN(z.rtNo), COUNT(*) FROM (
                  SELECT DISTINCT r.rtNo FROM tbl_ImportDTRTResolved r
                   WHERE r.batchId = @b AND r.rtKind = 1
                     AND NOT EXISTS (SELECT 1 FROM tbl_ReceivingTickets t WHERE t.rtNumber = r.rtNo)) z`,

      linkage: `SELECT 'Assets resolving to an inventory record' AS Item,
                       COUNT(DISTINCT partNum) AS Count
                  FROM tbl_ImportDTRTResolved WHERE batchId = @b AND systemId IS NOT NULL
                UNION ALL
                SELECT 'Assets with NO inventory record (created first)',
                       COUNT(DISTINCT partNum)
                  FROM tbl_ImportDTRTResolved WHERE batchId = @b AND systemId IS NULL
                UNION ALL
                SELECT 'Job tool-list rows to add to tbl_JobTools', COUNT(*) FROM (
                  SELECT DISTINCT r.jobKey, r.systemId FROM tbl_ImportDTRTResolved r
                   WHERE r.batchId = @b AND r.systemId IS NOT NULL
                     AND NOT EXISTS (SELECT 1 FROM tbl_JobTools jt
                                      WHERE ${jobKey('jt.JobID')} = r.jobKey
                                        AND jt.SystemID = r.systemId)) a
                UNION ALL
                SELECT 'Utilization rows missing from tbl_DailyFieldLogs', COUNT(*) FROM (
                  SELECT DISTINCT r.dtNo, r.systemId FROM tbl_ImportDTRTResolved r
                   WHERE r.batchId = @b AND r.systemId IS NOT NULL
                     AND NOT EXISTS (SELECT 1 FROM tbl_DailyFieldLogs d
                                      WHERE d.DTNumber = r.dtNo AND d.ToolSerial = r.systemId)) c`,
    }

    if (!PARTS[part]) {
      return jsonResponse(context, 400, { error: `Unknown part "${part}"`, parts: Object.keys(PARTS) })
    }

    try {
      const r = await query(PARTS[part], p)
      const single = ['shape', 'dt', 'rt'].includes(part)
      return jsonResponse(context, 200, {
        batchId, part, data: single ? (r.recordset[0] || {}) : r.recordset,
      })
    } catch (err) {
      context.log.error(`import preview ${part} error:`, err)
      return jsonResponse(context, 500, { error: `Preview "${part}" failed — ${err.message}` })
    }
  }

  return jsonResponse(context, 404, { error: 'Unknown import-dtrt route' })
}
