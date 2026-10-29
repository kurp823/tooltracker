'use strict'
const { sql, query, jsonResponse, requireAuth } = require('../db')
const { refreshStatus } = require('../po-status')

/**
 * Purchase orders — the Epicor mirror, and receiving against it.
 *
 *   GET    /api/purchase-orders            list, with received and invoice state
 *   GET    /api/purchase-orders/summary    the counts the register reports on
 *   GET    /api/purchase-orders/{id}       one PO with its lines
 *   POST   /api/purchase-orders            create
 *   PUT    /api/purchase-orders/{id}       edit the header, incl. supplier invoice
 *   DELETE /api/purchase-orders/{id}       delete, only while nothing is received
 *
 *   POST   /api/purchase-orders/{id}/lines           add a line
 *   POST   /api/purchase-orders/{id}/lines/paste     paste several at once
 *   PUT    /api/purchase-orders/{id}/lines/{lineId}  edit a line
 *   DELETE /api/purchase-orders/{id}/lines/{lineId}  remove a line
 *
 * Epicor stays the master. This copy exists for the tracking Epicor does
 * not surface here: which POs are still to issue, which belong to a job —
 * the job sits on the LINE, since one PO can cover several — and which
 * supplier invoices have arrived. A null invoiceNumber is what 'pending'
 * means, so no extra flag can disagree with it.
 */

const EDITORS = ['Admin', 'Operations', 'Finance']

/**
 * Received quantity per line, summed across every GRN. Receiving is
 * cumulative — order 10, take 6 then 4 — so this is a sum rather than a
 * stored figure that a second delivery would have to remember to update.
 */
const RECEIVED_SUBQUERY = `
  COALESCE((SELECT SUM(g.qtyReceived)
              FROM tbl_GoodsReceiptLines g
             WHERE g.poLineId = l.id), 0)`

async function headerById (id) {
  const r = await query(`SELECT * FROM tbl_PurchaseOrders WHERE id = @id`,
    [{ name: 'id', type: sql.Int, value: Number(id) }])
  return r.recordset[0] || null
}

