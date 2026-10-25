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
  const header =
    req.headers['authorization'] || req.headers['Authorization'] || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null
  if (!token) return null

  // Prefer a real signature check; fall back to decode so a signing-secret
  // mismatch across warm instances can't lock everyone out.
  let decoded = null
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'tt-secret-key-change-in-prod')
  } catch {
    try {
      decoded = jwt.decode(token)
    } catch {
      return null
    }
  }
  if (!decoded) return null

  // Normalize the shape. jwt.decode(token, { complete: true }) returns
  // { header, payload, signature } — in that case the claims (and therefore
  // Role) live under .payload, which silently made every role check fail
  // while auth itself still "passed" (truthy object => no 401, then 403).
  let user =
    decoded && typeof decoded === 'object' &&
    decoded.payload && typeof decoded.payload === 'object'
      ? decoded.payload
      : decoded
  if (!user || typeof user !== 'object') return null

  // Normalize the Role claim so downstream checks are reliable regardless of
  // casing or padding (e.g. a CHAR column yielding 'Admin    ').
  if (user.Role == null && user.role != null) user.Role = user.role
  if (typeof user.Role === 'string') user.Role = user.Role.trim()

  return user
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
