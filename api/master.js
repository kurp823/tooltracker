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

module.exports = { followMerges, standardiseCategory, standardiseSize, findAssetVariant, assetClash, resolveSystemId, parseInches, normKey, assetKey, bust, ensureColumns }
