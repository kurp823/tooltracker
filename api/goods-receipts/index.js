'use strict'
const { sql, query, jsonResponse, requireAuth } = require('../db')
const { refreshStatus } = require('../po-status')

/**
 * Goods receipts (GRN) — receiving against the PO's own lines.
 *
 *   GET    /api/goods-receipts                  list
 *   GET    /api/goods-receipts/{id}             one GRN with its lines
 *   GET    /api/goods-receipts/open/{poNumber}  a PO's lines with what is
 *                                               still outstanding, which is
 *                                               what the tick list shows
 *   POST   /api/goods-receipts                  create from ticked lines
 *   POST   /api/goods-receipts/{id}/post        create the items
 *   DELETE /api/goods-receipts/{id}             delete, only before posting
 *
 * ── Receiving ──────────────────────────────────────────────────────────
 * You tick the PO lines that arrived and say, per line, whether the item
 * becomes an Asset, Inventory stock, or a Consumable. Receiving is
 * cumulative, so a line ordered 10 can arrive 6 then 4 and the outstanding
 * figure is what is left rather than a flag that has to be maintained.
 *
 * ── Posting ────────────────────────────────────────────────────────────
 * Creating the GRN records what arrived. POSTING is what creates the
 * item — an inventory record for an Asset or Inventory line, a positive
 * movement for a Consumable. The two are separate so a receipt can be
 * entered at the gate and checked before it changes stock.
 *
 * A posted line carries systemId, so posting twice cannot create the item
 * twice however many times the button is pressed.
 */

const EDITORS = ['Admin', 'Operations']

