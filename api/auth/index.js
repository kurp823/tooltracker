/**
 * POST /api/auth  — Login
 * POST /api/auth/change-password — Change password (alias for users endpoint)
 */
const { sql, query, jsonResponse } = require('../db')
const bcrypt = require('bcryptjs')
const jwt    = require('jsonwebtoken')

// Read live on every request — NOT cached at module scope. Azure Functions
// reuses warm worker processes across invocations, so a module-level
// constant here would keep signing tokens with whatever JWT_SECRET value
// was in effect the moment this worker last cold-started. That silently
// diverges from db.js's verifyToken(), which already reads
// process.env.JWT_SECRET fresh on every call — any settings change or
// scale-out event would otherwise produce tokens signed with one secret
// and verified against another, with every login rejected until all warm
// instances happened to recycle.
const JWT_EXPIRES = '12h'

module.exports = async function (context, req) {
  const method = req.method.toUpperCase()

  // ── POST /api/auth  (login) ──────────────────────────────────────────────
  if (method === 'POST') {
    const { username, password } = req.body || {}

    if (!username || !password) {
      return jsonResponse(context, 400, { error: 'Username and password required' })
    }

    try {
      const result = await query(
        `SELECT UserID, Username, FullName, Role, Password,
                MustChangePassword, Active
         FROM   tbl_Users
         WHERE  Username = @u`,
        [{ name: 'u', type: sql.NVarChar, value: username }]
      )

      const user = result.recordset[0]

      if (!user || !user.Active) {
        return jsonResponse(context, 401, { error: 'Invalid username or password' })
      }

      // Compare password — supports both bcrypt hashes and plain text (legacy)
      let passwordOk = false
      if (user.Password && user.Password.startsWith('$2')) {
        passwordOk = await bcrypt.compare(password, user.Password)
      } else {
        // Legacy plain-text comparison (migrate on first login)
        passwordOk = user.Password === password
        if (passwordOk) {
          const newHash = await bcrypt.hash(password, 12)
          await query(
            `UPDATE tbl_Users SET Password = @h WHERE UserID = @id`,
            [
              { name: 'h',  type: sql.NVarChar, value: newHash },
              { name: 'id', type: sql.Int,      value: user.UserID },
            ]
          )
        }
      }

      if (!passwordOk) {
        return jsonResponse(context, 401, { error: 'Invalid username or password' })
      }

      // Update last login
      await query(
        `UPDATE tbl_Users SET LastLogin = GETDATE() WHERE UserID = @id`,
        [{ name: 'id', type: sql.Int, value: user.UserID }]
      )

      const payload = {
        UserID:   user.UserID,
        Username: user.Username,
        FullName: user.FullName,
        Role:     user.Role,
        MustChangePassword: !!user.MustChangePassword,
      }

      const token = jwt.sign(
        payload,
        process.env.JWT_SECRET || 'tt-secret-key-change-in-prod',
        { expiresIn: JWT_EXPIRES }
      )

      // DEBUG: Verify the token we just signed to confirm round-trip works
      let _debugVerify = 'untested'
      try {
        jwt.verify(token, process.env.JWT_SECRET || 'tt-secret-key-change-in-prod')
        _debugVerify = 'ok'
      } catch (e) {
        _debugVerify = 'FAIL:' + e.message
      }

      return jsonResponse(context, 200, { user: payload, token, _debugVerify, _secretLen: (process.env.JWT_SECRET || 'tt-secret-key-change-in-prod').length })
    } catch (err) {
      context.log.error('Login error:', err)
      return jsonResponse(context, 500, { error: 'Server error during login' })
    }
  }

  jsonResponse(context, 405, { error: 'Method not allowed' })
}
