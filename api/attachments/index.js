'use strict'
const { sql, query, jsonResponse, requireAuth, safe, hasId, audit } = require('../db')

/**
 * Attachments — the signed ticket, the SES, the client approval, the
 * supplier's invoice PDF — kept against the record they belong to.
 *
 *   GET    /api/attachments?entity=&id=          list (no file content)
 *   GET    /api/attachments/{aid}/file           the file as { fileName, contentType, base64 }
 *   POST   /api/attachments                       { entity, entityId, fileName, contentType, base64 }
 *   DELETE /api/attachments/{aid}                 Admin, or the uploader within a day
 *
 * Files are stored in the database (varbinary) rather than blob storage:
 * nothing to configure in Azure, one backup covers everything, and at a
 * few signed pages a day the volume is small. 10 MB per file.
 */
const MAX_BYTES = 10 * 1024 * 1024
const EDITORS = ['Admin', 'Operations', 'Billing', 'Finance', 'QAQC', 'CostController']

let ready = null
function ensureTable() {
  if (!ready) ready = query(`
    IF OBJECT_ID('dbo.tbl_Attachments', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.tbl_Attachments (
        id          int IDENTITY(1,1) NOT NULL CONSTRAINT PK_tbl_Attachments PRIMARY KEY,
        entity      nvarchar(40)  NOT NULL,
        entityId    nvarchar(80)  NOT NULL,
        fileName    nvarchar(255) NOT NULL,
        contentType nvarchar(120) NULL,
        sizeBytes   int           NOT NULL,
        data        varbinary(max) NOT NULL,
        uploadedBy  nvarchar(100) NULL,
        uploadedAt  datetime      NOT NULL CONSTRAINT DF_Att_At DEFAULT (GETDATE()),
        note        nvarchar(255) NULL);
      CREATE INDEX IX_Attachments_entity ON dbo.tbl_Attachments(entity, entityId);
    END`, []).catch(e => { ready = null; throw e })
  return ready
}

module.exports = safe(async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  await ensureTable()
  const method = req.method.toUpperCase()
  const id = hasId(context.bindingData.id) ? String(context.bindingData.id) : null
  const sub = context.bindingData.sub
  const qs = req.query || {}

  if (method === 'GET' && !id) {
    if (!qs.entity || !qs.id) return jsonResponse(context, 400, { error: 'entity and id required' })
    const r = await query(
      `SELECT id, entity, entityId, fileName, contentType, sizeBytes, uploadedBy, uploadedAt, note
         FROM tbl_Attachments WHERE entity = @e AND entityId = @i ORDER BY uploadedAt DESC`,
      [{ name: 'e', type: sql.NVarChar, value: qs.entity }, { name: 'i', type: sql.NVarChar, value: qs.id }])
    return jsonResponse(context, 200, r.recordset)
  }

  if (method === 'GET' && id && sub === 'file') {
    const r = await query(`SELECT fileName, contentType, data FROM tbl_Attachments WHERE id = @id`, [{ name: 'id', type: sql.Int, value: Number(id) }])
    if (!r.recordset.length) return jsonResponse(context, 404, { error: 'Not found' })
    const x = r.recordset[0]
    return jsonResponse(context, 200, { fileName: x.fileName, contentType: x.contentType || 'application/octet-stream', base64: Buffer.from(x.data).toString('base64') })
  }

  if (method === 'POST' && !id) {
    if (!EDITORS.includes(user.Role)) return jsonResponse(context, 403, { error: 'Forbidden' })
    const b = req.body || {}
    const entity = String(b.entity || '').trim(), entityId = String(b.entityId || '').trim(), fileName = String(b.fileName || '').trim()
    if (!entity || !entityId || !fileName || !b.base64) return jsonResponse(context, 400, { error: 'entity, entityId, fileName and base64 are required' })
    let buf
    try { buf = Buffer.from(String(b.base64).replace(/^data:[^;]+;base64,/, ''), 'base64') } catch { return jsonResponse(context, 400, { error: 'Bad file data' }) }
    if (!buf.length) return jsonResponse(context, 400, { error: 'Empty file' })
    if (buf.length > MAX_BYTES) return jsonResponse(context, 413, { error: `File is ${(buf.length / 1048576).toFixed(1)} MB; the limit is 10 MB` })
    const r = await query(
      `INSERT INTO tbl_Attachments (entity, entityId, fileName, contentType, sizeBytes, data, uploadedBy, note)
       OUTPUT INSERTED.id
       VALUES (@e, @i, @f, @ct, @n, @d, @by, @note)`,
      [{ name: 'e', type: sql.NVarChar, value: entity }, { name: 'i', type: sql.NVarChar, value: entityId },
       { name: 'f', type: sql.NVarChar, value: fileName.slice(0, 255) }, { name: 'ct', type: sql.NVarChar, value: String(b.contentType || '').slice(0, 120) || null },
       { name: 'n', type: sql.Int, value: buf.length }, { name: 'd', type: sql.VarBinary(sql.MAX), value: buf },
       { name: 'by', type: sql.NVarChar, value: user.Username }, { name: 'note', type: sql.NVarChar, value: String(b.note || '').slice(0, 255) || null }])
    await audit(user, entity, entityId, 'attach', { file: fileName, bytes: buf.length })
    return jsonResponse(context, 201, { id: r.recordset[0].id })
  }

  if (method === 'DELETE' && id) {
    const r = await query(`SELECT entity, entityId, fileName, uploadedBy, uploadedAt FROM tbl_Attachments WHERE id = @id`, [{ name: 'id', type: sql.Int, value: Number(id) }])
    if (!r.recordset.length) return jsonResponse(context, 404, { error: 'Not found' })
    const x = r.recordset[0]
    const own = x.uploadedBy === user.Username && (Date.now() - new Date(x.uploadedAt).getTime()) < 86400000
    if (user.Role !== 'Admin' && !own) return jsonResponse(context, 403, { error: 'Only Admin, or the uploader on the day of upload, can remove an attachment' })
    await query(`DELETE FROM tbl_Attachments WHERE id = @id`, [{ name: 'id', type: sql.Int, value: Number(id) }])
    await audit(user, x.entity, x.entityId, 'detach', { file: x.fileName })
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
})
