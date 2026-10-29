'use strict'
const { sql, query, jsonResponse, requireAuth } = require('../db')

/**
 * Goods Inward (GRN).
 *
 *   GET    /api/goods-receipts                 list, newest first
 *   GET    /api/goods-receipts/{id}            one receipt with its lines
 *   POST   /api/goods-receipts                 create — allocates GRN-NNNNN
 *   PUT    /api/goods-receipts/{id}            edit the header
 *   DELETE /api/goods-receipts/{id}            delete, only while nothing is accepted
 *
 *   POST   /api/goods-receipts/{id}/lines      add a line
 *   PUT    /api/goods-receipts/{id}/lines/{n}  edit a line
 *   DELETE /api/goods-receipts/{id}/lines/{n}  remove a line
 *   POST   /api/goods-receipts/{id}/accept     accept — creates the assets
 *
 * ── Why there is no purchase-order table ───────────────────────────────
 * Epicor owns the PO. poNumber here is a reference typed in by the person
 * receiving, the same way a delivery ticket carries a client PO. Keeping a
 * second PO master would mean someone reconciling two systems by hand every
 * month, and they would drift.
 *
 * ── Accepting ──────────────────────────────────────────────────────────
 * Accepting is what creates the inventory record, which is the loop that
 * currently leaves orphan serials: tools appear on tickets having never
 * been taken into stock. A line carries systemId once accepted, so the same
 * asset cannot be created twice however many times the button is pressed.
 */

const EDITORS = ['Admin', 'Operations']

