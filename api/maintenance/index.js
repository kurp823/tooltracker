'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

module.exports = async function (context, req) {
  const user   = requireAuth(context, req)
  if (!user) return

  const id     = context.bindingData.id
  const method = req.method.toUpperCase()

  // ── GET list ─────────────────────────────────────────────────────────────
  if (!id && method === 'GET') {
    const result = await query(
      `SELECT m.MaintenanceJobID, m.MaintenanceJobNumber,
              m.SerialNumber, m.AssetNo, m.ToolDescription,
              m.MaintenanceType, m.Priority, m.Description,
              m.ScheduledDate, m.CompletedDate, m.Status,
              m.TechnicianName, m.Notes, m.CreatedDate, m.CreatedBy
         FROM tbl_MaintenanceJobs m
        ORDER BY
          CASE m.Priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
          m.ScheduledDate ASC`,
      []
    )
    return jsonResponse(context, 200, result.recordset)
  }

  // ── GET single ───────────────────────────────────────────────────────────
  if (id && method === 'GET') {
    const result = await query(
      `SELECT m.* FROM tbl_MaintenanceJobs m WHERE m.MaintenanceJobID = @id`,
      [{ name: 'id', value: Number(id) }]
    )
    if (!result.recordset.length) return jsonResponse(context, 404, { error: 'Not found' })
    return jsonResponse(context, 200, result.recordset[0])
  }

  // ── POST create ──────────────────────────────────────────────────────────
  if (!id && method === 'POST') {
    if (!['Admin','Operations','QAQC'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    const yr = new Date().getFullYear()
    const lastRow = await query(
      `SELECT TOP 1 MaintenanceJobNumber FROM tbl_MaintenanceJobs
        WHERE MaintenanceJobNumber LIKE 'MJ-${yr}-%'
        ORDER BY MaintenanceJobNumber DESC`, []
    )
    let seq = 1
    if (lastRow.recordset.length) {
      const parts = lastRow.recordset[0].MaintenanceJobNumber.split('-')
      seq = parseInt(parts[parts.length - 1], 10) + 1
    }
    const MaintenanceJobNumber = `MJ-${yr}-${String(seq).padStart(5, '0')}`

    const r = await query(
      `INSERT INTO tbl_MaintenanceJobs
         (MaintenanceJobNumber, SerialNumber, AssetNo, ToolDescription,
          MaintenanceType, Priority, Description, ScheduledDate,
          Status, TechnicianName, Notes, CreatedBy, CreatedDate)
       OUTPUT INSERTED.MaintenanceJobID
       VALUES (@num, @serial, @asset, @tooldesc, @type, @priority, @desc, @scheduled, 'Open', @tech, @notes, @by, GETDATE())`,
      [
        { name: 'num',      value: MaintenanceJobNumber          },
        { name: 'serial',   value: b.SerialNumber    || null     },
        { name: 'asset',    value: b.AssetNo         || null     },
        { name: 'tooldesc', value: b.ToolDescription || null     },
        { name: 'type',     value: b.MaintenanceType || null     },
        { name: 'priority',  value: b.Priority || 'Medium'  },
        { name: 'desc',      value: b.Description || null   },
        { name: 'scheduled', value: b.ScheduledDate || null  },
        { name: 'tech',      value: b.TechnicianName || null },
        { name: 'notes',     value: b.Notes || null          },
        { name: 'by',        value: user.Username            },
      ]
    )
    return jsonResponse(context, 201, { MaintenanceJobID: r.recordset[0].MaintenanceJobID, MaintenanceJobNumber })
  }

  // ── PUT update ───────────────────────────────────────────────────────────
  if (id && method === 'PUT') {
    if (!['Admin','Operations','QAQC'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    await query(
      `UPDATE tbl_MaintenanceJobs
          SET Priority = @priority, Status = @status, ScheduledDate = @scheduled,
              CompletedDate = @completed, TechnicianName = @tech, Notes = @notes
        WHERE MaintenanceJobID = @id`,
      [
        { name: 'id',        value: Number(id)           },
        { name: 'priority',  value: b.Priority || null    },
        { name: 'status',    value: b.Status || null      },
        { name: 'scheduled', value: b.ScheduledDate || null },
        { name: 'completed', value: b.CompletedDate || null },
        { name: 'tech',      value: b.TechnicianName || null },
        { name: 'notes',     value: b.Notes || null       },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
