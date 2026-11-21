'use strict'
const { sql, query } = require('./db')

/**
 * Master-data guard for anything that creates or re-describes a tool.
 *
 * After the November clean-up the inventory carries one spelling per
 * category and per size, and one record per asset number. This module keeps
 * it that way at the door: every path that writes a tool (inventory create /
 * edit, goods receipt, rental inward, missing-tool registration, history
 * import, contract rate lines) runs its values through here first.
 *
 *   standardiseCategory(name)  → canonical CategoryName, or { error }
 *   standardiseSize(label)     → master SizeLabel for the same value, or { error }
 *   findAssetVariant(no, skip) → the existing inventory row whose number is the
 *                                same once dashes, slashes, dots and spaces are
 *                                ignored (and where it was merged to), or null
 *
 * Masters are cached for 60 s per function instance; the clean-up and the
 * Categories & Sizes screens change them rarely.
 */

const normKey = s => String(s || '').toUpperCase().replace(/[\s\-_./"'()]+/g, '')
const assetKey = s => String(s || '').toUpperCase().replace(/[\s\-_./]+/g, '')

function parseInches (label) {
  let s = String(label || '').trim().toUpperCase().replace(/[”"″]|''|\bINCH(ES)?\b|\bIN\b/g, '').trim()
  if (!s || /X/.test(s) || (/[A-Z]/.test(s) && !/^\d/.test(s))) return null
  let m = /^(\d+)\s*[- ]\s*(\d+)\s*\/\s*(\d+)$/.exec(s); if (m) return +m[1] + (+m[2]) / (+m[3])
  m = /^(\d+)\s*\/\s*(\d+)$/.exec(s); if (m) return (+m[1]) / (+m[2])
  m = /^(\d+(?:\.\d+)?)$/.exec(s); if (m) return +m[1]
  return null
}

let cache = { at: 0, cats: null, sizes: null }
async function masters () {
  if (Date.now() - cache.at < 60000 && cache.cats) return cache
  const [c, s] = await Promise.all([
    query(`SELECT CategoryName, ActiveFlag FROM tbl_ToolCategories`, []),
    query(`SELECT SizeLabel, ActiveFlag FROM tbl_ToolSizes`, []),
  ])
  cache = {
    at: Date.now(),
    cats: c.recordset.map(r => ({ name: String(r.CategoryName).trim(), active: !!r.ActiveFlag, key: normKey(r.CategoryName) })),
    sizes: s.recordset.map(r => ({ label: String(r.SizeLabel).trim(), active: !!r.ActiveFlag, key: normKey(r.SizeLabel), inches: parseInches(r.SizeLabel) })),
  }
  return cache
}
const bust = () => { cache.at = 0 }

/** Canonical category name for a typed/pasted one. Empty in → { value: null }. */
async function standardiseCategory (name) {
  const v = String(name || '').trim()
  if (!v) return { value: null }
  const { cats } = await masters()
  const key = normKey(v)
  const hits = cats.filter(c => c.key === key)
  const pick = hits.find(c => c.active) || hits[0]
  if (!pick) return { error: `Category '${v}' is not in Tool Categories. Add it under Inventory → Tool Categories & Sizes, or pick an existing one.` }
  return { value: pick.name, changed: pick.name !== v }
}

/** Master size label for a typed/pasted one. Non-inch sizes must match a master label exactly (ignoring case/spaces). */
async function standardiseSize (label, { allowUnknown = false } = {}) {
  const v = String(label || '').trim()
  if (!v || /^(N\/?A|NA|NIL|NONE|-+)$/i.test(v)) return { value: v ? 'N/A' : null }
  const { sizes } = await masters()
  const inches = parseInches(v)
  let pick = null
  if (inches != null) {
    const same = sizes.filter(s => s.inches != null && Math.abs(s.inches - inches) < 0.0005)
    pick = same.find(s => s.active && s.label === v) || same.find(s => s.active && !/\.\d/.test(s.label)) || same.find(s => s.active) || same[0]
  }
  if (!pick) { const key = normKey(v); pick = sizes.find(s => s.key === key && s.active) || sizes.find(s => s.key === key) }
  if (!pick) {
    if (allowUnknown) return { value: v, unknown: true }
    return { error: `Size '${v}' is not in Tool Sizes. Add it under Inventory → Master Data Clean-up → Sizes, or pick an existing one.` }
  }
  return { value: pick.label, changed: pick.label !== v }
}

/** An existing asset whose number is a spelling variant of this one. */
async function findAssetVariant (assetNo, skipSystemId) {
  const v = String(assetNo || '').trim()
  if (!v) return null
  await ensureColumns()
  const r = await query(
    `SELECT TOP 1 SystemID, AssetNo, ShortDesc, Status, MergedInto
       FROM tbl_Inventory
      WHERE UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(AssetNo, SystemID),'-',''),' ',''),'/',''),'_',''),'.','')) = @k
         OR UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(SystemID,'-',''),' ',''),'/',''),'_',''),'.','')) = @k
      ORDER BY CASE WHEN ISNULL(Status,'') = 'Merged' THEN 1 ELSE 0 END, AddedDate`,
    [{ name: 'k', type: sql.NVarChar, value: assetKey(v) }])
  const hit = r.recordset.find(x => x.SystemID !== skipSystemId)
  return hit || null
}

/** Message for a variant clash, or null when the number is free. */
async function assetClash (assetNo, skipSystemId) {
  const hit = await findAssetVariant(assetNo, skipSystemId)
  if (!hit) return null
  if (hit.Status === 'Merged' && hit.MergedInto) return `'${assetNo}' was merged into ${hit.MergedInto} — use that number.`
  if (hit.AssetNo === assetNo || hit.SystemID === assetNo) return `'${assetNo}' already exists in inventory (${hit.ShortDesc || 'uncategorised'}).`
  return `'${assetNo}' is already in inventory as '${hit.AssetNo || hit.SystemID}' (${hit.ShortDesc || 'uncategorised'}) — use that number rather than a new spelling.`
}

/** Resolve a scanned/typed number to the live SystemID, following merges. */
async function resolveSystemId (no) {
  const v = String(no || '').trim()
  if (!v) return null
  await ensureColumns()
  const r = await query(`SELECT TOP 1 SystemID, Status, MergedInto FROM tbl_Inventory WHERE SystemID = @k OR AssetNo = @k ORDER BY CASE WHEN ISNULL(Status,'') = 'Merged' THEN 1 ELSE 0 END`,
    [{ name: 'k', type: sql.NVarChar, value: v }])
  const row = r.recordset[0]
  if (!row) { const alt = await findAssetVariant(v); return alt ? (alt.MergedInto || alt.SystemID) : null }
  return row.Status === 'Merged' && row.MergedInto ? row.MergedInto : row.SystemID
}

/** One query: every number in the list that points at a merged record → the kept SystemID. */
async function followMerges (nos) {
  const list = [...new Set(nos.map(x => String(x || '').trim()).filter(Boolean))]
  if (!list.length) return new Map()
  await ensureColumns()
  const params = list.map((v, i) => ({ name: `m${i}`, type: sql.NVarChar, value: v }))
  const inList = params.map(p => '@' + p.name).join(', ')
  const r = await query(`SELECT SystemID, AssetNo, MergedInto FROM tbl_Inventory WHERE ISNULL(Status,'') = 'Merged' AND MergedInto IS NOT NULL AND (SystemID IN (${inList}) OR AssetNo IN (${inList}))`, params)
  const map = new Map()
  for (const row of r.recordset) { map.set(row.SystemID, row.MergedInto); if (row.AssetNo) map.set(row.AssetNo, row.MergedInto) }
  return map
}

/** Runs once per instance: the MergedInto column the merge screens fill. */
let migrated = false
async function ensureColumns () {
  if (migrated) return
  await query(`IF COL_LENGTH('dbo.tbl_Inventory','MergedInto') IS NULL ALTER TABLE dbo.tbl_Inventory ADD MergedInto nvarchar(100) NULL`, [])
  migrated = true
}

let keysReady = false
async function ensureJobKeys () {
  if (keysReady) return
  await ensureColumns()
  const expr = (col) => `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(UPPER(LTRIM(RTRIM(${col}))),'-0','-'),'-0','-'),'-0','-'),'-0','-'),'-0','-')`
  await query(`IF COL_LENGTH('dbo.tbl_Jobs','JobKeyNorm') IS NULL ALTER TABLE dbo.tbl_Jobs ADD JobKeyNorm AS (${expr('JobID')}) PERSISTED`, [])
  await query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Jobs_JobKeyNorm' AND object_id = OBJECT_ID('dbo.tbl_Jobs')) CREATE INDEX IX_Jobs_JobKeyNorm ON dbo.tbl_Jobs (JobKeyNorm) INCLUDE (Client, Status, LegalInvoiceNumber)`, [])
  await query(`IF COL_LENGTH('dbo.tbl_ImportDTRT','JobKeyNorm') IS NULL ALTER TABLE dbo.tbl_ImportDTRT ADD JobKeyNorm AS (${expr('jobNum')}) PERSISTED`, [])
  await query(`IF COL_LENGTH('dbo.tbl_JobTools','JobKeyNorm') IS NULL ALTER TABLE dbo.tbl_JobTools ADD JobKeyNorm AS (${expr('JobID')}) PERSISTED`, [])
  await query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_JobTools_JobKeyNorm' AND object_id = OBJECT_ID('dbo.tbl_JobTools')) CREATE INDEX IX_JobTools_JobKeyNorm ON dbo.tbl_JobTools (JobKeyNorm, SystemID)`, [])
  await query(`IF COL_LENGTH('dbo.tbl_DailyFieldLogs','JobKeyNorm') IS NULL ALTER TABLE dbo.tbl_DailyFieldLogs ADD JobKeyNorm AS (${expr('JobID')}) PERSISTED`, [])
  await query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FieldLogs_JobKeyNorm' AND object_id = OBJECT_ID('dbo.tbl_DailyFieldLogs')) CREATE INDEX IX_FieldLogs_JobKeyNorm ON dbo.tbl_DailyFieldLogs (JobKeyNorm, ToolSerial, LogDate)`, [])
  await query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ImportDTRT_Batch' AND object_id = OBJECT_ID('dbo.tbl_ImportDTRT')) CREATE INDEX IX_ImportDTRT_Batch ON dbo.tbl_ImportDTRT (batchId, id) INCLUDE (jobNum, dtNo, rtNo, partNum, JobKeyNorm)`, [])
  // RESOLVE looks every staged part number up by AssetNo or SystemID; SystemID is the key, AssetNo was not indexed.
  await query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Inventory_AssetNo' AND object_id = OBJECT_ID('dbo.tbl_Inventory')) CREATE INDEX IX_Inventory_AssetNo ON dbo.tbl_Inventory (AssetNo) INCLUDE (SystemID, ShortDesc, [Size], IsEmdad, Status)`, [])
  // The line stages test NOT EXISTS (ticket, serial) against 45k-row line tables; without these the test is a scan per staged row.
  await query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DTLines_Ticket_Serial' AND object_id = OBJECT_ID('dbo.tbl_DeliveryTicketLines')) CREATE INDEX IX_DTLines_Ticket_Serial ON dbo.tbl_DeliveryTicketLines (dtNumber, serial)`, [])
  await query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RTLines_Ticket_Serial' AND object_id = OBJECT_ID('dbo.tbl_ReceivingTicketLines')) CREATE INDEX IX_RTLines_Ticket_Serial ON dbo.tbl_ReceivingTicketLines (rtNumber, serial)`, [])
  await query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DTLines_Serial' AND object_id = OBJECT_ID('dbo.tbl_DeliveryTicketLines')) CREATE INDEX IX_DTLines_Serial ON dbo.tbl_DeliveryTicketLines (serial) INCLUDE (dtNumber)`, [])
  await query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RTLines_Serial' AND object_id = OBJECT_ID('dbo.tbl_ReceivingTicketLines')) CREATE INDEX IX_RTLines_Serial ON dbo.tbl_ReceivingTicketLines (serial) INCLUDE (rtNumber)`, [])
  // Spelling-variant check for new part numbers: persisted normalised keys, indexed, instead of REPLACE chains per row pair.
  const akey = (col) => `UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${col},'-',''),' ',''),'/',''),'_',''),'.',''))`
  await query(`IF COL_LENGTH('dbo.tbl_Inventory','AssetKeyNorm') IS NULL ALTER TABLE dbo.tbl_Inventory ADD AssetKeyNorm AS (${akey('ISNULL(AssetNo, SystemID)')}) PERSISTED`, [])
  await query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Inventory_AssetKeyNorm' AND object_id = OBJECT_ID('dbo.tbl_Inventory')) CREATE INDEX IX_Inventory_AssetKeyNorm ON dbo.tbl_Inventory (AssetKeyNorm)`, [])
  await query(`IF COL_LENGTH('dbo.tbl_ImportDTRT','PartKeyNorm') IS NULL ALTER TABLE dbo.tbl_ImportDTRT ADD PartKeyNorm AS (${akey('partNum')}) PERSISTED`, [])
  // Ticket headers: the fill-from-tickets and reconcile queries join them to jobs by key.
  await query(`IF COL_LENGTH('dbo.tbl_DeliveryTickets','JobKeyNorm') IS NULL ALTER TABLE dbo.tbl_DeliveryTickets ADD JobKeyNorm AS (${expr('jobNumber')}) PERSISTED`, [])
  await query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_DT_JobKeyNorm' AND object_id = OBJECT_ID('dbo.tbl_DeliveryTickets')) CREATE INDEX IX_DT_JobKeyNorm ON dbo.tbl_DeliveryTickets (JobKeyNorm, deliveryDate) INCLUDE (dtNumber)`, [])
  await query(`IF COL_LENGTH('dbo.tbl_ReceivingTickets','JobKeyNorm') IS NULL ALTER TABLE dbo.tbl_ReceivingTickets ADD JobKeyNorm AS (${expr('jobNumber')}) PERSISTED`, [])
  await query(`IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RT_JobKeyNorm' AND object_id = OBJECT_ID('dbo.tbl_ReceivingTickets')) CREATE INDEX IX_RT_JobKeyNorm ON dbo.tbl_ReceivingTickets (JobKeyNorm, receivingDate) INCLUDE (rtNumber)`, [])
  keysReady = true
}


module.exports = { ensureJobKeys, followMerges, standardiseCategory, standardiseSize, findAssetVariant, assetClash, resolveSystemId, parseInches, normKey, assetKey, bust, ensureColumns }