async function nextGrnNumber () {
  // Continues one GRN-NNNNN series, counting only plain five-digit numbers
  // so a hand-typed or imported oddity cannot push the sequence sideways.
  const r = await query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(grnNumber, 5, 5) AS int)), 0) + 1 AS seq
       FROM tbl_GoodsReceipts
      WHERE grnNumber LIKE 'GRN-[0-9][0-9][0-9][0-9][0-9]'`, []
  )
  return `GRN-${String(r.recordset[0].seq).padStart(5, '0')}`
}

async function headerById (id) {
  const r = await query(
    `SELECT * FROM tbl_GoodsReceipts WHERE id = @id`,
    [{ name: 'id', type: sql.Int, value: Number(id) }]
  )
  return r.recordset[0] || null
}

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const method = req.method.toUpperCase()
  const id     = context.bindingData.id
  const sub    = context.bindingData.sub
  const subId  = context.bindingData.subId
  const qs     = req.query || {}

  try {
    // ── GET list ───────────────────────────────────────────────────────────
    if (method === 'GET' && !id) {
      const search = (qs.search || '').trim()
      const r = await query(
        `SELECT TOP 500 g.*,
                (SELECT COUNT(*) FROM tbl_GoodsReceiptLines l
                  WHERE l.grnNumber = g.grnNumber) AS lineCount,
                (SELECT COUNT(*) FROM tbl_GoodsReceiptLines l
                  WHERE l.grnNumber = g.grnNumber AND l.systemId IS NOT NULL) AS acceptedCount
           FROM tbl_GoodsReceipts g
          WHERE (@q IS NULL
                 OR g.grnNumber    LIKE @q OR g.poNumber     LIKE @q
                 OR g.supplierName LIKE @q OR g.deliveryNote LIKE @q)
          ORDER BY g.receiptDate DESC, g.id DESC`,
        [{ name: 'q', type: sql.NVarChar, value: search ? `%${search}%` : null }]
      )
      return jsonResponse(context, 200, r.recordset)
    }

    // ── GET one, with lines ────────────────────────────────────────────────
    if (method === 'GET' && id && !sub) {
      const head = await headerById(id)
      if (!head) return jsonResponse(context, 404, { error: 'Receipt not found' })
      const lines = await query(
        `SELECT * FROM tbl_GoodsReceiptLines WHERE grnNumber = @n ORDER BY itemNo`,
        [{ name: 'n', type: sql.NVarChar, value: head.grnNumber }]
      )
      return jsonResponse(context, 200, { ...head, lines: lines.recordset })
    }

    // ── POST create ────────────────────────────────────────────────────────
    if (method === 'POST' && !id) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const b = req.body || {}
      if (!b.receiptDate)
        return jsonResponse(context, 400, { error: 'Receipt date is required' })

      const grnNumber = await nextGrnNumber()
      const r = await query(
        `INSERT INTO tbl_GoodsReceipts
           (grnNumber, poNumber, supplierName, receiptDate, deliveryNote,
            receivedBy, status, notes, createdBy)
         OUTPUT INSERTED.id
         VALUES (@n, @po, @sup, @date, @dn, @rcv, @status, @notes, @by)`,
        [
          { name: 'n',      type: sql.NVarChar, value: grnNumber },
          { name: 'po',     type: sql.NVarChar, value: b.poNumber     || null },
          { name: 'sup',    type: sql.NVarChar, value: b.supplierName || null },
          { name: 'date',   type: sql.Date,     value: new Date(b.receiptDate) },
          { name: 'dn',     type: sql.NVarChar, value: b.deliveryNote || null },
          { name: 'rcv',    type: sql.NVarChar, value: b.receivedBy   || user.Username || null },
          { name: 'status', type: sql.NVarChar, value: b.status       || 'Received' },
          { name: 'notes',  type: sql.NVarChar, value: b.notes        || null },
          { name: 'by',     type: sql.NVarChar, value: user.Username  || null },
        ]
      )
      return jsonResponse(context, 201, { id: r.recordset[0].id, grnNumber })
    }

    // ── PUT header ─────────────────────────────────────────────────────────
    if (method === 'PUT' && id && !sub) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const b = req.body || {}
      await query(
        `UPDATE tbl_GoodsReceipts
            SET poNumber = @po, supplierName = @sup, receiptDate = @date,
                deliveryNote = @dn, receivedBy = @rcv, status = @status,
                notes = @notes, updatedAt = GETDATE()
          WHERE id = @id`,
        [
          { name: 'id',     type: sql.Int,      value: Number(id) },
          { name: 'po',     type: sql.NVarChar, value: b.poNumber     || null },
          { name: 'sup',    type: sql.NVarChar, value: b.supplierName || null },
          { name: 'date',   type: sql.Date,     value: b.receiptDate ? new Date(b.receiptDate) : null },
          { name: 'dn',     type: sql.NVarChar, value: b.deliveryNote || null },
          { name: 'rcv',    type: sql.NVarChar, value: b.receivedBy   || null },
          { name: 'status', type: sql.NVarChar, value: b.status       || 'Received' },
          { name: 'notes',  type: sql.NVarChar, value: b.notes        || null },
        ]
      )
      return jsonResponse(context, 200, { ok: true })
    }

    // ── DELETE ─────────────────────────────────────────────────────────────
    if (method === 'DELETE' && id && !sub) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const head = await headerById(id)
      if (!head) return jsonResponse(context, 404, { error: 'Receipt not found' })

      // Once a line has created an asset, deleting the receipt would leave
      // that asset with nothing explaining where it came from.
      const acc = await query(
        `SELECT COUNT(*) AS n FROM tbl_GoodsReceiptLines
          WHERE grnNumber = @n AND systemId IS NOT NULL`,
        [{ name: 'n', type: sql.NVarChar, value: head.grnNumber }]
      )
      if (acc.recordset[0].n > 0)
        return jsonResponse(context, 409, {
          error: `${head.grnNumber} has accepted lines that created inventory assets and cannot be deleted.`,
        })

      await query(`DELETE FROM tbl_GoodsReceiptLines WHERE grnNumber = @n`,
        [{ name: 'n', type: sql.NVarChar, value: head.grnNumber }])
      await query(`DELETE FROM tbl_GoodsReceipts WHERE id = @id`,
        [{ name: 'id', type: sql.Int, value: Number(id) }])
      return jsonResponse(context, 200, { ok: true })
    }

    // ── POST a line ────────────────────────────────────────────────────────
    if (method === 'POST' && id && sub === 'lines') {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const head = await headerById(id)
      if (!head) return jsonResponse(context, 404, { error: 'Receipt not found' })

      const b = req.body || {}
      if (!b.shortDesc)
        return jsonResponse(context, 400, { error: 'Category (shortDesc) is required' })

      const r = await query(
        `INSERT INTO tbl_GoodsReceiptLines
           (grnNumber, itemNo, assetNo, shortDesc, size, oemSerial,
            qty, unitCost, currency, condition, remarks)
         OUTPUT INSERTED.id
         VALUES (@n,
                 COALESCE((SELECT MAX(itemNo) FROM tbl_GoodsReceiptLines WHERE grnNumber = @n), 0) + 1,
                 @asset, @desc, @size, @serial, @qty, @cost, @cur, @cond, @rem)`,
        [
          { name: 'n',      type: sql.NVarChar, value: head.grnNumber },
          { name: 'asset',  type: sql.NVarChar, value: b.assetNo   || null },
          { name: 'desc',   type: sql.NVarChar, value: b.shortDesc },
          { name: 'size',   type: sql.NVarChar, value: b.size      || null },
          { name: 'serial', type: sql.NVarChar, value: b.oemSerial || null },
          { name: 'qty',    type: sql.Decimal(18, 3), value: b.qty == null ? 1 : Number(b.qty) },
          { name: 'cost',   type: sql.Decimal(18, 2), value: b.unitCost == null || b.unitCost === '' ? null : Number(b.unitCost) },
          { name: 'cur',    type: sql.NVarChar, value: b.currency  || null },
          { name: 'cond',   type: sql.NVarChar, value: b.condition || 'Good' },
          { name: 'rem',    type: sql.NVarChar, value: b.remarks   || null },
        ]
      )
      return jsonResponse(context, 201, { id: r.recordset[0].id })
    }

    // ── PUT a line ─────────────────────────────────────────────────────────
    if (method === 'PUT' && id && sub === 'lines' && subId) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const cur = await query(
        `SELECT systemId FROM tbl_GoodsReceiptLines WHERE id = @id`,
        [{ name: 'id', type: sql.Int, value: Number(subId) }]
      )
      if (!cur.recordset.length) return jsonResponse(context, 404, { error: 'Line not found' })
      if (cur.recordset[0].systemId)
        return jsonResponse(context, 409, {
          error: 'This line has already been accepted and created an asset, so it cannot be changed.',
        })

      const b = req.body || {}
      await query(
        `UPDATE tbl_GoodsReceiptLines
            SET assetNo = @asset, shortDesc = @desc, size = @size,
                oemSerial = @serial, qty = @qty, unitCost = @cost,
                currency = @cur, condition = @cond, remarks = @rem
          WHERE id = @id`,
        [
          { name: 'id',     type: sql.Int,      value: Number(subId) },
          { name: 'asset',  type: sql.NVarChar, value: b.assetNo   || null },
          { name: 'desc',   type: sql.NVarChar, value: b.shortDesc || null },
          { name: 'size',   type: sql.NVarChar, value: b.size      || null },
          { name: 'serial', type: sql.NVarChar, value: b.oemSerial || null },
          { name: 'qty',    type: sql.Decimal(18, 3), value: b.qty == null ? 1 : Number(b.qty) },
          { name: 'cost',   type: sql.Decimal(18, 2), value: b.unitCost == null || b.unitCost === '' ? null : Number(b.unitCost) },
          { name: 'cur',    type: sql.NVarChar, value: b.currency  || null },
          { name: 'cond',   type: sql.NVarChar, value: b.condition || null },
          { name: 'rem',    type: sql.NVarChar, value: b.remarks   || null },
        ]
      )
      return jsonResponse(context, 200, { ok: true })
    }

    // ── DELETE a line ──────────────────────────────────────────────────────
    if (method === 'DELETE' && id && sub === 'lines' && subId) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const cur = await query(
        `SELECT systemId FROM tbl_GoodsReceiptLines WHERE id = @id`,
        [{ name: 'id', type: sql.Int, value: Number(subId) }]
      )
      if (!cur.recordset.length) return jsonResponse(context, 404, { error: 'Line not found' })
      if (cur.recordset[0].systemId)
        return jsonResponse(context, 409, {
          error: 'This line created an inventory asset and cannot be removed.',
        })

      await query(`DELETE FROM tbl_GoodsReceiptLines WHERE id = @id`,
        [{ name: 'id', type: sql.Int, value: Number(subId) }])
      return jsonResponse(context, 200, { ok: true })
    }

    // ── POST accept ────────────────────────────────────────────────────────
    // Creates one inventory asset per not-yet-accepted line. Reports what it
    // did and what it skipped rather than failing the whole receipt on one
    // bad line: a clash on a single asset number should not block the other
    // nine items that arrived in the same delivery.
    if (method === 'POST' && id && sub === 'accept') {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const head = await headerById(id)
      if (!head) return jsonResponse(context, 404, { error: 'Receipt not found' })

      const lines = await query(
        `SELECT * FROM tbl_GoodsReceiptLines
          WHERE grnNumber = @n AND systemId IS NULL
          ORDER BY itemNo`,
        [{ name: 'n', type: sql.NVarChar, value: head.grnNumber }]
      )
      if (!lines.recordset.length)
        return jsonResponse(context, 200, { ok: true, created: 0, skipped: [], message: 'Nothing left to accept.' })

      const created = []
      const skipped = []

      for (const l of lines.recordset) {
        const assetNo = (l.assetNo || '').trim()
        if (!assetNo) {
          skipped.push({ itemNo: l.itemNo, reason: 'No asset number on the line' })
          continue
        }
        if (!(l.shortDesc || '').trim()) {
          skipped.push({ itemNo: l.itemNo, assetNo, reason: 'No category on the line' })
          continue
        }

        // tbl_Inventory keys on SystemID; Missing Tools already uses the
        // asset number as the SystemID when taking a tool into stock, and
        // this follows that so the two routes produce the same shape.
        const clash = await query(
          `SELECT TOP 1 SystemID FROM tbl_Inventory
            WHERE SystemID = @a OR AssetNo = @a`,
          [{ name: 'a', type: sql.VarChar, value: assetNo }]
        )
        if (clash.recordset.length) {
          skipped.push({ itemNo: l.itemNo, assetNo, reason: 'Already in inventory' })
          continue
        }

        await query(
          `INSERT INTO tbl_Inventory
             (SystemID, AssetNo, Size, ShortDesc, Qty, Location,
              Status, Ownership, IsEmdad, OEMSerial, Supplier,
              AddedDate, AddedBy)
           VALUES
             (@id, @asset, @size, @desc, @qty, 'Emdad Base',
              @status, 'Owned', 1, @serial, @sup,
              CAST(GETDATE() AS date), @by)`,
          [
            { name: 'id',     type: sql.VarChar, value: assetNo },
            { name: 'asset',  type: sql.VarChar, value: assetNo },
            { name: 'size',   type: sql.VarChar, value: l.size || null },
            { name: 'desc',   type: sql.VarChar, value: l.shortDesc },
            { name: 'qty',    type: sql.Int,     value: l.qty == null ? 1 : Math.round(Number(l.qty)) },
            // A damaged item is taken in, but not as ready to mobilise.
            { name: 'status', type: sql.VarChar,
              value: String(l.condition || 'Good').toLowerCase() === 'good' ? 'Good' : 'Inspection' },
            { name: 'serial', type: sql.VarChar, value: l.oemSerial || null },
            { name: 'sup',    type: sql.VarChar, value: head.supplierName || null },
            { name: 'by',     type: sql.VarChar, value: user.Username || null },
          ]
        )

        await query(
          `UPDATE tbl_GoodsReceiptLines
              SET systemId = @sid, acceptedAt = GETDATE(), acceptedBy = @by
            WHERE id = @id`,
          [
            { name: 'id',  type: sql.Int,      value: l.id },
            { name: 'sid', type: sql.NVarChar, value: assetNo },
            { name: 'by',  type: sql.NVarChar, value: user.Username || null },
          ]
        )
        created.push({ itemNo: l.itemNo, assetNo })
      }

      // The header reflects what actually happened, so a receipt that could
      // only be partly taken in does not read as fully accepted.
      const remaining = await query(
        `SELECT COUNT(*) AS n FROM tbl_GoodsReceiptLines
          WHERE grnNumber = @n AND systemId IS NULL`,
        [{ name: 'n', type: sql.NVarChar, value: head.grnNumber }]
      )
      const status = remaining.recordset[0].n === 0 ? 'Accepted'
                   : created.length > 0             ? 'Partly Accepted'
                   : head.status
      await query(
        `UPDATE tbl_GoodsReceipts SET status = @s, updatedAt = GETDATE() WHERE id = @id`,
        [{ name: 'id', type: sql.Int, value: Number(id) },
         { name: 's',  type: sql.NVarChar, value: status }]
      )

      return jsonResponse(context, 200, {
        ok: true, created: created.length, createdItems: created, skipped, status,
      })
    }

    return jsonResponse(context, 405, { error: 'Method not allowed' })
  } catch (err) {
    context.log.error('Goods receipts error:', err)
    return jsonResponse(context, 500, { error: 'Goods receipt operation failed', detail: err.message })
  }
}
