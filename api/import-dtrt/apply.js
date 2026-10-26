'use strict'
const { sql, query, jobKey } = require('../db')

/**
 * Write a staged DT/RT sheet into the live tables.
 *
 * The sheet is the operator's own reconciliation and is treated as the
 * authority on equipment; tbl_Jobs stays the authority on the job. Each stage
 * is a separate request, bounded, and guarded so repeating it changes nothing —
 * which matters here because a request that passes the 45-second platform cap
 * still runs to completion in the database, so the caller can see a failure for
 * work that actually succeeded.
 *
 * Order matters. Jobs and inventory come first because everything else needs a
 * job to hang off and a SystemID to point at: ticket lines store the inventory
 * SystemID in `serial`, while the sheet carries the human AssetNo.
 */

/* Rows of the staged sheet per request for the line stages. The header stages
 * aggregate to a few thousand rows and need no window. */
const WINDOW = 8000

/** Resolve the sheet's AssetNo to one SystemID. TOP 1 because inventory holds
 *  duplicate asset numbers, and a plain join would fan every line out. */
const RESOLVE = `
  OUTER APPLY (
    SELECT TOP 1 i.SystemID, i.AssetNo, i.ShortDesc, i.[Size], i.IsEmdad
      FROM tbl_Inventory i
     WHERE i.AssetNo = s.partNum OR i.SystemID = s.partNum
     ORDER BY CASE WHEN i.AssetNo = s.partNum THEN 0 ELSE 1 END, i.SystemID
  ) inv`

/*
 * The dummy return ticket for a job, derived rather than allocated.
 *
 * The 305 dummies already in the database are all RT-DUMMY-{year}-{sequence}
 * matching their own job, so the number follows from the job id. Deriving it
 * makes the stage idempotent for free: the same job can only ever produce the
 * same ticket, so a second run inserts nothing.
 */
const DUMMY_NO = (col) => `
  'RT-DUMMY-' + RIGHT('000' + CAST(TRY_CAST(
      SUBSTRING(${col}, CHARINDEX('-', ${col}) + 1,
                CHARINDEX('-', ${col}, CHARINDEX('-', ${col}) + 1) - CHARINDEX('-', ${col}) - 1)
      AS INT) AS VARCHAR(8)), 3)
  + '-' + RIGHT('00000' + CAST(TRY_CAST(
      SUBSTRING(${col}, CHARINDEX('-', ${col}, CHARINDEX('-', ${col}) + 1) + 1, 5)
      AS INT) AS VARCHAR(8)), 5)`

/* Used / Not Used / LIH, as the receiving screen routes them. Copied from
 * api/receiving-tickets so an imported line lands where a keyed-in one would. */
const USED = `CASE WHEN UPPER(LTRIM(RTRIM(COALESCE(s.remark, '')))) LIKE 'LIH%' THEN 'LIH'
                   WHEN UPPER(LTRIM(RTRIM(COALESCE(s.remark, '')))) = 'USED'  THEN 'USED'
                   ELSE 'NOT USED' END`
const ROUTED = `CASE WHEN UPPER(LTRIM(RTRIM(COALESCE(s.remark, '')))) LIKE 'LIH%' THEN 'Lost in Hole'
                     WHEN UPPER(LTRIM(RTRIM(COALESCE(s.remark, '')))) = 'USED'  THEN 'Inspection Bay'
                     ELSE 'Available Inventory' END`
const CONDITION = `CASE WHEN UPPER(LTRIM(RTRIM(COALESCE(s.remark, '')))) LIKE 'LIH%' THEN 'Lost in Hole'
                        WHEN UPPER(LTRIM(RTRIM(COALESCE(s.remark, '')))) = 'USED'  THEN 'Inspection'
                        ELSE 'Available' END`

/* Job statuses that mean the job is still running, so kit on them is genuinely
 * out on a rig rather than missing paperwork. */
const LIVE = `('Ongoing', 'Draft Invoice Submitted', 'Open', 'Waiting on Signed Docs')`