async function nextGrnNumber () {
  const r = await query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(grnNumber, 5, 5) AS int)), 0) + 1 AS seq
       FROM tbl_GoodsReceipts
      WHERE grnNumber LIKE 'GRN-[0-9][0-9][0-9][0-9][0-9]'`, []
  )
  return `GRN-${String(r.recordset[0].seq).padStart(5, '0')}`
}

async function headerById (id) {
  const r = await query(`SELECT * FROM tbl_GoodsReceipts WHERE id = @id`,
    [{ name: 'id', type: sql.Int, value: Number(id) }])
  return r.recordset[0] || null
}

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const method = req.method.toUpperCase()
  const id     = context.bindingData.id
  const sub    = context.bindingData.sub

  try {
    // ── GET a PO's outstanding lines — the tick list ───────────────────────
    if (method === 'GET' && id === 'open' && sub) {
      const poNumber = decodeURIComponent(sub)
      const r = await query(
        `SELECT l.id AS poLineId, l.lineNo, l.partNumber, l.description,
                l.size, l.qty, l.uom, l.unitRate, l.currency, l.jobId,
                l.destination AS expectedDestination,
                COALESCE((SELECT SUM(g.qtyReceived)
                            FROM tbl_GoodsReceiptLines g
                           WHERE g.poLineId = l.id), 0) AS qtyReceived
           FROM tbl_PurchaseOrderLines l
          WHERE l.poNumber = @po
          ORDER BY l.lineNo`,
        [{ name: 'po', type: sql.NVarChar, value: poNumber }]
      )
      return jsonResponse(context, 200, r.recordset.map(l => ({
        ...l,
        outstanding: Number(l.qty) - Number(l.qtyReceived),
      })))
    }

    // ── GET list ───────────────────────────────────────────────────────────
    if (method === 'GET' && !id) {
      const search = ((req.query || {}).search || '').trim()
      const r = await query(
        `SELECT TOP 500 g.*,
                (SELECT COUNT(*) FROM tbl_GoodsReceiptLines x
                  WHERE x.grnNumber = g.grnNumber) AS lineCount,
                (SELECT COUNT(*) FROM tbl_GoodsReceiptLines x
                  WHERE x.grnNumber = g.grnNumber AND x.systemId IS NOT NULL) AS postedCount,
                (SELECT TOP 1 p.supplierName FROM tbl_PurchaseOrders p
                  WHERE p.poNumber = g.poNumber) AS supplierName
           FROM tbl_GoodsReceipts g
          WHERE (@q IS NULL
                 OR g.grnNumber LIKE @q OR g.poNumber LIKE @q OR g.deliveryNote LIKE @q)
          ORDER BY g.receiptDate DESC, g.id DESC`,
        [{ name: 'q', type: sql.NVarChar, value: search ? `%${search}%` : null }]
      )
      return jsonResponse(context, 200, r.recordset)
    }

    // ── GET one ────────────────────────────────────────────────────────────
    if (method === 'GET' && id && !sub) {
      const head = await headerById(id)
      if (!head) return jsonResponse(context, 404, { error: 'Receipt not found' })
      const lines = await query(
        `SELECT g.*, l.lineNo, l.description, l.partNumber, l.qty AS orderedQty,
                l.uom, l.jobId
           FROM tbl_GoodsReceiptLines g
           LEFT JOIN tbl_PurchaseOrderLines l ON l.id = g.poLineId
          WHERE g.grnNumber = @n
          ORDER BY l.lineNo`,
        [{ name: 'n', type: sql.NVarChar, value: head.grnNumber }]
      )
      return jsonResponse(context, 200, { ...head, lines: lines.recordset })
    }

    // ── POST create from ticked lines ──────────────────────────────────────
    if (method === 'POST' && !id) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const b = req.body || {}
      const poNumber = String(b.poNumber || '').trim()
      const picked   = Array.isArray(b.lines) ? b.lines : []
      if (!poNumber) return jsonResponse(context, 400, { error: 'PO number is required' })
      if (!picked.length) return jsonResponse(context, 400, { error: 'Tick at least one line' })
      if (!b.receiptDate) return jsonResponse(context, 400, { error: 'Receipt date is required' })

      // Validate everything BEFORE writing anything, so a bad line cannot
      // leave a half-made receipt behind.
      const problems = []
      const prepared = []
      for (const p of picked) {
        const poLineId = Number(p.poLineId)
        const qty      = Number(p.qtyReceived)
        const dest     = String(p.destination || '').trim()

        const lr = await query(
          `SELECT l.*,
                  COALESCE((SELECT SUM(g.qtyReceived) FROM tbl_GoodsReceiptLines g
                             WHERE g.poLineId = l.id), 0) AS already
             FROM tbl_PurchaseOrderLines l
            WHERE l.id = @id AND l.poNumber = @po`,
          [{ name: 'id', type: sql.Int, value: poLineId },
           { name: 'po', type: sql.NVarChar, value: poNumber }]
        )
        const line = lr.recordset[0]
        if (!line) { problems.push(`Line ${poLineId} is not on ${poNumber}`); continue }
        if (!Number.isFinite(qty) || qty <= 0) {
          problems.push(`Line ${line.lineNo}: quantity must be more than zero`); continue
        }
        const outstanding = Number(line.qty) - Number(line.already)
        if (qty > outstanding) {
          problems.push(`Line ${line.lineNo}: only ${outstanding} outstanding, ${qty} entered`); continue
        }
        if (!dest) { problems.push(`Line ${line.lineNo}: choose where it goes`); continue }

        if (dest === 'Consumable') {
          if (!String(p.consumableId || '').trim() && !String(p.itemName || line.description || '').trim())
            problems.push(`Line ${line.lineNo}: a consumable needs an item`)
        } else if (!String(p.assetNo || '').trim()) {
          problems.push(`Line ${line.lineNo}: ${dest} needs an asset number`)
        }
        prepared.push({ p, line, qty, dest })
      }
      if (problems.length) return jsonResponse(context, 400, { error: problems.join('; '), problems })

      const grnNumber = await nextGrnNumber()
      const r = await query(
        `INSERT INTO tbl_GoodsReceipts
           (grnNumber, poNumber, receiptDate, deliveryNote, receivedBy, status, notes, createdBy)
         OUTPUT INSERTED.id
         VALUES (@n, @po, @date, @dn, @rcv, 'Received', @notes, @by)`,
        [
          { name: 'n',     type: sql.NVarChar, value: grnNumber },
          { name: 'po',    type: sql.NVarChar, value: poNumber },
          { name: 'date',  type: sql.Date,     value: new Date(b.receiptDate) },
          { name: 'dn',    type: sql.NVarChar, value: b.deliveryNote || null },
          { name: 'rcv',   type: sql.NVarChar, value: b.receivedBy || user.Username || null },
          { name: 'notes', type: sql.NVarChar, value: b.notes || null },
          { name: 'by',    type: sql.NVarChar, value: user.Username || null },
        ]
      )

      for (const { p, line, qty, dest } of prepared) {
        await query(
          `INSERT INTO tbl_GoodsReceiptLines
             (grnNumber, poLineId, qtyReceived, destination, assetNo,
              shortDesc, size, oemSerial, consumableId, condition, remarks)
           VALUES (@n, @pl, @qty, @dest, @asset, @desc, @size, @serial, @cid, @cond, @rem)`,
          [
            { name: 'n',      type: sql.NVarChar, value: grnNumber },
            { name: 'pl',     type: sql.Int,      value: line.id },
            { name: 'qty',    type: sql.Decimal(18, 3), value: qty },
            { name: 'dest',   type: sql.NVarChar, value: dest },
            { name: 'asset',  type: sql.NVarChar, value: p.assetNo || null },
            { name: 'desc',   type: sql.NVarChar, value: p.shortDesc || line.description || null },
            { name: 'size',   type: sql.NVarChar, value: p.size || line.size || null },
            { name: 'serial', type: sql.NVarChar, value: p.oemSerial || null },
            { name: 'cid',    type: sql.Int,      value: p.consumableId ? Number(p.consumableId) : null },
            { name: 'cond',   type: sql.NVarChar, value: p.condition || 'Good' },
            { name: 'rem',    type: sql.NVarChar, value: p.remarks || null },
          ]
        )
      }

      await refreshStatus(poNumber)
      return jsonResponse(context, 201, { id: r.recordset[0].id, grnNumber, lines: prepared.length })
    }

    // ── POST post — create the items ───────────────────────────────────────
    if (method === 'POST' && id && sub === 'post') {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const head = await headerById(id)
      if (!head) return jsonResponse(context, 404, { error: 'Receipt not found' })

      const lines = await query(
        `SELECT g.*, l.description, l.lineNo, l.jobId, l.uom, l.unitRate
           FROM tbl_GoodsReceiptLines g
           LEFT JOIN tbl_PurchaseOrderLines l ON l.id = g.poLineId
          WHERE g.grnNumber = @n AND g.systemId IS NULL
          ORDER BY l.lineNo`,
        [{ name: 'n', type: sql.NVarChar, value: head.grnNumber }]
      )
      if (!lines.recordset.length)
        return jsonResponse(context, 200, { ok: true, posted: 0, skipped: [], message: 'Nothing left to post.' })

      const posted = [], skipped = []

      for (const l of lines.recordset) {
        // ── Consumable: a positive movement, no inventory record ──────────
        if (l.destination === 'Consumable') {
          let consumableId = l.consumableId
          if (!consumableId) {
            // Create the item on first receipt rather than making someone
            // set up a code before they can book in a delivery.
            const name = (l.shortDesc || l.description || '').trim().slice(0, 200)
            const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 60) || `ITEM-${l.poLineId}`
            const ex = await query(
              `SELECT id FROM tbl_Consumables WHERE itemCode = @c`,
              [{ name: 'c', type: sql.NVarChar, value: code }]
            )
            if (ex.recordset.length) consumableId = ex.recordset[0].id
            else {
              const ins = await query(
                `INSERT INTO tbl_Consumables (itemCode, itemName, uom, lastUnitCost, currency, createdBy)
                 OUTPUT INSERTED.id VALUES (@c, @n, @u, @cost, @cur, @by)`,
                [
                  { name: 'c',    type: sql.NVarChar, value: code },
                  { name: 'n',    type: sql.NVarChar, value: name || code },
                  { name: 'u',    type: sql.NVarChar, value: l.uom || null },
                  { name: 'cost', type: sql.Decimal(18, 2), value: l.unitRate == null ? null : Number(l.unitRate) },
                  { name: 'cur',  type: sql.NVarChar, value: null },
                  { name: 'by',   type: sql.NVarChar, value: user.Username || null },
                ]
              )
              consumableId = ins.recordset[0].id
            }
          }

          await query(
            `INSERT INTO tbl_ConsumableMovements
               (consumableId, movedOn, qty, unitCost, sourceType, sourceRef, jobId, notes, createdBy)
             VALUES (@cid, @date, @qty, @cost, 'GRN', @ref, @job, @notes, @by)`,
            [
              { name: 'cid',  type: sql.Int,  value: consumableId },
              { name: 'date', type: sql.Date, value: head.receiptDate },
              { name: 'qty',  type: sql.Decimal(18, 3), value: Number(l.qtyReceived) },
              { name: 'cost', type: sql.Decimal(18, 2), value: l.unitRate == null ? null : Number(l.unitRate) },
              { name: 'ref',  type: sql.NVarChar, value: head.grnNumber },
              { name: 'job',  type: sql.NVarChar, value: l.jobId || null },
              { name: 'notes',type: sql.NVarChar, value: l.remarks || null },
              { name: 'by',   type: sql.NVarChar, value: user.Username || null },
            ]
          )
          await query(
            `UPDATE tbl_GoodsReceiptLines
                SET consumableId = @cid, systemId = @sid, postedAt = GETDATE(), postedBy = @by
              WHERE id = @id`,
            [
              { name: 'id',  type: sql.Int,      value: l.id },
              { name: 'cid', type: sql.Int,      value: consumableId },
              { name: 'sid', type: sql.NVarChar, value: `CONS-${consumableId}` },
              { name: 'by',  type: sql.NVarChar, value: user.Username || null },
            ]
          )
          posted.push({ lineNo: l.lineNo, destination: 'Consumable', ref: `CONS-${consumableId}` })
          continue
        }

        // ── Asset or Inventory: an inventory record ───────────────────────
        const assetNo = String(l.assetNo || '').trim()
        if (!assetNo) { skipped.push({ lineNo: l.lineNo, reason: 'No asset number' }); continue }

        const clash = await query(
          `SELECT TOP 1 SystemID FROM tbl_Inventory WHERE SystemID = @a OR AssetNo = @a`,
          [{ name: 'a', type: sql.VarChar, value: assetNo }]
        )
        if (clash.recordset.length) {
          skipped.push({ lineNo: l.lineNo, assetNo, reason: 'Already in inventory' }); continue
        }

        await query(
          `INSERT INTO tbl_Inventory
             (SystemID, AssetNo, Size, ShortDesc, Qty, Location, Status,
              Ownership, IsEmdad, OEMSerial, Supplier, ItemType, AddedDate, AddedBy)
           VALUES
             (@id, @asset, @size, @desc, @qty, 'Emdad Base', @status,
              'Owned', 1, @serial, @sup, @type, CAST(GETDATE() AS date), @by)`,
          [
            { name: 'id',     type: sql.VarChar, value: assetNo },
            { name: 'asset',  type: sql.VarChar, value: assetNo },
            { name: 'size',   type: sql.VarChar, value: l.size || null },
            { name: 'desc',   type: sql.VarChar, value: (l.shortDesc || l.description || '').slice(0, 150) },
            { name: 'qty',    type: sql.Int,     value: Math.max(1, Math.round(Number(l.qtyReceived))) },
            // A damaged item is taken in, but not as ready to mobilise.
            { name: 'status', type: sql.VarChar,
              value: String(l.condition || 'Good').toLowerCase() === 'good' ? 'Good' : 'Inspection' },
            { name: 'serial', type: sql.VarChar, value: l.oemSerial || null },
            { name: 'sup',    type: sql.VarChar, value: null },
            { name: 'type',   type: sql.VarChar, value: l.destination },
            { name: 'by',     type: sql.VarChar, value: user.Username || null },
          ]
        )
        await query(
          `UPDATE tbl_GoodsReceiptLines
              SET systemId = @sid, postedAt = GETDATE(), postedBy = @by
            WHERE id = @id`,
          [
            { name: 'id',  type: sql.Int,      value: l.id },
            { name: 'sid', type: sql.NVarChar, value: assetNo },
            { name: 'by',  type: sql.NVarChar, value: user.Username || null },
          ]
        )
        posted.push({ lineNo: l.lineNo, destination: l.destination, ref: assetNo })
      }

      const left = await query(
        `SELECT COUNT(*) AS n FROM tbl_GoodsReceiptLines
          WHERE grnNumber = @n AND systemId IS NULL`,
        [{ name: 'n', type: sql.NVarChar, value: head.grnNumber }]
      )
      const status = left.recordset[0].n === 0 ? 'Posted' : head.status
      await query(
        `UPDATE tbl_GoodsReceipts SET status = @s, updatedAt = GETDATE() WHERE id = @id`,
        [{ name: 'id', type: sql.Int, value: Number(id) },
         { name: 's',  type: sql.NVarChar, value: status }]
      )

      return jsonResponse(context, 200, {
        ok: true, posted: posted.length, postedItems: posted, skipped, status,
      })
    }

    // ── DELETE ─────────────────────────────────────────────────────────────
    if (method === 'DELETE' && id && !sub) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const head = await headerById(id)
      if (!head) return jsonResponse(context, 404, { error: 'Receipt not found' })

      const postedCount = await query(
        `SELECT COUNT(*) AS n FROM tbl_GoodsReceiptLines
          WHERE grnNumber = @n AND systemId IS NOT NULL`,
        [{ name: 'n', type: sql.NVarChar, value: head.grnNumber }]
      )
      if (postedCount.recordset[0].n > 0)
        return jsonResponse(context, 409, {
          error: `${head.grnNumber} has been posted and the items exist, so it cannot be deleted.`,
        })

      await query(`DELETE FROM tbl_GoodsReceiptLines WHERE grnNumber = @n`,
        [{ name: 'n', type: sql.NVarChar, value: head.grnNumber }])
      await query(`DELETE FROM tbl_GoodsReceipts WHERE id = @id`,
        [{ name: 'id', type: sql.Int, value: Number(id) }])
      await refreshStatus(head.poNumber)
      return jsonResponse(context, 200, { ok: true })
    }

    return jsonResponse(context, 405, { error: 'Method not allowed' })
  } catch (err) {
    context.log.error('Goods receipts error:', err)
    return jsonResponse(context, 500, { error: 'Goods receipt operation failed', detail: err.message })
  }
}
