'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

/**
 * Dropdown values, held in the database so a user can add one without a
 * code change and a deploy.
 *
 *   GET    /api/lists                 every list, grouped by name
 *   GET    /api/lists/{listName}      one list's values
 *   POST   /api/lists                 add a value      (Admin)
 *   PUT    /api/lists/{listId}        edit a value     (Admin)
 *   DELETE /api/lists/{listId}        hide a value     (Admin)
 *
 * tbl_Lists columns:
 *   ListID, ListName, Value, Label, SortOrder, ActiveFlag, IsSystem,
 *   Notes, UpdatedAt, UpdatedBy
 *
 * ── IsSystem ────────────────────────────────────────────────────────────
 * Some values are not just labels - the code branches on them. 'USED'
 * routes a returned tool to the Inspection Bay; 'Completed' locks a job;
 * 'Monthly' switches on rollover. Renaming one of those silently breaks
 * the behaviour behind it, with nothing to show the user why, so a system
 * value's Value cannot be changed and it cannot be deleted. Its label,
 * order and notes are free to edit, and it can be hidden from the
 * dropdown if it is not wanted.
 *
 * A value is never physically deleted. Hiding keeps rows that already
 * carry it readable - a ticket recorded as 'Workshop' two years ago still
 * has to display as 'Workshop' after someone stops offering that choice.
 */

const ADMIN_ONLY = ['Admin']

