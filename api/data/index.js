'use strict'
const { sql, query, jsonResponse, requireAuth, safe, audit } = require('../db')

/**
 * Administration → Data Editor. Admin only.
 *
 *   GET  /api/data                      tables the editor may open (tbl_* only) with row counts
 *   GET  /api/data/{table}              columns (name, type, nullable, identity, pk) + row count
 *   GET  /api/data/{table}/rows?q=&page=&size=&sort=&dir=
 *                                       one page of rows; q searches every text column
 *   PUT  /api/data/{table}/rows         { key: {pk: value}, set: {col: value} } — one row, audited
 *   POST /api/data/{table}/rows         { rows: [{col: value}] } — insert, audited (no update, no delete)
 *
 * Every identifier is checked against INFORMATION_SCHEMA before it is put in a
 * statement, and every value travels as a parameter. Tables outside tbl_* (the
 * bk_ backups, import staging, audit log, users) are not offered. There is no
 * delete: a wrong row is corrected, or flagged, never removed from here.
 */

// Retired old-app tables (schema review 24 Oct: batches, vendor orders, work
// orders, documents, job costs) are empty and unused; kept out of the editor.
const RETIRED = ['tbl_DTBatches', 'tbl_DTBatchLines', 'tbl_RTBatches', 'tbl_RTBatchLines', 'tbl_VendorOrders', 'tbl_VendorOrderLines',
  'tbl_WorkOrders', 'tbl_Documents', 'tbl_JobCosts', 'tbl_Callouts', 'tbl_CalloutItems', 'tbl_CalloutSerials']
const HIDDEN = new Set(['tbl_AuditLog', 'tbl_Users', 'tbl_ImportDTRT', 'tbl_ImportDTRTResolved', 'tbl_AppSettings', ...RETIRED])
const PAGE_MAX = 500

const isTable = n => /^tbl_[A-Za-z0-9_]+$/.test(n) && !HIDDEN.has(n)
const q = n => `[${String(n).replace(/]/g, ']]')}]`

async function columnsOf(table) {
  const cols = await query(
    `SELECT c.COLUMN_NAME AS name, c.DATA_TYPE AS type, c.CHARACTER_MAXIMUM_LENGTH AS len,
            c.IS_NULLABLE AS nullable, c.ORDINAL_POSITION AS pos,
            COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsIdentity') AS isIdentity,
            COLUMNPROPERTY(OBJECT_ID(c.TABLE_SCHEMA + '.' + c.TABLE_NAME), c.COLUMN_NAME, 'IsComputed') AS isComputed,
            CASE WHEN c.COLUMN_DEFAULT IS NULL THEN 0 ELSE 1 END AS hasDefault,
            CASE WHEN k.COLUMN_NAME IS NULL THEN 0 ELSE 1 END AS isPk
       FROM INFORMATION_SCHEMA.COLUMNS c
       LEFT JOIN (SELECT ku.TABLE_NAME, ku.COLUMN_NAME
                    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                    JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                      ON ku.CONSTRAINT_NAME = tc.CONSTRAINT_NAME AND ku.TABLE_NAME = tc.TABLE_NAME
                   WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY') k
         ON k.TABLE_NAME = c.TABLE_NAME AND k.COLUMN_NAME = c.COLUMN_NAME
      WHERE c.TABLE_NAME = @t
      ORDER BY c.ORDINAL_POSITION`,
    [{ name: 't', type: sql.NVarChar, value: table }])
  return cols.recordset.map(c => ({
    name: c.name, type: c.type, len: c.len, nullable: c.nullable === 'YES',
    identity: !!c.isIdentity, computed: !!c.isComputed, pk: !!c.isPk, hasDefault: !!c.hasDefault,
  }))
}

const TEXT = new Set(['varchar', 'nvarchar', 'char', 'nchar', 'text', 'ntext'])
const INTS = new Set(['int', 'bigint', 'smallint', 'tinyint'])
const DECS = new Set(['decimal', 'numeric', 'money', 'smallmoney', 'float', 'real'])
const DATES = new Set(['date', 'datetime', 'datetime2', 'smalldatetime'])

