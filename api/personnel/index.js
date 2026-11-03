'use strict'
const { query, jsonResponse, requireAuth, safe } = require('../db')

/**
 * Personnel register: the one list of people who can be put on a job - our own
 * engineers and sub-contractor staff. A job's crew is picked from here and
 * never typed in, so the same person cannot be entered twice under slightly
 * different spellings.
 *
 * GET    /api/personnel               all active people (?all=1 includes inactive)
 * POST   /api/personnel               add a person (duplicate name+company or badge refused)
 * PUT    /api/personnel/{id}          edit
 * DELETE /api/personnel/{id}          mark inactive (history on past jobs is kept)
 *
 * The table is created on first use.
 */
async function ensure () {
  await query(`
    IF OBJECT_ID('dbo.tbl_Personnel', 'U') IS NULL
      CREATE TABLE dbo.tbl_Personnel (
        PersonnelID int IDENTITY(1,1) PRIMARY KEY,
        BadgeNo     varchar(30)  NULL,
        Name        nvarchar(120) NOT NULL,
        Designation nvarchar(120) NULL,
        PersonType  varchar(20)  NOT NULL DEFAULT 'EMDAD',   -- EMDAD | Sub-contractor
        Company     nvarchar(120) NULL,                       -- sub-contractor's company
        RigPassNo   varchar(40)  NULL,
        H2SExpiry   date         NULL,
        Phone       varchar(40)  NULL,
        Active      bit          NOT NULL DEFAULT 1,
        CreatedBy   varchar(100) NULL,
        CreatedAt   datetime     NOT NULL DEFAULT GETDATE()
      )`)
}

module.exports = safe(async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  await ensure()

  const id = context.bindingData.id
  const method = req.method.toUpperCase()
  const canWrite = ['Admin', 'Operations'].includes(user.Role)

  if (!id && method === 'GET') {
    const all = String((req.query || {}).all || '') === '1'
    const r = await query(
      `SELECT PersonnelID, BadgeNo, Name, Designation, PersonType, Company, RigPassNo, H2SExpiry, Phone, Active
         FROM tbl_Personnel ${all ? '' : 'WHERE Active = 1'} ORDER BY Name`)
    return jsonResponse(context, 200, r.recordset)
  }

  if (!canWrite) return jsonResponse(context, 403, { error: 'Insufficient permissions' })
  const b = req.body || {}
  const s = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim())

  if (!id && method === 'POST') {
    const name = s(b.Name)
    if (!name) return jsonResponse(context, 400, { error: 'Name is required' })
    const type = b.PersonType === 'Sub-contractor' ? 'Sub-contractor' : 'EMDAD'
    const company = type === 'Sub-contractor' ? s(b.Company) : null
    if (type === 'Sub-contractor' && !company)
      return jsonResponse(context, 400, { error: 'Company is required for sub-contractor staff' })

    const dup = await query(
      `SELECT TOP 1 PersonnelID, Name, BadgeNo FROM tbl_Personnel
        WHERE Active = 1 AND ((LOWER(LTRIM(RTRIM(Name))) = LOWER(@n) AND ISNULL(LOWER(Company),'') = ISNULL(LOWER(@c),''))
                           OR (@badge IS NOT NULL AND BadgeNo = @badge))`,
      [{ name: 'n', value: name }, { name: 'c', value: company }, { name: 'badge', value: s(b.BadgeNo) }])
    if (dup.recordset.length)
      return jsonResponse(context, 409, { error: `Already in the register: ${dup.recordset[0].Name}${dup.recordset[0].BadgeNo ? ' (' + dup.recordset[0].BadgeNo + ')' : ''}` })

    const r = await query(
      `INSERT INTO tbl_Personnel (BadgeNo, Name, Designation, PersonType, Company, RigPassNo, H2SExpiry, Phone, CreatedBy)
       OUTPUT INSERTED.PersonnelID
       VALUES (@badge, @n, @des, @type, @c, @rp, @h2s, @ph, @by)`,
      [{ name: 'badge', value: s(b.BadgeNo) }, { name: 'n', value: name }, { name: 'des', value: s(b.Designation) },
       { name: 'type', value: type }, { name: 'c', value: company }, { name: 'rp', value: s(b.RigPassNo) },
       { name: 'h2s', value: b.H2SExpiry ? new Date(b.H2SExpiry) : null }, { name: 'ph', value: s(b.Phone) },
       { name: 'by', value: user.Username || null }])
    return jsonResponse(context, 201, { PersonnelID: r.recordset[0].PersonnelID })
  }

  if (id && method === 'PUT') {
    await query(
      `UPDATE tbl_Personnel SET BadgeNo = @badge, Name = COALESCE(@n, Name), Designation = @des,
              Company = @c, RigPassNo = @rp, H2SExpiry = @h2s, Phone = @ph
        WHERE PersonnelID = @id`,
      [{ name: 'id', value: Number(id) }, { name: 'badge', value: s(b.BadgeNo) }, { name: 'n', value: s(b.Name) },
       { name: 'des', value: s(b.Designation) }, { name: 'c', value: s(b.Company) }, { name: 'rp', value: s(b.RigPassNo) },
       { name: 'h2s', value: b.H2SExpiry ? new Date(b.H2SExpiry) : null }, { name: 'ph', value: s(b.Phone) }])
    return jsonResponse(context, 200, { ok: true })
  }

  if (id && method === 'DELETE') {
    await query(`UPDATE tbl_Personnel SET Active = 0 WHERE PersonnelID = @id`, [{ name: 'id', value: Number(id) }])
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
})
