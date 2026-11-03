'use strict'
const { sql, query, jsonResponse, requireAuth, safe } = require('../db')
const { ensureLines, ownerSql, sheetApply, amountSql } = require('../sub-lines')

/**
 * Sub-contract POs and accruals.
 *
 *   GET /api/sub-accruals          one row per supplier and job
 *   PUT /api/sub-accruals          record the PO and/or the supplier invoice
 *
 * A hired-in tool is paid for after the job, on what was agreed for the hire:
 * the final PO is raised when the job is complete, and the supplier then
 * invoices against it. Until then the cost is an accrual. This screen answers
 * two questions - which POs are still to be issued, and which supplier
 * invoices are still to arrive - from the days already marked on the jobs
 * and the settlement lines (basis x quantity x rate) agreed for each tool.
 *
 * The cost is not stored. It is worked out from the field logs and the hire
 * rate every time, so setting a rate or correcting a day moves it. Only the
 * paperwork - PO number and date, invoice number, date and amount - is kept,
 * in tbl_SubContractPOs, one row per supplier and job.
 */

const VIEWERS = ['Admin', 'Billing', 'Finance', 'CostController', 'Executive']
const EDITORS = ['Admin', 'Billing', 'Finance', 'CostController']

let ready = null
function ensureTable() {
  if (!ready) {
    ready = ensureLines().then(() => query(`
      IF OBJECT_ID('dbo.tbl_SubContractPOs', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.tbl_SubContractPOs (
          id            int IDENTITY(1,1) NOT NULL CONSTRAINT PK_tbl_SubContractPOs PRIMARY KEY,
          supplierName  nvarchar(200) NOT NULL,
          jobId         nvarchar(64)  NOT NULL,
          poNumber      nvarchar(64)  NULL,
          poDate        date          NULL,
          invoiceNo     nvarchar(64)  NULL,
          invoiceDate   date          NULL,
          invoiceAmount decimal(18,2) NULL,
          currency      nvarchar(10)  NULL,
          notes         nvarchar(500) NULL,
          updatedBy     nvarchar(100) NULL,
          updatedAt     datetime      NULL CONSTRAINT DF_SCPO_At DEFAULT (GETDATE()),
          CONSTRAINT UQ_tbl_SubContractPOs UNIQUE (supplierName, jobId)
        );
      END`, [])).catch(e => { ready = null; throw e })
  }
  return ready
}

