'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

/**
 * GET  /api/utilization?year=YYYY&month=MM[&jobId=Job-XXX-NNNNN]
 *   Returns { rows: [ { label, jobId, toolId, days: { 1: { code:'1', logId:N }, ... } } ] }
 *   UtilizationCode: '1' = Operations, 'S' = Standby
 *
 * POST /api/utilization
 *   Body: { JobID, ToolID?, LogDate, UtilizationCode }
 *
 * PUT  /api/utilization/:id
 *   Body: { UtilizationCode }
 *
 * DELETE /api/utilization/:id
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

    // Join tbl_Inventory for tool label; fall back gracefully if no match
    const result = await query(
      `SELECT d.LogID, d.JobID, d.ToolID,
              d.LogDate, d.UtilizationCode,
              i.Serial    AS SerialNumber,
              i.AssetNo   AS AssetNo,
              i.ShortDesc AS ToolDescription
         FROM tbl_DailyFieldLogs d
         LEFT JOIN tbl_Inventory i
                ON i.SystemID = CAST(d.ToolID AS NVARCHAR(50))
        WHERE YEAR(d.LogDate)  = @year
          AND MONTH(d.LogDate) = @month
          AND (@jobId IS NULL OR d.JobID = @jobId)
          AND d.UtilizationCode IN ('1','S')
        ORDER BY d.JobID,
                 COALESCE(i.Serial, i.AssetNo, CAST(d.ToolID AS NVARCHAR(50))),
                 d.LogDate`,
      [
        { name: 'year',  value: year  },
        { name: 'month', value: month },
        { name: 'jobId', value: jobId },
      ]
    )

    // Group into rows keyed by (JobID + ToolID)
    const rowMap = new Map()
    for (const r of result.recordset) {
      const key = `${r.JobID}|${r.ToolID ?? 'null'}`

      const serial = r.SerialNumber || r.AssetNo || ''
      const desc   = r.ToolDescription || ''
      const label  = [serial, desc].filter(Boolean).join(' – ')
                  || (r.ToolID ? `Tool #${r.ToolID}` : 'Unknown')

      const day = new Date(r.LogDate).getDate()

      if (!rowMap.has(key)) {
        rowMap.set(key, { label, jobId: r.JobID, toolId: r.ToolID, days: {} })
      }
      rowMap.get(key).days[day] = { code: r.UtilizationCode, logId: r.LogID }
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

    // ToolID may be numeric string — try to parse; keep null if non-numeric
    const toolIdVal = b.ToolID != null && !isNaN(Number(b.ToolID))
      ? Number(b.ToolID) : null

    const r = await query(
      `INSERT INTO tbl_DailyFieldLogs
         (JobID, ToolID, PersonnelID, LogDate, UtilizationCode, CreatedBy, CreatedDate)
       OUTPUT INSERTED.LogID
       VALUES (@job, @tool, NULL, @date, @code, @by, GETDATE())`,
      [
        { name: 'job',  value: b.JobID          },
        { name: 'tool', value: toolIdVal         },
        { name: 'date', value: b.LogDate         },
        { name: 'code', value: b.UtilizationCode },
        { name: 'by',   value: user.Username      },
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
      `UPDATE tbl_DailyFieldLogs SET UtilizationCode = @code WHERE LogID = @id`,
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
