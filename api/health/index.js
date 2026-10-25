/**
 * GET /api/health
 * Minimal liveness check — confirms the Functions host is up.
 * No database access, no auth, no schema or data exposure.
 *
 * The schema/data audit and the PR #85 AssetNo-join verification are both
 * complete (see PRs #74-#87). The temporary ?tables= / ?probe= diagnostic
 * modes have been removed since they exposed raw DB structure and content
 * with no authentication.
 */
module.exports = async function (context, req) {
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true })
  }
}
