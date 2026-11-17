'use strict'
const { sql, query, jsonResponse, requireAuth, safe, hasId } = require('../db')

/**
 * Supplier invoice register — every supplier invoice the app knows, in one place.
 *
 *   GET    /api/supplier-invoices?year=&supplier=&status=&gl=   the register
 *   GET    /api/supplier-invoices/summary?year=                 totals by supplier and by GL, pending list
 *   POST   /api/supplier-invoices                               record an invoice directly
 *   PUT    /api/supplier-invoices/{key}                         status / paid date / GL / notes (any row)
 *
 * Invoices were being recorded in three places with nothing joining them:
 * on a purchase order (tbl_PurchaseOrders.invoiceNumber), on a sub-contract
 * PO (tbl_SubContractPOs.invoiceNo) and as the reference on an expense line
 * (tbl_MonthlyExpenses.invoiceRef). This register READS those three sources
 * as they are - nothing is copied, so a change on the PO screen shows here
 * at once - and adds a fourth: invoices typed straight into the register.
 * Status (Received / Approved / Paid), paid date, GL line and notes for a
 * sourced row are kept in tbl_SupplierInvoices against the row's key, so
 * the source screens stay untouched.
 *
 * Row key: 'PO:<po id>', 'SC:<subcontract po id>', 'EX:<expense id>', 'DI:<direct id>'.
 */
const EDITORS = ['Admin', 'Finance', 'Billing', 'CostController']
const VIEWERS = [...EDITORS, 'Operations', 'Executive']
const STATUSES = ['Received', 'Approved', 'Paid', 'Disputed']

let ready = null
function ensureTable() {
  if (!ready) ready = query(`
    IF OBJECT_ID('dbo.tbl_SupplierInvoices', 'U') IS NULL
      CREATE TABLE dbo.tbl_SupplierInvoices (
        id            int IDENTITY(1,1) NOT NULL CONSTRAINT PK_tbl_SupplierInvoices PRIMARY KEY,
        rowKey        nvarchar(40)  NOT NULL,          -- PO:n / SC:n / EX:n / DI:n (DI rows: 'DI:' + id, set after insert)
        supplierName  nvarchar(200) NULL,
        invoiceNo     nvarchar(80)  NULL,
        invoiceDate   date          NULL,
        amount        decimal(18,2) NULL,
        currency      nvarchar(10)  NULL,
        glCategory    nvarchar(100) NULL,
        poNumber      nvarchar(64)  NULL,
        jobId         nvarchar(64)  NULL,
        status        nvarchar(20)  NULL,
        paidDate      date          NULL,
        notes         nvarchar(500) NULL,
        createdBy     nvarchar(100) NULL,
        createdAt     datetime      NOT NULL CONSTRAINT DF_SI_At DEFAULT (GETDATE()),
        updatedBy     nvarchar(100) NULL,
        updatedAt     datetime      NULL);
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_SupplierInvoices_key')
      CREATE UNIQUE INDEX UX_SupplierInvoices_key ON dbo.tbl_SupplierInvoices(rowKey);`, [])
    .catch(e => { ready = null; throw e })
  return ready
}

