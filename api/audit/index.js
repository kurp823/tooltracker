'use strict'
const { sql, query, jsonResponse, requireAuth, safe } = require('../db')

/**
 * GET /api/audit?entity=&id=&who=&from=&to=&top=
 * The change history written by audit() in db.js. Admin, Finance and Billing
 * can read everything; other roles can read the history of one entity they
 * are looking at (entity + id required).
 */
const FULL = ['Admin', 'Finance', 'Billing', 'CostController', 'Executive']

module.exports = safe(async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  const qs = req.query || {}
  if (!FULL.includes(user.Role) && !(qs.entity && qs.id))
    return jsonResponse(context, 403, { error: 'Forbidden' })
  const exists = await query(`SELECT OBJECT_ID('dbo.tbl_AuditLog') AS o`, [])
  if (!exists.recordset[0].o) return jsonResponse(context, 200, [])

  const conds = [], params = []
  if (qs.entity) { conds.push('entity = @e'); params.push({ name: 'e', type: sql.NVarChar, value: qs.entity }) }
  if (qs.id)     { conds.push('entityId = @i'); params.push({ name: 'i', type: sql.NVarChar, value: qs.id }) }
  if (qs.who)    { conds.push('who = @w'); params.push({ name: 'w', type: sql.NVarChar, value: qs.who }) }
  if (qs.from)   { conds.push('at >= @f'); params.push({ name: 'f', type: sql.DateTime, value: new Date(qs.from) }) }
  if (qs.to)     { conds.push('at < DATEADD(day, 1, @t)'); params.push({ name: 't', type: sql.DateTime, value: new Date(qs.to) }) }
  if (qs.search) { conds.push('(entityId LIKE @q OR action LIKE @q OR detail LIKE @q)'); params.push({ name: 'q', type: sql.NVarChar, value: `%${qs.search}%` }) }
  let top = parseInt(qs.top, 10); if (!Number.isFinite(top) || top <= 0) top = 500
  const r = await query(
    `SELECT TOP (${Math.min(top, 5000)}) id, at, who, role, entity, entityId, action, detail
       FROM tbl_AuditLog ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''} ORDER BY at DESC, id DESC`, params)
  return jsonResponse(context, 200, r.recordset)
})
