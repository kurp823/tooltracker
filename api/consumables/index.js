'use strict'
const { sql, query, jsonResponse, requireAuth } = require('../db')

/**
 * Consumables — the stock register, and issuing against a maintenance job.
 *
 *   GET    /api/consumables                 items with their balance
 *   GET    /api/consumables/{id}            one item with its movements
 *   GET    /api/consumables/for/{mjNumber}  what a maintenance job has used
 *   POST   /api/consumables                 add an item
 *   PUT    /api/consumables/{id}            edit an item
 *   POST   /api/consumables/{id}/issue      issue against a maintenance job
 *   POST   /api/consumables/{id}/adjust     correct the balance, with a reason
 *
 * ── The balance is never stored ────────────────────────────────────────
 * It is SUM(qty) over the movements: positive in from a GRN, negative out
 * when issued. A stored balance and its movement history drift apart
 * within a week of anyone editing one directly, and then nobody knows
 * which to believe. Deriving it means they cannot disagree.
 *
 * ── Issuing happens here, from Maintenance ─────────────────────────────
 * Consumables are used on maintenance jobs, so the issue is recorded
 * against the job card number rather than through a separate store screen.
 */

const EDITORS  = ['Admin', 'Operations']
const ISSUERS  = ['Admin', 'Operations', 'QAQC']

