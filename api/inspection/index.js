'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

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

module.exports = async function (context, req) {
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

    const b = req.body
    const r = await query(
      `INSERT INTO tbl_InspectionRecords
         (jobNumber, serial, asset, inspectionType, inspectionDate, inspector, result, status, notes, createdBy, createdAt)
       OUTPUT INSERTED.id
       VALUES (@job, @serial, @asset, @type, @date, @inspector, @result, 'Open', @notes, @by, GETDATE())`,
      [
        { name: 'job',       value: b.JobID           || null      },
        { name: 'serial',    value: b.SerialNumber    || null      },
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
          SET inspectionDate = @date, inspector = @inspector, result = @result,
              status = @status, notes = @notes, updatedAt = GETDATE()
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
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
