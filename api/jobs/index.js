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
const { sql, query, jsonResponse, requireAuth, jobKey } = require('../db')

/**
 * A finished job is read-only.
 *
 * 'Completed' is the end of the line - 3,675 jobs carry it, most already
 * legally invoiced - so its figures must not move under an invoice that
 * has gone to the client. Every other status stays editable, because work
 * in progress is exactly what people need to correct.
 *
 * An Admin can unlock one job at a time through POST /api/jobs/{id}/unlock,
 * and the unlock is recorded against the job. The lock lives here rather
 * than only in the screen: a disabled input is a courtesy, not a control.
 */
const LOCKED_STATUS = 'Completed'

async function lockStateOf (jobId) {
  const r = await query(
    `SELECT Status, UnlockedBy, UnlockedAt, UnlockReason
       FROM tbl_Jobs WHERE JobID = @id`,
    [{ name: 'id', type: sql.NVarChar, value: jobId }]
  )
  const j = r.recordset[0]
  if (!j) return { exists: false }
  return {
    exists:   true,
    status:   j.Status,
    unlocked: j.UnlockedAt != null,
    locked:   j.Status === LOCKED_STATUS && j.UnlockedAt == null,
    unlockedBy: j.UnlockedBy || null,
    unlockedAt: j.UnlockedAt || null,
    reason:     j.UnlockReason || null,
  }
}

/**
 * Guards a write. Returns true when the caller may proceed; otherwise it
 * has already answered the request and the caller must return.
 */
async function blockIfLocked (context, jobId) {
  const s = await lockStateOf(jobId)
  if (!s.exists) {
    jsonResponse(context, 404, { error: 'Job not found' })
    return true
  }
  if (s.locked) {
    jsonResponse(context, 423, {
      error:  `This job is ${LOCKED_STATUS} and cannot be changed.`,
      locked: true,
      status: s.status,
      hint:   'An Admin can unlock it if it genuinely needs correcting.',
    })
    return true
  }
  return false
}

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


/**
 * Tools still on the rig for a job: on a delivery ticket, with no return
 * ticket for the same job carrying the same serial.
 *
 * Job numbers are written six different ways across the ticket data, so
 * both sides are normalised with the same rule db.js uses everywhere else.
 * A plain string compare misses roughly a third of them.
 */
