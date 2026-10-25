/**
 * Shared Azure SQL connection pool.
 * Credentials come ONLY from environment variables — never hardcoded.
 */
const sql = require('mssql')

const config = {
  server:   process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  user:     process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  options: {
    encrypt:                true,
    trustServerCertificate: false,
    enableArithAbort:       true,
  },
  pool: {
    max:              10,
    min:              0,
    idleTimeoutMillis: 30000,
  },
}

/** Singleton pool — reused across function invocations in the same worker */
let _pool = null

async function getPool() {
  if (_pool && _pool.connected) return _pool
  _pool = await sql.connect(config)
  return _pool
}

/**
 * Run a parameterised query.
 * @param {string} queryText  - SQL with @param placeholders
 * @param {Array}  params     - [{ name, type, value }]
 * @returns {Promise<sql.IResult>}
 */
async function query(queryText, params = []) {
  const pool    = await getPool()
  const request = pool.request()
  for (const { name, type, value } of params) {
    request.input(name, type, value)
  }
  return request.query(queryText)
}

/**
 * Standard JSON response helper for Azure Functions.
 */
function jsonResponse(context, statusCode, body) {
  context.res = {
    status:  statusCode,
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  }
}

/**
 * Parse and verify JWT from Authorization header.
 * Returns decoded payload or null.
 */
function verifyToken(req, context) {
  const jwt = require('jsonwebtoken')
  const header = req.headers['authorization'] || ''
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    if (context) context.log.warn('verifyToken: no token in Authorization header')
    return null
  }
  const secret = process.env.JWT_SECRET || 'tt-secret-key-change-in-prod'
  try {
    return jwt.verify(token, secret)
  } catch (err) {
    if (context) context.log.error('verifyToken FAILED:', err.message, '| secretSource:', process.env.JWT_SECRET ? 'env' : 'fallback', '| secretLen:', secret.length, '| tokenLen:', token.length)
    return null
  }
}

/**
 * Middleware-style auth check. Returns user payload or sends 401.
 */
function requireAuth(context, req) {
  const user = verifyToken(req, context)
  if (!user) {
    jsonResponse(context, 401, { error: 'Unauthorized' })
    return null
  }
  return user
}

module.exports = { sql, getPool, query, jsonResponse, verifyToken, requireAuth }
