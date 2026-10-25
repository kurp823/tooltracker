/**
 * GET /api/health — Diagnostic endpoint (no auth required)
 * Tests JWT sign+verify round-trip server-side.
 * Also does a full login+verify test to check cross-function consistency.
 * TEMPORARY — remove after debugging.
 */
const { sql, query: dbQuery } = require('../db')
const bcrypt = require('bcryptjs')

module.exports = async function (context, req) {
  const jwt = require('jsonwebtoken')

  const secret = process.env.JWT_SECRET || 'tt-secret-key-change-in-prod'
  const secretSource = process.env.JWT_SECRET ? 'env' : 'fallback'
  const secretLen = secret.length

  // Self-test: sign then verify
  let selfToken, selfVerified, selfVerifyErr
  try {
    selfToken = jwt.sign({ test: true, ts: Date.now() }, secret, { expiresIn: '1m' })
  } catch (e) {
    selfToken = null
  }
  if (selfToken) {
    try {
      selfVerified = jwt.verify(selfToken, secret)
      selfVerifyErr = null
    } catch (e) {
      selfVerified = null
      selfVerifyErr = e.message
    }
  }

  // Full login simulation: query the DB for admin user, sign token same as auth/index.js
  let loginTest = null
  try {
    const result = await dbQuery(
      `SELECT TOP 1 UserID, Username, FullName, Role, Password, Active
       FROM tbl_Users WHERE Active = 1`,
      []
    )
    const user = result.recordset[0]
    if (user) {
      const payload = {
        UserID: user.UserID,
        Username: user.Username,
        FullName: user.FullName,
        Role: user.Role,
        MustChangePassword: false,
      }
      // Sign exactly as auth/index.js does
      const loginToken = jwt.sign(
        payload,
        process.env.JWT_SECRET || 'tt-secret-key-change-in-prod',
        { expiresIn: '12h' }
      )
      // Verify exactly as db.js does
      let verifyResult = null
      try {
        const decoded = jwt.verify(loginToken, process.env.JWT_SECRET || 'tt-secret-key-change-in-prod')
        verifyResult = { ok: true, username: decoded.Username }
      } catch (e) {
        verifyResult = { ok: false, error: e.message }
      }
      loginTest = {
        userFound: user.Username,
        tokenSigned: !!loginToken,
        tokenLen: loginToken.length,
        verifyResult
      }
    } else {
      loginTest = { userFound: null }
    }
  } catch (e) {
    loginTest = { dbError: e.message }
  }

  // Test incoming token via query param (for browser testing without custom headers)
  let incomingResult = null
  const incomingToken = (req.query && req.query.token) || null
  if (incomingToken) {
    try {
      const decoded = jwt.verify(incomingToken, secret)
      incomingResult = { ok: true, payload: { Username: decoded.Username, Role: decoded.Role } }
    } catch (e) {
      incomingResult = { ok: false, error: e.message }
    }
  }

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'ok',
      secretSource,
      secretLen,
      selfTestSign: !!selfToken,
      selfTestVerify: selfVerified ? true : false,
      selfTestVerifyErr: selfVerifyErr,
      loginTest,
      incomingTokenProvided: !!incomingToken,
      incomingResult,
      nodeVersion: process.version,
      timestamp: new Date().toISOString()
    })
  }
}
