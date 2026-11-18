/**
 * Contracts API
 * GET  /api/contracts             — list
 * POST /api/contracts             — create
 * PUT  /api/contracts/{id}        — update
 * GET  /api/contracts/{id}/rates  — rate lines for a contract
 * POST /api/contracts/{id}/rates  — add rate line
 *
 * Real tbl_Contracts columns (confirmed via INFORMATION_SCHEMA):
 *   ContractID (varchar PK), Client, ContractRef, PONumber, Currency,
 *   StartDate, EndDate, Status, Notes, ContractValue, PBGNumber,
 *   PBGValue, PBGIssueDate, PBGExpiryDate, InvoicedToDate
 * Real tbl_ContractRates columns:
 *   RateID, ContractCode, ContractName, ContractRef, Category,
 *   EMDADShortDesc, Size, HoleSection, OpsRate, StandbyRate, RunCharges,
 *   Redress, Currency, Notes, ActiveFlag
 * (No ContractNumber/ClientID/Description/IsActive on tbl_Contracts —
 * Client is already a plain text name, not an FK. Rates link to a
 * contract by ContractCode text, not a numeric ContractID. SQL aliases
 * output back to the PascalCase names the frontend already expects.)
 */
const { sql, query, jsonResponse, requireAuth, safe , audit } = require('../db')
const master = require('../master')

