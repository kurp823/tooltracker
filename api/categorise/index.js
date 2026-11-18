'use strict'
const { sql, query, jsonResponse, requireAuth, safe, audit } = require('../db')

/**
 * Inventory → Categorise Tools.
 *
 *   GET  /api/categorise/proposals   uncategorised tools with a proposed category + size
 *   POST /api/categorise/apply       { items: [{ SystemID, ShortDesc, Size }] } — set them (audited)
 *   GET  /api/categorise/duplicates  uncategorised stubs whose asset number is a spelling
 *                                    variant of a real catalogue asset
 *   POST /api/categorise/merge       { stub, real } — repoint the stub's history to the real
 *                                    asset and retire the stub (audited, one pair per call)
 *
 * The DT/RT history import created a tbl_Inventory stub, ShortDesc
 * 'TO BE CATEGORISED', for every part number the catalogue did not hold. A
 * proposal here comes from two sources, both read from the database:
 *   1. the category list (tbl_ToolCategories) and its common abbreviations
 *      ('F. MAGNET' is a fishing magnet, 'RCJB' a reverse-circulating junk basket);
 *   2. how tools with similar descriptions are already categorised in the
 *      catalogue — the strongest signal, because it is EMDAD's own usage.
 * Nothing is written until the user applies a row.
 */

const PLACEHOLDER = 'TO BE CATEGORISED'
const ADMIN_OPS = ['Admin', 'Operations']

// Words that describe connections, materials and dimensions, not the tool.
const NOISE = new Set(['W', 'C', 'OD', 'ID', 'REG', 'IF', 'FH', 'NC', 'PIN', 'BOX', 'X', 'PINX', 'BOXX', 'CONN', 'CONNECTION',
  'THREAD', 'THD', 'TYPE', 'ASSY', 'ASSEMBLY', 'COMPLETE', 'WITH', 'AND', 'FOR', 'THE', 'OF', 'TO', 'IN', 'LONG', 'FT',
  'FEET', 'PSI', 'K', 'STD', 'SPL', 'NEW', 'OLD', 'SET', 'NON', 'PORTED', 'PORT', 'UPPER', 'LOWER',
  'LH', 'RH', 'HD', 'HEAVY', 'DUTY', 'SERIES', 'MODEL', 'SIZE', 'RANGE', 'CATCH', 'FLANGE', 'FLANGED', 'MALE', 'FEMALE',
  'SUB', 'TOOL', 'A', 'OD.', 'O'])

// Abbreviations used in CategoryName → words that appear in descriptions.
const EXPAND = {
  'F.': 'FISHING', 'F': 'FISHING', 'HYD-MECH': 'HYDRAULIC MECHANICAL', 'HYD': 'HYDRAULIC', 'MECH': 'MECHANICAL',
  'RCJB': 'REVERSE CIRCULATING JUNK BASKET', 'DSA': 'DOUBLE STUDDED ADAPTER', 'NMDC': 'NON MAGNETIC DRILL COLLAR',
  'STAB': 'STABILIZER', 'IMP.': 'IMPRESSION', 'IMP': 'IMPRESSION', 'C.BUSHING': 'CASING BUSHING', 'DJ': 'DRILLING JAR',
  'SH': 'SH', 'SC': 'SC', 'FS': 'FS', 'LUB': 'LUBRICATED', 'BUMPERSUB': 'BUMPER SUB', 'PACKOFF': 'PACK OFF',
  'TOPSUB': 'TOP SUB', 'XO': 'CROSSOVER', 'X/O': 'CROSSOVER', 'SJ': 'SAFETY JOINT', 'MAG': 'MAGNETIC',
}
// Description words → canonical word, so both sides compare alike.
const CANON = {
  'STABILISER': 'STABILIZER', 'STABILIZERS': 'STABILIZER', 'STABILIZER': 'STABILIZER', 'STAB': 'STABILIZER',
  'JARS': 'JAR', 'MILLS': 'MILL', 'SPEARS': 'SPEAR', 'OVERSHOTS': 'OVERSHOT', 'MAGNETS': 'MAGNET', 'SUBS': 'SUB',
  'REAMERS': 'REAMER', 'X-OVER': 'CROSSOVER', 'XOVER': 'CROSSOVER', 'XO': 'CROSSOVER', 'X/O': 'CROSSOVER',
  'CROSS-OVER': 'CROSSOVER', 'HYD': 'HYDRAULIC', 'MECH': 'MECHANICAL', 'PACKOFF': 'PACK', 'BUMPERSUB': 'BUMPER',
  'DRILLCOLLAR': 'DRILL', 'D/C': 'DC', 'N/MAG': 'NONMAG', 'NON-MAG': 'NONMAG', 'NONMAGNETIC': 'NONMAG',
  'WASH': 'WASH', 'WASHPIPE': 'WASHPIPE', 'WASH-PIPE': 'WASHPIPE', 'EXT': 'EXTENSION', 'EXTN': 'EXTENSION', 'EXTENSIONS': 'EXTENSION', 'ADAPTOR': 'ADAPTER', 'ADAPTORS': 'ADAPTER',
}

