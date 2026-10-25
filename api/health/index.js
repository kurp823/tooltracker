/**
 * GET /api/health — Full end-to-end diagnostic (no credentials needed)
 * Signs a token server-side, then calls dashboard/stats via HTTP with it.
 * TEMPORARY — remove after debugging.
 */
const { query: dbQuery } = require('../db')

module.exports = async function (context, req) {
  const jwt = require('jsonwebtoken')
  const SECRET = 'tt-secret-key-change-in-prod'

  // Step 1: Get a real user from DB and sign a token
  let token = null, signInfo = null
  try {
    const result = await dbQuery(
      'SELECT TOP 1 UserID, Username, FullName, Role FROM tbl_Users WHERE Active = 1', []
    )
    const u = result.recordset[0]
    if (u) {
      token = jwt.sign(
        { UserID: u.UserID, Username: u.Username, FullName: u.FullName, Role: u.Role, MustChangePassword: false },
        SECRET, { expiresIn: '12h' }
      )
      signInfo = { user: u.Username, tokenLen: token.length }
    }
  } catch (e) {
    signInfo = { error: e.message }
  }

  // Step 2: Verify the token locally (should always work)
  let localVerify = null
  if (token) {
    try {
      const d = jwt.verify(token, SECRET)
      localVerify = { ok: true, username: d.Username }
    } catch (e) {
      localVerify = { ok: false, error: e.message }
    }
  }

  // Step 3: Call dashboard/stats via HTTP with the token
  let httpDash = null
  if (token) {
    const host = req.headers['host']
    const proto = req.headers['x-forwarded-proto'] || 'https'
    const url = proto + '://' + host + '/api/dashboard/stats'
    try {
      const resp = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + token }
      })
      const body = await resp.text()
      httpDash = { status: resp.status, body: body.substring(0, 500) }
    } catch (e) {
      httpDash = { fetchError: e.message }
    }
  }

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signInfo, localVerify, httpDash, ts: new Date().toISOString() })
  }
}