// A JS value as a typed mssql parameter for the column it is going into.
function param(name, col, v) {
  if (v === '' || v === undefined) v = null
  const t = col.type
  if (v === null) return { name, type: TEXT.has(t) ? sql.NVarChar : INTS.has(t) ? sql.BigInt : DECS.has(t) ? sql.Float : DATES.has(t) ? sql.DateTime : t === 'bit' ? sql.Bit : sql.NVarChar, value: null }
  if (INTS.has(t)) { const n = Number(v); if (!Number.isInteger(n)) throw new Error(`${col.name}: '${v}' is not a whole number`); return { name, type: sql.BigInt, value: n } }
  if (DECS.has(t)) { const n = Number(String(v).replace(/,/g, '')); if (!Number.isFinite(n)) throw new Error(`${col.name}: '${v}' is not a number`); return { name, type: sql.Float, value: n } }
  if (DATES.has(t)) { const d = new Date(v); if (isNaN(d.getTime())) throw new Error(`${col.name}: '${v}' is not a date`); return { name, type: t === 'date' ? sql.Date : sql.DateTime, value: d } }
  if (t === 'bit') { const s = String(v).trim().toLowerCase(); return { name, type: sql.Bit, value: ['1', 'true', 'yes', 'y'].includes(s) ? 1 : 0 } }
  if (t === 'uniqueidentifier') return { name, type: sql.UniqueIdentifier, value: String(v) }
  return { name, type: sql.NVarChar(sql.MAX), value: String(v) }
}