const SIZE_RE = /(\d{1,2}\s*-\s*\d{1,2}\/\d{1,2}|\d{1,2}\/\d{1,2}|\d{1,2}(?:\.\d{1,3})?)\s*(?:"|''|”|\s?IN\b|\s?INCH)/i

function words(s) {
  return uncomma(String(s || '')).toUpperCase()
    .replace(/\d+\s*-\s*\d+\/\d+\s*("|'')?/g, ' ')   // 9-1/2"
    .replace(/\d+\/\d+\s*("|'')?/g, ' ')               // 7/8"
    .replace(/\d+(\.\d+)?\s*("|''|FT|PSI|K)\b/g, ' ')   // 15", 500 PSI, 2K
    .replace(/[^A-Z0-9./-]+/g, ' ')
    .split(/\s+/).filter(Boolean)
    .map(w => CANON[w] || w.replace(/[./-]+$/, ''))
    .map(w => CANON[w] || w)
    .filter(w => w && !NOISE.has(w) && !/^\d+$/.test(w))
}
function catWords(name) {
  const out = []
  for (const raw of String(name).toUpperCase().replace(/(?<=[A-Z])-(?=[A-Z])/g, ' ').split(/\s+/)) {
    if (raw === '-') continue
    const exp = EXPAND[raw]
    if (exp) out.push(...exp.split(' '))
    else out.push(raw)
  }
  return words(out.join(' '))
}
// A category whose name carries a size ('STRING STAB - 7.5/8"') applies only
// when that size appears in the description; otherwise the generic category.
function sizeReq(name) {
  const m = /(\d+)\s*[.-]\s*(\d+\/\d+)/.exec(String(name))
  return m ? `${m[1]}-${m[2]}` : null
}
const normSizes = s => String(s || '').replace(/(\d+)\s*[.-]\s*(\d+\/\d+)/g, '$1-$2')
// Does the category's word sequence appear in the description in that order?
function orderedIn(seq, ws) {
  // Contiguous phrase: 'MILL CONTROL' inside 'MILL CONTROL PACKER', not 'MILL … CONTROL'.
  outer: for (let i = 0; i + seq.length <= ws.length; i++) {
    for (let j = 0; j < seq.length; j++) if (ws[i + j] !== seq[j]) continue outer
    return true
  }
  return false
}
// Catalogue style 'PACKER, MILL CONTROL, 3-1/2"' lists the noun first and its
// qualifier after the comma; read it as 'MILL CONTROL PACKER' so phrases line up.
function uncomma(s) {
  const segs = String(s || '').split(',').map(x => x.trim()).filter(Boolean)
  const lettered = segs.filter(x => /[A-Za-z]{3,}/.test(x))
  if (lettered.length < 2) return s
  return [...lettered].reverse().join(' ') + ' ' + segs.filter(x => !/[A-Za-z]{3,}/.test(x)).join(' ')
}
function sizeOf(desc) {
  const m = SIZE_RE.exec(String(desc || ''))
  if (!m) return null
  return m[1].replace(/\s+/g, '') + '"'
}

async function loadKnowledge() {
  const cats = await query(`SELECT CategoryName FROM tbl_ToolCategories WHERE ActiveFlag = 1 ORDER BY CategoryName`, [])
  const names = cats.recordset.map(r => r.CategoryName)
  // How the catalogue already describes each category: word → categories it appears under.
  const known = await query(
    `SELECT ShortDesc, Description, COUNT(*) AS n FROM tbl_Inventory
      WHERE NULLIF(LTRIM(RTRIM(ShortDesc)),'') IS NOT NULL AND ShortDesc <> @p AND NULLIF(LTRIM(RTRIM(Description)),'') IS NOT NULL
      GROUP BY ShortDesc, Description`, [{ name: 'p', type: sql.NVarChar, value: PLACEHOLDER }])
  const examples = known.recordset.map(r => ({ cat: r.ShortDesc.trim(), set: new Set(words(r.Description)), n: Number(r.n) })).filter(e => e.set.size)
  const catDefs = names.map(n => ({ name: n, seq: catWords(n), set: new Set(catWords(n)), size: sizeReq(n) })).filter(c => c.set.size)
  const sizeOfCat = Object.fromEntries(names.map(n => [n, sizeReq(n)]))
  return { names, examples, catDefs, sizeOfCat }
}

function propose(desc, k) {
  const ws = words(desc); const set = new Set(ws)
  if (!set.size) return { ShortDesc: null, confidence: 'none', why: 'no usable words' }
  const dn = normSizes(desc)
  const sizeOk = cat => { const r = k.sizeOfCat[cat]; return !r || dn.includes(r) }
  // 1. Nearest categorised neighbour (Jaccard over tool words, weighted by how many rows say so)
  let best = null
  for (const e of k.examples) {
    if (!sizeOk(e.cat)) continue
    let inter = 0; for (const w of e.set) if (set.has(w)) inter++
    if (!inter) continue
    const j = inter / (e.set.size + set.size - inter)
    const score = j + Math.min(e.n, 20) / 400
    if (!best || score > best.score) best = { cat: e.cat, score, j, inter }
  }
  // 2. Category-name match: all words of the category name present
  let cbest = null
  for (const c of k.catDefs) {
    if (!sizeOk(c.name)) continue
    let inter = 0; for (const w of c.set) if (set.has(w)) inter++
    // All words of the category name present. More words beat fewer; the name
    // whose words appear in order in the description ('MILL CONTROL' inside
    // 'PACKER, MILL CONTROL') beats one that does not ('PACKER MILL'); on a
    // tie the shorter (more generic) name wins, so 'RISER' beats 'RISER - 4FT'.
    if (inter === c.set.size) {
      const sc = c.set.size * 10 + (orderedIn(c.seq, ws) ? 5 : 0) - (c.name.length / 100)
      if (!cbest || sc > cbest.score) cbest = { cat: c.name, score: sc, inter, ordered: orderedIn(c.seq, ws) }
    }
  }
  // An ordered category-name match outranks a neighbour that disagrees with it.
  if (cbest && cbest.ordered && cbest.inter >= 2 && best && best.cat !== cbest.cat && best.j < 0.8)
    return { ShortDesc: cbest.cat, confidence: 'high', why: 'category name found in description' }
  if (best && best.j >= 0.6) return { ShortDesc: best.cat, confidence: 'high', why: `matches catalogue tools described alike (${Math.round(best.j * 100)}%)` }
  if (cbest && cbest.inter >= 2) return { ShortDesc: cbest.cat, confidence: 'high', why: 'category name found in description' }
  if (best && best.j >= 0.34) return { ShortDesc: best.cat, confidence: 'medium', why: `similar to catalogue tools (${Math.round(best.j * 100)}%)` }
  if (cbest) return { ShortDesc: cbest.cat, confidence: 'medium', why: 'category word found in description' }
  if (best && best.inter >= 1) return { ShortDesc: best.cat, confidence: 'low', why: `shares words with catalogue tools (${Math.round(best.j * 100)}%)` }
  return { ShortDesc: null, confidence: 'none', why: 'no category or catalogue match' }
}

module.exports = safe(async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  if (!ADMIN_OPS.includes(user.Role)) return jsonResponse(context, 403, { error: 'Admin or Operations only' })
  const method = (req.method || 'GET').toUpperCase()
  const action = req.params && req.params.action
  const body = req.body || {}

  if (method === 'GET' && action === 'proposals') {
    const k = await loadKnowledge()
    const rows = await query(
      `SELECT SystemID, AssetNo, Description, Size, Location, Status, Ownership, Supplier, AddedDate,
              (SELECT COUNT(*) FROM tbl_DeliveryTicketLines l WHERE l.serial = i.SystemID) AS dtLines,
              (SELECT COUNT(*) FROM tbl_DailyFieldLogs f WHERE f.ToolSerial = i.SystemID) AS days
         FROM tbl_Inventory i WHERE ShortDesc = @p ORDER BY Description`, [{ name: 'p', type: sql.NVarChar, value: PLACEHOLDER }])
    const out = rows.recordset.map(r => {
      const p = propose(r.Description, k)
      return { ...r, proposedShortDesc: p.ShortDesc, proposedSize: r.Size || sizeOf(r.Description), confidence: p.confidence, why: p.why }
    })
    const summary = out.reduce((a, r) => { a[r.confidence] = (a[r.confidence] || 0) + 1; return a }, {})
    return jsonResponse(context, 200, { total: out.length, summary, categories: k.names, rows: out })
  }

  if (method === 'POST' && action === 'apply') {
    const items = Array.isArray(body.items) ? body.items : []
    if (!items.length) return jsonResponse(context, 400, { error: 'No items' })
    if (items.length > 2000) return jsonResponse(context, 400, { error: 'At most 2,000 per call' })
    const cats = new Set((await query(`SELECT CategoryName FROM tbl_ToolCategories`, [])).recordset.map(r => r.CategoryName.trim().toUpperCase()))
    let updated = 0; const rejected = []
    for (const it of items) {
      const sd = String(it.ShortDesc || '').trim()
      if (!it.SystemID || !sd) { rejected.push({ SystemID: it.SystemID, error: 'category required' }); continue }
      if (!cats.has(sd.toUpperCase())) { rejected.push({ SystemID: it.SystemID, error: `'${sd}' is not in Tool Categories` }); continue }
      const r = await query(
        `UPDATE tbl_Inventory SET ShortDesc = @sd, Size = COALESCE(NULLIF(@sz,''), Size), LastUpdated = GETDATE(), LastUpdatedBy = @by
          WHERE SystemID = @id AND ShortDesc = @p`,
        [{ name: 'sd', type: sql.NVarChar, value: sd }, { name: 'sz', type: sql.NVarChar, value: it.Size == null ? '' : String(it.Size) },
         { name: 'by', type: sql.NVarChar, value: user.Username || user.FullName || 'app' },
         { name: 'id', type: sql.NVarChar, value: String(it.SystemID) }, { name: 'p', type: sql.NVarChar, value: PLACEHOLDER }])
      if (r.rowsAffected[0]) updated++; else rejected.push({ SystemID: it.SystemID, error: 'not found or already categorised' })
    }
    await audit(user, 'inventory', 'categorise', 'categorise', { updated, rejected: rejected.length, items: items.slice(0, 200) })
    return jsonResponse(context, 200, { updated, rejected })
  }

  if (method === 'GET' && action === 'duplicates') {
    const r = await query(
      `;WITH n AS (SELECT SystemID, AssetNo, ShortDesc, Description, Location, Status,
                          UPPER(REPLACE(REPLACE(REPLACE(REPLACE(AssetNo,'-',''),' ',''),'/',''),'_','')) AS k
                     FROM tbl_Inventory WHERE NULLIF(LTRIM(RTRIM(AssetNo)),'') IS NOT NULL)
        SELECT a.SystemID AS stub, a.AssetNo AS stubAsset, a.Description AS stubDesc, a.Location AS stubLocation, a.Status AS stubStatus,
               (SELECT COUNT(*) FROM tbl_DeliveryTicketLines l WHERE l.serial = a.SystemID) AS stubDt,
               (SELECT COUNT(*) FROM tbl_ReceivingTicketLines l WHERE l.serial = a.SystemID) AS stubRt,
               (SELECT COUNT(*) FROM tbl_DailyFieldLogs f WHERE f.ToolSerial = a.SystemID) AS stubDays,
               b.SystemID AS real_, b.AssetNo AS realAsset, b.ShortDesc AS realShortDesc, b.Description AS realDesc, b.Location AS realLocation, b.Status AS realStatus,
               (SELECT COUNT(*) FROM tbl_DeliveryTicketLines l WHERE l.serial = b.SystemID) AS realDt
          FROM n a JOIN n b ON a.k = b.k AND a.SystemID <> b.SystemID
         WHERE a.ShortDesc = @p AND b.ShortDesc <> @p
         ORDER BY a.AssetNo`, [{ name: 'p', type: sql.NVarChar, value: PLACEHOLDER }])
    return jsonResponse(context, 200, r.recordset.map(x => ({ ...x, real: x.real_, real_: undefined })))
  }

  if (method === 'POST' && action === 'merge') {
    if (user.Role !== 'Admin') return jsonResponse(context, 403, { error: 'Admin only' })
    const stub = String(body.stub || '').trim(), real = String(body.real || '').trim()
    if (!stub || !real || stub === real) return jsonResponse(context, 400, { error: 'stub and real SystemID required' })
    const chk = await query(`SELECT SystemID, ShortDesc FROM tbl_Inventory WHERE SystemID IN (@s, @r)`,
      [{ name: 's', type: sql.NVarChar, value: stub }, { name: 'r', type: sql.NVarChar, value: real }])
    const s = chk.recordset.find(x => x.SystemID === stub), rr = chk.recordset.find(x => x.SystemID === real)
    if (!s || !rr) return jsonResponse(context, 404, { error: 'Asset not found' })
    if (s.ShortDesc !== PLACEHOLDER) return jsonResponse(context, 400, { error: 'Only a TO BE CATEGORISED stub can be merged away' })
    if (rr.ShortDesc === PLACEHOLDER) return jsonResponse(context, 400, { error: 'Target must be a categorised asset' })
    const p = [{ name: 's', type: sql.NVarChar, value: stub }, { name: 'r', type: sql.NVarChar, value: real }]
    const moved = {}
    moved.dtLines = (await query(`UPDATE tbl_DeliveryTicketLines SET serial = @r WHERE serial = @s`, p)).rowsAffected[0]
    moved.rtLines = (await query(`UPDATE tbl_ReceivingTicketLines SET serial = @r WHERE serial = @s`, p)).rowsAffected[0]
    moved.jobTools = (await query(
      `UPDATE t SET SystemID = @r FROM tbl_JobTools t WHERE t.SystemID = @s
          AND NOT EXISTS (SELECT 1 FROM tbl_JobTools x WHERE x.JobID = t.JobID AND x.SystemID = @r)`, p)).rowsAffected[0]
    // A row the real asset already has for the same job/date is left on the
    // stub rather than deleted: nothing is removed from the live tables here.
    moved.jobToolsLeftOnStub = (await query(`SELECT COUNT(*) AS n FROM tbl_JobTools WHERE SystemID = @s`, p)).recordset[0].n
    moved.fieldLogs = (await query(
      `UPDATE f SET ToolSerial = @r FROM tbl_DailyFieldLogs f WHERE f.ToolSerial = @s
          AND NOT EXISTS (SELECT 1 FROM tbl_DailyFieldLogs x WHERE x.JobID = f.JobID AND x.ToolSerial = @r AND x.LogDate = f.LogDate)`, p)).rowsAffected[0]
    moved.fieldLogsLeftOnStub = (await query(`SELECT COUNT(*) AS n FROM tbl_DailyFieldLogs WHERE ToolSerial = @s`, p)).recordset[0].n
    await query(`UPDATE tbl_Inventory SET Status = 'Merged', Location = 'MERGED INTO ' + @r, Qty = 0, LastUpdated = GETDATE(), LastUpdatedBy = @by WHERE SystemID = @s`,
      [...p, { name: 'by', type: sql.NVarChar, value: user.Username || user.FullName || 'app' }])
    await audit(user, 'inventory', stub, 'merge-into', { into: real, moved })
    return jsonResponse(context, 200, { stub, real, moved })
  }

  return jsonResponse(context, 404, { error: 'Not found' })
})
