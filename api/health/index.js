/**
 * GET /api/health — Tests if Azure SWA platform blocks Authorization header
 * TEMPORARY — remove after debugging.
 */
const { query: dbQuery } = require('../db')

module.exports = async function (context, req) {
  const jwt = require('jsonwebtoken')
  const SECRET = 'tt-secret-key-change-in-prod'

  // Sign a token for a real user
  let token = null
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
    }
  } catch (e) {
    return context.res = { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message }) }
  }

  const host = req.headers['host']
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const base = proto + '://' + host

  // Test 1: dashboard WITHOUT token (should get 401 from OUR code with body)
  let test1 = null
  try {
    const r = await fetch(base + '/api/dashboard/stats')
    test1 = { status: r.status, body: await r.text(), label: 'no-token' }
  } catch (e) { test1 = { error: e.message } }

  // Test 2: dashboard WITH token (the one that fails)
  let test2 = null
  try {
    const r = await fetch(base + '/api/dashboard/stats', {
      headers: { 'Authorization': 'Bearer ' + token }
    })
    test2 = { status: r.status, body: await r.text(), label: 'with-token' }
  } catch (e) { test2 = { error: e.message } }

  // Test 3: dashboard debug=headers WITH token (bypasses auth)
  let test3 = null
  try {
    const r = await fetch(base + '/api/dashboard/stats?debug=headers', {
      headers: { 'Authorization': 'Bearer ' + token }
    })
    test3 = { status: r.status, body: await r.text(), label: 'debug-headers' }
  } catch (e) { test3 = { error: e.message } }

  // Test 4: health endpoint itself with token (different function, should work)
  let test4 = null
  try {
    const r = await fetch(base + '/api/health?selftest=1', {
      headers: { 'Authorization': 'Bearer ' + token }
    })
    test4 = { status: r.status, bodyLen: (await r.text()).length, label: 'health-with-token' }
  } catch (e) { test4 = { error: e.message } }

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ test1, test2, test3, test4, tokenLen: token ? token.length : 0 })
  }
}