module.exports = safe(async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  if (user.Role !== 'Admin') return jsonResponse(context, 403, { error: 'Admin only' })

  const method = (req.method || 'GET').toUpperCase()
  const table = req.params && req.params.table
  const sub = req.params && req.params.sub
  const qs = req.query || {}
  const body = req.body || {}

  // ── GET /data ── tables the editor may open
  if (method === 'GET' && !table) {
    const r = await query(
      `SELECT t.name, SUM(p.rows) AS rows_,
              (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_NAME = t.name) AS cols
         FROM sys.tables t JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
        WHERE t.name LIKE 'tbl[_]%'
        GROUP BY t.name ORDER BY t.name`, [])
    return jsonResponse(context, 200, r.recordset.filter(x => isTable(x.name)).map(x => ({ name: x.name, rows: Number(x.rows_), cols: Number(x.cols) })))
  }

  if (!isTable(table)) return jsonResponse(context, 404, { error: `Table ${table} is not available in the editor` })
  const cols = await columnsOf(table)
  if (!cols.length) return jsonResponse(context, 404, { error: `Table ${table} does not exist` })
  const byName = Object.fromEntries(cols.map(c => [c.name, c]))
  const pks = cols.filter(c => c.pk).map(c => c.name)

  // ── GET /data/{table} ── structure
  if (method === 'GET' && !sub) {
    const n = await query(`SELECT COUNT(*) AS n FROM ${q(table)}`, [])
    return jsonResponse(context, 200, { table, rows: n.recordset[0].n, pk: pks, columns: cols })
  }

  if (sub !== 'rows') return jsonResponse(context, 404, { error: 'Not found' })

  // ── GET /data/{table}/rows ── one page
  if (method === 'GET') {
    let size = parseInt(qs.size, 10); if (!Number.isFinite(size) || size <= 0) size = 100; size = Math.min(size, PAGE_MAX)
    let page = parseInt(qs.page, 10); if (!Number.isFinite(page) || page < 1) page = 1
    const sort = byName[qs.sort] ? qs.sort : (pks[0] || cols[0].name)
    const dir = String(qs.dir || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC'
    const params = []
    const conds = []
    const term = String(qs.q || '').trim()
    if (term) {
      const textCols = cols.filter(c => TEXT.has(c.type) || INTS.has(c.type) || DECS.has(c.type)).map(c => c.name)
      params.push({ name: 'q', type: sql.NVarChar, value: `%${term}%` })
      conds.push('(' + textCols.map(c => `CAST(${q(c)} AS nvarchar(400)) LIKE @q`).join(' OR ') + ')')
    }
    // Optional exact filter on one column: ?col=Name&val=Value
    if (qs.col && byName[qs.col]) {
      params.push(param('fv', byName[qs.col], qs.val))
      conds.push(params[params.length - 1].value === null ? `${q(qs.col)} IS NULL` : `${q(qs.col)} = @fv`)
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
    const total = await query(`SELECT COUNT(*) AS n FROM ${q(table)} ${where}`, params)
    const rows = await query(
      `SELECT * FROM ${q(table)} ${where} ORDER BY ${q(sort)} ${dir}
        OFFSET ${(page - 1) * size} ROWS FETCH NEXT ${size} ROWS ONLY`, params)
    return jsonResponse(context, 200, { page, size, total: total.recordset[0].n, sort, dir, rows: rows.recordset })
  }

  // ── PUT /data/{table}/rows ── change one row
  if (method === 'PUT') {
    if (!pks.length) return jsonResponse(context, 400, { error: `${table} has no primary key; rows cannot be edited safely here` })
    const key = body.key || {}, set = body.set || {}
    for (const k of pks) if (key[k] === undefined || key[k] === null || key[k] === '') return jsonResponse(context, 400, { error: `Key column ${k} is required` })
    const setCols = Object.keys(set).filter(c => byName[c] && !byName[c].identity && !byName[c].computed && !byName[c].pk)
    if (!setCols.length) return jsonResponse(context, 400, { error: 'Nothing to change' })
    let params
    try {
      params = [...pks.map((k, i) => param(`k${i}`, byName[k], key[k])), ...setCols.map((c, i) => param(`s${i}`, byName[c], set[c]))]
    } catch (e) { return jsonResponse(context, 400, { error: e.message }) }
    const whereKey = pks.map((k, i) => `${q(k)} = @k${i}`).join(' AND ')
    const before = await query(`SELECT ${setCols.map(q).join(', ')} FROM ${q(table)} WHERE ${whereKey}`, params.slice(0, pks.length))
    if (!before.recordset.length) return jsonResponse(context, 404, { error: 'Row not found' })
    const r = await query(`UPDATE ${q(table)} SET ${setCols.map((c, i) => `${q(c)} = @s${i}`).join(', ')} WHERE ${whereKey}`, params)
    await audit(user, 'data:' + table, pks.map(k => key[k]).join('|'), 'edit-row', { before: before.recordset[0], after: set })
    return jsonResponse(context, 200, { updated: r.rowsAffected[0] })
  }

  // ── POST /data/{table}/rows ── insert rows
  if (method === 'POST') {
    const rows = Array.isArray(body.rows) ? body.rows : []
    if (!rows.length) return jsonResponse(context, 400, { error: 'No rows' })
    if (rows.length > 2000) return jsonResponse(context, 400, { error: 'At most 2,000 rows per import' })
    const insertable = cols.filter(c => !c.identity && !c.computed && !/^(timestamp|rowversion)$/i.test(c.type))
    const used = insertable.filter(c => rows.some(r => r[c.name] !== undefined && r[c.name] !== ''))
    if (!used.length) return jsonResponse(context, 400, { error: 'No column in the sheet matches this table' })
    // A NOT NULL column with a default (rowver, CreatedDate GETDATE()) does not need a value; only ask for the ones with no default.
    const required = insertable.filter(c => !c.nullable && !used.includes(c) && !c.hasDefault)
    if (required.length) return jsonResponse(context, 400, { error: `Required column(s) missing: ${required.map(c => c.name).join(', ')}` })
    let inserted = 0
    const errors = []
    for (let i = 0; i < rows.length; i++) {
      try {
        const params = used.map((c, j) => param(`v${j}`, c, rows[i][c.name]))
        await query(`INSERT INTO ${q(table)} (${used.map(c => q(c.name)).join(', ')}) VALUES (${used.map((_, j) => `@v${j}`).join(', ')})`, params)
        inserted++
      } catch (e) {
        errors.push({ row: i + 1, error: e.message })
        if (errors.length >= 25) break
      }
    }
    await audit(user, 'data:' + table, 'import', 'import-rows', { inserted, failed: errors.length, columns: used.map(c => c.name) })
    return jsonResponse(context, errors.length && !inserted ? 400 : 200, { inserted, failed: errors.length, errors })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
})