module.exports = safe(async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  if (!VIEWERS.includes(user.Role))
    return jsonResponse(context, 403, { error: 'Forbidden' })
  await ensureTable()

  const method = req.method.toUpperCase()

  if (method === 'GET') {
    const r = await query(
      `SELECT a.supplier AS supplierName, a.jobId, a.tools, a.days, a.accrued, a.unsettled,
              a.currency, a.firstDay, a.lastDay,
              j.Status AS jobStatus, j.Client AS client, j.Rig AS rig, j.DemobDate AS demobDate,
              p.poNumber, p.poDate, p.invoiceNo, p.invoiceDate, p.invoiceAmount,
              COALESCE(p.currency, a.currency) AS poCurrency, p.notes
         FROM (
           SELECT x.supplier, x.jobId,
                  COUNT(*)               AS tools,
                  SUM(x.days)            AS days,
                  SUM(COALESCE(x.amount, 0)) AS accrued,
                  SUM(CASE WHEN x.amount IS NULL THEN 1 ELSE 0 END) AS unsettled,
                  MAX(x.cur)             AS currency,
                  MIN(x.firstDay)        AS firstDay,
                  MAX(x.lastDay)         AS lastDay
             FROM (
               SELECT t.jobId, t.tool, t.days, t.firstDay, t.lastDay, t.supplier,
                      ${amountSql('t.days')} AS amount,
                      COALESCE(l.currency, sh.sheetCurrency) AS cur
                 FROM (
                   SELECT d.JobID AS jobId, d.ToolSerial AS tool,
                          COUNT(*) AS days, MIN(d.LogDate) AS firstDay, MAX(d.LogDate) AS lastDay,
                          ${ownerSql('i')} AS supplier, i.ShortDesc AS category, i.Size AS size, j.Contract AS contract
                     FROM tbl_DailyFieldLogs d
                     JOIN tbl_Inventory i ON i.SystemID = d.ToolSerial AND i.IsEmdad = 0
                      AND NOT (UPPER(COALESCE(i.Ownership, '')) = 'EMDAD' AND UPPER(COALESCE(i.Supplier, '')) IN ('EMDAD', ''))
                     LEFT JOIN tbl_Jobs j ON j.JobID = d.JobID
                    WHERE d.StatusType IN ('1','S')
                    GROUP BY d.JobID, d.ToolSerial, i.Ownership, i.Supplier, i.ShortDesc, i.Size, j.Contract
                 ) t
                 LEFT JOIN tbl_SubContractLines l ON l.jobId = t.jobId AND l.toolSerial = t.tool
                 ${sheetApply('t.supplier', 't.category', 't.size', 't.contract')}
             ) x
            GROUP BY x.supplier, x.jobId
         ) a
         LEFT JOIN tbl_Jobs j ON j.JobID = a.jobId
         LEFT JOIN tbl_SubContractPOs p ON p.supplierName = a.supplier AND p.jobId = a.jobId
        ORDER BY a.supplier, a.jobId`, [])

    const DONE = ['jobcompleted', 'completed', 'closed', 'invoiced']
    const rows = r.recordset.map(x => {
      const done = DONE.includes(String(x.jobStatus || '').replace(/\s+/g, '').toLowerCase())
      const stage = x.invoiceNo ? 'Invoiced'
                  : x.poNumber  ? 'Invoice awaited'
                  : done        ? 'PO to issue'
                  :               'Accruing'
      return { ...x, jobDone: done, stage }
    })
    return jsonResponse(context, 200, rows)
  }

  // ── PUT: record the paperwork for a supplier on a job ────────────────────
  if (method === 'PUT') {
    if (!EDITORS.includes(user.Role))
      return jsonResponse(context, 403, { error: 'Only Admin, Billing, Finance or Cost Control can record POs and invoices' })
    const b = req.body || {}
    const supplier = String(b.supplierName || '').trim()
    const job = String(b.jobId || '').trim()
    if (!supplier || !job) return jsonResponse(context, 400, { error: 'Supplier and job are required' })
    const txt = k => (b[k] == null || String(b[k]).trim() === '' ? null : String(b[k]).trim())
    const dt  = k => (b[k] ? new Date(b[k]) : null)
    if (b.invoiceAmount != null && b.invoiceAmount !== '' && isNaN(Number(b.invoiceAmount)))
      return jsonResponse(context, 400, { error: 'Invoice amount must be a number' })

    await query(
      `MERGE tbl_SubContractPOs AS t
        USING (SELECT @sup AS supplierName, @job AS jobId) AS s
           ON t.supplierName = s.supplierName AND t.jobId = s.jobId
        WHEN MATCHED THEN UPDATE SET
             poNumber = @po, poDate = @pod, invoiceNo = @inv, invoiceDate = @ind,
             invoiceAmount = @amt, currency = @cur, notes = @notes,
             updatedBy = @by, updatedAt = GETDATE()
        WHEN NOT MATCHED THEN INSERT
             (supplierName, jobId, poNumber, poDate, invoiceNo, invoiceDate,
              invoiceAmount, currency, notes, updatedBy)
             VALUES (@sup, @job, @po, @pod, @inv, @ind, @amt, @cur, @notes, @by);`,
      [
        { name: 'sup',   type: sql.NVarChar, value: supplier },
        { name: 'job',   type: sql.NVarChar, value: job },
        { name: 'po',    type: sql.NVarChar, value: txt('poNumber') },
        { name: 'pod',   type: sql.Date,     value: dt('poDate') },
        { name: 'inv',   type: sql.NVarChar, value: txt('invoiceNo') },
        { name: 'ind',   type: sql.Date,     value: dt('invoiceDate') },
        { name: 'amt',   type: sql.Decimal(18, 2), value: b.invoiceAmount == null || b.invoiceAmount === '' ? null : Number(b.invoiceAmount) },
        { name: 'cur',   type: sql.NVarChar, value: txt('currency') },
        { name: 'notes', type: sql.NVarChar, value: txt('notes') },
        { name: 'by',    type: sql.NVarChar, value: user.Username || null },
      ])
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
})
