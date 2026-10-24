/**
 * Users API
 * GET    /api/users                  — list users (Admin only)
 * POST   /api/users                  — create user (Admin only)
 * PUT    /api/users/{id}             — update user (Admin only)
 * POST   /api/users/change-password  — change own password
 */
const { sql, query, jsonResponse, requireAuth } = require('../db')
const bcrypt = require('bcryptjs')

module.exports = async function (context, req) {
  const user   = requireAuth(context, req)
  if (!user) return

  const method = req.method.toUpperCase()
  const id     = context.bindingData.id   // numeric user ID or 'change-password'

  // ── POST /api/users/change-password ───────────────────────────────────────
  if (method === 'POST' && id === 'change-password') {
    const { userId, currentPassword, newPassword } = req.body || {}
    if (!currentPassword || !newPassword || newPassword.length < 8)
      return jsonResponse(context, 400, { error: 'Invalid request' })

    // Users can only change their own password; Admin can change anyone's
    if (user.Role !== 'Admin' && user.UserID !== parseInt(userId))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    try {
      const result = await query(
        `SELECT PasswordHash FROM tbl_Users WHERE UserID = @id`,
        [{ name: 'id', type: sql.Int, value: parseInt(userId) }]
      )
      if (!result.recordset.length)
        return jsonResponse(context, 404, { error: 'User not found' })

      const { PasswordHash } = result.recordset[0]
      let ok = false
      if (PasswordHash && PasswordHash.startsWith('$2')) {
        ok = await bcrypt.compare(currentPassword, PasswordHash)
      } else {
        ok = PasswordHash === currentPassword
      }
      if (!ok && user.Role !== 'Admin')
        return jsonResponse(context, 401, { error: 'Current password is incorrect' })

      const newHash = await bcrypt.hash(newPassword, 12)
      await query(
        `UPDATE tbl_Users SET PasswordHash = @h, MustChangePassword = 0 WHERE UserID = @id`,
        [
          { name: 'h',  type: sql.NVarChar, value: newHash },
          { name: 'id', type: sql.Int,      value: parseInt(userId) },
        ]
      )
      return jsonResponse(context, 200, { success: true })
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to change password' })
    }
  }

  // ── GET /api/users  (Admin only) ──────────────────────────────────────────
  if (method === 'GET' && !id) {
    if (user.Role !== 'Admin')
      return jsonResponse(context, 403, { error: 'Admin only' })
    try {
      const result = await query(
        `SELECT UserID, Username, FullName, Role, IsActive,
                MustChangePassword, LastLogin, CreatedDate
         FROM   tbl_Users
         ORDER  BY FullName`
      )
      return jsonResponse(context, 200, result.recordset)
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to load users' })
    }
  }

  // ── POST /api/users  (create) ─────────────────────────────────────────────
  if (method === 'POST' && !id) {
    if (user.Role !== 'Admin')
      return jsonResponse(context, 403, { error: 'Admin only' })
    const b = req.body || {}
    if (!b.Username || !b.FullName || !b.Role || !b.Password)
      return jsonResponse(context, 400, { error: 'Username, FullName, Role, Password required' })
    try {
      const hash = await bcrypt.hash(b.Password, 12)
      await query(
        `INSERT INTO tbl_Users (Username, PasswordHash, FullName, Role, IsActive, MustChangePassword, CreatedDate)
         VALUES (@u, @h, @fn, @role, 1, 1, GETDATE())`,
        [
          { name: 'u',    type: sql.NVarChar, value: b.Username },
          { name: 'h',    type: sql.NVarChar, value: hash },
          { name: 'fn',   type: sql.NVarChar, value: b.FullName },
          { name: 'role', type: sql.NVarChar, value: b.Role },
        ]
      )
      return jsonResponse(context, 201, { success: true })
    } catch (err) {
      if (err.number === 2627)
        return jsonResponse(context, 409, { error: 'Username already exists' })
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to create user' })
    }
  }

  // ── PUT /api/users/{id}  (update) ─────────────────────────────────────────
  if (method === 'PUT' && id && id !== 'change-password') {
    if (user.Role !== 'Admin')
      return jsonResponse(context, 403, { error: 'Admin only' })
    const b = req.body || {}
    try {
      await query(
        `UPDATE tbl_Users SET FullName = @fn, Role = @role, IsActive = @active
         WHERE  UserID = @id`,
        [
          { name: 'fn',     type: sql.NVarChar, value: b.FullName },
          { name: 'role',   type: sql.NVarChar, value: b.Role },
          { name: 'active', type: sql.Bit,      value: b.IsActive ? 1 : 0 },
          { name: 'id',     type: sql.Int,      value: parseInt(id) },
        ]
      )
      // Optional: reset password
      if (b.NewPassword) {
        const hash = await bcrypt.hash(b.NewPassword, 12)
        await query(
          `UPDATE tbl_Users SET PasswordHash = @h, MustChangePassword = 1 WHERE UserID = @id`,
          [
            { name: 'h',  type: sql.NVarChar, value: hash },
            { name: 'id', type: sql.Int,      value: parseInt(id) },
          ]
        )
      }
      return jsonResponse(context, 200, { success: true })
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to update user' })
    }
  }

  jsonResponse(context, 405, { error: 'Method not allowed' })
}