const STAGES = {
  /* ------------------------------------------------------------ 1. jobs --- */
  // A job the sheet names that the app has never had. The sheet is ahead of the
  // app here: it carried 01849 and 01850 when the app stopped at 01848.
  jobs: `
    INSERT INTO tbl_Jobs (JobID, Client, Rig, Well, Status, CreatedBy, CreatedDate)
    SELECT MIN(s.jobNum), '', MAX(s.rig), MAX(s.well), 'Ongoing', @by, GETDATE()
      FROM tbl_ImportDTRT s
     WHERE s.batchId = @b
       AND NULLIF(LTRIM(RTRIM(s.jobNum)), '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM tbl_Jobs j
                        WHERE ${jobKey('j.JobID')} = ${jobKey('s.jobNum')})
     GROUP BY ${jobKey('s.jobNum')}`,

  /* ------------------------------------------------------- 2. inventory --- */
  // An asset the catalogue does not hold. Created so ticket lines have a
  // SystemID to point at; category, size and supplier are left for Ravi, which
  // is why ShortDesc is a marker rather than a guess.
  inventory: `
    INSERT INTO tbl_Inventory
      (SystemID, AssetNo, ShortDesc, Description, Qty, Location,
       Status, Ownership, IsEmdad, Supplier, AddedDate, AddedBy)
    SELECT s.partNum, s.partNum, 'TO BE CATEGORISED', MAX(s.partDesc), 1,
           MAX(s.rig), 'Good', 'EMDAD', 1, 'EMDAD', GETDATE(), @by
      FROM tbl_ImportDTRT s
     WHERE s.batchId = @b
       AND NULLIF(LTRIM(RTRIM(s.partNum)), '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM tbl_Inventory i
                        WHERE i.AssetNo = s.partNum OR i.SystemID = s.partNum)
     GROUP BY s.partNum`,

  /* ------------------------------------------------------ 3. DT headers --- */
  'dt-headers': `
    INSERT INTO tbl_DeliveryTickets
      (dtNumber, jobNumber, deliveryDate, rig, well, createdBy, createdAt)
    SELECT s.dtNo, MIN(s.jobNum), TRY_CONVERT(date, MIN(s.dtDate)),
           MAX(s.rig), MAX(s.well), @by, GETDATE()
      FROM tbl_ImportDTRT s
     WHERE s.batchId = @b
       AND NULLIF(LTRIM(RTRIM(s.dtNo)), '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM tbl_DeliveryTickets t WHERE t.dtNumber = s.dtNo)
     GROUP BY s.dtNo`,

  /* -------------------------------------------------------- 4. DT lines --- */
  'dt-lines': `
    INSERT INTO tbl_DeliveryTicketLines (dtNumber, itemNo, serial, toolDescription, qty)
    SELECT s.dtNo, TRY_CAST(s.sNo AS INT), inv.SystemID, s.partDesc, 1
      FROM tbl_ImportDTRT s
      ${RESOLVE}
     WHERE s.batchId = @b AND s.id > @fromId AND s.id <= @toId
       AND inv.SystemID IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM tbl_DeliveryTicketLines l
                        WHERE l.dtNumber = s.dtNo AND l.serial = inv.SystemID)`,

  /* ------------------------------------------------------ 5. RT headers --- */
  'rt-headers': `
    INSERT INTO tbl_ReceivingTickets
      (rtNumber, jobNumber, receivingDate, rig, well, createdBy, createdAt)
    SELECT s.rtNo, MIN(s.jobNum), TRY_CONVERT(date, MIN(s.rtDate)),
           MAX(s.rig), MAX(s.well), @by, GETDATE()
      FROM tbl_ImportDTRT s
     WHERE s.batchId = @b
       AND NULLIF(LTRIM(RTRIM(s.rtNo)), '') IS NOT NULL
       AND s.rtNo NOT LIKE '%DUMMY%'
       AND NOT EXISTS (SELECT 1 FROM tbl_ReceivingTickets t WHERE t.rtNumber = s.rtNo)
     GROUP BY s.rtNo`,

  /* -------------------------------------------------------- 6. RT lines --- */
  'rt-lines': `
    INSERT INTO tbl_ReceivingTicketLines
      (rtNumber, itemNo, serial, toolDescription, qty, usedStatus, condition, routedTo, routedAt, routedBy)
    SELECT s.rtNo, TRY_CAST(s.sNo AS INT), inv.SystemID, s.partDesc, 1,
           ${USED}, ${CONDITION}, ${ROUTED}, GETDATE(), @by
      FROM tbl_ImportDTRT s
      ${RESOLVE}
     WHERE s.batchId = @b AND s.id > @fromId AND s.id <= @toId
       AND NULLIF(LTRIM(RTRIM(s.rtNo)), '') IS NOT NULL
       AND s.rtNo NOT LIKE '%DUMMY%'
       AND inv.SystemID IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM tbl_ReceivingTicketLines l
                        WHERE l.rtNumber = s.rtNo AND l.serial = inv.SystemID)`,

  /* --------------------------------------------------- 7. dummy headers --- */
  /*
   * One numbered dummy per job, for two populations at once: lines the sheet
   * marked with its flat DUMMY-RT marker, and lines with no return ticket on a
   * job that is Completed with a legal invoice number — Ravi's rule, applied
   * the same way whether the job carries 1 line or 266.
   */
  'dummy-headers': `
    WITH j AS (
      SELECT ${jobKey('JobID')} AS jobKey, Status, LegalInvoiceNumber FROM tbl_Jobs
    ),
    need AS (
      SELECT DISTINCT s.jobNum
        FROM tbl_ImportDTRT s
        LEFT JOIN j ON j.jobKey = ${jobKey('s.jobNum')}
       WHERE s.batchId = @b
         AND NULLIF(LTRIM(RTRIM(s.jobNum)), '') IS NOT NULL
         AND ( s.rtNo LIKE '%DUMMY%'
            OR ( NULLIF(LTRIM(RTRIM(s.rtNo)), '') IS NULL
                 AND j.Status = 'Completed'
                 AND NULLIF(LTRIM(RTRIM(j.LegalInvoiceNumber)), '') IS NOT NULL ) )
    )
    INSERT INTO tbl_ReceivingTickets
      (rtNumber, jobNumber, receivingDate, rig, well, notes, createdBy, createdAt)
    SELECT ${DUMMY_NO('n.jobNum')}, n.jobNum,
           (SELECT TRY_CONVERT(date, MAX(x.dtDate)) FROM tbl_ImportDTRT x
             WHERE x.batchId = @b AND x.jobNum = n.jobNum),
           (SELECT MAX(x.rig)  FROM tbl_ImportDTRT x WHERE x.batchId = @b AND x.jobNum = n.jobNum),
           (SELECT MAX(x.well) FROM tbl_ImportDTRT x WHERE x.batchId = @b AND x.jobNum = n.jobNum),
           'Dummy return ticket — job closed from the corrected DT/RT sheet',
           @by, GETDATE()
      FROM need n
     WHERE NOT EXISTS (SELECT 1 FROM tbl_ReceivingTickets t
                        WHERE t.rtNumber = ${DUMMY_NO('n.jobNum')})`,

  /* ----------------------------------------------------- 8. dummy lines --- */
  'dummy-lines': `
    WITH j AS (
      SELECT ${jobKey('JobID')} AS jobKey, Status, LegalInvoiceNumber FROM tbl_Jobs
    )
    INSERT INTO tbl_ReceivingTicketLines
      (rtNumber, itemNo, serial, toolDescription, qty, usedStatus, condition, routedTo, routedAt, routedBy)
    SELECT ${DUMMY_NO('s.jobNum')}, TRY_CAST(s.sNo AS INT), inv.SystemID, s.partDesc, 1,
           ${USED}, ${CONDITION}, ${ROUTED}, GETDATE(), @by
      FROM tbl_ImportDTRT s
      LEFT JOIN j ON j.jobKey = ${jobKey('s.jobNum')}
      ${RESOLVE}
     WHERE s.batchId = @b AND s.id > @fromId AND s.id <= @toId
       AND inv.SystemID IS NOT NULL
       AND NULLIF(LTRIM(RTRIM(s.jobNum)), '') IS NOT NULL
       AND ( s.rtNo LIKE '%DUMMY%'
          OR ( NULLIF(LTRIM(RTRIM(s.rtNo)), '') IS NULL
               AND j.Status = 'Completed'
               AND NULLIF(LTRIM(RTRIM(j.LegalInvoiceNumber)), '') IS NOT NULL ) )
       AND EXISTS (SELECT 1 FROM tbl_ReceivingTickets t
                    WHERE t.rtNumber = ${DUMMY_NO('s.jobNum')})
       AND NOT EXISTS (SELECT 1 FROM tbl_ReceivingTicketLines l
                        WHERE l.rtNumber = ${DUMMY_NO('s.jobNum')} AND l.serial = inv.SystemID)`,

  /* ------------------------------------------------------- 9. job tools --- */
  // The tool list shown on the job file. Separate from the ticket lines, and
  // left stale by an import that writes tickets alone.
  jobtools: `
    INSERT INTO tbl_JobTools (JobID, SystemID, Serial, AssetNo, ShortDesc, [Size], IsEmdad, AddedDate, AddedBy, Notes)
    SELECT MIN(s.jobNum), inv.SystemID, inv.SystemID, MAX(inv.AssetNo),
           MAX(inv.ShortDesc), MAX(inv.[Size]), MAX(CAST(inv.IsEmdad AS INT)),
           GETDATE(), @by, 'From the corrected DT/RT sheet'
      FROM tbl_ImportDTRT s
      ${RESOLVE}
     WHERE s.batchId = @b AND s.id > @fromId AND s.id <= @toId
       AND inv.SystemID IS NOT NULL
       AND NULLIF(LTRIM(RTRIM(s.jobNum)), '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM tbl_JobTools jt
                        WHERE ${jobKey('jt.JobID')} = ${jobKey('s.jobNum')}
                          AND jt.SystemID = inv.SystemID)
     GROUP BY ${jobKey('s.jobNum')}, inv.SystemID`,

  /* ------------------------------------------------------ 10. field logs --- */
  // Keyed (ToolSerial, DTNumber) — what the revenue rollup joins on, so without
  // these every imported day is invisible to the totals.
  fieldlogs: `
    INSERT INTO tbl_DailyFieldLogs (JobID, DTNumber, ToolSerial, LogDate, StatusType, CreatedDate)
    SELECT MIN(s.jobNum), s.dtNo, inv.SystemID,
           TRY_CONVERT(date, MIN(s.dtDate)), '1', GETDATE()
      FROM tbl_ImportDTRT s
      ${RESOLVE}
     WHERE s.batchId = @b AND s.id > @fromId AND s.id <= @toId
       AND inv.SystemID IS NOT NULL
       AND NULLIF(LTRIM(RTRIM(s.dtNo)), '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM tbl_DailyFieldLogs d
                        WHERE d.DTNumber = s.dtNo AND d.ToolSerial = inv.SystemID)
     GROUP BY s.dtNo, inv.SystemID`,

  /* ------------------------------------------------ 11. inventory status --- */
  /*
   * Equipment the sheet shows as never returned, on a job the app still calls
   * live, is on a rig. Only rows reading 'Good' are moved: DBR, Inspection,
   * Maintenance and Lost in Hole each belong to another workflow.
   */
  'inv-status-onrig': `
    WITH j AS (SELECT ${jobKey('JobID')} AS jobKey, Status FROM tbl_Jobs),
    outstanding AS (
      SELECT DISTINCT inv.SystemID,
             FIRST_VALUE(s.rig) OVER (PARTITION BY inv.SystemID
                                      ORDER BY s.dtDate DESC) AS rig
        FROM tbl_ImportDTRT s
        JOIN j ON j.jobKey = ${jobKey('s.jobNum')}
        ${RESOLVE}
       WHERE s.batchId = @b
         AND NULLIF(LTRIM(RTRIM(s.rtNo)), '') IS NULL
         AND inv.SystemID IS NOT NULL
         AND j.Status IN ${LIVE}
    )
    UPDATE i
       SET Status = 'On Rig', Location = COALESCE(NULLIF(o.rig, ''), i.Location)
      FROM tbl_Inventory i
      JOIN outstanding o ON o.SystemID = i.SystemID
     WHERE i.Status = 'Good'`,

  /* Anything the sheet shows as returned goes back where the receiving rule
   * puts it, so a tool wrongly left 'On Rig' is released. */
  'inv-status-returned': `
    WITH returned AS (
      SELECT DISTINCT inv.SystemID,
             MAX(CASE WHEN UPPER(LTRIM(RTRIM(COALESCE(s.remark, '')))) = 'USED' THEN 1 ELSE 0 END) AS wasUsed
        FROM tbl_ImportDTRT s
        ${RESOLVE}
       WHERE s.batchId = @b
         AND NULLIF(LTRIM(RTRIM(s.rtNo)), '') IS NOT NULL
         AND inv.SystemID IS NOT NULL
       GROUP BY inv.SystemID
    )
    UPDATE i
       SET Status   = CASE WHEN r.wasUsed = 1 THEN 'Inspection' ELSE 'Good' END,
           Location = 'Emdad Base'
      FROM tbl_Inventory i
      JOIN returned r ON r.SystemID = i.SystemID
     WHERE i.Status = 'On Rig'`,

  /* ------------------------------------------------------ 12. job status --- */
  /*
   * A job the sheet shows with equipment still out, which the app has already
   * marked Completed or JobCompleted without a legal invoice, is not finished.
   * Jobs that ARE invoiced keep their status and get a dummy instead, which
   * stages 7 and 8 have already done.
   */
  'job-status': `
    WITH stillOut AS (
      SELECT DISTINCT ${jobKey('s.jobNum')} AS jobKey
        FROM tbl_ImportDTRT s
       WHERE s.batchId = @b AND NULLIF(LTRIM(RTRIM(s.rtNo)), '') IS NULL
    )
    UPDATE j
       SET Status = 'Ongoing'
      FROM tbl_Jobs j
      JOIN stillOut o ON o.jobKey = ${jobKey('j.JobID')}
     WHERE j.Status IN ('Completed', 'JobCompleted')
       AND NULLIF(LTRIM(RTRIM(j.LegalInvoiceNumber)), '') IS NULL`,
}