/** The shape the UI consumes. */
const shape = (r) => ({
  listId:    r.ListID,
  listName:  r.ListName,
  value:     r.Value,
  label:     r.Label || r.Value,
  sortOrder: r.SortOrder,
  active:    !!r.ActiveFlag,
  isSystem:  !!r.IsSystem,
  notes:     r.Notes || null,
})

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const id     = context.bindingData.id
  const method = req.method.toUpperCase()
  const qs     = req.query || {}

  // Hidden values are excluded by default so dropdowns show only what is
  // on offer. The Settings screen passes all=1 to manage them.
  const includeInactive = String(qs.all || '') === '1'

  // ── GET ──────────────────────────────────────────────────────────────────
  if (method === 'GET') {
    // `id` here is a list NAME, not a number - /api/lists/JobStatus
    const r = await query(
      `SELECT ListID, ListName, Value, Label, SortOrder, ActiveFlag,
              IsSystem, Notes
         FROM tbl_Lists
        WHERE (@name IS NULL OR ListName = @name)
          AND (@all = 1 OR ActiveFlag = 1)
        ORDER BY ListName, SortOrder, Value`,
      [
        { name: 'name', value: id || null },
        { name: 'all',  value: includeInactive ? 1 : 0 },
      ]
    )

    if (id) return jsonResponse(context, 200, r.recordset.map(shape))

    // Grouped, so the app fetches every dropdown in one call rather than
    // one request per list.
    const out = {}
    for (const row of r.recordset) {
      if (!out[row.ListName]) out[row.ListName] = []
      out[row.ListName].push(shape(row))
    }
    return jsonResponse(context, 200, out)
  }

  // ── POST add a value ─────────────────────────────────────────────────────
  if (!id && method === 'POST') {
    if (!ADMIN_ONLY.includes(user.Role))
      return jsonResponse(context, 403, { error: 'Admin only' })

    const b = req.body || {}
    const listName = String(b.ListName || '').trim()
    const value    = String(b.Value    || '').trim()
    if (!listName || !value)
      return jsonResponse(context, 400, { error: 'ListName and Value are required' })

    const dup = await query(
      `SELECT ListID, ActiveFlag FROM tbl_Lists
        WHERE ListName = @name AND Value = @value`,
      [{ name: 'name', value: listName }, { name: 'value', value }]
    )
    if (dup.recordset.length) {
      const existing = dup.recordset[0]
      // Re-adding something that was hidden should bring it back rather
      // than fail with a duplicate error the user cannot act on.
      if (!existing.ActiveFlag) {
        await query(
          `UPDATE tbl_Lists SET ActiveFlag = 1, UpdatedAt = GETDATE(), UpdatedBy = @who
            WHERE ListID = @id`,
          [{ name: 'id', value: existing.ListID },
           { name: 'who', value: user.Username || String(user.UserID || '') }]
        )
        return jsonResponse(context, 200, { ListID: existing.ListID, restored: true })
      }
      return jsonResponse(context, 409, { error: `'${value}' is already in ${listName}` })
    }

    const r = await query(
      `INSERT INTO tbl_Lists (ListName, Value, Label, SortOrder, ActiveFlag,
                              IsSystem, Notes, UpdatedAt, UpdatedBy)
       OUTPUT INSERTED.ListID
       VALUES (@name, @value, @label, @sort, 1, 0, @notes, GETDATE(), @who)`,
      [
        { name: 'name',  value: listName },
        { name: 'value', value },
        { name: 'label', value: b.Label ? String(b.Label).trim() : null },
        { name: 'sort',  value: b.SortOrder != null ? Number(b.SortOrder) : 999 },
        { name: 'notes', value: b.Notes ? String(b.Notes).slice(0, 300) : null },
        { name: 'who',   value: user.Username || String(user.UserID || '') },
      ]
    )
    return jsonResponse(context, 201, { ListID: r.recordset[0].ListID })
  }

  // ── PUT edit a value ─────────────────────────────────────────────────────
  if (id && method === 'PUT') {
    if (!ADMIN_ONLY.includes(user.Role))
      return jsonResponse(context, 403, { error: 'Admin only' })

    const listId = Number(id)
    if (!Number.isInteger(listId))
      return jsonResponse(context, 400, { error: 'Expected a list id' })

    const cur = await query(
      `SELECT ListID, ListName, Value, IsSystem FROM tbl_Lists WHERE ListID = @id`,
      [{ name: 'id', value: listId }]
    )
    const row = cur.recordset[0]
    if (!row) return jsonResponse(context, 404, { error: 'Not found' })

    const b = req.body || {}
    const newValue = b.Value != null ? String(b.Value).trim() : row.Value

    if (row.IsSystem && newValue !== row.Value)
      return jsonResponse(context, 409, {
        error: `'${row.Value}' is used by the app's own logic, so its value cannot be renamed. ` +
               `You can change its label, its order, or hide it.`,
      })

    if (!newValue)
      return jsonResponse(context, 400, { error: 'Value cannot be empty' })

    if (newValue !== row.Value) {
      const dup = await query(
        `SELECT ListID FROM tbl_Lists
          WHERE ListName = @name AND Value = @value AND ListID <> @id`,
        [{ name: 'name', value: row.ListName },
         { name: 'value', value: newValue },
         { name: 'id', value: listId }]
      )
      if (dup.recordset.length)
        return jsonResponse(context, 409, { error: `'${newValue}' is already in ${row.ListName}` })
    }

    await query(
      `UPDATE tbl_Lists
          SET Value      = @value,
              Label      = @label,
              SortOrder  = COALESCE(@sort, SortOrder),
              ActiveFlag = COALESCE(@active, ActiveFlag),
              Notes      = @notes,
              UpdatedAt  = GETDATE(),
              UpdatedBy  = @who
        WHERE ListID = @id`,
      [
        { name: 'id',     value: listId },
        { name: 'value',  value: newValue },
        { name: 'label',  value: b.Label != null ? String(b.Label).trim() || null : null },
        { name: 'sort',   value: b.SortOrder != null ? Number(b.SortOrder) : null },
        { name: 'active', value: b.ActiveFlag != null ? (b.ActiveFlag ? 1 : 0) : null },
        { name: 'notes',  value: b.Notes != null ? String(b.Notes).slice(0, 300) || null : null },
        { name: 'who',    value: user.Username || String(user.UserID || '') },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  // ── DELETE hides a value ─────────────────────────────────────────────────
  if (id && method === 'DELETE') {
    if (!ADMIN_ONLY.includes(user.Role))
      return jsonResponse(context, 403, { error: 'Admin only' })

    const listId = Number(id)
    if (!Number.isInteger(listId))
      return jsonResponse(context, 400, { error: 'Expected a list id' })

    const cur = await query(
      `SELECT ListID, Value, IsSystem FROM tbl_Lists WHERE ListID = @id`,
      [{ name: 'id', value: listId }]
    )
    const row = cur.recordset[0]
    if (!row) return jsonResponse(context, 404, { error: 'Not found' })

    if (row.IsSystem)
      return jsonResponse(context, 409, {
        error: `'${row.Value}' is used by the app's own logic and cannot be removed. ` +
               `You can hide it from the dropdown instead.`,
      })

    // Hidden, not deleted - records already carrying this value must still
    // display it.
    await query(
      `UPDATE tbl_Lists SET ActiveFlag = 0, UpdatedAt = GETDATE(), UpdatedBy = @who
        WHERE ListID = @id`,
      [{ name: 'id', value: listId },
       { name: 'who', value: user.Username || String(user.UserID || '') }]
    )
    return jsonResponse(context, 200, { ok: true, hidden: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