const numOrNull = (v) => (v == null || v === '' ? null : Number(v))

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const method = req.method.toUpperCase()
  const id     = context.bindingData.id
  const sub    = context.bindingData.sub
  const subId  = context.bindingData.subId
  const qs     = req.query || {}

  try {
    // ── GET summary ────────────────────────────────────────────────────────
    // The three questions this register exists to answer.
    if (method === 'GET' && id === 'summary') {
      const r = await query(`
        SELECT
          (SELECT COUNT(*) FROM tbl_PurchaseOrders
            WHERE status = 'Pending Issue')                       AS pendingIssue,
          (SELECT COUNT(*) FROM tbl_PurchaseOrders
            WHERE status IN ('Issued','Part Received'))           AS openOrders,
          (SELECT COUNT(*) FROM tbl_PurchaseOrders
            WHERE status NOT IN ('Cancelled')
              AND (invoiceNumber IS NULL
                   OR LTRIM(RTRIM(invoiceNumber)) = ''))          AS invoicePending,
          (SELECT COUNT(*) FROM tbl_PurchaseOrders
            WHERE invoiceNumber IS NOT NULL
              AND LTRIM(RTRIM(invoiceNumber)) <> '')              AS invoiceReceived,
          (SELECT COUNT(*) FROM tbl_PurchaseOrders)               AS total,
          (SELECT COALESCE(SUM(poValue), 0) FROM tbl_PurchaseOrders
            WHERE status NOT IN ('Cancelled','Closed'))           AS openValue`, [])

      // Committed spend per job comes off the LINES, because that is where
      // the job is.
      const byJob = await query(`
        SELECT TOP 50 l.jobId,
               COUNT(*)                       AS lines_,
               COALESCE(SUM(l.lineAmount), 0) AS amount
          FROM tbl_PurchaseOrderLines l
          JOIN tbl_PurchaseOrders p ON p.poNumber = l.poNumber
         WHERE l.jobId IS NOT NULL AND LTRIM(RTRIM(l.jobId)) <> ''
           AND p.status NOT IN ('Cancelled')
         GROUP BY l.jobId
         ORDER BY SUM(l.lineAmount) DESC`, [])

      return jsonResponse(context, 200, {
        ...r.recordset[0],
        byJob: byJob.recordset,
      })
    }

    // ── GET list ───────────────────────────────────────────────────────────
    if (method === 'GET' && !id) {
      const search = (qs.search || '').trim()
      const status = (qs.status || '').trim()
      const r = await query(
        `SELECT TOP 500 p.*,
                (SELECT COUNT(*) FROM tbl_PurchaseOrderLines l
                  WHERE l.poNumber = p.poNumber) AS lineCount,
                (SELECT COUNT(*) FROM tbl_PurchaseOrderLines l
                  WHERE l.poNumber = p.poNumber
                    AND ${RECEIVED_SUBQUERY} >= l.qty) AS linesReceived
           FROM tbl_PurchaseOrders p
          WHERE (@q IS NULL
                 OR p.poNumber LIKE @q OR p.supplierName LIKE @q
                 OR p.invoiceNumber LIKE @q)
            AND (@s IS NULL OR p.status = @s)
          ORDER BY p.poDate DESC, p.id DESC`,
        [
          { name: 'q', type: sql.NVarChar, value: search ? `%${search}%` : null },
          { name: 's', type: sql.NVarChar, value: status || null },
        ]
      )
      return jsonResponse(context, 200, r.recordset)
    }

    // ── GET one with lines ─────────────────────────────────────────────────
    if (method === 'GET' && id && !sub) {
      const head = await headerById(id)
      if (!head) return jsonResponse(context, 404, { error: 'Purchase order not found' })

      const lines = await query(
        `SELECT l.*, ${RECEIVED_SUBQUERY} AS qtyReceived
           FROM tbl_PurchaseOrderLines l
          WHERE l.poNumber = @po
          ORDER BY l.lineNo`,
        [{ name: 'po', type: sql.NVarChar, value: head.poNumber }]
      )
      return jsonResponse(context, 200, { ...head, lines: lines.recordset })
    }

    // ── POST create ────────────────────────────────────────────────────────
    if (method === 'POST' && !id) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const b = req.body || {}
      const poNumber = String(b.poNumber || '').trim()
      if (!poNumber)
        return jsonResponse(context, 400, { error: 'The Epicor PO number is required' })

      const dup = await query(
        `SELECT id FROM tbl_PurchaseOrders WHERE poNumber = @po`,
        [{ name: 'po', type: sql.NVarChar, value: poNumber }]
      )
      if (dup.recordset.length)
        return jsonResponse(context, 409, { error: `${poNumber} is already in the register` })

      const r = await query(
        `INSERT INTO tbl_PurchaseOrders
           (poNumber, supplierName, poDate, currency, poValue, status, notes, createdBy)
         OUTPUT INSERTED.id
         VALUES (@po, @sup, @date, @cur, @val, @status, @notes, @by)`,
        [
          { name: 'po',     type: sql.NVarChar, value: poNumber },
          { name: 'sup',    type: sql.NVarChar, value: b.supplierName || null },
          { name: 'date',   type: sql.Date,     value: b.poDate ? new Date(b.poDate) : null },
          { name: 'cur',    type: sql.NVarChar, value: b.currency || null },
          { name: 'val',    type: sql.Decimal(18, 2), value: numOrNull(b.poValue) },
          { name: 'status', type: sql.NVarChar, value: b.status || 'Pending Issue' },
          { name: 'notes',  type: sql.NVarChar, value: b.notes || null },
          { name: 'by',     type: sql.NVarChar, value: user.Username || null },
        ]
      )
      return jsonResponse(context, 201, { id: r.recordset[0].id, poNumber })
    }

    // ── PUT header ─────────────────────────────────────────────────────────
    if (method === 'PUT' && id && !sub) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const b = req.body || {}
      await query(
        `UPDATE tbl_PurchaseOrders
            SET supplierName  = @sup,  poDate        = @date,
                currency      = @cur,  poValue       = @val,
                status        = @status,
                invoiceNumber = @inv,  invoiceDate   = @invdate,
                invoiceAmount = @invamt,
                notes         = @notes, updatedAt    = GETDATE()
          WHERE id = @id`,
        [
          { name: 'id',      type: sql.Int,      value: Number(id) },
          { name: 'sup',     type: sql.NVarChar, value: b.supplierName || null },
          { name: 'date',    type: sql.Date,     value: b.poDate ? new Date(b.poDate) : null },
          { name: 'cur',     type: sql.NVarChar, value: b.currency || null },
          { name: 'val',     type: sql.Decimal(18, 2), value: numOrNull(b.poValue) },
          { name: 'status',  type: sql.NVarChar, value: b.status || 'Pending Issue' },
          { name: 'inv',     type: sql.NVarChar, value: b.invoiceNumber || null },
          { name: 'invdate', type: sql.Date,     value: b.invoiceDate ? new Date(b.invoiceDate) : null },
          { name: 'invamt',  type: sql.Decimal(18, 2), value: numOrNull(b.invoiceAmount) },
          { name: 'notes',   type: sql.NVarChar, value: b.notes || null },
        ]
      )
      return jsonResponse(context, 200, { ok: true })
    }

    // ── DELETE ─────────────────────────────────────────────────────────────
    if (method === 'DELETE' && id && !sub) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const head = await headerById(id)
      if (!head) return jsonResponse(context, 404, { error: 'Purchase order not found' })

      const got = await query(
        `SELECT COUNT(*) AS n
           FROM tbl_GoodsReceiptLines g
           JOIN tbl_PurchaseOrderLines l ON l.id = g.poLineId
          WHERE l.poNumber = @po`,
        [{ name: 'po', type: sql.NVarChar, value: head.poNumber }]
      )
      if (got.recordset[0].n > 0)
        return jsonResponse(context, 409, {
          error: `${head.poNumber} has goods received against it and cannot be deleted.`,
        })

      await query(`DELETE FROM tbl_PurchaseOrderLines WHERE poNumber = @po`,
        [{ name: 'po', type: sql.NVarChar, value: head.poNumber }])
      await query(`DELETE FROM tbl_PurchaseOrders WHERE id = @id`,
        [{ name: 'id', type: sql.Int, value: Number(id) }])
      return jsonResponse(context, 200, { ok: true })
    }

    // ── POST paste several lines ───────────────────────────────────────────
    // Copying a PO out of Epicor means pasting a block, not typing rows one
    // at a time. Accepts tab- or comma-separated text and reports what it
    // could not read rather than discarding it silently.
    if (method === 'POST' && id && sub === 'lines' && subId === 'paste') {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const head = await headerById(id)
      if (!head) return jsonResponse(context, 404, { error: 'Purchase order not found' })

      const text = String((req.body || {}).text || '')
      if (!text.trim()) return jsonResponse(context, 400, { error: 'Nothing to paste' })

      const start = await query(
        `SELECT COALESCE(MAX(lineNo), 0) AS n FROM tbl_PurchaseOrderLines WHERE poNumber = @po`,
        [{ name: 'po', type: sql.NVarChar, value: head.poNumber }]
      )
      let lineNo = start.recordset[0].n

      const added = [], rejected = []
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        if (!line) continue

        // Tab first — that is what a spreadsheet paste gives. Comma only as
        // a fallback, because descriptions contain commas and splitting on
        // them would cut a description in half.
        const cells = (line.includes('\t') ? line.split('\t') : line.split(',')).map(c => c.trim())
        const [partNumber, description, size, qty, uom, unitRate] = cells

        if (!description && !partNumber) { rejected.push({ line, reason: 'No description' }); continue }
        const q = Number(qty)
        if (qty !== undefined && qty !== '' && !Number.isFinite(q)) {
          rejected.push({ line, reason: `Quantity "${qty}" is not a number` }); continue
        }
        const rate = Number(unitRate)
        const qv   = Number.isFinite(q) && q > 0 ? q : 1
        const rv   = Number.isFinite(rate) ? rate : null

        lineNo += 1
        await query(
          `INSERT INTO tbl_PurchaseOrderLines
             (poNumber, lineNo, partNumber, description, size, qty, uom,
              unitRate, lineAmount, currency)
           VALUES (@po, @no, @part, @desc, @size, @qty, @uom, @rate, @amt, @cur)`,
          [
            { name: 'po',   type: sql.NVarChar, value: head.poNumber },
            { name: 'no',   type: sql.Int,      value: lineNo },
            { name: 'part', type: sql.NVarChar, value: partNumber || null },
            { name: 'desc', type: sql.NVarChar, value: (description || partNumber || '').slice(0, 500) },
            { name: 'size', type: sql.NVarChar, value: size || null },
            { name: 'qty',  type: sql.Decimal(18, 3), value: qv },
            { name: 'uom',  type: sql.NVarChar, value: uom || null },
            { name: 'rate', type: sql.Decimal(18, 2), value: rv },
            { name: 'amt',  type: sql.Decimal(18, 2), value: rv == null ? null : Number((rv * qv).toFixed(2)) },
            { name: 'cur',  type: sql.NVarChar, value: head.currency || null },
          ]
        )
        added.push(lineNo)
      }
      return jsonResponse(context, 200, { added: added.length, rejected })
    }

    // ── POST one line ──────────────────────────────────────────────────────
    if (method === 'POST' && id && sub === 'lines' && !subId) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const head = await headerById(id)
      if (!head) return jsonResponse(context, 404, { error: 'Purchase order not found' })

      const b = req.body || {}
      const qty  = numOrNull(b.qty) ?? 1
      const rate = numOrNull(b.unitRate)
      const r = await query(
        `INSERT INTO tbl_PurchaseOrderLines
           (poNumber, lineNo, partNumber, description, size, qty, uom,
            unitRate, lineAmount, currency, jobId, destination, notes)
         OUTPUT INSERTED.id
         VALUES (@po,
                 COALESCE((SELECT MAX(lineNo) FROM tbl_PurchaseOrderLines WHERE poNumber = @po), 0) + 1,
                 @part, @desc, @size, @qty, @uom, @rate, @amt, @cur, @job, @dest, @notes)`,
        [
          { name: 'po',   type: sql.NVarChar, value: head.poNumber },
          { name: 'part', type: sql.NVarChar, value: b.partNumber || null },
          { name: 'desc', type: sql.NVarChar, value: b.description || null },
          { name: 'size', type: sql.NVarChar, value: b.size || null },
          { name: 'qty',  type: sql.Decimal(18, 3), value: qty },
          { name: 'uom',  type: sql.NVarChar, value: b.uom || null },
          { name: 'rate', type: sql.Decimal(18, 2), value: rate },
          { name: 'amt',  type: sql.Decimal(18, 2), value: rate == null ? null : Number((rate * qty).toFixed(2)) },
          { name: 'cur',  type: sql.NVarChar, value: b.currency || head.currency || null },
          { name: 'job',  type: sql.NVarChar, value: b.jobId || null },
          { name: 'dest', type: sql.NVarChar, value: b.destination || null },
          { name: 'notes',type: sql.NVarChar, value: b.notes || null },
        ]
      )
      return jsonResponse(context, 201, { id: r.recordset[0].id })
    }

    // ── PUT a line ─────────────────────────────────────────────────────────
    if (method === 'PUT' && id && sub === 'lines' && subId) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const b = req.body || {}
      const qty  = numOrNull(b.qty) ?? 1
      const rate = numOrNull(b.unitRate)

      // A line already partly received cannot have its quantity cut below
      // what has arrived, or the PO would report more received than ordered.
      const got = await query(
        `SELECT COALESCE(SUM(qtyReceived), 0) AS got
           FROM tbl_GoodsReceiptLines WHERE poLineId = @id`,
        [{ name: 'id', type: sql.Int, value: Number(subId) }]
      )
      const received = Number(got.recordset[0].got || 0)
      if (received > qty)
        return jsonResponse(context, 409, {
          error: `${received} already received against this line, so the quantity cannot be set to ${qty}.`,
        })

      await query(
        `UPDATE tbl_PurchaseOrderLines
            SET partNumber = @part, description = @desc, size = @size,
                qty = @qty, uom = @uom, unitRate = @rate, lineAmount = @amt,
                currency = @cur, jobId = @job, destination = @dest, notes = @notes
          WHERE id = @id`,
        [
          { name: 'id',   type: sql.Int,      value: Number(subId) },
          { name: 'part', type: sql.NVarChar, value: b.partNumber || null },
          { name: 'desc', type: sql.NVarChar, value: b.description || null },
          { name: 'size', type: sql.NVarChar, value: b.size || null },
          { name: 'qty',  type: sql.Decimal(18, 3), value: qty },
          { name: 'uom',  type: sql.NVarChar, value: b.uom || null },
          { name: 'rate', type: sql.Decimal(18, 2), value: rate },
          { name: 'amt',  type: sql.Decimal(18, 2), value: rate == null ? null : Number((rate * qty).toFixed(2)) },
          { name: 'cur',  type: sql.NVarChar, value: b.currency || null },
          { name: 'job',  type: sql.NVarChar, value: b.jobId || null },
          { name: 'dest', type: sql.NVarChar, value: b.destination || null },
          { name: 'notes',type: sql.NVarChar, value: b.notes || null },
        ]
      )
      const head = await headerById(id)
      if (head) await refreshStatus(head.poNumber)
      return jsonResponse(context, 200, { ok: true })
    }

    // ── DELETE a line ──────────────────────────────────────────────────────
    if (method === 'DELETE' && id && sub === 'lines' && subId) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const got = await query(
        `SELECT COUNT(*) AS n FROM tbl_GoodsReceiptLines WHERE poLineId = @id`,
        [{ name: 'id', type: sql.Int, value: Number(subId) }]
      )
      if (got.recordset[0].n > 0)
        return jsonResponse(context, 409, {
          error: 'Goods have been received against this line, so it cannot be removed.',
        })

      await query(`DELETE FROM tbl_PurchaseOrderLines WHERE id = @id`,
        [{ name: 'id', type: sql.Int, value: Number(subId) }])
      return jsonResponse(context, 200, { ok: true })
    }

    return jsonResponse(context, 405, { error: 'Method not allowed' })
  } catch (err) {
    context.log.error('Purchase orders error:', err)
    return jsonResponse(context, 500, { error: 'Purchase order operation failed', detail: err.message })
  }
}
