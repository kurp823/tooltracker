/**
 * POST /api/auth  — Login
 * POST /api/auth/change-password — Change password (alias for users endpoint)
 */
const { sql, query, jsonResponse } = require('../db')
const bcrypt = require('bcryptjs')
const jwt    = require('jsonwebtoken')

// The signing secret comes ONLY from the environment — never hardcoded.
// A hardcoded constant lived here previously, which meant tokens were signed
// with a value committed to this repo while db.js verified against
// process.env.JWT_SECRET. The two never matched, which is the real source of
// the "JWT secret mismatch" 401s (not cross-instance env drift) and what led
// to signature verification being bypassed entirely. A repo-visible signing
// key also lets anyone mint their own Role:'Admin' token.
const JWT_SECRET  = process.env.JWT_SECRET
const JWT_EXPIRES = '12h'

module.exports = async function (context, req) {
  const method = req.method.toUpperCase()
  const action = context.bindingData.action

  // Fail closed rather than falling back to a guessable key.
  if (!JWT_SECRET) {
    context.log.error('JWT_SECRET is not configured — cannot issue tokens')
    return jsonResponse(context, 500, { error: 'Server auth is not configured' })
  }

  // ── POST /api/auth/activate  (first-time enrollment) ─────────────────────
  // The user proves ownership with the one-time activation code the admin
  // issued, and sets their own password in the same step. The code only works
  // while MustChangePassword = 1, so it is strictly single-use: once a real
  // password is set the same code can never be replayed.
  if (method === 'POST' && action === 'activate') {
    const { username, code, newPassword } = req.body || {}

    if (!username || !code || !newPassword) {
      return jsonResponse(context, 400, { error: 'Username, activation code and new password are required' })
    }
    if (String(newPassword).length < 8) {
      return jsonResponse(context, 400, { error: 'Password must be at least 8 characters' })
    }

    try {
      const result = await query(
        `SELECT UserID, Username, FullName, Role, Password,
                MustChangePassword, Active
         FROM   tbl_Users
         WHERE  Username = @u`,
        [{ name: 'u', type: sql.NVarChar, value: username }]
      )
      const u = result.recordset[0]

      // One generic message for every failure mode, so this endpoint can't be
      // used to discover which usernames exist or are pending activation.
      const reject = () =>
        jsonResponse(context, 401, { error: 'Invalid username or activation code' })

      if (!u || !u.Active) return reject()
      if (!u.MustChangePassword) return reject()   // already activated
      if (!u.Password) return reject()

      // Accept the code however it's typed — "7k4p29qx", "7K4P-29QX",
      // "7k4p 29qx" all normalize to the canonical stored form.
      const canonical = (() => {
        const s = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '')
        return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : s
      })()

      const codeOk = u.Password.startsWith('$2')
        ? await bcrypt.compare(canonical, u.Password)
        : u.Password === canonical
      if (!codeOk) return reject()

      const newHash = await bcrypt.hash(newPassword, 12)
      await query(
        `UPDATE tbl_Users
            SET Password = @h, MustChangePassword = 0, LastLogin = GETDATE()
          WHERE UserID = @id`,
        [
          { name: 'h',  type: sql.NVarChar, value: newHash },
          { name: 'id', type: sql.Int,      value: u.UserID },
        ]
      )

      const payload = {
        UserID:   u.UserID,
        Username: u.Username,
        FullName: u.FullName,
        Role:     u.Role,
        MustChangePassword: false,
      }
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES })
      return jsonResponse(context, 200, { user: payload, token })
    } catch (err) {
      context.log.error('Activation error:', err)
      return jsonResponse(context, 500, { error: 'Activation failed' })
    }
  }

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
