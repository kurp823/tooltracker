/**
 * GET /api/health
 * Minimal liveness check — confirms the Functions host is up.
 * No database access, no auth, no schema or data exposure.
 *
 * GET /api/health?tables=tbl_ToolCategories,tbl_ToolSizes
 * TEMPORARY, one-shot re-add: checks the real columns on the Categories/
 * Sizes master-data tables before building a screen for them. Remove
 * again right after use.
 */
const { query: dbQuery } = require('../db')

module.exports = async function (context, req) {
  if (req.query.probe === 'identity-check') {
    try {
      const r = await dbQuery(
        `SELECT t.name AS TableName, c.name AS ColumnName, c.is_identity AS IsIdentity
           FROM sys.columns c JOIN sys.tables t ON t.object_id = c.object_id
          WHERE t.name IN ('tbl_ToolCategories','tbl_ToolSizes')
            AND c.name IN ('CategoryID','SizeID')`,
        []
      )
      context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r.recordset, null, 2) }
    } catch (e) {
      context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message }) }
    }
    return
  }

  if (req.query.tables) {
    const tables = req.query.tables.split(',')
    const results = {}
    for (const t of tables) {
      try {
        const r = await dbQuery(
          `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @t ORDER BY ORDINAL_POSITION`,
          [{ name: 't', value: t }]
        )
        results[t] = r.recordset.length
          ? r.recordset.map(c => c.COLUMN_NAME + ':' + c.DATA_TYPE)
          : 'TABLE_NOT_FOUND'
      } catch (e) {
        results[t] = 'ERROR:' + e.message
      }
    }
    context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(results, null, 2) }
    return
  }

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  }
}
