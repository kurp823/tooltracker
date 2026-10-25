/**
 * GET /api/health — Full end-to-end diagnostic
 * 1. Signs a token (same as auth/index.js)
 * 2. Verifies it in-process (same as db.js)
 * 3. Calls POST /api/auth via HTTP (real network path)
 * 4. Calls GET /api/dashboard/stats with that token via HTTP
 * Reports everything. TEMPORARY — remove after debugging.
 */
const { sql, query: dbQuery } = require('../db')

module.exports = async function (context, req) {
  const jwt = require('jsonwebtoken')
  const secret = 'tt-secret-key-change-in-prod'

  // 1. In-process sign+verify
  let inProcessTest = 'untested'
  try {
    const t = jwt.sign({ test: true }, secret, { expiresIn: '1m' })
    jwt.verify(t, secret)
    inProcessTest = 'ok'
  } catch (e) {
    inProcessTest = 'FAIL:' + e.message
  }

  // 2. Full HTTP round-trip: login then dashboard
  const host = req.headers['host'] || 'polite-tree-0c9507d00.2.azurestaticapps.net'
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const baseUrl = proto + '://' + host

  let httpLoginStatus = null, httpLoginBody = null
  let httpDashStatus = null, httpDashBody = null
  let tokenFromLogin = null

  try {
    // Call POST /api/auth
    const loginResp = await fetch(baseUrl + '/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ravi', password: req.query.p || '' })
    })
    httpLoginStatus = loginResp.status
    const loginText = await loginResp.text()
    try {
      const parsed = JSON.parse(loginText)
      httpLoginBody = {
        hasToken: !!parsed.token,
        tokenLen: parsed.token ? parsed.token.length : 0,
        user: parsed.user ? parsed.user.Username : null
      }
      tokenFromLogin = parsed.token || null
    } catch (e) {
      httpLoginBody = { raw: loginText.substring(0, 200) }
    }

    // Call GET /api/dashboard/stats with the token
    if (tokenFromLogin) {
      // First verify the token ourselves
      let localVerify = 'untested'
      try {
        jwt.verify(tokenFromLogin, secret)
        localVerify = 'ok'
      } catch (e) {
        localVerify = 'FAIL:' + e.message
      }

      const dashResp = await fetch(baseUrl + '/api/dashboard/stats', {
        headers: { 'Authorization': 'Bearer ' + tokenFromLogin }
      })
      httpDashStatus = dashResp.status
      const dashText = await dashResp.text()
      httpDashBody = dashText.substring(0, 500)

      httpLoginBody.localVerifyOfToken = localVerify
    }
  } catch (e) {
    httpLoginBody = { fetchError: e.message }
  }

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inProcessTest,
      httpLoginStatus,
      httpLoginBody,
      httpDashStatus,
      httpDashBody,
      timestamp: new Date().toISOString()
    })
  }
}
