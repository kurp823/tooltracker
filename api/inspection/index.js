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
      `SELECT i.InspectionID, i.InspectionNumber, i.JobID,
              i.SerialNumber, i.AssetNo, i.ToolDescription, i.SizeName,
              i.InspectionType, i.InspectionDate, i.Inspector,
              i.Result, i.Status, i.Notes, i.CreatedDate, i.CreatedBy
         FROM tbl_Inspections i
        ORDER BY i.InspectionDate DESC, i.CreatedDate DESC`,
      []
    )
    return jsonResponse(context, 200, result.recordset)
  }

  // ── GET single ───────────────────────────────────────────────────────────
  if (id && method === 'GET') {
    const result = await query(
      `SELECT i.* FROM tbl_Inspections i WHERE i.InspectionID = @id`,
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
    const yr = new Date().getFullYear()
    const lastRow = await query(
      `SELECT TOP 1 InspectionNumber FROM tbl_Inspections
        WHERE InspectionNumber LIKE 'INS-${yr}-%'
        ORDER BY InspectionNumber DESC`, []
    )
    let seq = 1
    if (lastRow.recordset.length) {
      const parts = lastRow.recordset[0].InspectionNumber.split('-')
      seq = parseInt(parts[parts.length - 1], 10) + 1
    }
    const InspectionNumber = `INS-${yr}-${String(seq).padStart(5, '0')}`

    const r = await query(
      `INSERT INTO tbl_Inspections
         (InspectionNumber, JobID, SerialNumber, AssetNo, ToolDescription, SizeName,
          InspectionType, InspectionDate, Inspector, Result, Status, Notes, CreatedBy, CreatedDate)
       OUTPUT INSERTED.InspectionID
       VALUES (@num, @job, @serial, @asset, @desc, @size, @type, @date, @inspector, @result, 'Open', @notes, @by, GETDATE())`,
      [
        { name: 'num',       value: InspectionNumber               },
        { name: 'job',       value: b.JobID           || null      },
        { name: 'serial',    value: b.SerialNumber    || null      },
        { name: 'asset',     value: b.AssetNo         || null      },
        { name: 'desc',      value: b.ToolDescription || null      },
        { name: 'size',      value: b.SizeName        || null      },
        { name: 'type',      value: b.InspectionType  || null      },
        { name: 'date',      value: b.InspectionDate  || new Date().toISOString().split('T')[0] },
        { name: 'inspector', value: b.Inspector || user.FullName || user.Username },
        { name: 'result',    value: b.Result          || null      },
        { name: 'notes',     value: b.Notes           || null      },
        { name: 'by',        value: user.Username                  },
      ]
    )
    return jsonResponse(context, 201, { InspectionID: r.recordset[0].InspectionID, InspectionNumber })
  }

  // ── PUT update ───────────────────────────────────────────────────────────
  if (id && method === 'PUT') {
    if (!['Admin','Operations','QAQC'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    await query(
      `UPDATE tbl_Inspections
          SET InspectionDate = @date, Inspector = @inspector, Result = @result,
              Status = @status, Notes = @notes
        WHERE InspectionID = @id`,
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
