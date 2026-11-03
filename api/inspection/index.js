'use strict'
const { query, jsonResponse, requireAuth, safe } = require('../db')

// NOTE: the table this code originally assumed, `tbl_Inspections`, does
// not exist. There are two real candidates — `tbl_Inspection` (tied to a
// specific receiving-ticket workflow: WONumber/RTNumber/FromRTBatchID)
// and `tbl_InspectionRecords` (a standalone certification/QC record:
// serial, asset, jobNumber, inspectionType, result, qcApprovedBy, etc).
// The frontend's fields (InspectionType, Result, Status, Inspector,
// Notes, CreatedBy/CreatedDate) match tbl_InspectionRecords far more
// closely, so this endpoint is built against that table. There is no
// InspectionNumber column — a display number is derived from id.
//
// Real tbl_InspectionRecords columns (confirmed via INFORMATION_SCHEMA):
//   id, serial, asset, jobNumber, rtNumber, inspectionType, inspectionDate,
//   nextDueDate, certNumber, inspector, inspectionCompany, standard, result,
//   findings, actions, qcApprovedBy, qcApprovedDate, vendorOrderRef, cost,
//   status, attachmentRef, notes, createdBy, createdAt, updatedAt

module.exports = safe(async function (context, req) {
  const user   = requireAuth(context, req)
  if (!user) return

  const id     = context.bindingData.id
  const method = req.method.toUpperCase()

  // ── GET list ─────────────────────────────────────────────────────────────
  if (!id && method === 'GET') {
    const result = await query(
      `SELECT i.id AS InspectionID, 'INS-' + CAST(i.id AS varchar) AS InspectionNumber,
              i.jobNumber AS JobID, i.serial AS SerialNumber, i.asset AS AssetNo,
              NULL AS ToolDescription, NULL AS SizeName,
              i.inspectionType AS InspectionType, i.inspectionDate AS InspectionDate,
              i.inspector AS Inspector, i.result AS Result, i.status AS Status,
              i.notes AS Notes, i.createdAt AS CreatedDate, i.createdBy AS CreatedBy
         FROM tbl_InspectionRecords i
        ORDER BY i.inspectionDate DESC, i.createdAt DESC`,
      []
    )
    return jsonResponse(context, 200, result.recordset)
  }

  // ── GET single ───────────────────────────────────────────────────────────
  if (id && method === 'GET') {
    const result = await query(
      `SELECT i.id AS InspectionID, 'INS-' + CAST(i.id AS varchar) AS InspectionNumber,
              i.jobNumber AS JobID, i.serial AS SerialNumber, i.asset AS AssetNo,
              i.inspectionType AS InspectionType, i.inspectionDate AS InspectionDate,
              i.inspector AS Inspector, i.inspectionCompany AS InspectionCompany,
              i.standard AS Standard, i.result AS Result, i.findings AS Findings,
              i.actions AS Actions, i.status AS Status, i.certNumber AS CertNumber,
              i.notes AS Notes, i.createdAt AS CreatedDate, i.createdBy AS CreatedBy
         FROM tbl_InspectionRecords i WHERE i.id = @id`,
      [{ name: 'id', value: Number(id) }]
    )
    if (!result.recordset.length) return jsonResponse(context, 404, { error: 'Not found' })
    return jsonResponse(context, 200, result.recordset[0])
  }

  // ── POST create ──────────────────────────────────────────────────────────
  if (!id && method === 'POST') {
    if (!['Admin','Operations','QAQC','ThirdParty'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body || {}
    if (!b.AssetNo && !b.SerialNumber)
      return jsonResponse(context, 400, { error: 'Pick the tool being inspected (asset number or serial)' })
    const r = await query(
      `INSERT INTO tbl_InspectionRecords
         (jobNumber, serial, asset, inspectionType, inspectionDate, inspector, result, status, notes, createdBy, createdAt)
       OUTPUT INSERTED.id
       VALUES (@job, @serial, @asset, @type, @date, @inspector, @result, 'Open', @notes, @by, GETDATE())`,
      [
        { name: 'job',       value: b.JobID           || null      },
        // tbl_InspectionRecords.serial is NOT NULL. A record raised from an asset
        // number alone sent NULL and the insert failed, so no inspection could
        // be created from the screen. Fall back to the asset number, then ''.
        { name: 'serial',    value: b.SerialNumber || b.AssetNo || ''  },
        { name: 'asset',     value: b.AssetNo         || null      },
        { name: 'type',      value: b.InspectionType  || null      },
        { name: 'date',      value: b.InspectionDate  || new Date().toISOString().split('T')[0] },
        { name: 'inspector', value: b.Inspector || user.FullName || user.Username },
        { name: 'result',    value: b.Result          || null      },
        { name: 'notes',     value: b.Notes           || null      },
        { name: 'by',        value: user.Username                  },
      ]
    )
    const newId = r.recordset[0].id
    return jsonResponse(context, 201, { InspectionID: newId, InspectionNumber: `INS-${newId}` })
  }

  // ── PUT update ───────────────────────────────────────────────────────────
  if (id && method === 'PUT') {
    if (!['Admin','Operations','QAQC'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    await query(
      `UPDATE tbl_InspectionRecords
          SET inspectionDate = COALESCE(@date, inspectionDate),
              inspector      = COALESCE(@inspector, inspector),
              result         = COALESCE(@result, result),
              status         = COALESCE(@status, status),
              notes          = COALESCE(@notes, notes),
              updatedAt      = GETDATE()
        WHERE id = @id`,
      [
        { name: 'id',        value: Number(id)           },
        { name: 'date',      value: b.InspectionDate || null },
        { name: 'inspector', value: b.Inspector || null   },
        { name: 'result',    value: b.Result || null      },
        { name: 'status',    value: b.Status || null      },
        { name: 'notes',     value: b.Notes || null       },
      ]
    )

    // The inspection decides where the tool goes next. Without this a tool
    // sent to the bay by a return ticket stayed 'Inspection' forever (435 rows
    // today) whatever the result. Only a tool that is actually in the bay is
    // moved, so a stray record can never override a tool that is on a rig.
    //   Pass -> 'Good'   Fail -> 'DBR'   Conditional / Pending -> stays
    let tool = null
    const res = String(b.Result || '').trim()
    if (res === 'Pass' || res === 'Fail') {
      const r = await query(
        `UPDATE i
            SET i.Status = @st, i.LastUpdated = GETDATE()
           FROM tbl_Inventory i
           JOIN tbl_InspectionRecords r
             ON r.id = @id
            AND ( (NULLIF(r.asset,'')  IS NOT NULL AND i.AssetNo  = r.asset)
               OR (NULLIF(r.serial,'') IS NOT NULL AND (i.SystemID = r.serial OR i.OEMSerial = r.serial)) )
          WHERE i.Status = 'Inspection'`,
        [{ name: 'id', value: Number(id) },
         { name: 'st', value: res === 'Pass' ? 'Good' : 'DBR' }]
      )
      tool = r.rowsAffected[0] || 0
    }
    return jsonResponse(context, 200, { ok: true, toolsUpdated: tool })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
})
