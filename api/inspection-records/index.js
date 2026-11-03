'use strict'
const { query, jsonResponse, requireAuth, safe } = require('../db')
const main = require('../inspection/index.js')

// Diagnostic: POST is traced step by step and always answers with what
// happened, so the empty-200 on POST /inspections can be explained.
module.exports = safe(async function (context, req) {
  if (String(req.method).toUpperCase() !== 'POST') return main(context, req)
  const trace = []
  try {
    const user = requireAuth(context, req)
    trace.push('auth:' + (user ? user.Role : 'none'))
    if (!user) return
    const b = req.body
    trace.push('body:' + typeof b + ':' + Object.keys(b || {}).join('|'))
    const r = await query(
      `INSERT INTO tbl_InspectionRecords (jobNumber, serial, asset, inspectionType, inspectionDate, inspector, result, status, notes, createdBy, createdAt)
       OUTPUT INSERTED.id
       VALUES (@job, NULL, @asset, @type, CAST(GETDATE() AS date), @insp, @result, 'Open', @notes, @by, GETDATE())`,
      [
        { name: 'job', value: (b && b.JobID) || null },
        { name: 'asset', value: (b && b.AssetNo) || null },
        { name: 'type', value: (b && b.InspectionType) || null },
        { name: 'insp', value: user.Username },
        { name: 'result', value: (b && b.Result) || null },
        { name: 'notes', value: (b && b.Notes) || null },
        { name: 'by', value: user.Username },
      ]
    )
    trace.push('rowsets:' + (r.recordsets ? r.recordsets.length : 'none') + ' rec0:' + JSON.stringify(r.recordset && r.recordset[0]) + ' affected:' + JSON.stringify(r.rowsAffected))
    return jsonResponse(context, 201, { InspectionID: r.recordset && r.recordset[0] && r.recordset[0].id, trace })
  } catch (e) {
    trace.push('error:' + e.message)
    return jsonResponse(context, 500, { error: e.message, trace })
  }
})