// The union of the sources. Overlay o carries status / paid / GL / notes for sourced rows.
const REGISTER_SQL = `
  SELECT u.rowKey, u.source, u.supplierName, u.invoiceNo, u.invoiceDate, u.amount, u.currency,
         COALESCE(o.glCategory, u.glCategory) AS glCategory, u.poNumber, u.jobId,
         COALESCE(o.status, 'Received') AS status, o.paidDate, COALESCE(o.notes, u.notes) AS notes, u.sourceRef
    FROM (
      SELECT 'PO:' + CAST(p.id AS varchar) AS rowKey, 'Purchase order' AS source, p.supplierName, p.invoiceNumber AS invoiceNo,
             p.invoiceDate, p.invoiceAmount AS amount, p.currency, CAST(NULL AS nvarchar(100)) AS glCategory, p.poNumber,
             (SELECT TOP 1 l.jobId FROM tbl_PurchaseOrderLines l WHERE l.poNumber = p.poNumber AND NULLIF(l.jobId,'') IS NOT NULL) AS jobId,
             p.notes, p.poNumber AS sourceRef
        FROM tbl_PurchaseOrders p
       WHERE NULLIF(LTRIM(RTRIM(p.invoiceNumber)), '') IS NOT NULL
      UNION ALL
      SELECT 'SC:' + CAST(s.id AS varchar), 'Sub-contract hire', s.supplierName, s.invoiceNo, s.invoiceDate, s.invoiceAmount, s.currency,
             'Lease Rental-Equipment', s.poNumber, s.jobId, s.notes, s.jobId
        FROM tbl_SubContractPOs s
       WHERE NULLIF(LTRIM(RTRIM(s.invoiceNo)), '') IS NOT NULL
      UNION ALL
      SELECT 'EX:' + CAST(e.id AS varchar), 'Expense grid', e.supplierName, e.invoiceRef, CONVERT(date, e.period + '-01'), e.amount,
             COALESCE(NULLIF(e.currency,''),'AED'), e.category, NULL, e.jobId, e.notes, e.period
        FROM tbl_MonthlyExpenses e
       WHERE NULLIF(LTRIM(RTRIM(e.invoiceRef)), '') IS NOT NULL AND NULLIF(LTRIM(RTRIM(e.supplierName)), '') IS NOT NULL
      UNION ALL
      SELECT d.rowKey, 'Register', d.supplierName, d.invoiceNo, d.invoiceDate, d.amount, d.currency, d.glCategory, d.poNumber, d.jobId, d.notes, NULL
        FROM tbl_SupplierInvoices d
       WHERE d.rowKey LIKE 'DI:%'
    ) u
    LEFT JOIN tbl_SupplierInvoices o ON o.rowKey = u.rowKey AND o.rowKey NOT LIKE 'DI:%'`

