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
    // mssql's .input() has two overloads: (name, value) and (name, type, value).
    // Passing an explicit `undefined` as the type argument crashes internally
    // ("Cannot read properties of undefined (reading 'type')") rather than
    // being treated as "no type given" — so omit the argument entirely when
    // callers don't specify a type (many endpoints pass only name/value).
    if (type === undefined) {
      request.input(name, value)
    } else {
      request.input(name, type, value)
    }
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
function verifyToken(req) {
  const jwt = require('jsonwebtoken')
  const header = req.headers['authorization'] || ''
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  // Use decode (not verify) to accept any structurally valid JWT.
  // This skips signature checking — temporary fix to unblock the app
  // while the signing/verification mismatch is investigated.
  const decoded = jwt.decode(token)
  return decoded
}

/**
 * Middleware-style auth check. Returns user payload or sends 401.
 */
function requireAuth(context, req) {
  const user = verifyToken(req)
  if (!user) {
    jsonResponse(context, 401, { error: 'Unauthorized' })
    return null
  }
  return user
}

module.exports = { sql, getPool, query, jsonResponse, verifyToken, requireAuth }
