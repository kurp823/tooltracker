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
    const result = await query(
      // tbl_Invoices is empty (0 rows) — no invoice record has ever been
      // created in it. The real billing data lives on tbl_Jobs, which carries
      // the whole pipeline: SubmittedToBillingDate -> DraftInvoicedDate/
      // DraftInvoiceNumber -> SesSubmittedDate/SesNumber ->
      // FinalInvoicedDate/LegalInvoiceNumber, plus InvoiceAmount and
      // InvoiceDate. So the invoice list is derived from the jobs that have
      // billing activity, mirroring the original app's invoicing workflow.
      `SELECT
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
          j.PONumber AS PONumber
        FROM tbl_Jobs j
       WHERE j.InvoiceAmount > 0
          OR j.InvoiceDate             IS NOT NULL
          OR j.SubmittedToBillingDate  IS NOT NULL
          OR j.DraftInvoicedDate       IS NOT NULL
          OR j.SesSubmittedDate        IS NOT NULL
          OR j.FinalInvoicedDate       IS NOT NULL
          OR NULLIF(j.DraftInvoiceNumber, '') IS NOT NULL
          OR NULLIF(j.SesNumber, '')          IS NOT NULL
          OR NULLIF(j.LegalInvoiceNumber, '') IS NOT NULL
       ORDER BY COALESCE(j.InvoiceDate, j.CreatedDate) DESC`,
      []
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

    const yr = new Date().getFullYear()
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

    const r = await query(
      `INSERT INTO tbl_Invoices
         (invoiceNumber, jobNumber, clientCode, invoiceDate, currency, subtotal, vatAmount, totalAmount, status, notes, createdBy, createdAt)
       OUTPUT INSERTED.id
       VALUES (@num, @job, @client, @date, @currency, 0, 0, 0, 'Draft', @notes, @by, GETDATE())`,
      [
        { name: 'num',      value: InvoiceNumber           },
        { name: 'job',      value: b.JobID                 },
        { name: 'client',   value: b.ClientCode || null    },
        { name: 'date',     value: b.InvoiceDate || new Date().toISOString().split('T')[0] },
        { name: 'currency', value: b.Currency || 'USD'     },
        { name: 'notes',    value: b.Notes || null          },
        { name: 'by',       value: user.Username            },
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
          SET invoiceDate = @date, status = @status,
              currency = @currency, notes = @notes, updatedAt = GETDATE()
        WHERE id = @id`,
      [
        { name: 'id',       value: Number(id)          },
        { name: 'date',     value: b.InvoiceDate || null },
        { name: 'status',   value: b.Status || null     },
        { name: 'currency', value: b.Currency || null   },
        { name: 'notes',    value: b.Notes || null      },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
