/**
 * Jobs API
 * GET    /api/jobs          — list all jobs
 * POST   /api/jobs          — create new job
 * GET    /api/jobs/{id}     — single job
 * PUT    /api/jobs/{id}     — update job
 *
 * GET    /api/jobs/{id}/tools      — job tools list
 * POST   /api/jobs/{id}/tools      — add tool to job
 * DELETE /api/jobs/{id}/tools/{tid} — remove tool from job
 *
 * GET    /api/jobs/{id}/personnel  — job personnel
 * POST   /api/jobs/{id}/personnel  — add person
 * DELETE /api/jobs/{id}/personnel/{pid} — remove person
 */
const { sql, query, jsonResponse, requireAuth } = require('../db')

// ── Job number generator: EMDAD format Job-YYY-NNNNN ─────────────────────────
async function nextJobID(fiscalYear) {
  const yr = fiscalYear || new Date().getFullYear().toString().slice(-3)
  const result = await query(`
    SELECT TOP 1 JobID FROM tbl_Jobs
    ORDER BY JobID DESC
  `)
  if (!result.recordset.length) return `Job-${yr}-00001`
  const last = result.recordset[0].JobID // e.g. Job-026-01848
  const parts = last.split('-')
  const seq   = parseInt(parts[2] || '0', 10) + 1
  return `Job-${yr}-${String(seq).padStart(5, '0')}`
}

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const method = req.method.toUpperCase()
  const jobId  = context.bindingData.id
  const sub    = context.bindingData.sub   // 'tools' | 'personnel' | undefined
  const subId  = context.bindingData.subId // tool/person ID for DELETE

  // ── GET /api/jobs  (list) ─────────────────────────────────────────────────
  if (method === 'GET' && !jobId) {
    // ?search= and ?limit= let a type-ahead picker query the 3,824 jobs
    // without pulling the whole table into the browser on every keystroke.
    const { search, limit } = req.query || {}
    const params = []
    let where = ''
    if (search) {
      where = `WHERE JobID LIKE @q OR Client LIKE @q OR Rig LIKE @q OR Well LIKE @q OR Contract LIKE @q`
      params.push({ name: 'q', type: sql.NVarChar, value: `%${search}%` })
    }
    let top = parseInt(limit, 10)
    if (!Number.isFinite(top) || top <= 0) top = 0
    const topClause = top > 0 ? `TOP (@top)` : ''
    if (top > 0) params.push({ name: 'top', type: sql.Int, value: Math.min(top, 5000) })

    try {
      const result = await query(`
        SELECT ${topClause}
               JobID, Client, Rig, Well, Contract, PONumber, ClientRef,
               ServiceType, HoleSection, MobDate, DemobDate,
               Status, InvoicingType, Currency, FiscalYear,
               -- Job value and legal invoice no: both on the old register and
               -- needed by the executive dashboard, alongside ServiceType.
               InvoiceAmount, NetInvoiceAmount, LegalInvoiceNumber,
               CreatedDate, CreatedBy, UpdatedAt
        FROM   tbl_Jobs
        ${where}
        -- Newest job first. CreatedDate is NULL on the newer rows, and a DESC
        -- sort puts NULLs last in SQL Server, which pushed the newest jobs to
        -- the bottom and showed 2017/2018 jobs first. The trailing sequence in
        -- Job-YYY-NNNNN never resets across years, so it is the reliable key.
        ORDER  BY TRY_CAST(RIGHT(JobID, CHARINDEX('-', REVERSE(JobID) + '-') - 1) AS INT) DESC,
                  JobID DESC
      `, params)
      return jsonResponse(context, 200, result.recordset)
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to load jobs' })
    }
  }

  // ── GET /api/jobs/{id}  (single) ──────────────────────────────────────────
  if (method === 'GET' && jobId && !sub) {
    try {
      const result = await query(
        `SELECT * FROM tbl_Jobs WHERE JobID = @id`,
        [{ name: 'id', type: sql.NVarChar, value: jobId }]
      )
      if (!result.recordset.length)
        return jsonResponse(context, 404, { error: 'Job not found' })
      return jsonResponse(context, 200, result.recordset[0])
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to load job' })
    }
  }

  // ── POST /api/jobs  (create) ──────────────────────────────────────────────
  if (method === 'POST' && !jobId) {
    if (!['Admin', 'Operations'].includes(user.Role)) {
      return jsonResponse(context, 403, { error: 'Insufficient permissions' })
    }
    const b = req.body || {}
    if (!b.Client || !b.Rig)
      return jsonResponse(context, 400, { error: 'Client and Rig are required' })

    try {
      const newId = await nextJobID(b.FiscalYear)
      await query(
        `INSERT INTO tbl_Jobs (
           JobID, Client, Rig, Well, Contract, PONumber, ClientRef, ERPRef,
           ServiceType, HoleSection, Status, InvoicingType, Currency,
           FiscalYear, MobDate, DemobDate, Notes, CreatedBy, CreatedDate
         ) VALUES (
           @id, @client, @rig, @well, @contract, @po, @clientref, @erp,
           @svctype, @hole, @status, @invtype, @currency,
           @year, @mob, @demob, @notes, @by, GETDATE()
         )`,
        [
          { name: 'id',        type: sql.NVarChar, value: newId },
          { name: 'client',    type: sql.NVarChar, value: b.Client || '' },
          { name: 'rig',       type: sql.NVarChar, value: b.Rig || '' },
          { name: 'well',      type: sql.NVarChar, value: b.Well || '' },
          { name: 'contract',  type: sql.NVarChar, value: b.Contract || null },
          { name: 'po',        type: sql.NVarChar, value: b.PONumber || null },
          { name: 'clientref', type: sql.NVarChar, value: b.ClientRef || null },
          { name: 'erp',       type: sql.NVarChar, value: b.ERPRef || null },
          { name: 'svctype',   type: sql.NVarChar, value: b.ServiceType || null },
          { name: 'hole',      type: sql.NVarChar, value: b.HoleSection || null },
          { name: 'status',    type: sql.NVarChar, value: b.Status || 'Open' },
          { name: 'invtype',   type: sql.NVarChar, value: b.InvoicingType || 'PerJob' },
          { name: 'currency',  type: sql.NVarChar, value: b.Currency || 'USD' },
          { name: 'year',      type: sql.NVarChar, value: b.FiscalYear || null },
          { name: 'mob',       type: sql.Date,     value: b.MobDate ? new Date(b.MobDate) : null },
          { name: 'demob',     type: sql.Date,     value: b.DemobDate ? new Date(b.DemobDate) : null },
          { name: 'notes',     type: sql.NVarChar, value: b.Notes || null },
          { name: 'by',        type: sql.NVarChar, value: user.Username },
        ]
      )
      const created = await query(
        `SELECT * FROM tbl_Jobs WHERE JobID = @id`,
        [{ name: 'id', type: sql.NVarChar, value: newId }]
      )
      return jsonResponse(context, 201, created.recordset[0])
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to create job' })
    }
  }

  // ── PUT /api/jobs/{id}  (update) ──────────────────────────────────────────
  if (method === 'PUT' && jobId && !sub) {
    if (!['Admin', 'Operations'].includes(user.Role)) {
      return jsonResponse(context, 403, { error: 'Insufficient permissions' })
    }
    const b = req.body || {}
    try {
      await query(
        `UPDATE tbl_Jobs SET
           Client = @client, Rig = @rig, Well = @well,
           Contract = @contract, PONumber = @po, ClientRef = @clientref,
           ERPRef = @erp, ServiceType = @svctype, HoleSection = @hole,
           Status = @status, InvoicingType = @invtype, Currency = @currency,
           FiscalYear = @year, MobDate = @mob, DemobDate = @demob,
           Notes = @notes,
           FirstDtDate = @fdt, LastRtDate = @lrt, DocsSignedDate = @docs,
           SubmittedToBillingDate = @stb, DraftInvoicedDate = @did,
           DraftInvoiceNumber = @din, SesSubmittedDate = @ses,
           SesNumber = @sesno, FinalInvoicedDate = @fid,
           LegalInvoiceNumber = @lin, InvoiceDate = @invdt,
           UpdatedAt = GETDATE()
         WHERE  JobID = @id`,
        [
          { name: 'id',       type: sql.NVarChar, value: jobId },
          { name: 'client',   type: sql.NVarChar, value: b.Client || '' },
          { name: 'rig',      type: sql.NVarChar, value: b.Rig || '' },
          { name: 'well',     type: sql.NVarChar, value: b.Well || '' },
          { name: 'contract', type: sql.NVarChar, value: b.Contract || null },
          { name: 'po',       type: sql.NVarChar, value: b.PONumber || null },
          { name: 'clientref',type: sql.NVarChar, value: b.ClientRef || null },
          { name: 'erp',      type: sql.NVarChar, value: b.ERPRef || null },
          { name: 'svctype',  type: sql.NVarChar, value: b.ServiceType || null },
          { name: 'hole',     type: sql.NVarChar, value: b.HoleSection || null },
          { name: 'status',   type: sql.NVarChar, value: b.Status || 'Open' },
          { name: 'invtype',  type: sql.NVarChar, value: b.InvoicingType || 'PerJob' },
          { name: 'currency', type: sql.NVarChar, value: b.Currency || 'USD' },
          { name: 'year',     type: sql.NVarChar, value: b.FiscalYear || null },
          { name: 'mob',      type: sql.Date,     value: b.MobDate    ? new Date(b.MobDate)    : null },
          { name: 'demob',    type: sql.Date,     value: b.DemobDate  ? new Date(b.DemobDate)  : null },
          { name: 'notes',    type: sql.NVarChar, value: b.Notes || null },
          { name: 'fdt',      type: sql.Date,     value: b.FirstDtDate            ? new Date(b.FirstDtDate)            : null },
          { name: 'lrt',      type: sql.Date,     value: b.LastRtDate             ? new Date(b.LastRtDate)             : null },
          { name: 'docs',     type: sql.Date,     value: b.DocsSignedDate         ? new Date(b.DocsSignedDate)         : null },
          { name: 'stb',      type: sql.Date,     value: b.SubmittedToBillingDate ? new Date(b.SubmittedToBillingDate) : null },
          { name: 'did',      type: sql.Date,     value: b.DraftInvoicedDate      ? new Date(b.DraftInvoicedDate)      : null },
          { name: 'din',      type: sql.NVarChar, value: b.DraftInvoiceNumber || null },
          { name: 'ses',      type: sql.Date,     value: b.SesSubmittedDate       ? new Date(b.SesSubmittedDate)       : null },
          { name: 'sesno',    type: sql.NVarChar, value: b.SesNumber || null },
          { name: 'fid',      type: sql.Date,     value: b.FinalInvoicedDate      ? new Date(b.FinalInvoicedDate)      : null },
          { name: 'lin',      type: sql.NVarChar, value: b.LegalInvoiceNumber || null },
          { name: 'invdt',    type: sql.Date,     value: b.InvoiceDate            ? new Date(b.InvoiceDate)            : null },
          { name: 'by',       type: sql.NVarChar, value: user.Username },
        ]
      )
      return jsonResponse(context, 200, { success: true })
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to update job' })
    }
  }

  // ── GET /api/jobs/{id}/tools ───────────────────────────────────────────────
  if (method === 'GET' && sub === 'tools') {
    try {
      const result = await query(
        // tbl_Inventory has no Category/CategoryID columns (confirmed via
        // INFORMATION_SCHEMA) — selecting them made this 500 even once
        // tbl_JobTools existed. Resolve the live asset details instead, and
        // fall back to the snapshot stored on the job-tool row.
        `SELECT jt.JobToolID, jt.JobID, jt.SystemID, jt.Serial, jt.AssetNo,
                jt.ShortDesc, jt.Size, jt.IsEmdad, jt.AddedDate, jt.AddedBy, jt.Notes,
                COALESCE(NULLIF(i.AssetNo, ''),   jt.AssetNo)   AS LiveAssetNo,
                COALESCE(NULLIF(i.ShortDesc, ''), jt.ShortDesc) AS LiveShortDesc,
                COALESCE(NULLIF(i.Size, ''),      jt.Size)      AS LiveSize,
                i.Status   AS ToolStatus,
                i.Location AS ToolLocation
         FROM   tbl_JobTools jt
         LEFT   JOIN tbl_Inventory i ON jt.SystemID = i.SystemID
         WHERE  jt.JobID = @id
         ORDER  BY jt.AddedDate`,
        [{ name: 'id', type: sql.NVarChar, value: jobId }]
      )
      return jsonResponse(context, 200, result.recordset)
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to load job tools' })
    }
  }

  // ── POST /api/jobs/{id}/tools ──────────────────────────────────────────────
  if (method === 'POST' && sub === 'tools') {
    if (!['Admin', 'Operations'].includes(user.Role)) {
      return jsonResponse(context, 403, { error: 'Insufficient permissions' })
    }
    const b = req.body || {}
    try {
      await query(
        `INSERT INTO tbl_JobTools (JobID, SystemID, Serial, AssetNo, ShortDesc, Size, IsEmdad, AddedDate, AddedBy, Notes)
         VALUES (@job, @sys, @serial, @asset, @desc, @size, @isemdad, GETDATE(), @by, @notes)`,
        [
          { name: 'job',     type: sql.NVarChar, value: jobId },
          { name: 'sys',     type: sql.NVarChar, value: b.SystemID  || null },
          { name: 'serial',  type: sql.NVarChar, value: b.Serial    || null },
          { name: 'asset',   type: sql.NVarChar, value: b.AssetNo   || null },
          { name: 'desc',    type: sql.NVarChar, value: b.ShortDesc || null },
          { name: 'size',    type: sql.NVarChar, value: b.Size      || null },
          { name: 'isemdad', type: sql.Bit,      value: b.IsEmdad ? 1 : 0 },
          { name: 'by',      type: sql.NVarChar, value: user.Username },
          { name: 'notes',   type: sql.NVarChar, value: b.Notes     || null },
        ]
      )
      return jsonResponse(context, 201, { success: true })
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to add tool' })
    }
  }

  // ── DELETE /api/jobs/{id}/tools/{tid} ─────────────────────────────────────
  if (method === 'DELETE' && sub === 'tools' && subId) {
    if (!['Admin', 'Operations'].includes(user.Role)) {
      return jsonResponse(context, 403, { error: 'Insufficient permissions' })
    }
    try {
      await query(
        `DELETE FROM tbl_JobTools WHERE JobToolID = @tid AND JobID = @jid`,
        [
          { name: 'tid', type: sql.Int,      value: parseInt(subId) },
          { name: 'jid', type: sql.NVarChar, value: jobId },
        ]
      )
      return jsonResponse(context, 200, { success: true })
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to remove tool' })
    }
  }

  // ── GET /api/jobs/{id}/personnel ──────────────────────────────────────────
  if (method === 'GET' && sub === 'personnel') {
    try {
      const result = await query(
        `SELECT * FROM tbl_JobPersonnel WHERE JobID = @id ORDER BY MobDate`,
        [{ name: 'id', type: sql.NVarChar, value: jobId }]
      )
      return jsonResponse(context, 200, result.recordset)
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to load personnel' })
    }
  }

  // ── POST /api/jobs/{id}/personnel ─────────────────────────────────────────
  if (method === 'POST' && sub === 'personnel') {
    if (!['Admin', 'Operations'].includes(user.Role)) {
      return jsonResponse(context, 403, { error: 'Insufficient permissions' })
    }
    const b = req.body || {}
    try {
      await query(
        `INSERT INTO tbl_JobPersonnel (JobID, UserID, Name, Role, MobDate, DemobDate, Notes)
         VALUES (@job, @uid, @name, @role, @mob, @demob, @notes)`,
        [
          { name: 'job',   type: sql.NVarChar, value: jobId },
          { name: 'uid',   type: sql.Int,      value: b.UserID   || null },
          { name: 'name',  type: sql.NVarChar, value: b.Name     || null },
          { name: 'role',  type: sql.NVarChar, value: b.Role     || null },
          { name: 'mob',   type: sql.Date,     value: b.MobDate  ? new Date(b.MobDate)  : null },
          { name: 'demob', type: sql.Date,     value: b.DemobDate? new Date(b.DemobDate): null },
          { name: 'notes', type: sql.NVarChar, value: b.Notes    || null },
        ]
      )
      return jsonResponse(context, 201, { success: true })
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to add personnel' })
    }
  }

  // ── DELETE /api/jobs/{id}/personnel/{pid} ─────────────────────────────────
  // Documented in this file's header but never implemented, so a crew member
  // could be added and never removed.
  if (method === 'DELETE' && sub === 'personnel' && subId) {
    if (!['Admin', 'Operations'].includes(user.Role)) {
      return jsonResponse(context, 403, { error: 'Insufficient permissions' })
    }
    try {
      await query(
        `DELETE FROM tbl_JobPersonnel WHERE id = @pid AND JobID = @jid`,
        [
          { name: 'pid', type: sql.Int,      value: parseInt(subId) },
          { name: 'jid', type: sql.NVarChar, value: jobId },
        ]
      )
      return jsonResponse(context, 200, { success: true })
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to remove personnel' })
    }
  }

  jsonResponse(context, 405, { error: 'Method not allowed' })
}
