'use strict'
const { sql, query, jsonResponse, requireAuth, safe } = require('../db')
const { ensureLines } = require('../sub-lines')

/**
 * What we pay a sub-contractor for a hired-in tool on one job.
 *
 *   GET /api/sub-settlement?jobId=…   the settlement lines of a job
 *   PUT /api/sub-settlement           set one line (a blank rate removes it)
 *
 * How a hire is charged is agreed each time - by the day, by the month or as a
 * lump sum - and the days paid can differ from the days billed to the client.
 * So nothing is derived from the tool or the supplier. One line holds what was
 * agreed for one tool on one job: basis, quantity, rate. The amount is
 * quantity x rate, worked out here, so every screen reads the same figure.
 *
 * A lump sum is quantity 1 at the agreed amount.
 */

const VIEWERS = ['Admin', 'Operations', 'Billing', 'Finance', 'CostController', 'Executive']
const EDITORS = ['Admin', 'Billing', 'Finance', 'CostController']

module.exports = safe(async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  if (!VIEWERS.includes(user.Role)) return jsonResponse(context, 403, { error: 'Forbidden' })
  await ensureLines()
  const method = req.method.toUpperCase()

  if (method === 'GET') {
    const jobId = String((req.query || {}).jobId || '').trim()
    if (!jobId) return jsonResponse(context, 400, { error: 'jobId is required' })
    const r = await query(
      `SELECT jobId, toolSerial, supplierName, basis, qty, rate, currency, notes
         FROM tbl_SubContractLines WHERE jobId = @j`,
      [{ name: 'j', type: sql.NVarChar, value: jobId }])
    return jsonResponse(context, 200, r.recordset)
  }

  if (method === 'PUT') {
    if (!EDITORS.includes(user.Role))
      return jsonResponse(context, 403, { error: 'Only Admin, Billing, Finance or Cost Control can set what we pay a sub-contractor' })
    const b = req.body || {}
    const jobId = String(b.jobId || '').trim()
    const tool = String(b.toolSerial || '').trim()
    if (!jobId || !tool) return jsonResponse(context, 400, { error: 'Job and tool are required' })

    // A blank rate clears the line.
    if (b.rate === '' || b.rate == null) {
      await query(`DELETE FROM tbl_SubContractLines WHERE jobId = @j AND toolSerial = @t`,
        [{ name: 'j', type: sql.NVarChar, value: jobId }, { name: 't', type: sql.NVarChar, value: tool }])
      return jsonResponse(context, 200, { ok: true, cleared: true })
    }

    const rate = Number(b.rate)
    const basis = String(b.basis || '').trim()
    if (!basis) return jsonResponse(context, 400, { error: 'Choose how this hire is charged' })
    if (!(rate >= 0)) return jsonResponse(context, 400, { error: 'The rate must be a number' })
    // Quantity is only stored when someone agreed something other than the days billed
    // (8 days paid when 10 were billed, 0.5 of a month). Blank follows the days marked.
    const qty = b.qty === '' || b.qty == null ? null : Number(b.qty)
    if (qty != null && !(qty >= 0)) return jsonResponse(context, 400, { error: 'The quantity must be a number' })
    const amount = /lump/i.test(basis) ? rate : (qty == null ? null : Math.round(qty * rate * 100) / 100)

    await query(
      `MERGE tbl_SubContractLines AS t
        USING (SELECT @j AS jobId, @t AS toolSerial) AS s
           ON t.jobId = s.jobId AND t.toolSerial = s.toolSerial
        WHEN MATCHED THEN UPDATE SET supplierName = @sup, basis = @basis, qty = @qty, rate = @rate,
             amount = @amt, currency = @cur, notes = @notes, updatedBy = @by, updatedAt = GETDATE()
        WHEN NOT MATCHED THEN INSERT (jobId, toolSerial, supplierName, basis, qty, rate, amount, currency, notes, updatedBy)
             VALUES (@j, @t, @sup, @basis, @qty, @rate, @amt, @cur, @notes, @by);`,
      [
        { name: 'j',     type: sql.NVarChar, value: jobId },
        { name: 't',     type: sql.NVarChar, value: tool },
        { name: 'sup',   type: sql.NVarChar, value: b.supplierName ? String(b.supplierName) : null },
        { name: 'basis', type: sql.NVarChar, value: basis },
        { name: 'qty',   type: sql.Decimal(18, 3), value: qty },
        { name: 'rate',  type: sql.Decimal(18, 2), value: rate },
        { name: 'amt',   type: sql.Decimal(18, 2), value: amount },
        { name: 'cur',   type: sql.NVarChar, value: b.currency ? String(b.currency) : null },
        { name: 'notes', type: sql.NVarChar, value: b.notes ? String(b.notes) : null },
        { name: 'by',    type: sql.NVarChar, value: user.Username || null },
      ])
    return jsonResponse(context, 200, { ok: true })
  }
  return jsonResponse(context, 405, { error: 'Method not allowed' })
})
