/**
 * GET /api/health
 * Minimal liveness check — confirms the Functions host is up.
 * No database access, no auth, no schema or data exposure.
 */
module.exports = async function (context, req) {
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  }
}
