/**
 * GET /api/health — Diagnostic endpoint (no auth required)
 * Tests JWT sign+verify round-trip server-side.
 * TEMPORARY — remove after debugging.
 */
module.exports = async function (context, req) {
  const jwt = require('jsonwebtoken')

  const secret = process.env.JWT_SECRET || 'tt-secret-key-change-in-prod'
  const secretSource = process.env.JWT_SECRET ? 'env' : 'fallback'
  const secretLen = secret.length

  // Sign a test payload
  let token, verified, verifyErr
  try {
    token = jwt.sign({ test: true, ts: Date.now() }, secret, { expiresIn: '1m' })
  } catch (e) {
    token = null
  }

  // Verify the same token we just signed
  if (token) {
    try {
      verified = jwt.verify(token, secret)
      verifyErr = null
    } catch (e) {
      verified = null
      verifyErr = e.message
    }
  }

  // Also test verifying an incoming token if one is provided
  let incomingResult = null
  const authHeader = req.headers['authorization'] || ''
  const incomingToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (incomingToken) {
    try {
      const decoded = jwt.verify(incomingToken, secret)
      incomingResult = { ok: true, payload: decoded }
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
      selfTestSign: !!token,
      selfTestVerify: verified ? true : false,
      selfTestVerifyErr: verifyErr,
      incomingTokenProvided: !!incomingToken,
      incomingResult,
      nodeVersion: process.version,
      timestamp: new Date().toISOString()
    })
  }
}
