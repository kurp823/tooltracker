'use strict'
const { query, jsonResponse, requireAuth, safe, jobKey, jobKeyOf , withLock, nextNumber , listControls } = require('../db')
const { ensureBillingStatus, setBillingStatus } = require('../billing-status')

// Real tbl_Invoices columns (confirmed via INFORMATION_SCHEMA):
//   id, invoiceNumber, invoiceType, clientCode, contract, jobNumber, rig,
//   well, poNumber, invoiceDate, periodFrom, periodTo, currency, subtotal,
//   vatPercent, vatAmount, totalAmount, status, submittedDate, approvedDate,
//   paidDate, paidAmount, notes, attachmentRef, createdBy, createdAt,
//   updatedAt, legalInvoiceNumber, legalInvoiceDate, legalEnteredBy,
//   legalEnteredAt, lockStage, lockedAt, lockedBy, rowver
// Real tbl_InvoiceLines columns:
//   id, invoiceNumber, jobNumber, lineItemRef, serial, toolDescription,
//   standbyDays, opsDays, standbyRate, opsRate, standbyAmount, opsAmount,
//   redressAmount, otherAmount, otherDesc, lineTotal, remarks, rowver
// (No numeric InvoiceID/JobID FK to tbl_Jobs — jobNumber/clientCode are
// plain text. Lines are keyed by invoiceNumber, not a numeric InvoiceID,
// same pattern as Delivery/Receiving Tickets. No DueDate/FiscalYear
// columns — those come back null/derived. SQL aliases output back to the
// PascalCase names the frontend already expects.)

// Subtotal / VAT / total from the lines. One place, so adding, deleting and
// generating lines all leave the invoice header consistent (the old code only
// updated totalAmount and left subtotal and VAT at 0).
async function recalcTotals(invoiceId) {
  await query(
    `UPDATE tbl_Invoices
        SET subtotal    = x.sub,
            vatAmount   = ROUND(x.sub * ISNULL(vatPercent,0) / 100.0, 2),
            totalAmount = x.sub + ROUND(x.sub * ISNULL(vatPercent,0) / 100.0, 2),
            updatedAt   = GETDATE()
       FROM tbl_Invoices
       CROSS APPLY (SELECT COALESCE(SUM(lineTotal),0) AS sub
                      FROM tbl_InvoiceLines l
                     WHERE l.invoiceNumber = tbl_Invoices.invoiceNumber) x
      WHERE tbl_Invoices.id = @id`,
    [{ name: 'id', value: Number(invoiceId) }]
  )
}


/**
 * Replace an invoice's lines with lines built from the utilization grid.
 * Monthly: days inside periodFrom..periodTo. Job: every day of the job, and
 * the period is set to the first and last day marked so the invoice says
 * what it covers. Returns { lines, unpricedDays } or { error, code }.
 */
