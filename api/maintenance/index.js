'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

// Real tbl_MaintenanceJobs columns (confirmed via INFORMATION_SCHEMA):
//   id, jobCardNumber, serial, asset, jobNumber, jobType, priority,
//   triggeredBy, supplierCode, supplierName, vendorOrderRef, dateIn,
//   estimatedOut, dateOut, description, scopeOfWork, workDone, partsUsed,
//   laborHours, cost, status, completedDate, completedBy, attachmentRef,
//   notes, createdBy, createdAt, updatedAt
// (No MaintenanceJobID/MaintenanceJobNumber/SerialNumber/AssetNo/
// ToolDescription/MaintenanceType/ScheduledDate/TechnicianName/CreatedDate
// — those don't exist. SQL aliases output back to the PascalCase names
// the frontend already expects.)

module.exports = async function (context, req) {
  const user   = requireAuth(context, req)
  if (!user) return

  const id     = context.bindingData.id
  const method = req.method.toUpperCase()

  // ── GET list ─────────────────────────────────────────────────────────────
  if (!id && method === 'GET') {
    const result = await query(
      `SELECT m.id AS MaintenanceJobID, m.jobCardNumber AS MaintenanceJobNumber,
              m.serial AS SerialNumber, m.asset AS AssetNo, NULL AS ToolDescription,
              m.jobType AS MaintenanceType, m.priority AS Priority, m.description AS Description,
              m.dateIn AS ScheduledDate, m.completedDate AS CompletedDate, m.status AS Status,
              m.completedBy AS TechnicianName, m.notes AS Notes,
              m.createdAt AS CreatedDate, m.createdBy AS CreatedBy
         FROM tbl_MaintenanceJobs m
        ORDER BY
          CASE m.priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
          m.dateIn ASC`,
      []
    )
    return jsonResponse(context, 200, result.recordset)
  }

  // ── GET single ───────────────────────────────────────────────────────────
  if (id && method === 'GET') {
    const result = await query(
      `SELECT m.id AS MaintenanceJobID, m.jobCardNumber AS MaintenanceJobNumber,
              m.serial AS SerialNumber, m.asset AS AssetNo, m.jobNumber AS JobID,
              m.jobType AS MaintenanceType, m.priority AS Priority, m.description AS Description,
              m.scopeOfWork AS ScopeOfWork, m.workDone AS WorkDone, m.partsUsed AS PartsUsed,
              m.laborHours AS LaborHours, m.cost AS Cost,
              m.dateIn AS ScheduledDate, m.completedDate AS CompletedDate, m.status AS Status,
              m.completedBy AS TechnicianName, m.notes AS Notes,
              m.createdAt AS CreatedDate, m.createdBy AS CreatedBy
         FROM tbl_MaintenanceJobs m WHERE m.id = @id`,
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
      `SELECT TOP 1 jobCardNumber FROM tbl_MaintenanceJobs
        WHERE jobCardNumber LIKE 'MJ-${yr}-%'
        ORDER BY jobCardNumber DESC`, []
    )
    let seq = 1
    if (lastRow.recordset.length) {
      const parts = lastRow.recordset[0].jobCardNumber.split('-')
      seq = parseInt(parts[parts.length - 1], 10) + 1
    }
    const MaintenanceJobNumber = `MJ-${yr}-${String(seq).padStart(5, '0')}`

    const r = await query(
      `INSERT INTO tbl_MaintenanceJobs
         (jobCardNumber, serial, asset, jobType, priority, description, dateIn,
          status, completedBy, notes, createdBy, createdAt)
       OUTPUT INSERTED.id
       VALUES (@num, @serial, @asset, @type, @priority, @desc, @scheduled, 'Open', @tech, @notes, @by, GETDATE())`,
      [
        { name: 'num',      value: MaintenanceJobNumber          },
        { name: 'serial',   value: b.SerialNumber    || null     },
        { name: 'asset',    value: b.AssetNo         || null     },
        { name: 'type',     value: b.MaintenanceType || null     },
        { name: 'priority',  value: b.Priority || 'Medium'  },
        { name: 'desc',      value: b.Description || null   },
        { name: 'scheduled', value: b.ScheduledDate || null  },
        { name: 'tech',      value: b.TechnicianName || null },
        { name: 'notes',     value: b.Notes || null          },
        { name: 'by',        value: user.Username            },
      ]
    )
    return jsonResponse(context, 201, { MaintenanceJobID: r.recordset[0].id, MaintenanceJobNumber })
  }

  // ── PUT update ───────────────────────────────────────────────────────────
  if (id && method === 'PUT') {
    if (!['Admin','Operations','QAQC'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    await query(
      `UPDATE tbl_MaintenanceJobs
          SET priority = @priority, status = @status, dateIn = @scheduled,
              completedDate = @completed, completedBy = @tech, notes = @notes,
              updatedAt = GETDATE()
        WHERE id = @id`,
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
