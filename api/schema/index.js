'use strict'
const { sql, query, jsonResponse, requireAuth } = require('../db')

/**
 * GET /api/schema            — every table with its row count
 * GET /api/schema?table=X    — columns for table X (plus its row count)
 * GET /api/schema?tables=A,B — columns for several tables at once
 *
 * Admin only. This exists because the live schema has drifted from what
 * several endpoints assume, and discovering that one failed column per
 * deploy is unworkable. It reads INFORMATION_SCHEMA only — never row data —
 * so it exposes structure and counts, not records.
 */
module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  if (user.Role !== 'Admin') {
    return jsonResponse(context, 403, { error: 'Admin only' })
  }

  const qs = req.query || {}
  const wanted = (qs.tables || qs.table || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  try {
    if (wanted.length) {
      const out = {}
      for (const t of wanted) {
        const cols = await query(
          `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
             FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = @t
            ORDER BY ORDINAL_POSITION`,
          [{ name: 't', type: sql.NVarChar, value: t }]
        )
        if (!cols.recordset.length) { out[t] = { exists: false }; continue }

        let rows = null
        try {
          // Table name can't be parameterised; it is validated against
          // INFORMATION_SCHEMA above and bracket-quoted, so only a real
          // existing table name can reach here.
          const safe = t.replace(/]/g, ']]')
          const c = await query(`SELECT COUNT(*) AS n FROM [${safe}]`)
          rows = c.recordset[0].n
        } catch { /* count is best-effort */ }

        out[t] = {
          exists: true,
          rowCount: rows,
          columns: cols.recordset.map(c =>
            `${c.COLUMN_NAME} ${c.DATA_TYPE}${c.CHARACTER_MAXIMUM_LENGTH ? `(${c.CHARACTER_MAXIMUM_LENGTH})` : ''}${c.IS_NULLABLE === 'YES' ? '' : ' NOT NULL'}`
          ),
        }
      }
      return jsonResponse(context, 200, out)
    }

    // No table specified: list every table with its row count, so we can see
    // at a glance which ones actually hold data.
    const tables = await query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME`
    )
    const counts = await query(
      `SELECT t.name AS TableName, SUM(p.rows) AS ApproxRows
         FROM sys.tables t
         JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
        GROUP BY t.name
        ORDER BY t.name`
    )
    const countMap = {}
    for (const r of counts.recordset) countMap[r.TableName] = Number(r.ApproxRows)

    return jsonResponse(context, 200, {
      tableCount: tables.recordset.length,
      tables: tables.recordset.map(r => ({
        name: r.TABLE_NAME,
        rows: countMap[r.TABLE_NAME] ?? null,
      })),
    })
  } catch (err) {
    context.log.error('Schema inspect error:', err)
    return jsonResponse(context, 500, { error: 'Failed to read schema', detail: err.message })
  }
}
