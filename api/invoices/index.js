'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

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

module.exports = async function (context, req) {
  const user   = requireAuth(context, req)
  if (!user) return

  const id     = context.bindingData.id
  const sub    = context.bindingData.sub
  const subId  = context.bindingData.subId
  const method = req.method.toUpperCase()

  // ── /invoices/{id}/lines ─────────────────────────────────────────────────
  // `id` here is the invoice's numeric id — lines are keyed by invoiceNumber.
  if (id && sub === 'lines') {
    if (method === 'GET') {
      const result = await query(
        `SELECT l.id AS LineID, l.invoiceNumber AS InvoiceID, l.lineItemRef AS LineNumber,
                l.serial AS SerialNumber, NULL AS AssetNo, l.toolDescription AS ToolDescription,
                (ISNULL(l.standbyDays,0) + ISNULL(l.opsDays,0)) AS Quantity,
                COALESCE(l.opsRate, l.standbyRate) AS UnitRate,
                l.lineTotal AS LineAmount, l.remarks AS Notes
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
           (invoiceNumber, jobNumber, lineItemRef, serial, toolDescription, opsDays, opsRate, lineTotal, remarks)
         OUTPUT INSERTED.id
         VALUES (
           (SELECT invoiceNumber FROM tbl_Invoices WHERE id = @id),
           (SELECT jobNumber FROM tbl_Invoices WHERE id = @id),
           @ref, @serial, @desc, @qty, @rate, @amount, @notes
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

      // Recalculate TotalAmount
      await query(
        `UPDATE tbl_Invoices
            SET totalAmount = (SELECT COALESCE(SUM(lineTotal),0) FROM tbl_InvoiceLines WHERE invoiceNumber = tbl_Invoices.invoiceNumber)
          WHERE id = @id`,
        [{ name: 'id', value: Number(id) }]
      )

      return jsonResponse(context, 201, { LineID: r.recordset[0].id })
    }

    if (method === 'DELETE' && subId) {
      if (!['Admin','Billing','Finance'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })
      await query('DELETE FROM tbl_InvoiceLines WHERE id = @lid',
        [{ name: 'lid', value: Number(subId) }])
      await query(
        `UPDATE tbl_Invoices
            SET totalAmount = (SELECT COALESCE(SUM(lineTotal),0) FROM tbl_InvoiceLines WHERE invoiceNumber = tbl_Invoices.invoiceNumber)
          WHERE id = @id`,
        [{ name: 'id', value: Number(id) }]
      )
      return jsonResponse(context, 200, { ok: true })
    }
  }

  // ── GET list ─────────────────────────────────────────────────────────────
  if (!id && method === 'GET') {
    const jobQ = String((req.query || {}).job || '').trim()
    const jobFilter = jobQ ? `AND j.JobID = @jobQ` : ''
    const jobParam  = jobQ ? [{ name: 'jobQ', value: jobQ }] : []

    const result = await query(
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
          'monthly'             AS Source
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
          CASE
            WHEN j.FinalInvoicedDate IS NOT NULL
              OR NULLIF(j.LegalInvoiceNumber, '') IS NOT NULL THEN 'Final Invoiced'
            WHEN j.SesSubmittedDate IS NOT NULL
              OR NULLIF(j.SesNumber, '') IS NOT NULL          THEN 'Under SES'
            WHEN j.DraftInvoicedDate IS NOT NULL
              OR NULLIF(j.DraftInvoiceNumber, '') IS NOT NULL THEN 'Draft Invoiced'
            WHEN j.SubmittedToBillingDate IS NOT NULL         THEN 'In Billing'
            WHEN j.DocsSignedDate IS NOT NULL                 THEN 'Docs Signed'
            ELSE j.Status
          END AS Status,
          j.FiscalYear AS FiscalYear,
          j.CreatedDate AS CreatedDate,
          j.Client AS Client,
          j.Rig AS Rig,
          j.Well AS Well,
          j.Contract AS Contract,
          j.PONumber AS PONumber,
          NULL AS PeriodFrom,
          NULL AS PeriodTo,
          'job' AS Source
        FROM tbl_Jobs j
       WHERE (
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

       ORDER BY InvoiceDate DESC, InvoiceID DESC`,
      jobParam
    )
    return jsonResponse(context, 200, result.recordset)
  }

  // ── GET single ───────────────────────────────────────────────────────────
  if (id && !sub && method === 'GET') {
    const result = await query(
      `SELECT i.id AS InvoiceID, i.invoiceNumber AS InvoiceNumber, i.jobNumber AS JobID,
              i.invoiceDate AS InvoiceDate, NULL AS DueDate,
              i.currency AS Currency, i.subtotal AS Subtotal, i.vatPercent AS VatPercent,
              i.vatAmount AS VatAmount, i.totalAmount AS TotalAmount, i.status AS Status,
              YEAR(i.invoiceDate) AS FiscalYear, i.notes AS Notes,
              i.createdAt AS CreatedDate, i.createdBy AS CreatedBy,
              c.clientName AS Client
         FROM tbl_Invoices i
         LEFT JOIN tbl_Clients c ON i.clientCode = c.clientCode
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
    const lastRow = await query(
      `SELECT TOP 1 invoiceNumber FROM tbl_Invoices
        WHERE invoiceNumber LIKE 'INV-${yr}-%'
        ORDER BY invoiceNumber DESC`, []
    )
    let seq = 1
    if (lastRow.recordset.length) {
      const parts = lastRow.recordset[0].invoiceNumber.split('-')
      seq = parseInt(parts[parts.length - 1], 10) + 1
    }
    const InvoiceNumber = `INV-${yr}-${String(seq).padStart(5, '0')}`

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

    const r = await query(
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
    return jsonResponse(context, 201, { InvoiceID: r.recordset[0].id, InvoiceNumber })
  }

  // ── PUT update ───────────────────────────────────────────────────────────
  if (id && !sub && method === 'PUT') {
    if (!['Admin','Billing','Finance'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    await query(
      `UPDATE tbl_Invoices
          SET invoiceDate  = COALESCE(@date,     invoiceDate),
              status       = COALESCE(@status,   status),
              currency     = COALESCE(@currency, currency),
              poNumber     = COALESCE(@po,       poNumber),
              periodFrom   = COALESCE(@pf,       periodFrom),
              periodTo     = COALESCE(@pt,       periodTo),
              notes        = COALESCE(@notes,    notes),
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
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
