/**
 * GET /api/health
 * Minimal liveness check — confirms the Functions host is up.
 * No database access, no auth, no schema or data exposure.
 *
 * The previous version of this endpoint supported ?tables= and ?probe=
 * modes used during the schema/data audit (see PRs #74-#83). That audit
 * is complete and those modes have been removed since they exposed raw
 * DB structure and content with no authentication.
 */
module.exports = async function (context, req) {
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  }
}
