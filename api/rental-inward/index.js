'use strict'
const { sql, query, jsonResponse, requireAuth } = require('../db')

/**
 * Third-party rental inward, and the sub-contractor rental report.
 *
 *   GET    /api/rental-inward              list, newest first
 *   GET    /api/rental-inward/summary      cost by supplier and by job
 *   GET    /api/rental-inward/{id}         one hire
 *   POST   /api/rental-inward              take a tool on hire
 *   PUT    /api/rental-inward/{id}         edit
 *   POST   /api/rental-inward/{id}/return  send it back
 *   DELETE /api/rental-inward/{id}         delete, only before it is in stock
 *
 * ── Why this exists ────────────────────────────────────────────────────
 * A sub-contractor's tool arrives, goes out on a delivery ticket, and has
 * no inward record anywhere. That is the gap behind the orphan serials
 * found on 27 October — the Goss roller-reamer cutters being the clearest
 * case. Recording the hire gives the tool somewhere to come from.
 *
 * Taking one on hire can create a tbl_Inventory record with IsEmdad = 0,
 * which is how sub-contractor tools are already marked there, so it can be
 * put on a ticket like any other tool while still being known as someone
 * else's. Returning it takes it back out of available stock.
 *
 * ── Days are counted, not stored ───────────────────────────────────────
 * Days on hire is dateOut minus dateIn, or today minus dateIn while it is
 * still here. A stored counter would need something to tick it over daily
 * and would be wrong the moment that failed.
 */

const EDITORS = ['Admin', 'Operations']
const VIEWERS = ['Admin', 'Operations', 'Finance', 'Billing', 'CostController']