module.exports = safe(async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  if (!VIEWERS.includes(user.Role)) return jsonResponse(context, 403, { error: 'Forbidden' })
  await ensureTable()
  const method = req.method.toUpperCase()
  const id = hasId(context.bindingData.id) ? String(context.bindingData.id) : null
  const qs = req.query || {}

  // Two sub-contract tables may not exist on a fresh database; the union would then fail.
  const missing = await query(`SELECT OBJECT_ID('dbo.tbl_SubContractPOs') AS sc, OBJECT_ID('dbo.tbl_MonthlyExpenses') AS ex, OBJECT_ID('dbo.tbl_PurchaseOrders') AS po`, [])
  const m = missing.recordset[0]
  let regSql = REGISTER_SQL
  if (!m.sc) regSql = regSql.replace(/UNION ALL\s+SELECT 'SC:'[\s\S]*?IS NOT NULL\s+(?=UNION ALL\s+SELECT 'EX:')/, '')
  if (!m.ex) regSql = regSql.replace(/UNION ALL\s+SELECT 'EX:'[\s\S]*?IS NOT NULL\s+(?=UNION ALL\s+SELECT d\.rowKey)/, '')
  if (!m.po) regSql = regSql.replace(/SELECT 'PO:'[\s\S]*?IS NOT NULL\s+UNION ALL\s+/, '')

  if (method === 'GET' && id === 'summary') {
    const year = /^\d{4}$/.test(qs.year || '') ? qs.year : String(new Date().getFullYear())
    const r = await query(`${regSql} WHERE YEAR(u.invoiceDate) = @y OR u.invoiceDate IS NULL`, [{ name: 'y', type: sql.Int, value: Number(year) }])
    const rows = r.recordset
    const by = (f) => {
      const map = new Map()
      for (const x of rows) {
        const k = x[f] || '(not set)'
        const cur = map.get(k) || { key: k, invoices: 0, byCurrency: {}, paid: 0, open: 0 }
        cur.invoices++
        const c = x.currency || 'USD'
        cur.byCurrency[c] = (cur.byCurrency[c] || 0) + Number(x.amount || 0)
        if (x.status === 'Paid') cur.paid++; else cur.open++
        map.set(k, cur)
      }
      return [...map.values()].sort((a, b) => b.invoices - a.invoices)
    }
    return jsonResponse(context, 200, {
      year, total: rows.length,
      byStatus: STATUSES.map(s => ({ status: s, n: rows.filter(x => x.status === s).length })),
      bySupplier: by('supplierName'), byGl: by('glCategory'), bySource: by('source'),
      unallocatedGl: rows.filter(x => !x.glCategory).length,
    })
  }

  if (method === 'GET' && !id) {
    const conds = [], params = []
    if (/^\d{4}$/.test(qs.year || '')) { conds.push(`(YEAR(u.invoiceDate) = @y)`); params.push({ name: 'y', type: sql.Int, value: Number(qs.year) }) }
    if (qs.supplier) { conds.push(`u.supplierName = @s`); params.push({ name: 's', type: sql.NVarChar, value: qs.supplier }) }
    if (qs.status) { conds.push(`COALESCE(o.status,'Received') = @st`); params.push({ name: 'st', type: sql.NVarChar, value: qs.status }) }
    if (qs.gl) { conds.push(`COALESCE(o.glCategory, u.glCategory) = @gl`); params.push({ name: 'gl', type: sql.NVarChar, value: qs.gl }) }
    if (qs.search) { conds.push(`(u.supplierName LIKE @q OR u.invoiceNo LIKE @q OR u.poNumber LIKE @q OR u.jobId LIKE @q)`); params.push({ name: 'q', type: sql.NVarChar, value: `%${qs.search}%` }) }
    const r = await query(`${regSql} ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''} ORDER BY u.invoiceDate DESC, u.supplierName`, params)
    return jsonResponse(context, 200, r.recordset)
  }

  if (method === 'POST' && !id) {
    if (!EDITORS.includes(user.Role)) return jsonResponse(context, 403, { error: 'Finance, Billing, Cost Control or Admin only' })
    const b = req.body || {}
    const sup = String(b.supplierName || '').trim(), no = String(b.invoiceNo || '').trim()
    if (!sup || !no) return jsonResponse(context, 400, { error: 'Supplier and invoice number are required' })
    if (b.amount == null || b.amount === '' || !Number.isFinite(Number(b.amount))) return jsonResponse(context, 400, { error: 'Amount must be a number' })
    const dup = await query(`${regSql} WHERE u.supplierName = @s AND u.invoiceNo = @n`, [{ name: 's', type: sql.NVarChar, value: sup }, { name: 'n', type: sql.NVarChar, value: no }])
    if (dup.recordset.length) return jsonResponse(context, 409, { error: `${sup} invoice ${no} is already in the register (${dup.recordset[0].source})` })
    const r = await query(
      `INSERT INTO tbl_SupplierInvoices (rowKey, supplierName, invoiceNo, invoiceDate, amount, currency, glCategory, poNumber, jobId, status, notes, createdBy)
       OUTPUT INSERTED.id
       VALUES (NEWID(), @s, @n, @d, @a, @c, @gl, @po, @job, @st, @notes, @by)`,
      [{ name: 's', type: sql.NVarChar, value: sup }, { name: 'n', type: sql.NVarChar, value: no },
       { name: 'd', type: sql.Date, value: b.invoiceDate ? new Date(b.invoiceDate) : null },
       { name: 'a', type: sql.Decimal(18, 2), value: Number(b.amount) }, { name: 'c', type: sql.NVarChar, value: b.currency || 'AED' },
       { name: 'gl', type: sql.NVarChar, value: b.glCategory || null }, { name: 'po', type: sql.NVarChar, value: b.poNumber || null },
       { name: 'job', type: sql.NVarChar, value: b.jobId || null }, { name: 'st', type: sql.NVarChar, value: STATUSES.includes(b.status) ? b.status : 'Received' },
       { name: 'notes', type: sql.NVarChar, value: b.notes || null }, { name: 'by', type: sql.NVarChar, value: user.Username }])
    const newId = r.recordset[0].id
    await query(`UPDATE tbl_SupplierInvoices SET rowKey = 'DI:' + CAST(id AS varchar) WHERE id = @id`, [{ name: 'id', type: sql.Int, value: newId }])
    return jsonResponse(context, 201, { ok: true, rowKey: `DI:${newId}` })
  }

  if (method === 'PUT' && id) {
    if (!EDITORS.includes(user.Role)) return jsonResponse(context, 403, { error: 'Finance, Billing, Cost Control or Admin only' })
    const key = decodeURIComponent(id)
    if (!/^(PO|SC|EX|DI):\S+$/.test(key)) return jsonResponse(context, 400, { error: 'Bad row key' })
    const b = req.body || {}
    if (b.status !== undefined && !STATUSES.includes(b.status)) return jsonResponse(context, 400, { error: `Status must be one of ${STATUSES.join(', ')}` })
    if (key.startsWith('DI:')) {
      const r = await query(
        `UPDATE tbl_SupplierInvoices SET
           supplierName = COALESCE(@s, supplierName), invoiceNo = COALESCE(@n, invoiceNo),
           invoiceDate = CASE WHEN @dSent = 1 THEN @d ELSE invoiceDate END,
           amount = COALESCE(@a, amount), currency = COALESCE(@c, currency),
           glCategory = CASE WHEN @gl IS NULL THEN glCategory ELSE NULLIF(@gl,'') END,
           poNumber = CASE WHEN @po IS NULL THEN poNumber ELSE NULLIF(@po,'') END,
           jobId = CASE WHEN @job IS NULL THEN jobId ELSE NULLIF(@job,'') END,
           status = COALESCE(@st, status),
           paidDate = CASE WHEN @pdSent = 1 THEN @pd WHEN @st = 'Paid' AND paidDate IS NULL THEN CAST(GETDATE() AS date) ELSE paidDate END,
           notes = CASE WHEN @notes IS NULL THEN notes ELSE NULLIF(@notes,'') END,
           updatedBy = @by, updatedAt = GETDATE()
         WHERE rowKey = @k`,
        [{ name: 'k', type: sql.NVarChar, value: key },
         { name: 's', type: sql.NVarChar, value: b.supplierName || null }, { name: 'n', type: sql.NVarChar, value: b.invoiceNo || null },
         { name: 'dSent', type: sql.Bit, value: b.invoiceDate !== undefined ? 1 : 0 }, { name: 'd', type: sql.Date, value: b.invoiceDate ? new Date(b.invoiceDate) : null },
         { name: 'a', type: sql.Decimal(18, 2), value: b.amount == null || b.amount === '' ? null : Number(b.amount) },
         { name: 'c', type: sql.NVarChar, value: b.currency || null },
         { name: 'gl', type: sql.NVarChar, value: b.glCategory === undefined ? null : String(b.glCategory) },
         { name: 'po', type: sql.NVarChar, value: b.poNumber === undefined ? null : String(b.poNumber) },
         { name: 'job', type: sql.NVarChar, value: b.jobId === undefined ? null : String(b.jobId) },
         { name: 'st', type: sql.NVarChar, value: b.status || null },
         { name: 'pdSent', type: sql.Bit, value: b.paidDate !== undefined ? 1 : 0 }, { name: 'pd', type: sql.Date, value: b.paidDate ? new Date(b.paidDate) : null },
         { name: 'notes', type: sql.NVarChar, value: b.notes === undefined ? null : String(b.notes) },
         { name: 'by', type: sql.NVarChar, value: user.Username }])
      if (!r.rowsAffected[0]) return jsonResponse(context, 404, { error: 'Invoice not found' })
      return jsonResponse(context, 200, { ok: true })
    }
    // Sourced row: overlay status / paid date / GL / notes only. The figures stay on the source screen.
    await query(
      `MERGE tbl_SupplierInvoices AS t USING (SELECT @k AS rowKey) s ON t.rowKey = s.rowKey
       WHEN MATCHED THEN UPDATE SET
         status = COALESCE(@st, t.status),
         paidDate = CASE WHEN @pdSent = 1 THEN @pd WHEN @st = 'Paid' AND t.paidDate IS NULL THEN CAST(GETDATE() AS date) ELSE t.paidDate END,
         glCategory = CASE WHEN @gl IS NULL THEN t.glCategory ELSE NULLIF(@gl,'') END,
         notes = CASE WHEN @notes IS NULL THEN t.notes ELSE NULLIF(@notes,'') END,
         updatedBy = @by, updatedAt = GETDATE()
       WHEN NOT MATCHED THEN INSERT (rowKey, status, paidDate, glCategory, notes, createdBy)
         VALUES (@k, COALESCE(@st,'Received'),
                 CASE WHEN @pdSent = 1 THEN @pd WHEN @st = 'Paid' THEN CAST(GETDATE() AS date) END,
                 NULLIF(@gl,''), NULLIF(@notes,''), @by);`,
      [{ name: 'k', type: sql.NVarChar, value: key }, { name: 'st', type: sql.NVarChar, value: b.status || null },
       { name: 'pdSent', type: sql.Bit, value: b.paidDate !== undefined ? 1 : 0 }, { name: 'pd', type: sql.Date, value: b.paidDate ? new Date(b.paidDate) : null },
       { name: 'gl', type: sql.NVarChar, value: b.glCategory === undefined ? null : String(b.glCategory) },
       { name: 'notes', type: sql.NVarChar, value: b.notes === undefined ? null : String(b.notes) },
       { name: 'by', type: sql.NVarChar, value: user.Username }])
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
})
