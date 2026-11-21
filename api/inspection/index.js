'use strict'
const { sql, query, jsonResponse, requireAuth, safe, hasId, audit, withLock, nextNumber } = require('../db')

// Inspection work orders. Epicor grouped inspections into a work order (WO)
// with one line per tool, a third-party report number per line and an action
// (Stock = back to stock, DMR = damaged/repair). The same columns live here so
// the 14k lines of Epicor history import as-is and new app records continue
// the WO numbering (MAX+1, same rule as tickets).
let colsReady = false
async function ensureCols () {
  if (colsReady) return
  await query(`IF COL_LENGTH('dbo.tbl_InspectionRecords','WONumber') IS NULL ALTER TABLE dbo.tbl_InspectionRecords ADD WONumber int NULL, LineNum int NULL, ToolDescription nvarchar(400) NULL, Source nvarchar(20) NULL`, [])
  for (const [nm, cols] of [['IX_Insp_Asset','asset'],['IX_Insp_Serial','serial'],['IX_Insp_Job','jobNumber'],['IX_Insp_WO','WONumber, LineNum'],['IX_Insp_Date','inspectionDate']]) {
    await query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = '${nm}' AND object_id = OBJECT_ID('dbo.tbl_InspectionRecords')) CREATE INDEX ${nm} ON dbo.tbl_InspectionRecords (${cols})`, [])
  }
  // Status flow: Open (awaiting third-party report) -> Report received -> Closed (QC validated)
  for (const [v, o] of [['Open', 1], ['Report received', 2], ['Closed', 3]]) {
    await query(`IF NOT EXISTS (SELECT 1 FROM tbl_Lists WHERE ListName = 'InspectionStatus' AND Value = @v)
                 INSERT INTO tbl_Lists (ListName, Value, Label, SortOrder, ActiveFlag, IsSystem, UpdatedAt, UpdatedBy)
                 VALUES ('InspectionStatus', @v, @v, @o, 1, 1, GETDATE(), 'system')`, [{ name: 'v', value: v }, { name: 'o', value: o }])
  }
  // Epicor history carries the QC decision already taken (its Action column).
  await query(`UPDATE tbl_InspectionRecords SET qcApprovedBy = 'Epicor', qcApprovedDate = inspectionDate
                WHERE Source = 'Epicor' AND actions IS NOT NULL AND qcApprovedBy IS NULL`, [])
  // All Epicor history is closed (Ravi, 21 Nov): the app's own flow starts from new lines only.
  await query(`UPDATE tbl_InspectionRecords SET status = 'Closed', notes = CONCAT(ISNULL(notes + ' | ',''), 'Closed on import: no action recorded in Epicor')
                WHERE Source = 'Epicor' AND status <> 'Closed'`, [])
  colsReady = true
}

const SELECT = `SELECT i.id AS InspectionID, 'INS-' + CAST(i.id AS varchar) AS InspectionNumber,
              i.WONumber, i.LineNum, i.Source,
              i.jobNumber AS JobID, i.serial AS SerialNumber, i.asset AS AssetNo,
              COALESCE(i.ToolDescription, inv.ShortDesc) AS ToolDescription, inv.[Size] AS SizeName,
              i.inspectionType AS InspectionType, i.inspectionDate AS InspectionDate,
              i.inspector AS Inspector, i.inspectionCompany AS InspectionCompany,
              i.standard AS Standard, i.result AS Result, i.actions AS Action, i.findings AS Findings,
              i.status AS Status, i.certNumber AS CertNumber, i.vendorOrderRef AS ServiceTicket,
              i.qcApprovedBy AS QCValidatedBy, i.qcApprovedDate AS QCValidatedDate,
              i.notes AS Notes, i.createdAt AS CreatedDate, i.createdBy AS CreatedBy
         FROM tbl_InspectionRecords i
         OUTER APPLY (SELECT TOP 1 x.ShortDesc, x.[Size] FROM tbl_Inventory x WHERE x.SystemID = i.serial) invS
         OUTER APPLY (SELECT TOP 1 x.ShortDesc, x.[Size] FROM tbl_Inventory x WHERE x.AssetNo = i.asset AND invS.ShortDesc IS NULL) invA
         CROSS APPLY (SELECT COALESCE(invS.ShortDesc, invA.ShortDesc) AS ShortDesc, COALESCE(invS.[Size], invA.[Size]) AS [Size]) inv`

/** Import Epicor inspection history rows as they are. Idempotent on (WO, line, part, action, report). */
async function importRows (user, rows) {
  const clean = []
  for (const r of rows) {
    const wo = parseInt(r.wo, 10); const ln = parseInt(r.line, 10)
    if (!Number.isFinite(wo) || !String(r.part || '').trim()) continue
    const act = String(r.action || '').trim().toUpperCase()
    let date = null
    if (r.date) { const d = new Date(r.date); if (!isNaN(d)) date = d.toISOString().slice(0, 10) }
    clean.push({
      wo, ln: Number.isFinite(ln) ? ln : null,
      part: String(r.part).trim().slice(0, 100),
      desc: String(r.description || '').trim().slice(0, 400) || null,
      jst: String(r.jst || '').trim().slice(0, 50) || null,
      job: String(r.job || '').trim().slice(0, 50) || null,
      date, report: String(r.report || '').trim().slice(0, 100) || null,
      action: act === 'STOCK' ? 'Stock' : act === 'DMR' ? 'DMR' : (act || null),
    })
  }
  let inserted = 0, skipped = 0
  const CH = 150
  for (let i = 0; i < clean.length; i += CH) {
    const part = clean.slice(i, i + CH)
    const params = []; const vals = []
    part.forEach((r, k) => {
      const n = (nm, v, t) => { params.push({ name: `${nm}${k}`, type: t, value: v }); return `@${nm}${k}` }
      vals.push(`(${n('w', r.wo, sql.Int)}, ${n('l', r.ln, sql.Int)}, ${n('p', r.part, sql.NVarChar)}, ${n('d', r.desc, sql.NVarChar)}, ${n('t', r.jst, sql.NVarChar)}, ${n('j', r.job, sql.NVarChar)}, ${n('dt', r.date, sql.VarChar)}, ${n('r', r.report, sql.NVarChar)}, ${n('a', r.action, sql.NVarChar)})`)
    })
    const res = await query(
      `;WITH src AS (SELECT * FROM (VALUES ${vals.join(',')}) v(wo, ln, part, descr, jst, job, dt, report, act))
       INSERT INTO tbl_InspectionRecords
         (WONumber, LineNum, asset, serial, ToolDescription, vendorOrderRef, jobNumber, inspectionDate, certNumber, actions, result,
          inspectionType, status, Source, inspector, qcApprovedBy, qcApprovedDate, createdBy, createdAt)
       SELECT s.wo, s.ln, s.part, COALESCE(inv.SystemID, s.part), s.descr, s.jst, s.job, TRY_CONVERT(date, s.dt), s.report, s.act,
              CASE UPPER(s.act) WHEN 'STOCK' THEN 'Pass' WHEN 'DMR' THEN 'Fail' ELSE NULL END,
              CASE WHEN s.job IS NOT NULL THEN 'Post-job' ELSE 'Stock' END,
              CASE WHEN s.act IS NULL THEN 'Open' ELSE 'Closed' END,
              'Epicor', 'Epicor',
              CASE WHEN s.act IS NULL THEN NULL ELSE 'Epicor' END, CASE WHEN s.act IS NULL THEN NULL ELSE TRY_CONVERT(date, s.dt) END,
              @by, GETDATE()
         FROM src s
         OUTER APPLY (SELECT TOP 1 COALESCE((SELECT TOP 1 x.SystemID FROM tbl_Inventory x WHERE x.AssetNo = s.part),
                                           (SELECT TOP 1 x.SystemID FROM tbl_Inventory x WHERE x.SystemID = s.part)) AS SystemID) inv
        WHERE NOT EXISTS (SELECT 1 FROM tbl_InspectionRecords e
                           WHERE e.Source = 'Epicor' AND e.WONumber = s.wo AND ISNULL(e.LineNum,-1) = ISNULL(s.ln,-1)
                             AND ISNULL(e.actions,'') = ISNULL(s.act,'') AND ISNULL(e.certNumber,'') = ISNULL(s.report,'')
                             AND e.asset = s.part)`,
      [...params, { name: 'by', type: sql.NVarChar, value: user.Username }])
    const n = res.rowsAffected[0] || 0
    inserted += n; skipped += part.length - n
  }
  await audit(user, 'inspection', 'import', 'import-epicor', JSON.stringify({ rows: rows.length, inserted, skipped }))
  return { received: rows.length, valid: clean.length, inserted, skipped }
}


/**
 * QC decision moves the tool (only if it is in the bay):
 *   Stock -> Good @ Emdad Base
 *   DMR   -> Maintenance @ Workshop + a maintenance work order (card) is raised,
 *            as in Epicor where DMR = maintenance work order.
 */
async function applyResult (recordId, result) {
  const res = String(result || '').trim()
  if (res !== 'Pass' && res !== 'Fail') return 0
  const r = await query(
    `UPDATE i SET i.Status = @st, i.Location = @loc, i.LastUpdated = GETDATE()
       FROM tbl_Inventory i JOIN tbl_InspectionRecords r ON r.id = @id
        AND ( (NULLIF(r.asset,'') IS NOT NULL AND i.AssetNo = r.asset)
           OR (NULLIF(r.serial,'') IS NOT NULL AND (i.SystemID = r.serial OR i.OEMSerial = r.serial)) )
      WHERE i.Status = 'Inspection'`,
    [{ name: 'id', value: Number(recordId) },
     { name: 'st', value: res === 'Pass' ? 'Good' : 'Maintenance' },
     { name: 'loc', value: res === 'Pass' ? 'Emdad Base' : 'Workshop' }])
  return r.rowsAffected[0] || 0
}

/** DMR: raise the maintenance work order from the inspection line (once per line). */
async function raiseMaintenanceCard (user, recordId) {
  const ex = await query(`SELECT TOP 1 m.jobCardNumber FROM tbl_MaintenanceJobs m WHERE m.triggeredBy = @trg`,
    [{ name: 'trg', value: `INS-${recordId}` }])
  if (ex.recordset.length) return ex.recordset[0].jobCardNumber
  const yr = new Date().getFullYear()
  return withLock('maintenance-number', async (tq) => {
    const num = await nextNumber(tq, 'tbl_MaintenanceJobs', 'jobCardNumber', `MJ-${yr}-`, 5)
    await tq(
      `INSERT INTO tbl_MaintenanceJobs
         (jobCardNumber, serial, asset, jobNumber, jobType, priority, triggeredBy, dateIn, description, scopeOfWork, status, createdBy, createdAt)
       SELECT @num, r.serial, r.asset, r.jobNumber, 'Repair', 'Medium', @trg, CAST(GETDATE() AS date),
              'DMR from inspection WO ' + ISNULL(CAST(r.WONumber AS varchar), '') + ISNULL(' / report ' + r.certNumber, ''),
              r.findings, 'Open', @by, GETDATE()
         FROM tbl_InspectionRecords r WHERE r.id = @id`,
      [{ name: 'num', value: num }, { name: 'trg', value: `INS-${recordId}` },
       { name: 'id', value: Number(recordId) }, { name: 'by', value: user.Username }])
    return num
  })
}

module.exports = safe(async function (context, req) {
  const user   = requireAuth(context, req)
  if (!user) return

  const id     = hasId(context.bindingData.id) ? String(context.bindingData.id) : null
  const method = req.method.toUpperCase()

  await ensureCols()

  // ── POST import (Epicor history) ─────────────────────────────────────────
  if (id === 'import' && method === 'POST') {
    if (user.Role !== 'Admin') return jsonResponse(context, 403, { error: 'Admin only' })
    const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : []
    if (!rows.length) return jsonResponse(context, 400, { error: 'rows[] required' })
    if (rows.length > 2000) return jsonResponse(context, 400, { error: 'Send at most 2000 rows per call' })
    return jsonResponse(context, 200, await importRows(user, rows))
  }

  // ── GET list ─────────────────────────────────────────────────────────────
  //   ?serial= / ?asset=  one tool (matched by asset no, system id or OEM serial)
  //   ?job=               one job      ?wo=  one work order
  //   ?search=            report no, asset, serial, job, description
  //   ?limit=             default 1000 newest, max 5000
  if (!id && method === 'GET') {
    const qs = req.query || {}
    const where = []; const params = []
    const tool = String(qs.serial || qs.asset || '').trim()
    if (tool) {
      params.push({ name: 'tool', type: sql.NVarChar, value: tool })
      // Resolve the tool once, then seek: a correlated EXISTS over tbl_Inventory scanned per row.
      where.push(`(i.serial IN (@tool, @sysId) OR i.asset IN (@tool, @assetNo))`)
    }
    if (qs.job) { params.push({ name: 'job', type: sql.NVarChar, value: String(qs.job).trim() }); where.push(`UPPER(i.jobNumber) = UPPER(@job)`) }
    if (qs.wo)  { params.push({ name: 'wo', type: sql.Int, value: parseInt(qs.wo, 10) || 0 }); where.push(`i.WONumber = @wo`) }
    if (qs.search) {
      params.push({ name: 'q', type: sql.NVarChar, value: `%${String(qs.search).trim()}%` })
      where.push(`(i.certNumber LIKE @q OR i.asset LIKE @q OR i.serial LIKE @q OR i.jobNumber LIKE @q OR i.ToolDescription LIKE @q OR CAST(i.WONumber AS varchar) LIKE @q)`)
    }
    let limit = parseInt(qs.limit, 10); if (!Number.isFinite(limit) || limit <= 0) limit = 1000; limit = Math.min(limit, 5000)
    params.push({ name: 'limit', type: sql.Int, value: limit })
    const result = await query(
      `DECLARE @sysId nvarchar(100) = NULL, @assetNo nvarchar(100) = NULL;
       ${tool ? `SELECT TOP 1 @sysId = SystemID, @assetNo = AssetNo FROM tbl_Inventory
                  WHERE SystemID = @tool OR AssetNo = @tool OR OEMSerial = @tool;
                SET @sysId = COALESCE(@sysId, @tool); SET @assetNo = COALESCE(NULLIF(@assetNo,''), @tool);` : ''}
       ;WITH pick AS (SELECT TOP (@limit) i.id FROM tbl_InspectionRecords i
                      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                      ORDER BY i.inspectionDate DESC, i.WONumber DESC, i.LineNum, i.id DESC)
       ${SELECT} JOIN pick ON pick.id = i.id
        ORDER BY i.inspectionDate DESC, i.WONumber DESC, i.LineNum, i.id DESC`, params)
    return jsonResponse(context, 200, result.recordset)
  }

  // ── GET single ───────────────────────────────────────────────────────────
  if (id && method === 'GET') {
    const result = await query(`${SELECT} WHERE i.id = @id`, [{ name: 'id', value: Number(id) }])
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
      `DECLARE @wo int = COALESCE(@woIn, (SELECT ISNULL(MAX(WONumber),0) + 1 FROM tbl_InspectionRecords));
       INSERT INTO tbl_InspectionRecords
         (WONumber, LineNum, jobNumber, serial, asset, ToolDescription, certNumber, inspectionCompany, findings, Source,
          inspectionType, inspectionDate, inspector, status, notes, createdBy, createdAt)
       OUTPUT INSERTED.id, INSERTED.WONumber, INSERTED.LineNum
       VALUES (@wo, (SELECT ISNULL(MAX(LineNum),0) + 1 FROM tbl_InspectionRecords WHERE WONumber = @wo),
               @job, @serial, @asset, @desc, @cert, @company, @findings, 'App',
               @type, @date, @inspector,
               CASE WHEN NULLIF(@cert,'') IS NOT NULL THEN 'Report received' ELSE 'Open' END,
               @notes, @by, GETDATE())`,
      [
        { name: 'woIn',      type: sql.Int, value: b.WONumber ? parseInt(b.WONumber, 10) || null : null },
        { name: 'desc',      value: b.ToolDescription   || null },
        { name: 'cert',      value: b.CertNumber        || null },
        { name: 'company',   value: b.InspectionCompany || null },
        { name: 'findings',  value: b.Findings          || null },
        { name: 'job',       value: b.JobID           || null      },
        { name: 'serial',    value: b.SerialNumber || b.AssetNo || ''  },
        { name: 'asset',     value: b.AssetNo         || null      },
        { name: 'type',      value: b.InspectionType  || null      },
        { name: 'date',      value: b.InspectionDate  || null },
        { name: 'inspector', value: b.Inspector       || null },
        { name: 'notes',     value: b.Notes           || null      },
        { name: 'by',        value: user.Username                  },
      ]
    )
    const newId = r.recordset[0].id
    // The tool does not move here: only QC validation (PUT with Decision) does.
    return jsonResponse(context, 201, { InspectionID: newId, InspectionNumber: `INS-${newId}`, WONumber: r.recordset[0].WONumber, LineNum: r.recordset[0].LineNum })
  }

  // ── PUT update ───────────────────────────────────────────────────────────
  //   Report step  (Admin, Operations, QAQC, ThirdParty): CertNumber, InspectionCompany,
  //                 InspectionDate, Inspector, Findings, Notes  -> status 'Report received'
  //   QC validation (Admin, QAQC): Decision 'Stock' | 'DMR'  -> status 'Closed', tool moves
  if (id && method === 'PUT') {
    if (!['Admin','Operations','QAQC','ThirdParty'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body || {}
    const decision = String(b.Decision || '').trim()
    if (decision) {
      if (!['Admin','QAQC'].includes(user.Role)) return jsonResponse(context, 403, { error: 'Only QC can validate an inspection' })
      if (decision !== 'Stock' && decision !== 'DMR') return jsonResponse(context, 400, { error: "Decision must be 'Stock' or 'DMR'" })
    }
    const upd = await query(
      `UPDATE tbl_InspectionRecords
          SET inspectionDate    = COALESCE(@date, inspectionDate),
              inspector         = COALESCE(@inspector, inspector),
              inspectionCompany = COALESCE(@company, inspectionCompany),
              certNumber        = COALESCE(@cert, certNumber),
              findings          = COALESCE(@findings, findings),
              notes             = COALESCE(@notes, notes),
              actions           = COALESCE(@decision, actions),
              result            = CASE @decision WHEN 'Stock' THEN 'Pass' WHEN 'DMR' THEN 'Fail' ELSE result END,
              qcApprovedBy      = CASE WHEN @decision IS NOT NULL THEN @by ELSE qcApprovedBy END,
              qcApprovedDate    = CASE WHEN @decision IS NOT NULL THEN GETDATE() ELSE qcApprovedDate END,
              status            = CASE WHEN @decision IS NOT NULL THEN 'Closed'
                                       WHEN @status IS NOT NULL THEN @status
                                       WHEN status = 'Open' AND NULLIF(COALESCE(@cert, certNumber),'') IS NOT NULL THEN 'Report received'
                                       ELSE status END,
              updatedAt         = GETDATE()
        WHERE id = @id`,
      [
        { name: 'id',        value: Number(id)           },
        { name: 'date',      value: b.InspectionDate || null },
        { name: 'inspector', value: b.Inspector || null   },
        { name: 'company',   value: b.InspectionCompany || null },
        { name: 'cert',      value: b.CertNumber || null  },
        { name: 'findings',  value: b.Findings || null    },
        { name: 'notes',     value: b.Notes || null       },
        { name: 'decision',  value: decision || null      },
        { name: 'status',    value: !decision && b.Status ? b.Status : null },
        { name: 'by',        value: user.Username         },
      ]
    )
    if (!upd.rowsAffected[0]) return jsonResponse(context, 404, { error: `Inspection ${id} not found` })

    // QC's decision is what moves the tool: Stock -> Good @ Emdad Base, DMR -> DBR.
    // Only a tool that is actually in the bay is moved, so a stray record can
    // never override a tool that is on a rig.
    let toolsUpdated = 0, maintenanceCard = null
    if (decision) {
      toolsUpdated = await applyResult(id, decision === 'Stock' ? 'Pass' : 'Fail')
      if (decision === 'DMR') maintenanceCard = await raiseMaintenanceCard(user, id)
      await audit(user, 'inspection', String(id), 'qc-validate', JSON.stringify({ decision, toolsUpdated, maintenanceCard }))
    }
    return jsonResponse(context, 200, { ok: true, toolsUpdated, maintenanceCard })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
})