const BALANCE = `
  COALESCE((SELECT SUM(m.qty) FROM tbl_ConsumableMovements m
             WHERE m.consumableId = c.id), 0)`

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const method = req.method.toUpperCase()
  const id     = context.bindingData.id
  const sub    = context.bindingData.sub
  const qs     = req.query || {}

  try {
    // ── GET what a maintenance job has used ────────────────────────────────
    if (method === 'GET' && id === 'for' && sub) {
      const mj = decodeURIComponent(sub)
      const r = await query(
        `SELECT m.id, m.consumableId, m.movedOn, m.qty, m.unitCost,
                m.jobId, m.notes, m.createdBy,
                c.itemCode, c.itemName, c.uom
           FROM tbl_ConsumableMovements m
           JOIN tbl_Consumables c ON c.id = m.consumableId
          WHERE m.sourceType = 'Maintenance' AND m.sourceRef = @ref
          ORDER BY m.movedOn DESC, m.id DESC`,
        [{ name: 'ref', type: sql.NVarChar, value: mj }]
      )
      // qty is stored negative for an issue; the screen wants the amount used
      return jsonResponse(context, 200, r.recordset.map(m => ({
        ...m, qtyUsed: Math.abs(Number(m.qty)),
        value: m.unitCost == null ? null : Math.abs(Number(m.qty)) * Number(m.unitCost),
      })))
    }

    // ── GET list ───────────────────────────────────────────────────────────
    if (method === 'GET' && !id) {
      const search = (qs.search || '').trim()
      const lowOnly = String(qs.low || '') === '1'
      const r = await query(
        `SELECT c.*, ${BALANCE} AS qtyOnHand
           FROM tbl_Consumables c
          WHERE (@q IS NULL OR c.itemCode LIKE @q OR c.itemName LIKE @q)
            AND (@all = 1 OR c.activeFlag = 1)
          ORDER BY c.itemName`,
        [
          { name: 'q',   type: sql.NVarChar, value: search ? `%${search}%` : null },
          { name: 'all', type: sql.Int,      value: String(qs.all || '') === '1' ? 1 : 0 },
        ]
      )
      let rows = r.recordset.map(c => ({
        ...c,
        qtyOnHand: Number(c.qtyOnHand),
        // Only a set reorder level can be below itself; an item with none
        // is not "low", it is simply not tracked that way.
        low: c.reorderLevel != null && Number(c.qtyOnHand) <= Number(c.reorderLevel),
      }))
      if (lowOnly) rows = rows.filter(x => x.low)
      return jsonResponse(context, 200, rows)
    }

    // ── GET one with movements ─────────────────────────────────────────────
    if (method === 'GET' && id && !sub) {
      const c = await query(
        `SELECT c.*, ${BALANCE} AS qtyOnHand FROM tbl_Consumables c WHERE c.id = @id`,
        [{ name: 'id', type: sql.Int, value: Number(id) }]
      )
      if (!c.recordset.length) return jsonResponse(context, 404, { error: 'Item not found' })

      const m = await query(
        `SELECT TOP 500 * FROM tbl_ConsumableMovements
          WHERE consumableId = @id
          ORDER BY movedOn DESC, id DESC`,
        [{ name: 'id', type: sql.Int, value: Number(id) }]
      )
      return jsonResponse(context, 200, {
        ...c.recordset[0],
        qtyOnHand: Number(c.recordset[0].qtyOnHand),
        movements: m.recordset,
      })
    }

    // ── POST add an item ───────────────────────────────────────────────────
    if (method === 'POST' && !id) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const b = req.body || {}
      const itemCode = String(b.itemCode || '').trim()
      const itemName = String(b.itemName || '').trim()
      if (!itemCode || !itemName)
        return jsonResponse(context, 400, { error: 'Item code and name are required' })

      const dup = await query(`SELECT id FROM tbl_Consumables WHERE itemCode = @c`,
        [{ name: 'c', type: sql.NVarChar, value: itemCode }])
      if (dup.recordset.length)
        return jsonResponse(context, 409, { error: `${itemCode} already exists` })

      const r = await query(
        `INSERT INTO tbl_Consumables
           (itemCode, itemName, uom, reorderLevel, lastUnitCost, currency, notes, createdBy)
         OUTPUT INSERTED.id
         VALUES (@c, @n, @u, @re, @cost, @cur, @notes, @by)`,
        [
          { name: 'c',    type: sql.NVarChar, value: itemCode },
          { name: 'n',    type: sql.NVarChar, value: itemName },
          { name: 'u',    type: sql.NVarChar, value: b.uom || null },
          { name: 're',   type: sql.Decimal(18, 3), value: b.reorderLevel == null || b.reorderLevel === '' ? null : Number(b.reorderLevel) },
          { name: 'cost', type: sql.Decimal(18, 2), value: b.lastUnitCost == null || b.lastUnitCost === '' ? null : Number(b.lastUnitCost) },
          { name: 'cur',  type: sql.NVarChar, value: b.currency || null },
          { name: 'notes',type: sql.NVarChar, value: b.notes || null },
          { name: 'by',   type: sql.NVarChar, value: user.Username || null },
        ]
      )
      return jsonResponse(context, 201, { id: r.recordset[0].id })
    }

    // ── PUT edit an item ───────────────────────────────────────────────────
    if (method === 'PUT' && id && !sub) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const b = req.body || {}
      await query(
        `UPDATE tbl_Consumables
            SET itemName = @n, uom = @u, reorderLevel = @re,
                lastUnitCost = @cost, currency = @cur,
                activeFlag = COALESCE(@active, activeFlag), notes = @notes
          WHERE id = @id`,
        [
          { name: 'id',   type: sql.Int,      value: Number(id) },
          { name: 'n',    type: sql.NVarChar, value: b.itemName || null },
          { name: 'u',    type: sql.NVarChar, value: b.uom || null },
          { name: 're',   type: sql.Decimal(18, 3), value: b.reorderLevel == null || b.reorderLevel === '' ? null : Number(b.reorderLevel) },
          { name: 'cost', type: sql.Decimal(18, 2), value: b.lastUnitCost == null || b.lastUnitCost === '' ? null : Number(b.lastUnitCost) },
          { name: 'cur',  type: sql.NVarChar, value: b.currency || null },
          { name: 'active', type: sql.Bit,    value: b.activeFlag == null ? null : (b.activeFlag ? 1 : 0) },
          { name: 'notes',type: sql.NVarChar, value: b.notes || null },
        ]
      )
      return jsonResponse(context, 200, { ok: true })
    }

    // ── POST issue against a maintenance job ───────────────────────────────
    if (method === 'POST' && id && sub === 'issue') {
      if (!ISSUERS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const b   = req.body || {}
      const qty = Number(b.qty)
      const mj  = String(b.maintenanceJob || '').trim()
      if (!Number.isFinite(qty) || qty <= 0)
        return jsonResponse(context, 400, { error: 'Quantity must be more than zero' })
      if (!mj)
        return jsonResponse(context, 400, { error: 'Which maintenance job is this for?' })

      const c = await query(
        `SELECT c.*, ${BALANCE} AS qtyOnHand FROM tbl_Consumables c WHERE c.id = @id`,
        [{ name: 'id', type: sql.Int, value: Number(id) }]
      )
      if (!c.recordset.length) return jsonResponse(context, 404, { error: 'Item not found' })

      const item = c.recordset[0]
      const onHand = Number(item.qtyOnHand)
      // Refused rather than allowed to go negative: a negative balance means
      // either the receipt was never booked or the issue is wrong, and both
      // want looking at before the number is believed.
      if (qty > onHand)
        return jsonResponse(context, 409, {
          error: `Only ${onHand} ${item.uom || ''} of ${item.itemName} on hand, ${qty} requested.`,
          onHand,
        })

      await query(
        `INSERT INTO tbl_ConsumableMovements
           (consumableId, movedOn, qty, unitCost, sourceType, sourceRef,
            jobId, issuedTo, notes, createdBy)
         VALUES (@cid, @date, @qty, @cost, 'Maintenance', @ref, @job, @to, @notes, @by)`,
        [
          { name: 'cid',  type: sql.Int,  value: Number(id) },
          { name: 'date', type: sql.Date, value: b.issueDate ? new Date(b.issueDate) : new Date() },
          // stored negative, so the balance is a plain sum
          { name: 'qty',  type: sql.Decimal(18, 3), value: -Math.abs(qty) },
          { name: 'cost', type: sql.Decimal(18, 2), value: item.lastUnitCost },
          { name: 'ref',  type: sql.NVarChar, value: mj },
          { name: 'job',  type: sql.NVarChar, value: b.jobId || null },
          { name: 'to',   type: sql.NVarChar, value: b.issuedTo || null },
          { name: 'notes',type: sql.NVarChar, value: b.notes || null },
          { name: 'by',   type: sql.NVarChar, value: user.Username || null },
        ]
      )
      return jsonResponse(context, 201, { ok: true, remaining: onHand - qty })
    }

    // ── POST adjust the balance ────────────────────────────────────────────
    if (method === 'POST' && id && sub === 'adjust') {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const b    = req.body || {}
      const qty  = Number(b.qty)
      const why  = String(b.reason || '').trim()
      if (!Number.isFinite(qty) || qty === 0)
        return jsonResponse(context, 400, { error: 'Enter an amount to add or remove' })
      // An adjustment with no reason is an unexplained change to stock, and
      // a stocktake that cannot be explained is not worth having.
      if (!why)
        return jsonResponse(context, 400, { error: 'A reason is required for an adjustment' })

      await query(
        `INSERT INTO tbl_ConsumableMovements
           (consumableId, movedOn, qty, sourceType, sourceRef, notes, createdBy)
         VALUES (@cid, CAST(GETDATE() AS date), @qty, 'Adjustment', @ref, @notes, @by)`,
        [
          { name: 'cid',  type: sql.Int, value: Number(id) },
          { name: 'qty',  type: sql.Decimal(18, 3), value: qty },
          { name: 'ref',  type: sql.NVarChar, value: (b.reference || 'Stock count').slice(0, 64) },
          { name: 'notes',type: sql.NVarChar, value: why.slice(0, 500) },
          { name: 'by',   type: sql.NVarChar, value: user.Username || null },
        ]
      )
      return jsonResponse(context, 201, { ok: true })
    }

    // Movements are not deleted here. A GRN receipt is undone by deleting
    // the GRN, which keeps the two in step; an issue is corrected with an
    // adjustment, which leaves the correction visible rather than making
    // the original disappear.

    return jsonResponse(context, 405, { error: 'Method not allowed' })
  } catch (err) {
    context.log.error('Consumables error:', err)
    return jsonResponse(context, 500, { error: 'Consumables operation failed', detail: err.message })
  }
}