/** Stages that walk the staged rows in windows rather than aggregating. */
const WINDOWED = new Set(['dt-lines', 'rt-lines', 'dummy-lines', 'jobtools', 'fieldlogs'])

const ORDER = [
  'jobs', 'inventory', 'dt-headers', 'dt-lines', 'rt-headers', 'rt-lines',
  'dummy-headers', 'dummy-lines', 'jobtools', 'fieldlogs',
  'inv-status-onrig', 'inv-status-returned', 'job-status',
]

async function runStage(stage, batchId, fromId, username) {
  const p = [
    { name: 'b', type: sql.NVarChar, value: batchId },
    { name: 'by', type: sql.NVarChar, value: username || '' },
  ]
  if (WINDOWED.has(stage)) {
    p.push({ name: 'fromId', type: sql.Int, value: fromId })
    p.push({ name: 'toId', type: sql.Int, value: fromId + WINDOW })
  }

  const t0 = Date.now()
  const r = await query(STAGES[stage], p)
  const written = r.rowsAffected ? r.rowsAffected.reduce((a, n) => a + n, 0) : 0

  let nextFromId = null
  if (WINDOWED.has(stage)) {
    const m = await query(
      'SELECT MAX(id) AS maxId FROM tbl_ImportDTRT WHERE batchId = @b',
      [{ name: 'b', type: sql.NVarChar, value: batchId }])
    const maxId = m.recordset[0].maxId || 0
    nextFromId = fromId + WINDOW < maxId ? fromId + WINDOW : null
  }

  return { stage, ms: Date.now() - t0, written, fromId, nextFromId }
}

module.exports = { STAGES, WINDOWED, ORDER, runStage }