module.exports = safe(async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const method = req.method.toUpperCase()
  const id     = context.bindingData.id
  const sub    = context.bindingData.sub   // 'rates'
  const subId  = context.bindingData.subId // rate ID

  // Prime contract end vs extensions. EndDate is the current validity (after
  // any extension); PrimeEndDate is the original contract's end and
  // ExtensionRef says what extended it, so the register can show which
  // validity is the prime term and which an extension.
  await query(`IF COL_LENGTH('dbo.tbl_Contracts','PrimeEndDate') IS NULL ALTER TABLE dbo.tbl_Contracts ADD PrimeEndDate date NULL;
               IF COL_LENGTH('dbo.tbl_Contracts','ExtensionRef') IS NULL ALTER TABLE dbo.tbl_Contracts ADD ExtensionRef nvarchar(300) NULL;`, [])

  // ── GET /api/contracts/rate-scopes ───────────────────────────────────────
  // Every distinct ContractCode / ContractRef in tbl_ContractRates with its
  // row counts and the contract it resolves to (if any). This is how to see
  // rate rows that are filed under a code no contract register row carries.
  if (method === 'GET' && id === 'rate-scopes') {
    try {
      const r = await query(
        `WITH g AS (
           SELECT LTRIM(RTRIM(ISNULL(ContractCode,''))) AS ContractCode,
                  LTRIM(RTRIM(ISNULL(ContractRef,'')))  AS ContractRef,
                  COUNT(*) AS Rows_, SUM(CASE WHEN ActiveFlag = 1 THEN 1 ELSE 0 END) AS Active,
                  MIN(ContractName) AS ContractName
             FROM tbl_ContractRates
            GROUP BY LTRIM(RTRIM(ISNULL(ContractCode,''))), LTRIM(RTRIM(ISNULL(ContractRef,'')))
         )
         SELECT g.*,
                (SELECT TOP 1 c.ContractID FROM tbl_Contracts c
                  WHERE UPPER(g.ContractCode) = UPPER(c.ContractRef)
                     OR UPPER(g.ContractCode) LIKE UPPER(c.ContractRef) + '-%'
                     OR UPPER(g.ContractRef) = UPPER(c.ContractRef)) AS MatchedContractID
           FROM g ORDER BY g.ContractCode`, [])
      return jsonResponse(context, 200, r.recordset.map(x => ({ ...x, Rows: x.Rows_, Rows_: undefined })))
    } catch (e) { return jsonResponse(context, 500, { error: e.message }) }
  }

  // ── GET /api/contracts ────────────────────────────────────────────────────
  if (method === 'GET' && !id) {
    try {
      const result = await query(
        // Returns the real tbl_Contracts columns. This previously selected
        // invented aliases (ContractName built as "Client - Ref", a ClientID
        // that does not exist on the table) and silently dropped PBGNumber,
        // PBGValue, PBGIssueDate, PBGExpiryDate, ContractValue, PONumber and
        // InvoicedToDate — so the register had no PBG details even though
        // 13 contracts carry them.
        // No MonthlyCharges here. It is a column on tbl_ContractRates - a
        // per-rate-line monthly charge, which rates.js reads - not on
        // tbl_Contracts, whose real columns are listed at the top of this
        // file. Selecting it here made the whole statement fail on an
        // invalid column name, which is why both the Master Contract
        // Register and the Contracts Dashboard showed nothing at all.
        `SELECT c.ContractID,
                c.ContractRef      AS ContractNumber,
                c.Client           AS ClientName,
                c.PONumber,
                c.Currency,
                c.StartDate,
                c.EndDate,
                c.Status,
                c.Notes            AS Description,
                c.ContractValue,
                c.InvoicedToDate,
                c.PrimeEndDate,
                c.ExtensionRef,
                c.PBGNumber,
                c.PBGValue,
                c.PBGIssueDate,
                c.PBGExpiryDate,
                CASE WHEN c.Status = 'Active' THEN 1 ELSE 0 END AS IsActive
         FROM   tbl_Contracts c
         ORDER  BY CASE WHEN c.Status = 'Active' THEN 0
                        WHEN c.Status = 'Closed' THEN 1
                        ELSE 2 END,
                  c.ContractRef`
      )
      return jsonResponse(context, 200, result.recordset)
    } catch (err) {
      context.log.error(err)
      return jsonResponse(context, 500, { error: 'Failed to load contracts' })
    }
  }

  // ── Which rate rows belong to a contract ─────────────────────────────────
  // tbl_Contracts.ContractID is a plain number ('8'); jobs and rate rows carry
  // the contract NUMBER (ContractRef '4700024096'), and a scoped contract
  // files its rates as '4700024608-UDR' / '-UZ'. So rates are matched on the
  // ref, exact or with a scope suffix. The old code matched ContractCode to
  // ContractID and so never found a single rate.
  async function contractRow(cid) {
    const r = await query(`SELECT TOP 1 * FROM tbl_Contracts WHERE ContractID = @id OR ContractRef = @id`,
      [{ name: 'id', type: sql.VarChar, value: String(cid) }])
    return r.recordset[0] || null
  }
  const RATE_COLS = `r.RateID, r.ContractCode, r.ContractRef, r.Category, r.EMDADShortDesc, r.Size, r.HoleSection,
                     r.OpsRate, r.StandbyRate, r.RunCharges, r.Redress, r.MonthlyCharges, r.Currency, r.Notes, r.ActiveFlag`
  const rateWhere = `(UPPER(LTRIM(RTRIM(r.ContractCode))) = UPPER(@ref) OR UPPER(LTRIM(RTRIM(r.ContractCode))) LIKE UPPER(@ref) + '-%'
                      OR UPPER(LTRIM(RTRIM(r.ContractRef))) = UPPER(@ref))`

  // ── GET /api/contracts/{id} — one contract with counts ───────────────────
  if (method === 'GET' && id && !sub) {
    const c = await contractRow(id)
    if (!c) return jsonResponse(context, 404, { error: 'Contract not found' })
    const ref = String(c.ContractRef || '').trim()
    const n = await query(
      `SELECT (SELECT COUNT(*) FROM tbl_ContractRates r WHERE ${rateWhere} AND r.ActiveFlag = 1) AS rates,
              (SELECT COUNT(*) FROM tbl_Jobs j WHERE UPPER(LTRIM(RTRIM(j.Contract))) = UPPER(@ref)
                  OR UPPER(LTRIM(RTRIM(j.Contract))) LIKE UPPER(@ref) + '-%') AS jobs,
              (SELECT COUNT(*) FROM tbl_Jobs j WHERE (UPPER(LTRIM(RTRIM(j.Contract))) = UPPER(@ref)
                  OR UPPER(LTRIM(RTRIM(j.Contract))) LIKE UPPER(@ref) + '-%')
                  AND j.Status NOT IN ('Completed','JobCompleted','Cancelled','Closed')) AS openJobs,
              (SELECT STRING_AGG(x.ContractCode, ',') FROM (SELECT DISTINCT r.ContractCode FROM tbl_ContractRates r WHERE ${rateWhere}) x) AS scopes`,
      [{ name: 'ref', type: sql.VarChar, value: ref }])
    const x = n.recordset[0] || {}
    return jsonResponse(context, 200, {
      ContractID: c.ContractID, ContractNumber: c.ContractRef, ClientName: c.Client, PONumber: c.PONumber,
      Currency: c.Currency, StartDate: c.StartDate, EndDate: c.EndDate, Status: c.Status, Description: c.Notes,
      ContractValue: c.ContractValue, InvoicedToDate: c.InvoicedToDate, PrimeEndDate: c.PrimeEndDate, ExtensionRef: c.ExtensionRef,
      PBGNumber: c.PBGNumber, PBGValue: c.PBGValue,
      PBGIssueDate: c.PBGIssueDate, PBGExpiryDate: c.PBGExpiryDate,
      rateCount: Number(x.rates || 0), jobCount: Number(x.jobs || 0), openJobs: Number(x.openJobs || 0),
      scopes: String(x.scopes || '').split(',').filter(Boolean).sort(),
    })
  }

  // ── GET /api/contracts/{id}/rates ─────────────────────────────────────────
  if (method === 'GET' && id && sub === 'rates') {
    const c = await contractRow(id)
    if (!c) return jsonResponse(context, 404, { error: 'Contract not found' })
    const result = await query(
      `SELECT ${RATE_COLS} FROM tbl_ContractRates r WHERE ${rateWhere}
        ORDER BY r.ActiveFlag DESC, r.ContractCode, r.Category, r.HoleSection, r.Size`,
      [{ name: 'ref', type: sql.VarChar, value: String(c.ContractRef || '').trim() }])
    return jsonResponse(context, 200, result.recordset)
  }

  // ── POST /api/contracts — create ──────────────────────────────────────────
  if (method === 'POST' && !id) {
    if (!['Admin', 'Finance'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Admin or Finance only' })
    const b = req.body || {}
    const ref = String(b.ContractNumber || '').trim()
    if (!ref) return jsonResponse(context, 400, { error: 'Contract number (ref) is required' })
    if (!String(b.ClientName || '').trim()) return jsonResponse(context, 400, { error: 'Client is required' })
    const dup = await query(`SELECT TOP 1 ContractID FROM tbl_Contracts WHERE UPPER(ContractRef) = UPPER(@ref)`,
      [{ name: 'ref', type: sql.VarChar, value: ref }])
    if (dup.recordset.length) return jsonResponse(context, 409, { error: `${ref} is already in the register` })
    // Ids are plain numbers; continue the series.
    const nx = await query(`SELECT COALESCE(MAX(TRY_CAST(ContractID AS int)), 0) + 1 AS n FROM tbl_Contracts`, [])
    const newId = String(nx.recordset[0].n)
    await query(
      `INSERT INTO tbl_Contracts
         (ContractID, Client, ContractRef, PONumber, Currency, StartDate, EndDate, Status, Notes,
          ContractValue, PBGNumber, PBGValue, PBGIssueDate, PBGExpiryDate)
       VALUES (@id, @client, @ref, @po, @currency, @start, @end, @status, @desc, @val, @pbgno, @pbgval, @pbgiss, @pbgexp)`,
      [
        { name: 'id',       type: sql.VarChar,  value: newId },
        { name: 'client',   type: sql.VarChar,  value: String(b.ClientName).trim() },
        { name: 'ref',      type: sql.VarChar,  value: ref },
        { name: 'po',       type: sql.VarChar,  value: b.PONumber || null },
        { name: 'currency', type: sql.VarChar,  value: b.Currency || 'USD' },
        { name: 'start',    type: sql.Date,     value: b.StartDate ? new Date(b.StartDate) : null },
        { name: 'end',      type: sql.Date,     value: b.EndDate ? new Date(b.EndDate) : null },
        { name: 'status',   type: sql.VarChar,  value: b.Status || 'Active' },
        { name: 'desc',     type: sql.VarChar,  value: b.Description || null },
        { name: 'val',      type: sql.Decimal(18, 2), value: b.ContractValue == null || b.ContractValue === '' ? null : Number(b.ContractValue) },
        { name: 'pbgno',    type: sql.VarChar,  value: b.PBGNumber || null },
        { name: 'pbgval',   type: sql.Decimal(18, 2), value: b.PBGValue == null || b.PBGValue === '' ? null : Number(b.PBGValue) },
        { name: 'pbgiss',   type: sql.Date,     value: b.PBGIssueDate ? new Date(b.PBGIssueDate) : null },
        { name: 'pbgexp',   type: sql.Date,     value: b.PBGExpiryDate ? new Date(b.PBGExpiryDate) : null },
      ])
    return jsonResponse(context, 201, { success: true, ContractID: newId, ContractNumber: ref })
  }

  // ── PUT /api/contracts/{id} — header ──────────────────────────────────────
  if (method === 'PUT' && id && !sub) {
    if (!['Admin', 'Finance'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Admin or Finance only' })
    const c = await contractRow(id)
    if (!c) return jsonResponse(context, 404, { error: 'Contract not found' })
    const b = req.body || {}
    const num = (v) => (v === undefined ? null : (v === '' || v == null ? null : Number(v)))
    const dt  = (v) => (v === undefined ? null : (v ? new Date(v) : null))
    // Unsent fields keep their value; an empty string clears a text/date field.
    await query(
      `UPDATE tbl_Contracts SET
         Client        = COALESCE(@client, Client),
         PONumber      = CASE WHEN @po IS NULL THEN PONumber ELSE NULLIF(@po,'') END,
         Currency      = COALESCE(@currency, Currency),
         StartDate     = CASE WHEN @startSent = 1 THEN @start ELSE StartDate END,
         EndDate       = CASE WHEN @endSent = 1 THEN @end ELSE EndDate END,
         Status        = COALESCE(@status, Status),
         Notes         = CASE WHEN @desc IS NULL THEN Notes ELSE NULLIF(@desc,'') END,
         ContractValue = CASE WHEN @valSent = 1 THEN @val ELSE ContractValue END,
         InvoicedToDate= CASE WHEN @invSent = 1 THEN @inv ELSE InvoicedToDate END,
         PBGNumber     = CASE WHEN @pbgno IS NULL THEN PBGNumber ELSE NULLIF(@pbgno,'') END,
         PBGValue      = CASE WHEN @pbgvalSent = 1 THEN @pbgval ELSE PBGValue END,
         PBGIssueDate  = CASE WHEN @pbgissSent = 1 THEN @pbgiss ELSE PBGIssueDate END,
         PBGExpiryDate = CASE WHEN @pbgexpSent = 1 THEN @pbgexp ELSE PBGExpiryDate END,
         PrimeEndDate  = CASE WHEN @primeSent = 1 THEN @prime ELSE PrimeEndDate END,
         ExtensionRef  = CASE WHEN @extref IS NULL THEN ExtensionRef ELSE NULLIF(@extref,'') END
       WHERE ContractID = @id`,
      [
        { name: 'id',       type: sql.VarChar,  value: c.ContractID },
        { name: 'client',   type: sql.VarChar,  value: b.ClientName === undefined ? null : String(b.ClientName) },
        { name: 'po',       type: sql.VarChar,  value: b.PONumber === undefined ? null : String(b.PONumber) },
        { name: 'currency', type: sql.VarChar,  value: b.Currency || null },
        { name: 'startSent',type: sql.Bit,      value: b.StartDate !== undefined ? 1 : 0 },
        { name: 'start',    type: sql.Date,     value: dt(b.StartDate) },
        { name: 'endSent',  type: sql.Bit,      value: b.EndDate !== undefined ? 1 : 0 },
        { name: 'end',      type: sql.Date,     value: dt(b.EndDate) },
        { name: 'status',   type: sql.VarChar,  value: b.Status || null },
        { name: 'desc',     type: sql.VarChar,  value: b.Description === undefined ? null : String(b.Description) },
        { name: 'valSent',  type: sql.Bit,      value: b.ContractValue !== undefined ? 1 : 0 },
        { name: 'val',      type: sql.Decimal(18, 2), value: num(b.ContractValue) },
        { name: 'invSent',  type: sql.Bit,      value: b.InvoicedToDate !== undefined ? 1 : 0 },
        { name: 'inv',      type: sql.Decimal(18, 2), value: num(b.InvoicedToDate) },
        { name: 'pbgno',    type: sql.VarChar,  value: b.PBGNumber === undefined ? null : String(b.PBGNumber) },
        { name: 'pbgvalSent',type: sql.Bit,     value: b.PBGValue !== undefined ? 1 : 0 },
        { name: 'pbgval',   type: sql.Decimal(18, 2), value: num(b.PBGValue) },
        { name: 'pbgissSent',type: sql.Bit,     value: b.PBGIssueDate !== undefined ? 1 : 0 },
        { name: 'pbgiss',   type: sql.Date,     value: dt(b.PBGIssueDate) },
        { name: 'pbgexpSent',type: sql.Bit,     value: b.PBGExpiryDate !== undefined ? 1 : 0 },
        { name: 'pbgexp',   type: sql.Date,     value: dt(b.PBGExpiryDate) },
        { name: 'primeSent',type: sql.Bit,      value: b.PrimeEndDate !== undefined ? 1 : 0 },
        { name: 'prime',    type: sql.Date,     value: dt(b.PrimeEndDate) },
        { name: 'extref',   type: sql.NVarChar, value: b.ExtensionRef === undefined ? null : String(b.ExtensionRef) },
      ])
    await audit(user, 'contract', String(c.ContractRef || c.ContractID), 'update-header', b)
    return jsonResponse(context, 200, { success: true })
  }

  // ── Rates: add / edit / deactivate / paste ────────────────────────────────
  const RATE_EDITORS = ['Admin', 'Finance', 'Billing']
  const numOrNull = (v) => (v === '' || v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : NaN))

  async function cleanRate(b, c) {
    const category = String(b.Category || b.category || '').trim()
    if (!category) return { error: 'Category is required' }
    const vals = {
      code:    String(b.ContractCode || b.contractCode || c.ContractRef).trim(),
      category,
      desc:    String(b.EMDADShortDesc || b.shortDesc || '').trim() || null,
      size:    String(b.Size || b.size || '').trim() || null,   // standardised below
      hole:    String(b.HoleSection || b.holeSection || '').trim() || null,
      ops:     numOrNull(b.OpsRate ?? b.opsRate),
      standby: numOrNull(b.StandbyRate ?? b.standbyRate),
      run:     numOrNull(b.RunCharges ?? b.runCharges),
      redress: numOrNull(b.Redress ?? b.redress),
      monthly: numOrNull(b.MonthlyCharges ?? b.monthlyCharges),
      currency:String(b.Currency || b.currency || c.Currency || 'USD').trim(),
      notes:   String(b.Notes || b.notes || '').trim() || null,
    }
    // A plain inch size takes the master label (8.250" → 8-1/4"); a range such
    // as 10"-15" or a text size stays as typed, since it is the contract's wording.
    if (vals.size) { const std = await master.standardiseSize(vals.size, { allowUnknown: true }); vals.size = std.value }
    for (const k of ['ops','standby','run','redress','monthly']) if (Number.isNaN(vals[k])) return { error: `${k} rate must be a number` }
    if (vals.ops == null && vals.monthly == null && vals.standby == null) return { error: 'Give an operating, standby or monthly rate' }
    const base = String(c.ContractRef || '').trim().toUpperCase()
    const code = vals.code.toUpperCase()
    if (code !== base && !code.startsWith(base + '-')) return { error: `Scope must be ${c.ContractRef} or ${c.ContractRef}-<scope>` }
    return { v: vals }
  }
  const rateParams = (v, c) => [
    { name: 'code', type: sql.VarChar, value: v.code }, { name: 'ref', type: sql.VarChar, value: String(c.ContractRef || '').trim() },
    { name: 'cat', type: sql.VarChar, value: v.category }, { name: 'desc', type: sql.VarChar, value: v.desc },
    { name: 'size', type: sql.VarChar, value: v.size }, { name: 'hole', type: sql.VarChar, value: v.hole },
    { name: 'ops', type: sql.Decimal(18, 2), value: v.ops }, { name: 'standby', type: sql.Decimal(18, 2), value: v.standby },
    { name: 'run', type: sql.Decimal(18, 2), value: v.run }, { name: 'redress', type: sql.Decimal(18, 2), value: v.redress },
    { name: 'monthly', type: sql.Decimal(18, 2), value: v.monthly }, { name: 'cur', type: sql.VarChar, value: v.currency },
    { name: 'notes', type: sql.VarChar, value: v.notes },
  ]
  const INSERT_RATE = `INSERT INTO tbl_ContractRates
      (ContractCode, ContractRef, Category, EMDADShortDesc, Size, HoleSection, OpsRate, StandbyRate, RunCharges, Redress, MonthlyCharges, Currency, Notes, ActiveFlag)
    OUTPUT INSERTED.RateID
    VALUES (@code, @ref, @cat, @desc, @size, @hole, @ops, @standby, @run, @redress, @monthly, @cur, @notes, 1)`

  if (method === 'POST' && id && sub === 'rates' && !subId) {
    if (!RATE_EDITORS.includes(user.Role)) return jsonResponse(context, 403, { error: 'Admin, Finance or Billing only' })
    const c = await contractRow(id)
    if (!c) return jsonResponse(context, 404, { error: 'Contract not found' })
    const { error, v } = await cleanRate(req.body || {}, c)
    if (error) return jsonResponse(context, 400, { error })
    const r = await query(INSERT_RATE, rateParams(v, c))
    await audit(user, 'contract', String(c.ContractRef), 'add-rate', { RateID: r.recordset[0].RateID, ...v })
    return jsonResponse(context, 201, { success: true, RateID: r.recordset[0].RateID })
  }

  // Paste from Excel: tab-separated, one rate a line. Columns in order:
  // Category, Size, Hole section, Ops rate, Standby rate, Redress, Monthly, Run charges, Currency, Scope.
  // A header row is skipped when its first cell says Category.
  if (method === 'POST' && id && sub === 'rates' && subId === 'paste') {
    if (!RATE_EDITORS.includes(user.Role)) return jsonResponse(context, 403, { error: 'Admin, Finance or Billing only' })
    const c = await contractRow(id)
    if (!c) return jsonResponse(context, 404, { error: 'Contract not found' })
    const text = String((req.body || {}).text || '')
    const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim())
    let added = 0
    const rejected = []
    for (let i = 0; i < lines.length; i++) {
      const cells = lines[i].split('\t').map(x => x.trim())
      if (i === 0 && /^categor/i.test(cells[0] || '')) continue
      const [category, size, hole, ops, standby, redress, monthly, run, currency, scope] = cells
      const { error, v } = await cleanRate({ Category: category, Size: size, HoleSection: hole, OpsRate: ops, StandbyRate: standby,
                                       Redress: redress, MonthlyCharges: monthly, RunCharges: run, Currency: currency, ContractCode: scope }, c)
      if (error) { rejected.push({ line: i + 1, reason: error, text: lines[i].slice(0, 80) }); continue }
      await query(INSERT_RATE, rateParams(v, c))
      added++
    }
    if (added) await audit(user, 'contract', String(c.ContractRef), 'paste-rates', { added, rejected: rejected.length })
    return jsonResponse(context, 200, { added, rejected })
  }

  if (method === 'PUT' && id && sub === 'rates' && subId) {
    if (!RATE_EDITORS.includes(user.Role)) return jsonResponse(context, 403, { error: 'Admin, Finance or Billing only' })
    const c = await contractRow(id)
    if (!c) return jsonResponse(context, 404, { error: 'Contract not found' })
    const b = req.body || {}
    // Active flag alone: deactivate / reactivate without touching the figures.
    if (Object.keys(b).length === 1 && b.ActiveFlag !== undefined) {
      const r = await query(`UPDATE tbl_ContractRates SET ActiveFlag = @a WHERE RateID = @rid`,
        [{ name: 'a', type: sql.Bit, value: b.ActiveFlag ? 1 : 0 }, { name: 'rid', type: sql.Int, value: Number(subId) }])
      if (!r.rowsAffected[0]) return jsonResponse(context, 404, { error: 'Rate not found' })
      await audit(user, 'contract', String(c.ContractRef), b.ActiveFlag ? 'reactivate-rate' : 'deactivate-rate', { RateID: Number(subId) })
      return jsonResponse(context, 200, { success: true })
    }
    const before = await query(`SELECT * FROM tbl_ContractRates WHERE RateID = @rid`, [{ name: 'rid', type: sql.Int, value: Number(subId) }])
    const { error, v } = await cleanRate(b, c)
    if (error) return jsonResponse(context, 400, { error })
    const r = await query(
      `UPDATE tbl_ContractRates SET ContractCode=@code, ContractRef=@ref, Category=@cat, EMDADShortDesc=@desc, Size=@size, HoleSection=@hole,
              OpsRate=@ops, StandbyRate=@standby, RunCharges=@run, Redress=@redress, MonthlyCharges=@monthly, Currency=@cur, Notes=@notes
        WHERE RateID = @rid`,
      [...rateParams(v, c), { name: 'rid', type: sql.Int, value: Number(subId) }])
    if (!r.rowsAffected[0]) return jsonResponse(context, 404, { error: 'Rate not found' })
    await audit(user, 'contract', String(c.ContractRef), 'edit-rate', { RateID: Number(subId), old: before.recordset[0] || null, new: v })
    return jsonResponse(context, 200, { success: true })
  }

  // ── DELETE /api/contracts/{id} ───────────────────────────────────────────
  // Removing a contract created in error. Guarded: a contract that any job is
  // booked against is never deleted, because that would leave those jobs
  // pointing at nothing and silently break their billing lineage. Rates
  // belonging to the contract go with it.
  if (method === 'DELETE' && id && !sub) {
    if (user.Role !== 'Admin')
      return jsonResponse(context, 403, { error: 'Admin only' })

    try {
      // tbl_Contracts has ContractID and ContractRef; 'ContractNumber' is only
      // an alias in this file's SELECT, so referencing it here threw.
      // tbl_Jobs.Contract holds either the id or the ref depending on vintage.
      const inUse = await query(
        `SELECT COUNT(*) AS n FROM tbl_Jobs
          WHERE Contract = @id
             OR Contract = (SELECT TOP 1 ContractRef FROM tbl_Contracts WHERE ContractID = @id)`,
        [{ name: 'id', type: sql.VarChar, value: id }]
      )
      const n = Number(inUse.recordset[0]?.n || 0)
      if (n > 0) {
        return jsonResponse(context, 409, {
          error: `Cannot delete: ${n} job${n === 1 ? ' is' : 's are'} booked against this contract`,
          jobsAffected: n,
        })
      }

      await query('DELETE FROM tbl_ContractRates WHERE ContractCode = @id OR ContractRef = @id',
        [{ name: 'id', type: sql.VarChar, value: id }])
      const r = await query('DELETE FROM tbl_Contracts WHERE ContractID = @id',
        [{ name: 'id', type: sql.VarChar, value: id }])

      return jsonResponse(context, 200, { ok: true, deleted: r.rowsAffected?.[0] ?? 0 })
    } catch (err) {
      context.log.error('Contract delete error:', err)
      return jsonResponse(context, 500, { error: 'Failed to delete contract', detail: err.message })
    }
  }

  jsonResponse(context, 405, { error: 'Method not allowed' })
})
