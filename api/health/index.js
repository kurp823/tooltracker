/**
 * GET /api/health
 * Minimal liveness check — confirms the Functions host is up.
 * No database access, no auth, no schema or data exposure.
 *
 * GET /api/health?probe=dtlines-assetno-check
 * TEMPORARY, one-shot re-add: verifies the new LEFT JOIN tbl_Inventory
 * resolution added in PR #85 actually resolves AssetNo correctly against
 * the live DB for DT-26-3427 (Job-26-01830). Remove again right after use.
 */
const { query: dbQuery } = require('../db')

const PROBES = {
  'dtlines-assetno-check': `SELECT TOP 10 l.id, l.dtNumber, l.itemNo, l.serial AS SerialNumber,
         COALESCE(i.AssetNo, l.serial) AS AssetNo, l.toolDescription, l.remarks
         FROM tbl_DeliveryTicketLines l
         LEFT JOIN tbl_Inventory i ON i.SystemID = l.serial
         WHERE l.dtNumber = 'DT-26-3427'
         ORDER BY l.itemNo`,
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
        results[name] = { ok: true, rowCount: r.recordset.length, rows: r.recordset.slice(0, 15) }
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
