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
  // IMPORTANT: Azure Static Web Apps overwrites the Authorization header on
  // requests to its managed Functions with its OWN platform token (claims:
  // nbf/exp/iat/iss/aud only). Our app token never reached the function, and
  // because that platform token still decodes to a valid object, auth
  // "passed" while user.Role was undefined — so every role check returned 403
  // for even an Admin user. We therefore read our token from a custom header
  // that SWA passes through untouched, and fall back to Authorization for
  // non-SWA hosts / local dev.
  const pick = (name) => req.headers[name] || req.headers[name.toLowerCase()] || ''
  const raw = pick('x-auth-token') || pick('authorization')
  if (!raw) return null
  const token = String(raw).replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  // The signature MUST be verified. A previous workaround fell back to
  // jwt.decode() when verification failed, which accepts any unsigned token —
  // meaning anyone could mint themselves a Role:'Admin' session. That bypass
  // existed because logins were failing, but the real cause was the header
  // overwrite handled above (the token never arrived), not a bad signature.
  //
  // Fail closed if no secret is configured: the old `|| 'tt-secret-key-...'`
  // default is committed to the repo, so using it would let anyone who can
  // read the repo sign valid admin tokens.
  const secret = process.env.JWT_SECRET
  if (!secret) {
    console.error('JWT_SECRET is not configured — refusing to authenticate')
    return null
  }

  let decoded = null
  try {
    decoded = jwt.verify(token, secret)
  } catch {
    return null
  }
  if (!decoded || typeof decoded !== 'object') return null

  const user = decoded

  // Reject anything that isn't one of OUR app tokens — e.g. the Azure SWA
  // platform token, which decodes fine but carries no identity. Treating it as
  // authenticated is what produced role-less sessions and blanket 403s.
  if (user.UserID == null && user.Username == null && user.Role == null) return null

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