async function generateLines(inv) {
  const isJob = String(inv.invoiceType || '').toLowerCase() === 'job'
  if (!isJob && (!inv.periodFrom || !inv.periodTo))
    return { error: 'Set the invoice period (from / to) first', code: 400 }

  const g = await query(
    `SELECT d.ToolSerial, d.DTNumber,
            MAX(i.AssetNo)   AS AssetNo,
            MAX(i.ShortDesc) AS ShortDesc,
            MIN(d.LogDate)   AS FirstDay,
            MAX(d.LogDate)   AS LastDay,
            SUM(CASE WHEN d.StatusType = '1' THEN 1 ELSE 0 END) AS OpsDays,
            SUM(CASE WHEN d.StatusType = 'S' THEN 1 ELSE 0 END) AS StandbyDays,
            SUM(CASE WHEN d.StatusType = '1' THEN ISNULL(d.RateCharged,0) ELSE 0 END) AS OpsAmount,
            SUM(CASE WHEN d.StatusType = 'S' THEN ISNULL(d.RateCharged,0) ELSE 0 END) AS StandbyAmount,
            SUM(CASE WHEN d.RateCharged IS NULL THEN 1 ELSE 0 END) AS Unpriced
       FROM tbl_DailyFieldLogs d
       LEFT JOIN tbl_Inventory i ON i.SystemID = d.ToolSerial
      WHERE ${jobKey('d.JobID')} = @jk
        ${isJob ? '' : 'AND d.LogDate >= @pf AND d.LogDate < DATEADD(day, 1, @pt)'}
        AND d.StatusType IN ('1','S')
      GROUP BY d.ToolSerial, d.DTNumber
      ORDER BY MAX(i.ShortDesc), MAX(i.AssetNo)`,
    [
      { name: 'jk', value: jobKeyOf(inv.jobNumber) },
      ...(isJob ? [] : [{ name: 'pf', value: inv.periodFrom }, { name: 'pt', value: inv.periodTo }]),
    ]
  )
  if (!g.recordset.length)
    return { error: isJob ? 'No utilization days are marked for this job yet'
                          : 'No utilization days are marked for this job in the invoice period', code: 404 }

  await query('DELETE FROM tbl_InvoiceLines WHERE invoiceNumber = @n',
    [{ name: 'n', value: inv.invoiceNumber }])

  let unpriced = 0, n = 0, first = null, last = null
  for (const r of g.recordset) {
    n++
    const ops = Number(r.OpsDays), sb = Number(r.StandbyDays)
    const opsAmt = Number(r.OpsAmount), sbAmt = Number(r.StandbyAmount)
    unpriced += Number(r.Unpriced)
    if (!first || r.FirstDay < first) first = r.FirstDay
    if (!last  || r.LastDay  > last)  last  = r.LastDay
    await query(
      `INSERT INTO tbl_InvoiceLines
         (invoiceNumber, jobNumber, lineItemRef, serial, toolDescription,
          opsDays, standbyDays, opsRate, standbyRate, opsAmount, standbyAmount, lineTotal, remarks)
       VALUES (@n, @job, @ref, @serial, @desc, @od, @sd, @orate, @srate, @oamt, @samt, @tot, @rem)`,
      [
        { name: 'n',     value: inv.invoiceNumber },
        { name: 'job',   value: inv.jobNumber },
        { name: 'ref',   value: String(n) },
        { name: 'serial',value: r.AssetNo || r.ToolSerial },
        { name: 'desc',  value: r.ShortDesc || null },
        { name: 'od',    value: ops },
        { name: 'sd',    value: sb },
        { name: 'orate', value: ops ? Math.round(opsAmt / ops * 100) / 100 : null },
        { name: 'srate', value: sb  ? Math.round(sbAmt  / sb  * 100) / 100 : null },
        { name: 'oamt',  value: opsAmt },
        { name: 'samt',  value: sbAmt },
        { name: 'tot',   value: opsAmt + sbAmt },
        { name: 'rem',   value: [r.DTNumber, Number(r.Unpriced) ? `${r.Unpriced} day(s) have no rate` : null].filter(Boolean).join(' · ') || null },
      ]
    )
  }
  if (isJob && first && last) {
    await query(`UPDATE tbl_Invoices SET periodFrom = @pf, periodTo = @pt WHERE id = @id`,
      [{ name: 'pf', value: first }, { name: 'pt', value: last }, { name: 'id', value: Number(inv.id) }])
  }
  await recalcTotals(inv.id)
  return { lines: n, unpricedDays: unpriced }
}

