'use strict'
const { sql, query, jsonResponse, requireAuth, safe, audit } = require('../db')
const master = require('../master')

/**
 * Inventory → Master Data Clean-up. Admin only.
 *
 *   GET  /api/unify/categories           every ShortDesc in use, with its master row (if any) and a proposed canonical name
 *   POST /api/unify/categories/rename    { from, to }  — every inventory/job-tool row 'from' → 'to'; if 'from' is a
 *                                         master row too, it is deactivated (never deleted)
 *   GET  /api/unify/sizes                every Size in use, parsed to inches, with the master label it should carry
 *   POST /api/unify/sizes/rename         { from, to, addToMaster } — rows 'from' → 'to'; 'to' added to tbl_ToolSizes if asked
 *   GET  /api/unify/duplicates           asset pairs whose numbers are equal once dashes/slashes/spaces are ignored
 *   POST /api/unify/merge                { retire, keep } — repoint retire's tickets, job tools and rig days to keep;
 *                                         retire's status becomes Merged. Nothing is deleted.
 *
 * Every write is audited with before/after. Identifiers never come from the
 * request; values travel as parameters.
 */

const norm = s => String(s || '').toUpperCase().replace(/[\s\-_./"'()]+/g, '')

// ── sizes ──────────────────────────────────────────────────────────────────
// '8.250"', '8-1/4"', '8 1/4', '8.25 IN', '12-1/8"' → inches as a number; null if not a plain size.
function parseInches(label) {
  let s = String(label || '').trim().toUpperCase().replace(/[”"″]|''|\bINCH(ES)?\b|\bIN\b/g, '').trim()
  if (!s || /[A-Z]/.test(s) && !/^\d/.test(s)) return null
  if (/X/.test(s)) return null                                   // '2-7/8 X 3-1/2' is a pair, leave alone
  let m = /^(\d+)\s*[- ]\s*(\d+)\s*\/\s*(\d+)$/.exec(s); if (m) return +m[1] + (+m[2]) / (+m[3])
  m = /^(\d+)\s*\/\s*(\d+)$/.exec(s); if (m) return (+m[1]) / (+m[2])
  m = /^(\d+(?:\.\d+)?)$/.exec(s); if (m) return +m[1]
  return null
}
// 8.25 → '8-1/4"', 0.5 → '1/2"', 12 → '12"', 3.293 → '3.293"'
function canonicalLabel(inches) {
  if (inches == null) return null
  const whole = Math.floor(inches); const frac = inches - whole
  if (frac < 0.0005) return `${whole}"`
  for (const d of [2, 4, 8, 16, 32, 64]) {
    const n = Math.round(frac * d)
    if (Math.abs(frac - n / d) < 0.0005 && n > 0 && n < d) {
      // reduce
      const g = (a, b) => b ? g(b, a % b) : a; const k = g(n, d)
      return `${whole ? whole + '-' : ''}${n / k}/${d / k}"`
    }
  }
  return `${inches.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}"`
}

module.exports = safe(async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  if (user.Role !== 'Admin') return jsonResponse(context, 403, { error: 'Admin only' })
  const method = (req.method || 'GET').toUpperCase()
  const action = req.params && req.params.action
  const sub = req.params && req.params.sub
  const body = req.body || {}
  const by = user.Username || user.FullName || 'app'

  // ── categories ───────────────────────────────────────────────────────────
  if (action === 'categories' && method === 'GET') {
    const [used, master] = await Promise.all([
      query(`SELECT LTRIM(RTRIM(ShortDesc)) AS name, COUNT(*) AS tools,
                    SUM(CASE WHEN Status IN ('On Rig','Dispatched') THEN 1 ELSE 0 END) AS onRig
               FROM tbl_Inventory WHERE NULLIF(LTRIM(RTRIM(ShortDesc)),'') IS NOT NULL AND ISNULL(Status,'') <> 'Merged'
              GROUP BY LTRIM(RTRIM(ShortDesc))`, []),
      query(`SELECT CategoryID, CategoryName, ToolFamily, ActiveFlag FROM tbl_ToolCategories`, []),
    ])
    const masters = master.recordset.map(m => ({ ...m, key: norm(m.CategoryName) }))
    const byExact = new Map(masters.map(m => [m.CategoryName.trim().toUpperCase(), m]))
    const byKey = new Map()
    for (const m of masters) { const a = byKey.get(m.key) || []; a.push(m); byKey.set(m.key, a) }
    const useCount = new Map(used.recordset.map(u => [u.name.toUpperCase(), Number(u.tools)]))
    // Canonical per key: the active master with most tools in use, else first.
    const canonical = new Map()
    for (const [k, list] of byKey) {
      const pick = [...list].sort((a, b) => (b.ActiveFlag - a.ActiveFlag) || ((useCount.get(b.CategoryName.toUpperCase()) || 0) - (useCount.get(a.CategoryName.toUpperCase()) || 0)))[0]
      canonical.set(k, pick.CategoryName)
    }
    const rows = used.recordset.map(u => {
      const m = byExact.get(u.name.toUpperCase())
      const canon = canonical.get(norm(u.name)) || null
      return {
        name: u.name, tools: Number(u.tools), onRig: Number(u.onRig),
        inMaster: !!m, masterActive: m ? !!m.ActiveFlag : null, family: m ? m.ToolFamily : null,
        proposed: canon && canon !== u.name ? canon : null,
        issue: !m ? 'not in master' : canon && canon !== u.name ? 'variant of ' + canon : !m.ActiveFlag ? 'master inactive' : null,
      }
    })
    // Master duplicates even when only one spelling is in use
    // Only active masters count as duplicates; a retired spelling is already dealt with.
    const masterDupes = [...byKey.values()].map(l => l.filter(x => x.ActiveFlag)).filter(l => l.length > 1).map(l => ({ keep: canonical.get(l[0].key), others: l.map(x => x.CategoryName).filter(n => n !== canonical.get(l[0].key)) }))
    return jsonResponse(context, 200, { rows: rows.sort((a, b) => (a.issue ? 0 : 1) - (b.issue ? 0 : 1) || b.tools - a.tools), masterDupes, masters: masters.filter(m => m.ActiveFlag).map(m => m.CategoryName).sort() })
  }

  if (action === 'categories' && sub === 'rename' && method === 'POST') {
    const from = String(body.from || '').trim(), to = String(body.to || '').trim()
    if (!from || !to || from === to) return jsonResponse(context, 400, { error: 'from and to required' })
    const tgt = await query(`SELECT CategoryID, ActiveFlag FROM tbl_ToolCategories WHERE UPPER(CategoryName) = UPPER(@t)`, [{ name: 't', type: sql.NVarChar, value: to }])
    if (!tgt.recordset.length) return jsonResponse(context, 400, { error: `'${to}' is not in Tool Categories — add it first` })
    const p = [{ name: 'f', type: sql.NVarChar, value: from }, { name: 't', type: sql.NVarChar, value: to }, { name: 'by', type: sql.NVarChar, value: by }]
    const moved = {}
    moved.inventory = (await query(`UPDATE tbl_Inventory SET ShortDesc = @t, LastUpdated = GETDATE(), LastUpdatedBy = @by WHERE UPPER(LTRIM(RTRIM(ShortDesc))) = UPPER(@f)`, p)).rowsAffected[0]
    moved.jobTools = (await query(`UPDATE tbl_JobTools SET ShortDesc = @t WHERE UPPER(LTRIM(RTRIM(ShortDesc))) = UPPER(@f)`, p)).rowsAffected[0]
    moved.categoryMap = (await query(`IF OBJECT_ID('dbo.tbl_CategoryMap','U') IS NOT NULL
        UPDATE m SET InventoryCategory = @t FROM tbl_CategoryMap m WHERE UPPER(LTRIM(RTRIM(InventoryCategory))) = UPPER(@f)
          AND NOT EXISTS (SELECT 1 FROM tbl_CategoryMap x WHERE UPPER(x.InventoryCategory) = UPPER(@t))`, p)).rowsAffected[0] || 0
    if (!tgt.recordset[0].ActiveFlag) await query(`UPDATE tbl_ToolCategories SET ActiveFlag = 1 WHERE UPPER(CategoryName) = UPPER(@t)`, p)
    moved.masterDeactivated = (await query(`UPDATE tbl_ToolCategories SET ActiveFlag = 0, Notes = LEFT(ISNULL(Notes,'') + ' Merged into ' + @t + ' ' + CONVERT(varchar(10), GETDATE(), 120), 500) WHERE UPPER(CategoryName) = UPPER(@f)`, p)).rowsAffected[0]
    master.bust()
    await audit(user, 'category', from, 'rename-category', { to, moved })
    return jsonResponse(context, 200, { from, to, moved })
  }

  // ── sizes ────────────────────────────────────────────────────────────────
  if (action === 'sizes' && method === 'GET') {
    // One standard list for both sides: sizes as inventory writes them and as
    // the contract rate sheets write them, so a rename fixes both at once and
    // the rate lookup matches exactly.
    const [used, master] = await Promise.all([
      query(`SELECT label, SUM(tools) AS tools, SUM(rateLines) AS rateLines, STRING_AGG(contracts, ',') AS contracts FROM (
               SELECT LTRIM(RTRIM(Size)) AS label, COUNT(*) AS tools, 0 AS rateLines, CAST(NULL AS nvarchar(max)) AS contracts FROM tbl_Inventory
                WHERE NULLIF(LTRIM(RTRIM(Size)),'') IS NOT NULL AND ISNULL(Status,'') <> 'Merged' GROUP BY LTRIM(RTRIM(Size))
               UNION ALL
               SELECT LTRIM(RTRIM(Size)), 0, COUNT(*), STRING_AGG(ContractCode, ',') WITHIN GROUP (ORDER BY ContractCode) FROM (SELECT DISTINCT Size, ContractCode FROM tbl_ContractRates WHERE ActiveFlag = 1) d
                WHERE NULLIF(LTRIM(RTRIM(Size)),'') IS NOT NULL GROUP BY LTRIM(RTRIM(Size))
             ) u GROUP BY label`, []),
      query(`SELECT SizeID, SizeLabel, ActiveFlag FROM tbl_ToolSizes`, []),
    ])
    const rateLineCount = new Map((await query(`SELECT LTRIM(RTRIM(Size)) AS label, COUNT(*) AS n FROM tbl_ContractRates WHERE ActiveFlag = 1 AND NULLIF(LTRIM(RTRIM(Size)),'') IS NOT NULL GROUP BY LTRIM(RTRIM(Size))`, [])).recordset.map(r => [r.label.toUpperCase(), Number(r.n)]))
    const masters = master.recordset.map(m => ({ ...m, label: String(m.SizeLabel).trim(), inches: parseInches(m.SizeLabel) }))
    const masterByUpper = new Map(masters.map(m => [m.label.toUpperCase(), m]))
    // Canonical label per inch value: the master label that is already in fraction form, else the computed one.
    const masterByInches = new Map()
    for (const m of masters) if (m.inches != null) {
      const k = m.inches.toFixed(4); const cur = masterByInches.get(k)
      if (!cur || (m.label === canonicalLabel(m.inches) && cur.label !== canonicalLabel(cur.inches))) masterByInches.set(k, m)
    }
    const rows = used.recordset.map(u => {
      const inches = parseInches(u.label)
      const m = masterByUpper.get(u.label.toUpperCase())
      // Target: the master label for that inch value if one exists; otherwise a
      // fraction form when the value is an exact fraction, else the label as
      // written (5.970" stays 5.970" — no rounding of a decimal size).
      const canon = inches != null ? canonicalLabel(inches) : null
      const isFraction = canon != null && !/\.\d/.test(canon)
      const target = inches != null ? (masterByInches.get(inches.toFixed(4))?.label || (isFraction ? canon : u.label)) : null
      const proposed = target && target !== u.label ? target : null
      return {
        label: u.label, tools: Number(u.tools), rateLines: rateLineCount.get(u.label.toUpperCase()) || 0,
        contracts: [...new Set(String(u.contracts || '').split(',').filter(Boolean))], inches, inMaster: !!m,
        proposed, proposedInMaster: proposed ? masterByUpper.has(proposed.toUpperCase()) : null,
        issue: proposed ? (inches != null && m ? 'variant of ' + proposed : 'should be ' + proposed) : !m ? 'not in master' : null,
      }
    })
    const masterDupes = []
    const groups = new Map()
    for (const m of masters) if (m.inches != null && m.ActiveFlag) { const k = m.inches.toFixed(4); const a = groups.get(k) || []; a.push(m.label); groups.set(k, a) }
    for (const [k, labels] of groups) if (labels.length > 1) masterDupes.push({ keep: masterByInches.get(k).label, others: labels.filter(l => l !== masterByInches.get(k).label) })
    return jsonResponse(context, 200, { rows: rows.sort((a, b) => (a.issue ? 0 : 1) - (b.issue ? 0 : 1) || (a.inches ?? 1e9) - (b.inches ?? 1e9)), masterDupes, masters: masters.filter(m => m.ActiveFlag).map(m => m.label) })
  }

  if (action === 'sizes' && sub === 'rename' && method === 'POST') {
    const from = String(body.from || '').trim(), to = String(body.to || '').trim()
    if (!from || !to) return jsonResponse(context, 400, { error: 'from and to required' })
    // from === to with addToMaster: the label is already right, it only needs a master row.
    const p = [{ name: 'f', type: sql.NVarChar, value: from }, { name: 't', type: sql.NVarChar, value: to }, { name: 'by', type: sql.NVarChar, value: by }]
    const inMaster = (await query(`SELECT 1 AS x FROM tbl_ToolSizes WHERE UPPER(LTRIM(RTRIM(SizeLabel))) = UPPER(@t)`, p)).recordset.length > 0
    if (from === to && inMaster) return jsonResponse(context, 400, { error: 'Nothing to change' })
    const moved = {}
    if (!inMaster) {
      if (!body.addToMaster) return jsonResponse(context, 400, { error: `'${to}' is not in Tool Sizes — tick "add to master" or pick an existing size` })
      await query(`INSERT INTO tbl_ToolSizes (SizeLabel, SizeDecimal, InInventory, ActiveFlag, SortOrder)
                   SELECT @t, @d, 1, 1, ISNULL(MAX(SortOrder),0) + 1 FROM tbl_ToolSizes`,
        [...p, { name: 'd', type: sql.Float, value: parseInches(to) }])
      moved.masterAdded = 1
    }
    moved.inventory = from === to ? 0 : (await query(`UPDATE tbl_Inventory SET Size = @t, LastUpdated = GETDATE(), LastUpdatedBy = @by WHERE UPPER(LTRIM(RTRIM(Size))) = UPPER(@f)`, p)).rowsAffected[0]
    moved.jobTools = from === to ? 0 : (await query(`UPDATE tbl_JobTools SET Size = @t WHERE UPPER(LTRIM(RTRIM(Size))) = UPPER(@f)`, p)).rowsAffected[0]
    moved.rateLines = from === to ? 0 : (await query(`UPDATE tbl_ContractRates SET Size = @t WHERE UPPER(LTRIM(RTRIM(Size))) = UPPER(@f)`, p)).rowsAffected[0]
    moved.masterDeactivated = (await query(`UPDATE tbl_ToolSizes SET ActiveFlag = 0 WHERE UPPER(LTRIM(RTRIM(SizeLabel))) = UPPER(@f) AND UPPER(@f) <> UPPER(@t)`, p)).rowsAffected[0]
    master.bust()
    await audit(user, 'size', from, 'rename-size', { to, moved })
    return jsonResponse(context, 200, { from, to, moved })
  }

  // ── duplicate assets ─────────────────────────────────────────────────────
  // Pairs the user has judged to be different tools are remembered so they stop appearing.
  const ensureExcl = () => query(`IF OBJECT_ID('dbo.tbl_DuplicateExclusions','U') IS NULL
      CREATE TABLE dbo.tbl_DuplicateExclusions (Id int IDENTITY PRIMARY KEY, AId nvarchar(100) NOT NULL, BId nvarchar(100) NOT NULL, Reason nvarchar(300) NULL, CreatedBy nvarchar(100) NULL, CreatedAt datetime NOT NULL DEFAULT GETDATE())`, [])

  if (action === 'duplicates' && sub === 'exclude' && method === 'POST') {
    const a = String(body.aId || '').trim(), b2 = String(body.bId || '').trim()
    if (!a || !b2) return jsonResponse(context, 400, { error: 'aId and bId required' })
    await ensureExcl()
    await query(`INSERT INTO tbl_DuplicateExclusions (AId, BId, Reason, CreatedBy) VALUES (@a, @b, @r, @by)`,
      [{ name: 'a', type: sql.NVarChar, value: a }, { name: 'b', type: sql.NVarChar, value: b2 }, { name: 'r', type: sql.NVarChar, value: String(body.reason || 'Different tools') }, { name: 'by', type: sql.NVarChar, value: by }])
    await audit(user, 'inventory', a, 'not-duplicate', { of: b2 })
    return jsonResponse(context, 200, { ok: true })
  }

  if (action === 'duplicates' && method === 'GET') {
    await ensureExcl()
    const r = await query(
      `;WITH n AS (SELECT SystemID, AssetNo, ShortDesc, Size, Description, Location, Status, AddedDate,
                          UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(AssetNo,'-',''),' ',''),'/',''),'_',''),'.','')) AS k
                     FROM tbl_Inventory WHERE NULLIF(LTRIM(RTRIM(AssetNo)),'') IS NOT NULL AND ISNULL(Status,'') <> 'Merged'),
            h AS (SELECT SystemID,
                         (SELECT COUNT(*) FROM tbl_DeliveryTicketLines l WHERE l.serial = n.SystemID) AS dt,
                         (SELECT COUNT(*) FROM tbl_ReceivingTicketLines l WHERE l.serial = n.SystemID) AS rt,
                         (SELECT COUNT(*) FROM tbl_DailyFieldLogs f WHERE f.ToolSerial = n.SystemID) AS days,
                         (SELECT COUNT(*) FROM tbl_JobTools j WHERE j.SystemID = n.SystemID) AS jobs
                    FROM n)
        SELECT a.SystemID AS aId, a.AssetNo AS aAsset, a.ShortDesc AS aCat, a.Size AS aSize, a.Description AS aDesc, a.Location AS aLoc, a.Status AS aStatus, a.AddedDate AS aAdded,
               ha.dt AS aDt, ha.rt AS aRt, ha.days AS aDays, ha.jobs AS aJobs,
               b.SystemID AS bId, b.AssetNo AS bAsset, b.ShortDesc AS bCat, b.Size AS bSize, b.Description AS bDesc, b.Location AS bLoc, b.Status AS bStatus, b.AddedDate AS bAdded,
               hb.dt AS bDt, hb.rt AS bRt, hb.days AS bDays, hb.jobs AS bJobs
          FROM n a JOIN n b ON a.k = b.k AND a.SystemID < b.SystemID
          JOIN h ha ON ha.SystemID = a.SystemID JOIN h hb ON hb.SystemID = b.SystemID
         WHERE NOT EXISTS (SELECT 1 FROM tbl_DuplicateExclusions x WHERE (x.AId = a.SystemID AND x.BId = b.SystemID) OR (x.AId = b.SystemID AND x.BId = a.SystemID))
         ORDER BY a.AssetNo`, [])
    // Suggest which to keep: more history, then the one added first.
    const out = r.recordset.map(x => {
      const sa = x.aDt + x.aRt + x.aDays + x.aJobs, sb = x.bDt + x.bRt + x.bDays + x.bJobs
      const keep = sa > sb ? 'a' : sb > sa ? 'b' : (new Date(x.aAdded || 0) <= new Date(x.bAdded || 0) ? 'a' : 'b')
      // Different categories (or sizes) usually means two different tools that
      // happen to share a number pattern; flagged so they are not merged blindly.
      const sameCat = !x.aCat || !x.bCat || master.normKey(x.aCat) === master.normKey(x.bCat)
      const sameSize = !x.aSize || !x.bSize || master.normKey(x.aSize) === master.normKey(x.bSize) || (master.parseInches(x.aSize) != null && master.parseInches(x.aSize) === master.parseInches(x.bSize))
      return { ...x, suggestKeep: keep, likely: sameCat && sameSize, warn: !sameCat ? 'different categories' : !sameSize ? 'different sizes' : null }
    })
    return jsonResponse(context, 200, out)
  }

  if (action === 'merge' && method === 'POST') {
    const retire = String(body.retire || '').trim(), keep = String(body.keep || '').trim()
    if (!retire || !keep || retire === keep) return jsonResponse(context, 400, { error: 'retire and keep SystemID required' })
    const chk = await query(`SELECT SystemID, ShortDesc, Size, Status FROM tbl_Inventory WHERE SystemID IN (@r, @k)`,
      [{ name: 'r', type: sql.NVarChar, value: retire }, { name: 'k', type: sql.NVarChar, value: keep }])
    const R = chk.recordset.find(x => x.SystemID === retire), K = chk.recordset.find(x => x.SystemID === keep)
    if (!R || !K) return jsonResponse(context, 404, { error: 'Asset not found' })
    if (R.Status === 'Merged') return jsonResponse(context, 400, { error: 'Already merged' })
    const p = [{ name: 'r', type: sql.NVarChar, value: retire }, { name: 'k', type: sql.NVarChar, value: keep }, { name: 'by', type: sql.NVarChar, value: by }]
    const moved = {}
    moved.dtLines = (await query(`UPDATE tbl_DeliveryTicketLines SET serial = @k WHERE serial = @r`, p)).rowsAffected[0]
    moved.rtLines = (await query(`UPDATE tbl_ReceivingTicketLines SET serial = @k WHERE serial = @r`, p)).rowsAffected[0]
    moved.jobTools = (await query(`UPDATE t SET SystemID = @k FROM tbl_JobTools t WHERE t.SystemID = @r
        AND NOT EXISTS (SELECT 1 FROM tbl_JobTools x WHERE x.JobID = t.JobID AND x.SystemID = @k)`, p)).rowsAffected[0]
    moved.fieldLogs = (await query(`UPDATE f SET ToolSerial = @k FROM tbl_DailyFieldLogs f WHERE f.ToolSerial = @r
        AND NOT EXISTS (SELECT 1 FROM tbl_DailyFieldLogs x WHERE x.JobID = f.JobID AND x.ToolSerial = @k AND x.LogDate = f.LogDate)`, p)).rowsAffected[0]
    moved.leftOnRetired = {
      jobTools: (await query(`SELECT COUNT(*) AS n FROM tbl_JobTools WHERE SystemID = @r`, p)).recordset[0].n,
      fieldLogs: (await query(`SELECT COUNT(*) AS n FROM tbl_DailyFieldLogs WHERE ToolSerial = @r`, p)).recordset[0].n,
    }
    // The kept asset inherits a category/size it lacked.
    await query(`UPDATE k SET ShortDesc = COALESCE(NULLIF(k.ShortDesc,''), r.ShortDesc), Size = COALESCE(NULLIF(k.Size,''), r.Size),
                        LastUpdated = GETDATE(), LastUpdatedBy = @by
                   FROM tbl_Inventory k JOIN tbl_Inventory r ON r.SystemID = @r WHERE k.SystemID = @k`, p)
    await master.ensureColumns()
    await query(`UPDATE tbl_Inventory SET Status = 'Merged', MergedInto = @k, Location = 'MERGED INTO ' + @k, Qty = 0, LastUpdated = GETDATE(), LastUpdatedBy = @by WHERE SystemID = @r`, p)
    master.bust()
    await audit(user, 'inventory', retire, 'merge-into', { into: keep, moved })
    return jsonResponse(context, 200, { retire, keep, moved })
  }

  return jsonResponse(context, 404, { error: 'Not found' })
})
