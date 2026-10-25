/**
 * GET /api/health
 * Minimal liveness check — confirms the Functions host is up.
 * No database access, no auth, no schema or data exposure.
 *
 * GET /api/health?probe=job-status-distinct
 * TEMPORARY, one-shot re-add: checks the real distinct Status values
 * stored in tbl_Jobs, since the Jobs screen's status filter dropdown
 * (Open/Active/Completed/Cancelled/On Hold) returns 0 results for
 * 'Active' against 3824 jobs. Remove again right after use.
 */
const { query: dbQuery } = require('../db')

const PROBES = {
  'job-status-distinct': `SELECT Status, COUNT(*) AS n FROM tbl_Jobs GROUP BY Status ORDER BY n DESC`,
}

module.exports = async function (context, req) {
  if (req.query.probe) {
    const names = req.query.probe.split(',')
    const results = {}
    for (const name of names) {
      const sqlText = PROBES[name]
      if (!sqlText) { results[name] = 'UNKNOWN_PROBE'; continue }
      try {
        const r = await dbQuery(sqlText, [])
        results[name] = { ok: true, rowCount: r.recordset.length, rows: r.recordset.slice(0, 20) }
      } catch (e) {
        results[name] = { ok: false, error: e.message }
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