module.exports = safe(async function (context, req) {
  const user   = requireAuth(context, req)
  if (!user) return

  const id     = context.bindingData.id
  const sub    = context.bindingData.sub
  const subId  = context.bindingData.subId
  const method = req.method.toUpperCase()

  // ── /invoices/profile ── company details printed on the tax invoice ─────
  // Key/value rows in tbl_AppSettings (created on first use). Anyone signed in
  // can read them; only Admin can change them.
  if (id === 'profile') {
    await query(`IF OBJECT_ID('tbl_AppSettings') IS NULL
                   CREATE TABLE tbl_AppSettings (settingKey NVARCHAR(100) PRIMARY KEY, settingValue NVARCHAR(1000) NULL, updatedAt DATETIME NULL, updatedBy NVARCHAR(100) NULL)`, [])
    if (method === 'GET') {
      const r = await query(`SELECT settingKey, settingValue FROM tbl_AppSettings WHERE settingKey LIKE 'invoice.%'`, [])
      const out = {}
      for (const x of r.recordset) out[x.settingKey.replace('invoice.', '')] = x.settingValue
      return jsonResponse(context, 200, out)
    }
    if (method === 'PUT') {
      if (user.Role !== 'Admin') return jsonResponse(context, 403, { error: 'Admin only' })
      const allowed = ['companyName','companyAddress','trn','bankName','bankBranch','accountName','accountNo','iban','swift','paymentTerms','icvPercent','vatPercent','aedRate','preparedBy','authorisedBy']
      for (const k of allowed) {
        if (req.body[k] === undefined) continue
        await query(`MERGE tbl_AppSettings AS t USING (SELECT @k AS k) s ON t.settingKey = s.k
                     WHEN MATCHED THEN UPDATE SET settingValue=@v, updatedAt=GETDATE(), updatedBy=@u
                     WHEN NOT MATCHED THEN INSERT (settingKey, settingValue, updatedAt, updatedBy) VALUES (@k,@v,GETDATE(),@u);`,
          [{ name: 'k', value: 'invoice.' + k }, { name: 'v', value: String(req.body[k] ?? '') }, { name: 'u', value: user.Username }])
      }
      return jsonResponse(context, 200, { ok: true })
    }
  }

  // ── /invoices/{id}/lines ─────────────────────────────────────────────────
  // `id` here is the invoice's numeric id — lines are keyed by invoiceNumber.
  if (id && sub === 'lines') {
    if (method === 'GET') {
      const result = await query(
        `SELECT l.id AS LineID, l.invoiceNumber AS InvoiceID, l.lineItemRef AS LineNumber,
                l.serial AS SerialNumber, NULL AS AssetNo, l.toolDescription AS ToolDescription,
                (ISNULL(l.standbyDays,0) + ISNULL(l.opsDays,0)) AS Quantity,
                COALESCE(l.opsRate, l.standbyRate) AS UnitRate,
                l.lineTotal AS LineAmount, l.remarks AS Notes,
                ISNULL(l.opsDays,0) AS OpsDays, ISNULL(l.standbyDays,0) AS StandbyDays,
                l.opsRate AS OpsRate, l.standbyRate AS StandbyRate,
                COALESCE(l.opsAmount, ISNULL(l.lineTotal,0) - ISNULL(l.standbyAmount,0)) AS OpsAmount, ISNULL(l.standbyAmount,0) AS StandbyAmount
           FROM tbl_InvoiceLines l
          WHERE l.invoiceNumber = (SELECT invoiceNumber FROM tbl_Invoices WHERE id = @id)
          ORDER BY l.id`,
        [{ name: 'id', value: Number(id) }]
      )
      return jsonResponse(context, 200, result.recordset)
    }

    if (method === 'POST') {
      if (!['Admin','Billing','Finance'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })

      const b = req.body
      const r = await query(
        `INSERT INTO tbl_InvoiceLines
           (invoiceNumber, jobNumber, lineItemRef, serial, toolDescription, opsDays, opsRate, lineTotal, opsAmount, remarks)
         OUTPUT INSERTED.id
         VALUES (
           (SELECT invoiceNumber FROM tbl_Invoices WHERE id = @id),
           (SELECT jobNumber FROM tbl_Invoices WHERE id = @id),
           @ref, @serial, @desc, @qty, @rate, @amount, @amount, @notes
         )`,
        [
          { name: 'id',     value: Number(id)            },
          { name: 'ref',    value: b.ItemCode || null     },
          { name: 'serial', value: b.SerialNumber || null },
          { name: 'desc',   value: b.ToolDescription || null },
          { name: 'qty',    value: b.Quantity || 1          },
          { name: 'rate',   value: b.UnitRate || null        },
          { name: 'amount', value: b.LineAmount || null       },
          { name: 'notes',  value: b.Notes || null            },
        ]
      )

      await recalcTotals(id)

      return jsonResponse(context, 201, { LineID: r.recordset[0].id })
    }

    if (method === 'DELETE' && subId) {
      if (!['Admin','Billing','Finance'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })
      await query('DELETE FROM tbl_InvoiceLines WHERE id = @lid',
        [{ name: 'lid', value: Number(subId) }])
      await recalcTotals(id)
      return jsonResponse(context, 200, { ok: true })
    }
  }

  // ── POST /invoices/{id}/generate ─────────────────────────────────────────
  // Builds the invoice lines from the days actually marked on the utilization
  // grid for this job: one line per tool per delivery ticket, operating and
  // standby days priced at the rate stamped on each day. A Monthly invoice
  // takes the days inside its period; a Job invoice takes every day of the
  // job. Replaces the lines of a Draft invoice. Days with no rate are counted
  // and reported, never silently billed at zero.
  if (id && sub === 'generate' && method === 'POST') {
    if (!['Admin','Billing','Finance'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const h = await query(
      `SELECT id, invoiceNumber, invoiceType, jobNumber, periodFrom, periodTo, status
         FROM tbl_Invoices WHERE id = @id`, [{ name: 'id', value: Number(id) }])
    const inv = h.recordset[0]
    if (!inv) return jsonResponse(context, 404, { error: 'Not found' })
    if (String(inv.status || '').toLowerCase() !== 'draft')
      return jsonResponse(context, 409, { error: 'Lines can only be generated on a Draft invoice' })
    const out = await generateLines(inv)
    if (out.error) return jsonResponse(context, out.code || 400, { error: out.error })
    return jsonResponse(context, 200, { lines: out.lines, unpricedDays: out.unpricedDays })
  }

  // ── POST /invoices/from-job — the per-job invoice ───────────────────────
  // Decision 2 (17 Nov 2026): a job billed once is invoiced from the app the
  // same way a monthly job is — every marked day, priced from the contract,
  // with VAT — one invoice for the whole job. A job that already carries a
  // legal invoice number was billed before this existed and is frozen: it is
  // never generated for. One Job invoice per job.
  if (id === 'from-job' && method === 'POST') {
    if (!['Admin','Billing','Finance'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })
    const b = req.body || {}
    if (!b.JobID) return jsonResponse(context, 400, { error: 'JobID required' })

    const jr = await query(
      `SELECT JobID, Client, Contract, Rig, Well, PONumber, Currency, LegalInvoiceNumber, InvoicingType
         FROM tbl_Jobs WHERE ${jobKey('JobID')} = @jk`, [{ name: 'jk', value: jobKeyOf(b.JobID) }])
    if (jr.recordset.length !== 1) return jsonResponse(context, 404, { error: 'Job not found' })
    const job = jr.recordset[0]
    if (String(job.LegalInvoiceNumber || '').trim())
      return jsonResponse(context, 409, { error: `${job.JobID} already has legal invoice ${job.LegalInvoiceNumber.trim()} — its figures are final` })

    const ex = await query(
      `SELECT TOP 1 id, invoiceNumber FROM tbl_Invoices
        WHERE ${jobKey('jobNumber')} = @jk AND invoiceType = 'Job' ORDER BY id DESC`,
      [{ name: 'jk', value: jobKeyOf(job.JobID) }])
    if (ex.recordset.length)
      return jsonResponse(context, 409, { error: `${ex.recordset[0].invoiceNumber} already exists for ${job.JobID}`,
                                          InvoiceID: ex.recordset[0].id, InvoiceNumber: ex.recordset[0].invoiceNumber })

    const yr = new Date().getFullYear()
    const { newId, InvoiceNumber } = await withLock('invoice-number', async (tq) => {
      const InvoiceNumber = await nextNumber(tq, 'tbl_Invoices', 'invoiceNumber', `INV-${yr}-`, 5)
      const r = await tq(
        `INSERT INTO tbl_Invoices
           (invoiceNumber, invoiceType, jobNumber, clientCode, contract, rig, well,
            poNumber, invoiceDate, currency, subtotal, vatAmount, totalAmount, status, notes, createdBy, createdAt)
         OUTPUT INSERTED.id
         VALUES (@num, 'Job', @job, @client, @contract, @rig, @well, @po, @date, @cur, 0, 0, 0, 'Draft', @notes, @by, GETDATE())`,
        [
          { name: 'num',      value: InvoiceNumber },
          { name: 'job',      value: job.JobID },
          { name: 'client',   value: job.Client || '' },
          { name: 'contract', value: job.Contract || null },
          { name: 'rig',      value: job.Rig || null },
          { name: 'well',     value: job.Well || null },
          { name: 'po',       value: b.PONumber || job.PONumber || null },
          { name: 'date',     value: b.InvoiceDate || new Date().toISOString().split('T')[0] },
          { name: 'cur',      value: b.Currency || job.Currency || 'USD' },
          { name: 'notes',    value: b.Notes || null },
          { name: 'by',       value: user.Username },
        ])
      return { newId: r.recordset[0].id, InvoiceNumber }
    })

    const gen = await generateLines({ id: newId, invoiceNumber: InvoiceNumber, invoiceType: 'Job', jobNumber: job.JobID })
    // Draft milestone on the job comes from this invoice.
    await query(
      `UPDATE tbl_Jobs
          SET DraftInvoiceNumber = @n,
              DraftInvoicedDate  = COALESCE(DraftInvoicedDate, GETDATE()),
              UpdatedAt = GETDATE()
        WHERE JobID = @j`, [{ name: 'n', value: InvoiceNumber }, { name: 'j', value: job.JobID }])
    await setBillingStatus(job.JobID, 'Draft Invoiced', user.Username)

    return jsonResponse(context, 201, {
      InvoiceID: newId, InvoiceNumber,
      lines: gen.lines || 0, unpricedDays: gen.unpricedDays || 0,
      warning: gen.error || undefined,
    })
  }

  // ── GET list ─────────────────────────────────────────────────────────────
  if (!id && method === 'GET') {
    await ensureBillingStatus()
    const jobQ = String((req.query || {}).job || '').trim()
    const jobFilter = jobQ ? `AND j.JobID = @jobQ` : ''
    const jobParam  = jobQ ? [{ name: 'jobQ', value: jobQ }] : []
    // ?top= / ?search= over the combined register (bug 33: 1.5 MB per load).
    const lc = listControls(req.query, ['u.InvoiceNumber', 'u.JobID', 'u.Client', 'u.Rig', 'u.Well', 'u.Contract', 'u.PONumber'])
    const outer = `SELECT ${lc.topSql} u.* FROM (`
    const outerEnd = `) u ${lc.searchSql ? 'WHERE ' + lc.searchSql : ''} ORDER BY u.InvoiceDate DESC, u.InvoiceID DESC`

    const result = await query(
      outer +
      // Two billing worlds live side-by-side.
      //
      // LEGACY (per-job billing): The original app stored invoice milestones
      // on tbl_Jobs: Draft/Final invoice numbers, SES numbers, dates and
      // amounts. 3,666 jobs carry this data. We derive one invoice row per
      // job from that history.
      //
      // NEW MONTHLY BILLING: New invoices are created via POST and land in
      // tbl_Invoices with a proper invoice number, periodFrom/periodTo and
      // a PO number. Monthly jobs can have multiple invoices, one per period.
      //
      // Both are shown in the same register, with monthly invoices listed
      // first because they are newer. A 'Source' column lets the UI
      // distinguish them for the detail view.
      `-- New monthly invoices from tbl_Invoices
       SELECT
          CAST(i.id AS VARCHAR) AS InvoiceID,
          i.invoiceNumber       AS InvoiceNumber,
          i.jobNumber           AS JobID,
          i.invoiceDate         AS InvoiceDate,
          NULL                  AS DueDate,
          i.currency            AS Currency,
          i.totalAmount         AS TotalAmount,
          NULL                  AS NetAmount,
          i.status              AS Status,
          YEAR(i.invoiceDate)   AS FiscalYear,
          i.createdAt           AS CreatedDate,
          COALESCE(c.clientName, NULLIF(i.clientCode,'')) AS Client,
          i.rig                 AS Rig,
          i.well                AS Well,
          i.contract            AS Contract,
          i.poNumber            AS PONumber,
          i.periodFrom          AS PeriodFrom,
          i.periodTo            AS PeriodTo,
          'monthly'             AS Source,
          COALESCE(NULLIF(i.invoiceType,''),'Monthly') AS InvoiceType,
          i.legalInvoiceNumber  AS LegalInvoiceNumber,
          i.legalInvoiceDate    AS LegalInvoiceDate
       FROM tbl_Invoices i
       LEFT JOIN tbl_Clients c ON i.clientCode = c.clientCode
       ${jobQ ? 'WHERE i.jobNumber = @jobQ' : ''}

       UNION ALL

       -- Legacy per-job billing derived from tbl_Jobs pipeline columns
       SELECT
          j.JobID AS InvoiceID,
          COALESCE(
            NULLIF(j.LegalInvoiceNumber, ''),
            NULLIF(j.DraftInvoiceNumber, ''),
            NULLIF(j.SesNumber, '')
          ) AS InvoiceNumber,
          j.JobID AS JobID,
          COALESCE(j.InvoiceDate, j.FinalInvoicedDate, j.DraftInvoicedDate) AS InvoiceDate,
          NULL AS DueDate,
          j.Currency AS Currency,
          j.InvoiceAmount AS TotalAmount,
          j.NetInvoiceAmount AS NetAmount,
          COALESCE(NULLIF(j.BillingStatus, ''),
            CASE
              WHEN j.FinalInvoicedDate IS NOT NULL
                OR NULLIF(j.LegalInvoiceNumber, '') IS NOT NULL THEN 'Final Invoiced'
              WHEN j.SesSubmittedDate IS NOT NULL
                OR NULLIF(j.SesNumber, '') IS NOT NULL          THEN 'SES Submitted'
              WHEN j.DraftInvoicedDate IS NOT NULL
                OR NULLIF(j.DraftInvoiceNumber, '') IS NOT NULL THEN 'Draft Invoiced'
              WHEN j.SubmittedToBillingDate IS NOT NULL         THEN 'In Billing'
              WHEN j.DocsSignedDate IS NOT NULL                 THEN 'In Billing'
            END) AS Status,
          j.FiscalYear AS FiscalYear,
          j.CreatedDate AS CreatedDate,
          j.Client AS Client,
          j.Rig AS Rig,
          j.Well AS Well,
          j.Contract AS Contract,
          j.PONumber AS PONumber,
          NULL AS PeriodFrom,
          NULL AS PeriodTo,
          'job' AS Source,
          'Legacy' AS InvoiceType,
          j.LegalInvoiceNumber AS LegalInvoiceNumber,
          j.FinalInvoicedDate  AS LegalInvoiceDate
        FROM tbl_Jobs j
       WHERE NOT EXISTS (SELECT 1 FROM tbl_Invoices x WHERE x.invoiceType = 'Job' AND x.jobNumber = j.JobID)
         AND (
           j.InvoiceAmount > 0
          OR j.InvoiceDate             IS NOT NULL
          OR j.SubmittedToBillingDate  IS NOT NULL
          OR j.DraftInvoicedDate       IS NOT NULL
          OR j.SesSubmittedDate        IS NOT NULL
          OR j.FinalInvoicedDate       IS NOT NULL
          OR NULLIF(j.DraftInvoiceNumber, '') IS NOT NULL
          OR NULLIF(j.SesNumber, '')          IS NOT NULL
          OR NULLIF(j.LegalInvoiceNumber, '') IS NOT NULL
       )
       ${jobQ ? 'AND j.JobID = @jobQ' : ''}
      ` + outerEnd,
      [...jobParam, ...lc.params]
    )
    return jsonResponse(context, 200, result.recordset)
  }

  // ── GET single ───────────────────────────────────────────────────────────
  if (id && !sub && method === 'GET') {
    const result = await query(
      `SELECT i.id AS InvoiceID, i.invoiceNumber AS InvoiceNumber, i.jobNumber AS JobID,
              COALESCE(NULLIF(i.invoiceType,''),'Monthly') AS InvoiceType,
              i.invoiceDate AS InvoiceDate, NULL AS DueDate,
              i.currency AS Currency, i.subtotal AS Subtotal, i.vatPercent AS VatPercent,
              i.vatAmount AS VatAmount, i.totalAmount AS TotalAmount, i.status AS Status,
              YEAR(i.invoiceDate) AS FiscalYear, i.notes AS Notes,
              i.createdAt AS CreatedDate, i.createdBy AS CreatedBy,
              i.legalInvoiceNumber AS LegalInvoiceNumber, i.legalInvoiceDate AS LegalInvoiceDate,
              COALESCE(c.clientName, NULLIF(i.clientCode,''), j.Client) AS Client
         FROM tbl_Invoices i
         LEFT JOIN tbl_Clients c ON i.clientCode = c.clientCode
         LEFT JOIN tbl_Jobs j ON j.JobID = i.jobNumber
        WHERE i.id = @id`,
      [{ name: 'id', value: Number(id) }]
    )
    if (!result.recordset.length) return jsonResponse(context, 404, { error: 'Not found' })
    return jsonResponse(context, 200, result.recordset[0])
  }

  // ── POST create ──────────────────────────────────────────────────────────
  if (!id && method === 'POST') {
    if (!['Admin','Billing','Finance'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    if (!b.JobID) return jsonResponse(context, 400, { error: 'JobID required' })

    // Carry over contract, client, rig, well from the job.
    const jobRow = await query(
      `SELECT TOP 1 Client, Contract, Rig, Well, PONumber, Currency
         FROM tbl_Jobs WHERE JobID = @jid`,
      [{ name: 'jid', value: b.JobID }]
    )
    const job    = jobRow.recordset[0] || {}
    const yr     = new Date().getFullYear()

    // Block duplicate period: one invoice per job per billing period.
    // An empty periodFrom means a one-off invoice, not subject to this check.
    if (b.PeriodFrom) {
      const dup = await query(
        `SELECT TOP 1 invoiceNumber FROM tbl_Invoices
          WHERE jobNumber   = @job
            AND periodFrom  = @pf
            AND periodTo    = @pt`,
        [
          { name: 'job', value: b.JobID },
          { name: 'pf',  value: b.PeriodFrom },
          { name: 'pt',  value: b.PeriodTo || b.PeriodFrom },
        ]
      )
      if (dup.recordset.length) {
        return jsonResponse(context, 409, {
          error: `Invoice ${dup.recordset[0].invoiceNumber} already covers this period for job ${b.JobID}`,
        })
      }
    }

    // Number and insert under one lock, so two people saving in the same
    // second cannot both be given INV-yyyy-nnnnn (bug 25).
    const { newId, InvoiceNumber } = await withLock('invoice-number', async (tq) => {
      const InvoiceNumber = await nextNumber(tq, 'tbl_Invoices', 'invoiceNumber', `INV-${yr}-`, 5)
      const r = await tq(
      `INSERT INTO tbl_Invoices
         (invoiceNumber, invoiceType, jobNumber, clientCode, contract, rig, well,
          poNumber, invoiceDate, periodFrom, periodTo,
          currency, subtotal, vatAmount, totalAmount, status, notes, createdBy, createdAt)
       OUTPUT INSERTED.id
       SELECT
         @num, 'Monthly', @job,
         COALESCE(@client, j.Client, ''),
         COALESCE(@contract, j.Contract),
         COALESCE(@rig, j.Rig),
         COALESCE(@well, j.Well),
         COALESCE(@po, j.PONumber),
         @date, @pf, @pt,
         COALESCE(@currency, j.Currency, 'USD'),
         0, 0, 0, 'Draft', @notes, @by, GETDATE()
       FROM (SELECT 1 AS one) seed
       LEFT JOIN tbl_Jobs j ON j.JobID = @job`,
      [
        { name: 'num',      value: InvoiceNumber                  },
        { name: 'job',      value: b.JobID                        },
        { name: 'client',   value: b.ClientCode || null           },
        { name: 'contract', value: b.Contract   || null           },
        { name: 'rig',      value: b.Rig        || null           },
        { name: 'well',     value: b.Well       || null           },
        { name: 'po',       value: b.PONumber   || null           },
        { name: 'date',     value: b.InvoiceDate || new Date().toISOString().split('T')[0] },
        { name: 'pf',       value: b.PeriodFrom  || null          },
        { name: 'pt',       value: b.PeriodTo    || null          },
        { name: 'currency', value: b.Currency || job.Currency || 'USD' },
        { name: 'notes',    value: b.Notes || null                },
        { name: 'by',       value: user.Username                  },
      ]
      )
      return { newId: r.recordset[0].id, InvoiceNumber }
    })
    return jsonResponse(context, 201, { InvoiceID: newId, InvoiceNumber })
  }

  // ── PUT update ───────────────────────────────────────────────────────────
  if (id && !sub && method === 'PUT') {
    if (!['Admin','Billing','Finance'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body

    // A job-derived row (id is a Job number): only its billing status can be set,
    // and not once the job carries a legal invoice number - it is finally invoiced.
    if (!/^\d+$/.test(String(id))) {
      const st = String(b.Status || '').trim()
      if (!st) return jsonResponse(context, 400, { error: 'Status required' })
      const lj = await query(`SELECT LegalInvoiceNumber FROM tbl_Jobs WHERE JobID = @j`, [{ name: 'j', value: String(id) }])
      if (String(lj.recordset[0]?.LegalInvoiceNumber || '').trim())
        return jsonResponse(context, 409, { error: `${id} is finally invoiced (legal invoice ${lj.recordset[0].LegalInvoiceNumber.trim()}); its status cannot change` })
      await setBillingStatus(String(id), st, user.Username)
      return jsonResponse(context, 200, { ok: true })
    }

    const legalNo = b.LegalInvoiceNumber === undefined ? null : String(b.LegalInvoiceNumber || '').trim()
    // An app invoice that already carries a legal number is final: no further edits.
    const cur0 = await query(`SELECT legalInvoiceNumber FROM tbl_Invoices WHERE id = @id`, [{ name: 'id', value: Number(id) }])
    if (!cur0.recordset.length) return jsonResponse(context, 404, { error: `Invoice ${id} not found` })
    if (String(cur0.recordset[0].legalInvoiceNumber || '').trim() && user.Role !== 'Admin')
      return jsonResponse(context, 409, { error: `Legal invoice ${cur0.recordset[0].legalInvoiceNumber.trim()} is recorded; this invoice is final` })
    const upd = await query(
      `UPDATE tbl_Invoices
          SET invoiceDate  = COALESCE(@date,     invoiceDate),
              status       = COALESCE(@status,   status),
              currency     = COALESCE(@currency, currency),
              poNumber     = COALESCE(@po,       poNumber),
              periodFrom   = COALESCE(@pf,       periodFrom),
              periodTo     = COALESCE(@pt,       periodTo),
              notes        = COALESCE(@notes,    notes),
              legalInvoiceNumber = CASE WHEN @legal IS NULL THEN legalInvoiceNumber ELSE NULLIF(@legal,'') END,
              legalInvoiceDate   = CASE WHEN @legal IS NULL THEN legalInvoiceDate
                                        WHEN NULLIF(@legal,'') IS NULL THEN NULL
                                        ELSE COALESCE(@legaldate, legalInvoiceDate, CAST(GETDATE() AS date)) END,
              legalEnteredBy     = CASE WHEN NULLIF(@legal,'') IS NULL THEN legalEnteredBy ELSE @by END,
              legalEnteredAt     = CASE WHEN NULLIF(@legal,'') IS NULL THEN legalEnteredAt ELSE GETDATE() END,
              updatedAt    = GETDATE()
        WHERE id = @id`,
      [
        { name: 'id',       value: Number(id)          },
        { name: 'date',     value: b.InvoiceDate || null },
        { name: 'status',   value: b.Status     || null  },
        { name: 'currency', value: b.Currency   || null  },
        { name: 'po',       value: b.PONumber   || null  },
        { name: 'pf',       value: b.PeriodFrom || null  },
        { name: 'pt',       value: b.PeriodTo   || null  },
        { name: 'notes',    value: b.Notes      || null  },
        { name: 'legal',    value: legalNo },
        { name: 'legaldate',value: b.LegalInvoiceDate || null },
        { name: 'by',       value: user.Username },
      ]
    )
    if (!upd.rowsAffected[0]) return jsonResponse(context, 404, { error: `Invoice ${id} not found` })

    // A legal number on a Job invoice is the job's final invoice: the job's
    // milestone fields take their figures from the invoice from here on.
    if (legalNo) {
      const cur = await query(
        `SELECT invoiceType, jobNumber, totalAmount, subtotal, legalInvoiceDate FROM tbl_Invoices WHERE id = @id`,
        [{ name: 'id', value: Number(id) }])
      const x = cur.recordset[0]
      if (x && String(x.invoiceType || '').toLowerCase() === 'job' && x.jobNumber) {
        await query(
          `UPDATE tbl_Jobs
              SET LegalInvoiceNumber = @n,
                  FinalInvoicedDate  = COALESCE(@d, FinalInvoicedDate, GETDATE()),
                  InvoiceDate        = COALESCE(@d, InvoiceDate, GETDATE()),
                  InvoiceAmount      = @amt,
                  NetInvoiceAmount   = @net,
                  UpdatedAt = GETDATE()
            WHERE JobID = @j`,
          [{ name: 'n', value: legalNo }, { name: 'd', value: x.legalInvoiceDate || null },
           { name: 'amt', value: x.totalAmount }, { name: 'net', value: x.subtotal }, { name: 'j', value: x.jobNumber }])
        await setBillingStatus(x.jobNumber, 'Final Invoiced', user.Username)
      }
    }
    // The job carries the latest billing status, which Drilling Jobs shows.
    if (b.Status) {
      const j = await query(`SELECT jobNumber FROM tbl_Invoices WHERE id = @id`, [{ name: 'id', value: Number(id) }])
      if (j.recordset[0]?.jobNumber)
        await setBillingStatus(j.recordset[0].jobNumber, String(b.Status).trim(), user.Username)
    }
    return jsonResponse(context, 200, { ok: true })
  }

  // ── DELETE: TEST invoices only (Admin) ───────────────────────────────────
  if (id && !sub && method === 'DELETE') {
    if (user.Role !== 'Admin') return jsonResponse(context, 403, { error: 'Forbidden' })
    const r = await query(`SELECT invoiceNumber, notes FROM tbl_Invoices WHERE id = @id`, [{ name: 'id', value: Number(id) }])
    if (!r.recordset.length) return jsonResponse(context, 404, { error: 'Not found' })
    if (!/TEST/i.test(r.recordset[0].notes || ''))
      return jsonResponse(context, 403, { error: 'Only TEST invoices (notes contain TEST) can be deleted' })
    await query(`DELETE FROM tbl_InvoiceLines WHERE invoiceNumber = @n`, [{ name: 'n', value: r.recordset[0].invoiceNumber }])
    await query(`DELETE FROM tbl_Invoices WHERE id = @id`, [{ name: 'id', value: Number(id) }])
    return jsonResponse(context, 200, { deleted: r.recordset[0].invoiceNumber })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
})