async function toolsStillOut (sourceJobId) {
  const K = jobKey
  const r = await query(
    `SELECT dtl.serial                            AS SystemID,
            MAX(dt.dtNumber)                      AS SourceDTNumber,
            MAX(dt.deliveryDate)                  AS SentOn,
            MAX(COALESCE(NULLIF(i.AssetNo, ''), dtl.serial))   AS AssetNo,
            MAX(COALESCE(NULLIF(i.ShortDesc, ''), dtl.toolDescription)) AS ShortDesc,
            MAX(i.Size)                           AS Size,
            MAX(CAST(COALESCE(i.IsEmdad, 1) AS int)) AS IsEmdad,
            MAX(i.Status)                         AS ToolStatus,
            MAX(i.Location)                       AS ToolLocation
       FROM tbl_DeliveryTicketLines dtl
       JOIN tbl_DeliveryTickets dt ON dt.dtNumber = dtl.dtNumber
       LEFT JOIN tbl_Inventory i   ON i.SystemID  = dtl.serial
      WHERE ${K('dt.jobNumber')} = ${K('@job')}
        AND dtl.serial IS NOT NULL
        AND LTRIM(RTRIM(dtl.serial)) <> ''
        AND NOT EXISTS (
              SELECT 1
                FROM tbl_ReceivingTicketLines rtl
                JOIN tbl_ReceivingTickets rt ON rt.rtNumber = rtl.rtNumber
               WHERE rtl.serial = dtl.serial
                 AND ${K('rt.jobNumber')} = ${K('dt.jobNumber')})
      GROUP BY dtl.serial
      ORDER BY MAX(dt.deliveryDate)`,
    [{ name: 'job', type: sql.NVarChar, value: sourceJobId }]
  )
  return r.recordset
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
    const { search, limit, facets } = req.query || {}

    // ?facets=1 — the distinct values actually in use, for the job header's
    // Client / Rig / Well / Contract / Service Type pickers. Those were
    // free-text inputs, which is how the same rig ends up spelled three ways.
    // Returned as five short lists rather than making the browser pull all
    // 3,824 jobs to derive them.
    if (['1', 'true', 'yes'].includes(String(facets).toLowerCase())) {
      try {
        const r = await query(
          `SELECT 'Client' AS field, Client AS value FROM tbl_Jobs
            WHERE NULLIF(LTRIM(RTRIM(Client)), '') IS NOT NULL GROUP BY Client
           UNION ALL
           SELECT 'Rig', Rig FROM tbl_Jobs
            WHERE NULLIF(LTRIM(RTRIM(Rig)), '') IS NOT NULL GROUP BY Rig
           UNION ALL
           SELECT 'Well', Well FROM tbl_Jobs
            WHERE NULLIF(LTRIM(RTRIM(Well)), '') IS NOT NULL GROUP BY Well
           UNION ALL
           SELECT 'Contract', Contract FROM tbl_Jobs
            WHERE NULLIF(LTRIM(RTRIM(Contract)), '') IS NOT NULL GROUP BY Contract
           UNION ALL
           SELECT 'ServiceType', ServiceType FROM tbl_Jobs
            WHERE NULLIF(LTRIM(RTRIM(ServiceType)), '') IS NOT NULL GROUP BY ServiceType
           ORDER BY field, value`, []
        )
        const out = { Client: [], Rig: [], Well: [], Contract: [], ServiceType: [] }
        for (const row of r.recordset) {
          if (out[row.field]) out[row.field].push(row.value)
        }
        return jsonResponse(context, 200, out)
      } catch (err) {
        context.log.error('Job facets error:', err)
        return jsonResponse(context, 500, { error: 'Failed to load job facets', detail: err.message })
      }
    }

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
               CreatedDate, CreatedBy, UpdatedAt,
               -- Lock state travels with the row so the register can show a
               -- finished job as read-only without a call per job.
               UnlockedBy, UnlockedAt, UnlockReason,
               CAST(CASE WHEN Status = 'Completed' AND UnlockedAt IS NULL
                         THEN 1 ELSE 0 END AS bit) AS IsLocked
        FROM   tbl_Jobs
        ${where}
        -- Newest job first. CreatedDate is NULL on the newer rows, and a DESC
        -- sort puts NULLs last in SQL Server, which pushed the newest jobs to
        -- the bottom and showed 2017/2018 jobs first. Sort on the YEAR segment
        -- (always characters 5-7, in every id format here) and then on the id
        -- itself, which is zero-padded and so sorts correctly within a year.
        -- The trailing sequence alone is NOT a key: it repeats across years.
        ORDER  BY TRY_CAST(SUBSTRING(JobID, 5, 3) AS INT) DESC,
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
        `SELECT *,
                -- Computed rather than stored, so it can never drift out of
                -- step with the status it depends on.
                CAST(CASE WHEN Status = 'Completed' AND UnlockedAt IS NULL
                          THEN 1 ELSE 0 END AS bit) AS IsLocked
           FROM tbl_Jobs WHERE JobID = @id`,
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
    if (await blockIfLocked(context, jobId)) return
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
           -- Job value was editable on the header but absent from this list,
           -- so typing it saved nothing and the field silently reverted.
           InvoiceAmount    = @invamt,
           NetInvoiceAmount = @netamt,
           NetSubcontract   = @netsub,
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
          { name: 'invamt',   type: sql.Decimal(18, 2),
            value: b.InvoiceAmount    === '' || b.InvoiceAmount    == null ? null : Number(b.InvoiceAmount) },
          { name: 'netamt',   type: sql.Decimal(18, 2),
            value: b.NetInvoiceAmount === '' || b.NetInvoiceAmount == null ? null : Number(b.NetInvoiceAmount) },
          { name: 'netsub',   type: sql.Decimal(18, 2),
            value: b.NetSubcontract   === '' || b.NetSubcontract   == null ? null : Number(b.NetSubcontract) },
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
  // ── POST /api/jobs/{id}/unlock ────────────────────────────────────────────
  // Admin only, and it is recorded. Operations cannot unlock a finished job
  // however urgent it feels - that separation is the point of the lock.
  if (method === 'POST' && jobId && sub === 'unlock') {
    if (user.Role !== 'Admin')
      return jsonResponse(context, 403, { error: 'Only an Admin can unlock a completed job' })

    const s = await lockStateOf(jobId)
    if (!s.exists) return jsonResponse(context, 404, { error: 'Job not found' })
    if (!s.locked && !s.unlocked)
      return jsonResponse(context, 200, { ok: true, alreadyEditable: true, status: s.status })

    const reason = String((req.body || {}).Reason || '').trim()
    if (!reason)
      return jsonResponse(context, 400, {
        error: 'A reason is required — it is stored against the job so the change can be explained later.',
      })

    await query(
      `UPDATE tbl_Jobs
          SET UnlockedBy = @who, UnlockedAt = GETDATE(), UnlockReason = @reason
        WHERE JobID = @id`,
      [
        { name: 'id',     type: sql.NVarChar, value: jobId },
        { name: 'who',    type: sql.NVarChar, value: user.Username || String(user.UserID || '') },
        { name: 'reason', type: sql.NVarChar, value: reason.slice(0, 300) },
      ]
    )
    return jsonResponse(context, 200, { ok: true, unlocked: true })
  }

  // ── POST /api/jobs/{id}/lock ──────────────────────────────────────────────
  // Puts a previously unlocked job back under the lock. The reason and who
  // unlocked it are cleared, because they describe an unlock that is over.
  if (method === 'POST' && jobId && sub === 'lock') {
    if (user.Role !== 'Admin')
      return jsonResponse(context, 403, { error: 'Only an Admin can re-lock a job' })

    const s = await lockStateOf(jobId)
    if (!s.exists) return jsonResponse(context, 404, { error: 'Job not found' })

    await query(
      `UPDATE tbl_Jobs
          SET UnlockedBy = NULL, UnlockedAt = NULL, UnlockReason = NULL
        WHERE JobID = @id`,
      [{ name: 'id', type: sql.NVarChar, value: jobId }]
    )
    return jsonResponse(context, 200, {
      ok: true,
      locked: s.status === LOCKED_STATUS,
      status: s.status,
    })
  }

  // ── GET /api/jobs/{id}/rollover?from=Job-XXX ──────────────────────────────
  // A preview. Nothing is written, so the person can see exactly what would
  // carry over before committing to it.
  if (method === 'GET' && jobId && sub === 'rollover') {
    const from = (req.query || {}).from
    if (!from) return jsonResponse(context, 400, { error: 'Which job should it roll from?' })

    const [target, source] = await Promise.all([
      query(`SELECT JobID, InvoicingType, Status, Contract, Rig, RolledFromJobID
               FROM tbl_Jobs WHERE JobID = @id`,
        [{ name: 'id', type: sql.NVarChar, value: jobId }]),
      query(`SELECT JobID, InvoicingType, Status, Contract, Rig
               FROM tbl_Jobs WHERE JobID = @id`,
        [{ name: 'id', type: sql.NVarChar, value: from }]),
    ])
    if (!target.recordset.length) return jsonResponse(context, 404, { error: 'Job not found' })
    if (!source.recordset.length) return jsonResponse(context, 404, { error: `${from} not found` })

    const tools = await toolsStillOut(from)

    // Anything already on the target is reported rather than carried twice.
    const existing = await query(
      `SELECT SystemID FROM tbl_JobTools WHERE JobID = @id`,
      [{ name: 'id', type: sql.NVarChar, value: jobId }]
    )
    const have = new Set(existing.recordset.map(x => String(x.SystemID || '').toUpperCase()))

    return jsonResponse(context, 200, {
      target: target.recordset[0],
      source: source.recordset[0],
      willCarry: tools.filter(t => !have.has(String(t.SystemID || '').toUpperCase())),
      alreadyOnJob: tools.filter(t =>  have.has(String(t.SystemID || '').toUpperCase())),
    })
  }

  // ── POST /api/jobs/{id}/rollover ──────────────────────────────────────────
  if (method === 'POST' && jobId && sub === 'rollover') {
    if (!['Admin', 'Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Insufficient permissions' })
    if (await blockIfLocked(context, jobId)) return

    const from = String((req.body || {}).fromJobId || '').trim()
    if (!from) return jsonResponse(context, 400, { error: 'Which job should it roll from?' })
    if (from === jobId) return jsonResponse(context, 400, { error: 'A job cannot roll into itself' })

    const t = await query(
      `SELECT JobID, InvoicingType FROM tbl_Jobs WHERE JobID = @id`,
      [{ name: 'id', type: sql.NVarChar, value: jobId }]
    )
    if (!t.recordset.length) return jsonResponse(context, 404, { error: 'Job not found' })

    // Rollover is what 'Monthly' means. Allowing it on a per-job job would
    // quietly carry tools into work that is billed as one complete job.
    if (String(t.recordset[0].InvoicingType || '') !== 'Monthly')
      return jsonResponse(context, 409, {
        error: 'Rollover is only for jobs set to Monthly invoicing.',
        invoicingType: t.recordset[0].InvoicingType,
      })

    const tools = await toolsStillOut(from)
    if (!tools.length)
      return jsonResponse(context, 200, {
        ok: true, carried: 0, skipped: [],
        message: `Nothing is still out on ${from} — every tool has a return ticket.`,
      })

    const existing = await query(
      `SELECT SystemID FROM tbl_JobTools WHERE JobID = @id`,
      [{ name: 'id', type: sql.NVarChar, value: jobId }]
    )
    const have = new Set(existing.recordset.map(x => String(x.SystemID || '').toUpperCase()))

    const carried = [], skipped = []
    for (const tool of tools) {
      const key = String(tool.SystemID || '').toUpperCase()
      if (have.has(key)) { skipped.push({ systemId: tool.SystemID, reason: 'Already on this job' }); continue }

      await query(
        `INSERT INTO tbl_JobTools
           (JobID, SystemID, Serial, AssetNo, ShortDesc, Size, IsEmdad,
            SourceDTNumber, RolledFromJobID, AddedDate, AddedBy, Notes)
         VALUES (@job, @sid, @sid, @asset, @desc, @size, @emdad,
                 @dt, @from, GETDATE(), @by, @notes)`,
        [
          { name: 'job',   type: sql.NVarChar, value: jobId },
          { name: 'sid',   type: sql.NVarChar, value: tool.SystemID },
          { name: 'asset', type: sql.NVarChar, value: tool.AssetNo || null },
          { name: 'desc',  type: sql.NVarChar, value: tool.ShortDesc || null },
          { name: 'size',  type: sql.NVarChar, value: tool.Size || null },
          { name: 'emdad', type: sql.Bit,      value: tool.IsEmdad ? 1 : 0 },
          // The original DT travels with the tool: utilization is keyed on
          // (JobID, DTNumber, ToolSerial) and days with no ticket behind
          // them are invisible to the revenue rollup.
          { name: 'dt',    type: sql.NVarChar, value: tool.SourceDTNumber || null },
          { name: 'from',  type: sql.NVarChar, value: from },
          { name: 'by',    type: sql.NVarChar, value: user.Username || null },
          { name: 'notes', type: sql.NVarChar,
            value: `Rolled over from ${from}, out since ${tool.SentOn ? String(tool.SentOn).slice(0, 10) : 'unknown'} on ${tool.SourceDTNumber || 'no DT'}` },
        ]
      )
      carried.push({ systemId: tool.SystemID, assetNo: tool.AssetNo,
                     shortDesc: tool.ShortDesc, sourceDT: tool.SourceDTNumber })
      have.add(key)
    }

    await query(
      `UPDATE tbl_Jobs SET RolledFromJobID = @from, UpdatedAt = GETDATE() WHERE JobID = @id`,
      [{ name: 'id', type: sql.NVarChar, value: jobId },
       { name: 'from', type: sql.NVarChar, value: from }]
    )

    return jsonResponse(context, 200, {
      ok: true, carried: carried.length, carriedTools: carried, skipped, from,
    })
  }

  // ── GET /api/jobs/{id}/lock ───────────────────────────────────────────────
  // So the screen knows whether to show the job read-only, and why.
  if (method === 'GET' && jobId && sub === 'lock') {
    const s = await lockStateOf(jobId)
    if (!s.exists) return jsonResponse(context, 404, { error: 'Job not found' })
    return jsonResponse(context, 200, s)
  }

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
    if (await blockIfLocked(context, jobId)) return
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
    if (await blockIfLocked(context, jobId)) return
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
    if (await blockIfLocked(context, jobId)) return
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
    if (await blockIfLocked(context, jobId)) return
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
