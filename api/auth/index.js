/**
 * POST /api/auth  — Login
 * POST /api/auth/change-password — Change password (alias for users endpoint)
 */
const { sql, query, jsonResponse } = require('../db')
const bcrypt = require('bcryptjs')
const jwt    = require('jsonwebtoken')

// Hardcoded secret shared between auth (sign) and db.js (verify).
// Using a single constant eliminates cross-instance env-var drift that
// was causing 401 bounce-backs after every login.
const JWT_SECRET  = 'tt-secret-key-change-in-prod'
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

      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES })

      return jsonResponse(context, 200, { user: payload, token })
    } catch (err) {
      context.log.error('Login error:', err)
      return jsonResponse(context, 500, { error: 'Server error during login' })
    }
  }

  jsonResponse(context, 405, { error: 'Method not allowed' })
}
