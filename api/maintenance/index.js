'use strict'
const { query, jsonResponse, requireAuth, safe , withLock, nextNumber, hasId } = require('../db')

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

module.exports = safe(async function (context, req) {
  const user   = requireAuth(context, req)
  if (!user) return

  const id     = hasId(context.bindingData.id) ? String(context.bindingData.id) : null
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

    const b = req.body || {}
    // A card with no tool and no work described is not a card. Two blank
    // MJ-2026-0000x rows came from an empty POST (bug 27).
    if (!String(b.AssetNo || '').trim() && !String(b.SerialNumber || '').trim())
      return jsonResponse(context, 400, { error: 'Pick the tool (asset number or serial)' })
    if (!String(b.MaintenanceType || '').trim() && !String(b.Description || '').trim())
      return jsonResponse(context, 400, { error: 'Give the maintenance type or describe the work' })
    const yr = new Date().getFullYear()
    // Number and insert under one lock (bug 25).
    const { newId, MaintenanceJobNumber } = await withLock('maintenance-number', async (tq) => {
    const MaintenanceJobNumber = await nextNumber(tq, 'tbl_MaintenanceJobs', 'jobCardNumber', `MJ-${yr}-`, 5)
    const r = await tq(
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
    return { newId: r.recordset[0].id, MaintenanceJobNumber }
    })
    return jsonResponse(context, 201, { MaintenanceJobID: newId, MaintenanceJobNumber })
  }

  // ── PUT update ───────────────────────────────────────────────────────────
  if (id && method === 'PUT') {
    if (!['Admin','Operations','QAQC'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body || {}
    // Unsent fields keep their value (same rule as jobs, bug 26b).
    const upd = await query(
      `UPDATE tbl_MaintenanceJobs
          SET priority      = COALESCE(@priority,  priority),
              status        = COALESCE(@status,    status),
              dateIn        = COALESCE(@scheduled, dateIn),
              completedDate = COALESCE(@completed, completedDate),
              completedBy   = COALESCE(@tech,      completedBy),
              notes         = COALESCE(@notes,     notes),
              updatedAt     = GETDATE()
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
    if (!upd.rowsAffected[0]) return jsonResponse(context, 404, { error: `Maintenance card ${id} not found` })
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
})