// Days on hire, inclusive of the day it arrived.
const DAYS_ON_HIRE = `
  DATEDIFF(day, r.dateIn, COALESCE(r.dateOut, CAST(GETDATE() AS date))) + 1`

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  if (!VIEWERS.includes(user.Role))
    return jsonResponse(context, 403, { error: 'Forbidden' })

  const method = req.method.toUpperCase()
  const id     = context.bindingData.id
  const sub    = context.bindingData.sub
  const qs     = req.query || {}

  try {
    // ── GET summary — the Sub-Contractor Rentals report ────────────────────
    if (method === 'GET' && id === 'summary') {
      const [bySupplier, byJob, totals] = await Promise.all([
        query(
          `SELECT r.supplierName,
                  COUNT(*)                                          AS tools,
                  SUM(CASE WHEN r.status = 'On Hire' THEN 1 ELSE 0 END) AS onHire,
                  SUM(${DAYS_ON_HIRE})                              AS days,
                  SUM(COALESCE(r.dayRate, 0) * (${DAYS_ON_HIRE}))   AS cost
             FROM tbl_RentalInward r
            GROUP BY r.supplierName
            ORDER BY SUM(COALESCE(r.dayRate, 0) * (${DAYS_ON_HIRE})) DESC`, []),
        query(
          `SELECT COALESCE(NULLIF(LTRIM(RTRIM(r.jobId)), ''), '(no job)') AS jobId,
                  COUNT(*)                                        AS tools,
                  SUM(${DAYS_ON_HIRE})                            AS days,
                  SUM(COALESCE(r.dayRate, 0) * (${DAYS_ON_HIRE})) AS cost
             FROM tbl_RentalInward r
            GROUP BY COALESCE(NULLIF(LTRIM(RTRIM(r.jobId)), ''), '(no job)')
            ORDER BY SUM(COALESCE(r.dayRate, 0) * (${DAYS_ON_HIRE})) DESC`, []),
        query(
          `SELECT COUNT(*) AS tools,
                  SUM(CASE WHEN r.status = 'On Hire' THEN 1 ELSE 0 END)      AS onHire,
                  SUM(CASE WHEN r.status = 'Lost in Hole' THEN 1 ELSE 0 END) AS lostInHole,
                  SUM(CASE WHEN r.dayRate IS NULL THEN 1 ELSE 0 END)         AS noRate,
                  SUM(COALESCE(r.dayRate, 0) * (${DAYS_ON_HIRE}))            AS cost
             FROM tbl_RentalInward r`, []),
      ])
      return jsonResponse(context, 200, {
        bySupplier: bySupplier.recordset,
        byJob:      byJob.recordset,
        totals:     totals.recordset[0] || {},
      })
    }

    // ── GET list ───────────────────────────────────────────────────────────
    if (method === 'GET' && !id) {
      const search = (qs.search || '').trim()
      const status = (qs.status || '').trim()
      const r = await query(
        `SELECT r.*, ${DAYS_ON_HIRE} AS daysOnHire,
                COALESCE(r.dayRate, 0) * (${DAYS_ON_HIRE}) AS costToDate
           FROM tbl_RentalInward r
          WHERE (@q IS NULL OR r.supplierName LIKE @q OR r.assetNo LIKE @q
                 OR r.oemSerial LIKE @q OR r.rentalRef LIKE @q OR r.shortDesc LIKE @q)
            AND (@s IS NULL OR r.status = @s)
          ORDER BY r.dateIn DESC, r.id DESC`,
        [
          { name: 'q', type: sql.NVarChar, value: search ? `%${search}%` : null },
          { name: 's', type: sql.NVarChar, value: status || null },
        ]
      )
      return jsonResponse(context, 200, r.recordset)
    }

    // ── GET one ────────────────────────────────────────────────────────────
    if (method === 'GET' && id && !sub) {
      const r = await query(
        `SELECT r.*, ${DAYS_ON_HIRE} AS daysOnHire,
                COALESCE(r.dayRate, 0) * (${DAYS_ON_HIRE}) AS costToDate
           FROM tbl_RentalInward r WHERE r.id = @id`,
        [{ name: 'id', type: sql.Int, value: Number(id) }]
      )
      if (!r.recordset.length) return jsonResponse(context, 404, { error: 'Not found' })
      return jsonResponse(context, 200, r.recordset[0])
    }

    // ── POST take on hire ──────────────────────────────────────────────────
    if (method === 'POST' && !id) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const b = req.body || {}
      const supplier = String(b.supplierName || '').trim()
      if (!supplier)  return jsonResponse(context, 400, { error: 'Supplier is required' })
      if (!b.dateIn)  return jsonResponse(context, 400, { error: 'Date in is required' })

      const assetNo = String(b.assetNo || '').trim()
      const toStock = b.addToInventory !== false && !!assetNo

      // Checked before the hire is written, so a clash does not leave a
      // record claiming an inventory link it never made.
      if (toStock) {
        const clash = await query(
          `SELECT TOP 1 SystemID FROM tbl_Inventory WHERE SystemID = @a OR AssetNo = @a`,
          [{ name: 'a', type: sql.VarChar, value: assetNo }]
        )
        if (clash.recordset.length)
          return jsonResponse(context, 409, {
            error: `${assetNo} is already in inventory. Use a different number, or untick "add to inventory".`,
          })
      }

      const r = await query(
        `INSERT INTO tbl_RentalInward
           (rentalRef, supplierName, poNumber, assetNo, shortDesc, size,
            oemSerial, jobId, dateIn, expectedOut, dayRate, currency,
            status, notes, createdBy)
         OUTPUT INSERTED.id
         VALUES (@ref, @sup, @po, @asset, @desc, @size, @serial, @job,
                 @in, @exp, @rate, @cur, 'On Hire', @notes, @by)`,
        [
          { name: 'ref',    type: sql.NVarChar, value: b.rentalRef || null },
          { name: 'sup',    type: sql.NVarChar, value: supplier },
          { name: 'po',     type: sql.NVarChar, value: b.poNumber || null },
          { name: 'asset',  type: sql.NVarChar, value: assetNo || null },
          { name: 'desc',   type: sql.NVarChar, value: b.shortDesc || null },
          { name: 'size',   type: sql.NVarChar, value: b.size || null },
          { name: 'serial', type: sql.NVarChar, value: b.oemSerial || null },
          { name: 'job',    type: sql.NVarChar, value: b.jobId || null },
          { name: 'in',     type: sql.Date,     value: new Date(b.dateIn) },
          { name: 'exp',    type: sql.Date,     value: b.expectedOut ? new Date(b.expectedOut) : null },
          { name: 'rate',   type: sql.Decimal(18, 2), value: b.dayRate == null || b.dayRate === '' ? null : Number(b.dayRate) },
          { name: 'cur',    type: sql.NVarChar, value: b.currency || null },
          { name: 'notes',  type: sql.NVarChar, value: b.notes || null },
          { name: 'by',     type: sql.NVarChar, value: user.Username || null },
        ]
      )
      const newId = r.recordset[0].id

      if (toStock) {
        await query(
          `INSERT INTO tbl_Inventory
             (SystemID, AssetNo, Size, ShortDesc, Qty, Location, Status,
              Ownership, IsEmdad, OEMSerial, Supplier, ItemType, AddedDate, AddedBy)
           VALUES (@id, @asset, @size, @desc, 1, 'Emdad Base', 'Good',
                   'Rented', 0, @serial, @sup, 'Asset', CAST(GETDATE() AS date), @by)`,
          [
            { name: 'id',     type: sql.VarChar, value: assetNo },
            { name: 'asset',  type: sql.VarChar, value: assetNo },
            { name: 'size',   type: sql.VarChar, value: b.size || null },
            { name: 'desc',   type: sql.VarChar, value: (b.shortDesc || '').slice(0, 150) || 'RENTED TOOL' },
            { name: 'serial', type: sql.VarChar, value: b.oemSerial || null },
            { name: 'sup',    type: sql.VarChar, value: supplier },
            { name: 'by',     type: sql.VarChar, value: user.Username || null },
          ]
        )
        await query(`UPDATE tbl_RentalInward SET systemId = @a WHERE id = @id`,
          [{ name: 'id', type: sql.Int, value: newId },
           { name: 'a',  type: sql.NVarChar, value: assetNo }])
      }

      return jsonResponse(context, 201, { id: newId, addedToInventory: toStock })
    }

    // ── PUT edit ───────────────────────────────────────────────────────────
    if (method === 'PUT' && id && !sub) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const b = req.body || {}
      await query(
        `UPDATE tbl_RentalInward
            SET rentalRef = @ref, supplierName = @sup, poNumber = @po,
                shortDesc = @desc, size = @size, oemSerial = @serial,
                jobId = @job, dateIn = @in, expectedOut = @exp,
                dayRate = @rate, currency = @cur, status = @status,
                notes = @notes, updatedAt = GETDATE()
          WHERE id = @id`,
        [
          { name: 'id',     type: sql.Int,      value: Number(id) },
          { name: 'ref',    type: sql.NVarChar, value: b.rentalRef || null },
          { name: 'sup',    type: sql.NVarChar, value: b.supplierName || null },
          { name: 'po',     type: sql.NVarChar, value: b.poNumber || null },
          { name: 'desc',   type: sql.NVarChar, value: b.shortDesc || null },
          { name: 'size',   type: sql.NVarChar, value: b.size || null },
          { name: 'serial', type: sql.NVarChar, value: b.oemSerial || null },
          { name: 'job',    type: sql.NVarChar, value: b.jobId || null },
          { name: 'in',     type: sql.Date,     value: b.dateIn ? new Date(b.dateIn) : null },
          { name: 'exp',    type: sql.Date,     value: b.expectedOut ? new Date(b.expectedOut) : null },
          { name: 'rate',   type: sql.Decimal(18, 2), value: b.dayRate == null || b.dayRate === '' ? null : Number(b.dayRate) },
          { name: 'cur',    type: sql.NVarChar, value: b.currency || null },
          { name: 'status', type: sql.NVarChar, value: b.status || 'On Hire' },
          { name: 'notes',  type: sql.NVarChar, value: b.notes || null },
        ]
      )
      return jsonResponse(context, 200, { ok: true })
    }

    // ── POST return ────────────────────────────────────────────────────────
    if (method === 'POST' && id && sub === 'return') {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const b = req.body || {}
      const cur = await query(`SELECT * FROM tbl_RentalInward WHERE id = @id`,
        [{ name: 'id', type: sql.Int, value: Number(id) }])
      const row = cur.recordset[0]
      if (!row) return jsonResponse(context, 404, { error: 'Not found' })
      if (row.dateOut) return jsonResponse(context, 409, { error: 'This hire is already closed' })

      const dateOut = b.dateOut ? new Date(b.dateOut) : new Date()
      if (new Date(row.dateIn) > dateOut)
        return jsonResponse(context, 400, { error: 'The return date is before the date it arrived' })

      const status = b.status || 'Returned'
      await query(
        `UPDATE tbl_RentalInward
            SET dateOut = @out, status = @s, notes = COALESCE(@notes, notes),
                updatedAt = GETDATE()
          WHERE id = @id`,
        [
          { name: 'id',    type: sql.Int,  value: Number(id) },
          { name: 'out',   type: sql.Date, value: dateOut },
          { name: 's',     type: sql.NVarChar, value: status },
          { name: 'notes', type: sql.NVarChar, value: b.notes || null },
        ]
      )

      // A returned tool is no longer ours to send out. Marked rather than
      // deleted, so a ticket that already carries it still resolves.
      if (row.systemId) {
        await query(
          `UPDATE tbl_Inventory
              SET Status = @st, Location = @loc, LastUpdated = GETDATE(), LastUpdatedBy = @by
            WHERE SystemID = @sid`,
          [
            { name: 'sid', type: sql.VarChar, value: row.systemId },
            { name: 'st',  type: sql.VarChar, value: status === 'Lost in Hole' ? 'Lost in Hole' : 'Returned to Supplier' },
            { name: 'loc', type: sql.VarChar, value: status === 'Lost in Hole' ? null : row.supplierName },
            { name: 'by',  type: sql.VarChar, value: user.Username || null },
          ]
        )
      }
      return jsonResponse(context, 200, { ok: true, status })
    }

    // ── DELETE ─────────────────────────────────────────────────────────────
    if (method === 'DELETE' && id && !sub) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Insufficient permissions' })

      const cur = await query(`SELECT systemId FROM tbl_RentalInward WHERE id = @id`,
        [{ name: 'id', type: sql.Int, value: Number(id) }])
      if (!cur.recordset.length) return jsonResponse(context, 404, { error: 'Not found' })
      if (cur.recordset[0].systemId)
        return jsonResponse(context, 409, {
          error: 'This hire created an inventory record. Return it instead of deleting it.',
        })

      await query(`DELETE FROM tbl_RentalInward WHERE id = @id`,
        [{ name: 'id', type: sql.Int, value: Number(id) }])
      return jsonResponse(context, 200, { ok: true })
    }

    return jsonResponse(context, 405, { error: 'Method not allowed' })
  } catch (err) {
    context.log.error('Rental inward error:', err)
    return jsonResponse(context, 500, { error: 'Rental inward operation failed', detail: err.message })
  }
}
