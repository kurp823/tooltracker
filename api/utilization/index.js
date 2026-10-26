'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

/**
 * GET  /api/utilization?year=YYYY&month=MM[&jobId=Job-XXX-NNNNN]
 *   Returns { rows: [ { label, jobId, toolId, days: { 1: { code:'1', logId:N }, ... } } ] }
 *   StatusType: '1' = Operations, 'S' = Standby
 *
 * POST /api/utilization
 *   Body: { JobID, ToolID? (serial text), LogDate, UtilizationCode }
 *
 * PUT  /api/utilization/:id
 *   Body: { UtilizationCode }
 *
 * DELETE /api/utilization/:id
 *
 * Real tbl_DailyFieldLogs columns (confirmed via INFORMATION_SCHEMA):
 *   LogID, JobID, DTNumber, ToolSerial, LogDate, StatusType, RateCharged, CreatedDate
 * (No ToolID/UtilizationCode/PersonnelID columns — those don't exist.
 * ToolSerial is a free-text serial, not a numeric FK to tbl_Inventory.SystemID.)
 */
module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const id     = context.bindingData.id
  const method = req.method.toUpperCase()
  const qs     = req.query

  // ── GET calendar data ────────────────────────────────────────────────────
  if (!id && method === 'GET') {
    const year  = parseInt(qs.year  || new Date().getFullYear(), 10)
    const month = parseInt(qs.month || (new Date().getMonth() + 1), 10)
    const jobId = qs.jobId || null

    const result = await query(
      `SELECT d.LogID, d.JobID, d.ToolSerial, d.DTNumber,
              d.LogDate, d.StatusType,
              i.AssetNo   AS AssetNo,
              i.ShortDesc AS ToolDescription
         FROM tbl_DailyFieldLogs d
         LEFT JOIN tbl_Inventory i
                ON i.SystemID = d.ToolSerial
        WHERE YEAR(d.LogDate)  = @year
          AND MONTH(d.LogDate) = @month
          AND (@jobId IS NULL OR d.JobID = @jobId)
          AND d.StatusType IN ('1','S')
        ORDER BY d.JobID,
                 COALESCE(d.ToolSerial, i.AssetNo, ''),
                 d.LogDate`,
      [
        { name: 'year',  value: year  },
        { name: 'month', value: month },
        { name: 'jobId', value: jobId },
      ]
    )

    // Grouped per DISPATCH CYCLE — (JobID + DTNumber + ToolSerial) — not per
    // tool. The same tool can go out, come back and go out again on one job,
    // and those are separate charge periods; collapsing them into one row made
    // the second run look like a continuation of the first.
    const rowMap = new Map()
    for (const r of result.recordset) {
      const key = `${r.JobID}|${r.DTNumber ?? ''}|${r.ToolSerial ?? 'null'}`

      const serial = r.ToolSerial || r.AssetNo || ''
      const desc   = r.ToolDescription || ''
      const label  = [serial, desc].filter(Boolean).join(' – ')
                  || (r.ToolSerial ? `Tool ${r.ToolSerial}` : 'Unknown')

      const day = new Date(r.LogDate).getDate()

      if (!rowMap.has(key)) {
        rowMap.set(key, {
          label, jobId: r.JobID, toolId: r.ToolSerial,
          dtNumber: r.DTNumber || null, days: {},
        })
      }
      rowMap.get(key).days[day] = { code: r.StatusType, logId: r.LogID }
    }

    return jsonResponse(context, 200, { rows: Array.from(rowMap.values()) })
  }

  // ── POST create log entry ────────────────────────────────────────────────
  if (!id && method === 'POST') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    if (!b.JobID || !b.LogDate || !b.UtilizationCode)
      return jsonResponse(context, 400, { error: 'JobID, LogDate, UtilizationCode required' })
    if (!['1','S'].includes(b.UtilizationCode))
      return jsonResponse(context, 400, { error: 'UtilizationCode must be "1" or "S"' })

    const r = await query(
      // DTNumber is written here now. It was being left NULL, and the revenue
      // rollup in /api/tool-history joins the logs on (ToolSerial, DTNumber) —
      // so every day marked through this app was invisible to the operating
      // and standby totals it is supposed to feed.
      `INSERT INTO tbl_DailyFieldLogs (JobID, DTNumber, ToolSerial, LogDate, StatusType, CreatedDate)
       OUTPUT INSERTED.LogID
       VALUES (@job, @dt, @tool, @date, @code, GETDATE())`,
      [
        { name: 'job',  value: b.JobID          },
        { name: 'dt',   value: b.DTNumber || null },
        { name: 'tool', value: b.ToolID != null ? String(b.ToolID) : null },
        { name: 'date', value: b.LogDate         },
        { name: 'code', value: b.UtilizationCode },
      ]
    )
    return jsonResponse(context, 201, { LogID: r.recordset[0].LogID })
  }

  // ── PUT update code ──────────────────────────────────────────────────────
  if (id && method === 'PUT') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    if (!['1','S'].includes(b.UtilizationCode))
      return jsonResponse(context, 400, { error: 'UtilizationCode must be "1" or "S"' })

    await query(
      `UPDATE tbl_DailyFieldLogs SET StatusType = @code WHERE LogID = @id`,
      [
        { name: 'id',   value: Number(id)        },
        { name: 'code', value: b.UtilizationCode  },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (id && method === 'DELETE') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    await query('DELETE FROM tbl_DailyFieldLogs WHERE LogID = @id',
      [{ name: 'id', value: Number(id) }])
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
