'use strict'
const { sql, query, jsonResponse, requireAuth, safe, audit } = require('../db')

/**
 * Inventory status reconciliation.
 *
 *   GET  /api/reconcile/inventory            differences between the stored Status /
 *                                            Location and what the tickets say, by case
 *   POST /api/reconcile/inventory { cases }  apply the chosen cases (audited; no delete)
 *
 * The truth comes from movements: a tool's last delivery ticket (out to a
 * job) and last receiving ticket (back). The rule Ravi set:
 *   - On Rig  only while the tool is out on a job that is still Ongoing;
 *             Location = that job's rig.
 *   - Otherwise it is at base: Good — or Inspection / DBR only when an open
 *             inspection or maintenance record says so.
 *
 * Cases (current → expected):
 *   A  On Rig, but the last movement is a return              → Good, Emdad Base
 *   B  On Rig, last movement a delivery, job closed, no return → flag; Good, Emdad Base when applied
 *   C  not On Rig, but out on an open job                      → On Rig, job's rig
 *   D  Inspection with no open inspection record               → Good
 *   E  DBR / workshop with no open maintenance job             → Good
 *   G  On Rig on the right job but Location is not its rig     → Location = rig
 *   H  On Rig with no ticket history at all                    → Good, Emdad Base
 *   F  Good but Location is a rig name                         → Emdad Base
 */

// Ravi, 19 Nov: a tool is on the rig only while its job is Ongoing. Draft
// Invoice Submitted is a billing stage — the field work is over and the
// tools are expected back; any still On Rig are flagged (case B).
const OPEN_JOB = `j.Status = 'Ongoing'`
const BASE = 'Emdad Base'

// One row per live tool with its last out / last in and the job state.
const DERIVE = `
WITH inv AS (
  SELECT SystemID, AssetNo, ShortDesc, Size, Status, Location, IsEmdad
    FROM tbl_Inventory WHERE ISNULL(Status,'') <> 'Merged'
),
dtl AS (   -- last delivery per tool key (line serial may be SystemID or AssetNo)
  SELECT k.SystemID, MAX(CONVERT(varchar(10), d.deliveryDate, 120) + '|' + RIGHT('0000000000' + CAST(d.id AS varchar(10)), 10)) AS lastKey
    FROM tbl_DeliveryTicketLines l
    JOIN tbl_DeliveryTickets d ON d.dtNumber = l.dtNumber
    JOIN inv k ON l.serial = k.SystemID OR l.serial = k.AssetNo
   GROUP BY k.SystemID
),
dto AS (
  SELECT x.SystemID, d.id AS dtId, d.dtNumber, d.deliveryDate, d.jobNumber, d.rig
    FROM dtl x
    JOIN tbl_DeliveryTickets d ON RIGHT('0000000000' + CAST(d.id AS varchar(10)), 10) = RIGHT(x.lastKey, 10)
),
rtl AS (
  SELECT k.SystemID, MAX(CONVERT(varchar(10), r.receivingDate, 120) + '|' + RIGHT('0000000000' + CAST(r.id AS varchar(10)), 10)) AS lastKey
    FROM tbl_ReceivingTicketLines l
    JOIN tbl_ReceivingTickets r ON r.rtNumber = l.rtNumber
    JOIN inv k ON l.serial = k.SystemID OR l.serial = k.AssetNo
   GROUP BY k.SystemID
),
rti AS (
  SELECT x.SystemID, r.id AS rtId, r.rtNumber, r.receivingDate
    FROM rtl x
    JOIN tbl_ReceivingTickets r ON RIGHT('0000000000' + CAST(r.id AS varchar(10)), 10) = RIGHT(x.lastKey, 10)
),
insp AS (  -- open inspection record per asset / serial
  SELECT DISTINCT i.SystemID FROM tbl_InspectionRecords r
    JOIN inv i ON (NULLIF(r.asset,'') IS NOT NULL AND i.AssetNo = r.asset) OR (NULLIF(r.serial,'') IS NOT NULL AND i.SystemID = r.serial)
   WHERE ISNULL(r.status,'') NOT IN ('Closed','Completed','Done') AND ISNULL(r.result,'') NOT IN ('Pass','Fail')
),
mnt AS (   -- open maintenance job per tool
  SELECT DISTINCT i.SystemID FROM tbl_MaintenanceJobs m
    JOIN inv i ON (NULLIF(m.serial,'') IS NOT NULL AND (m.serial = i.SystemID OR m.serial = i.AssetNo)) OR (NULLIF(m.asset,'') IS NOT NULL AND m.asset = i.AssetNo)
   WHERE ISNULL(m.status,'') NOT IN ('Completed','Closed','Cancelled') AND m.completedDate IS NULL
),
rigs AS (SELECT DISTINCT UPPER(LTRIM(RTRIM(Rig))) AS Rig FROM tbl_Jobs WHERE NULLIF(LTRIM(RTRIM(Rig)),'') IS NOT NULL)
SELECT i.SystemID, i.AssetNo, i.ShortDesc, i.Size, i.Status, i.Location, i.IsEmdad,
       o.dtNumber, o.deliveryDate, o.jobNumber, o.rig AS dtRig,
       r.rtNumber, r.receivingDate,
       j.JobID, j.Status AS jobStatus, j.Rig AS jobRig, j.Client AS jobClient, j.Well AS jobWell, j.DemobDate, j.LegalInvoiceNumber, j.FinalInvoicedDate, j.InvoicingType,
       CASE WHEN o.dtNumber IS NOT NULL AND (r.receivingDate IS NULL OR r.receivingDate < o.deliveryDate
                 OR (r.receivingDate = o.deliveryDate AND r.rtId < o.dtId)) THEN 1 ELSE 0 END AS isOut,
       CASE WHEN j.JobID IS NOT NULL AND ${OPEN_JOB} THEN 1 ELSE 0 END AS jobOpen,
       CASE WHEN si.SystemID IS NOT NULL THEN 1 ELSE 0 END AS openInsp,
       CASE WHEN sm.SystemID IS NOT NULL THEN 1 ELSE 0 END AS openMnt,
       CASE WHEN rg.Rig IS NOT NULL THEN 1 ELSE 0 END AS locIsRig
  FROM inv i
  LEFT JOIN dto o ON o.SystemID = i.SystemID
  LEFT JOIN rti r ON r.SystemID = i.SystemID
  LEFT JOIN tbl_Jobs j ON UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(j.JobID,'-',''),' ',''),'/',''),'_',''),'.',''))
                        = UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(o.jobNumber,''),'-',''),' ',''),'/',''),'_',''),'.',''))
  LEFT JOIN insp si ON si.SystemID = i.SystemID
  LEFT JOIN mnt sm ON sm.SystemID = i.SystemID
  LEFT JOIN rigs rg ON rg.Rig = UPPER(LTRIM(RTRIM(i.Location)))
`

const WORKSHOP = new Set(['DBR', 'WORKSHOP', 'MAINTENANCE', 'UNDER MAINTENANCE', 'REPAIR'])

function classify (t) {
  const st = String(t.Status || '').trim()
  const up = st.toUpperCase()
  const rig = (t.jobRig || t.dtRig || '').trim()
  if (t.isOut) {
    if (t.jobOpen) {
      if (up !== 'ON RIG') return { c: 'C', status: 'On Rig', location: rig || t.Location }
      if (rig && String(t.Location || '').trim().toUpperCase() !== rig.toUpperCase()) return { c: 'G', status: 'On Rig', location: rig }
      return null
    }
    if (up === 'ON RIG') return { c: 'B', status: 'Good', location: BASE }
    // out on a closed job but not marked On Rig: already treated as back; fall through to base checks
  }
  // At base (returned, or never moved)
  if (up === 'ON RIG') return { c: t.dtNumber ? 'A' : 'H', status: 'Good', location: BASE }
  if (up === 'INSPECTION' && !t.openInsp) return { c: 'D', status: 'Good', location: t.locIsRig ? BASE : t.Location }
  if (WORKSHOP.has(up) && !t.openMnt) return { c: 'E', status: 'Good', location: t.locIsRig ? BASE : t.Location }
  if (up === 'GOOD' && t.locIsRig) return { c: 'F', status: 'Good', location: BASE }
  return null
}

const CASES = {
  A: 'On Rig, but the last movement is a return ticket → Good at Emdad Base',
  B: 'On Rig on a job that is no longer Ongoing (completed or at invoice stage), with no return ticket → flag (Good at Emdad Base when applied)',
  C: 'Out on an Ongoing job but not marked On Rig → On Rig at the job\'s rig',
  D: 'Inspection with no open inspection record → Good',
  E: 'DBR / workshop with no open maintenance job → Good (review: DBR may be genuine)',
  G: 'On Rig on the right job but Location is not its rig → Location = rig',
  H: 'On Rig with no ticket history at all → Good at Emdad Base',
  F: 'Good but Location is a rig name → Emdad Base',
}

module.exports = safe(async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return
  if (!['Admin', 'Operations'].includes(user.Role)) return jsonResponse(context, 403, { error: 'Admin or Operations only' })
  const method = (req.method || 'GET').toUpperCase()
  const action = req.params && req.params.action
  if (action !== 'inventory') return jsonResponse(context, 404, { error: 'Not found' })

  const rows = (await query(DERIVE, [])).recordset
  const diffs = []
  for (const t of rows) { const d = classify(t); if (d) diffs.push({ ...d, t }) }

  // GET ?case=B → every row of that case with job detail, for the yard to act on
  if (method === 'GET' && req.query && req.query.case) {
    const code = String(req.query.case).toUpperCase()
    const list = diffs.filter(d => d.c === code).map(d => ({
      SystemID: d.t.SystemID, AssetNo: d.t.AssetNo, ShortDesc: d.t.ShortDesc, Size: d.t.Size, Status: d.t.Status, Location: d.t.Location,
      lastDT: d.t.dtNumber, deliveryDate: d.t.deliveryDate, lastRT: d.t.rtNumber, receivingDate: d.t.receivingDate,
      JobID: d.t.JobID || d.t.jobNumber, jobStatus: d.t.jobStatus, Client: d.t.jobClient, Rig: d.t.jobRig || d.t.dtRig, Well: d.t.jobWell,
      DemobDate: d.t.DemobDate, LegalInvoiceNumber: d.t.LegalInvoiceNumber, FinalInvoicedDate: d.t.FinalInvoicedDate, InvoicingType: d.t.InvoicingType,
      to: `${d.status} @ ${d.location || '—'}`,
    }))
    return jsonResponse(context, 200, { code, label: CASES[code], count: list.length, rows: list })
  }

  if (method === 'GET') {
    const byCase = {}
    for (const d of diffs) {
      const b = byCase[d.c] || (byCase[d.c] = { code: d.c, label: CASES[d.c], count: 0, sample: [] })
      b.count++
      if (b.sample.length < 8) b.sample.push({ SystemID: d.t.SystemID, AssetNo: d.t.AssetNo, ShortDesc: d.t.ShortDesc, Status: d.t.Status, Location: d.t.Location, job: d.t.JobID || d.t.jobNumber, jobStatus: d.t.jobStatus, lastDT: d.t.dtNumber, lastRT: d.t.rtNumber, to: `${d.status} @ ${d.location || '—'}` })
    }
    const summary = rows.reduce((a, t) => { const k = t.Status || '(blank)'; a[k] = (a[k] || 0) + 1; return a }, {})
    const expected = { onRigOpenJobs: rows.filter(t => t.isOut && t.jobOpen).length, outOnClosedJobs: rows.filter(t => t.isOut && !t.jobOpen).length, atBase: rows.filter(t => !t.isOut).length }
    return jsonResponse(context, 200, { total: rows.length, currentByStatus: summary, expected, differences: diffs.length, cases: Object.keys(CASES).map(k => byCase[k]).filter(Boolean) })
  }

  if (method === 'POST') {
    const want = new Set(Array.isArray((req.body || {}).cases) ? req.body.cases : [])
    if (!want.size) return jsonResponse(context, 400, { error: 'cases required' })
    const todo = diffs.filter(d => want.has(d.c))
    const by = user.Username || user.FullName || 'app'
    let n = 0
    // Group identical (status, location) targets to keep the statement count down.
    const groups = new Map()
    for (const d of todo) { const k = d.status + '|' + (d.location || ''); (groups.get(k) || groups.set(k, []).get(k)).push(d.t.SystemID) }
    for (const [k, ids] of groups) {
      const [status, location] = k.split('|')
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500)
        const params = chunk.map((id, j) => ({ name: `i${j}`, type: sql.NVarChar, value: id }))
        const r = await query(`UPDATE tbl_Inventory SET Status = @st, Location = @loc, LastUpdated = GETDATE(), LastUpdatedBy = @by
                                WHERE SystemID IN (${params.map(p => '@' + p.name).join(',')})`,
          [...params, { name: 'st', type: sql.NVarChar, value: status }, { name: 'loc', type: sql.NVarChar, value: location || null }, { name: 'by', type: sql.NVarChar, value: by }])
        n += r.rowsAffected[0]
      }
    }
    const counts = {}; for (const d of todo) counts[d.c] = (counts[d.c] || 0) + 1
    await audit(user, 'inventory', 'reconcile', 'reconcile-status', { cases: [...want], counts, updated: n })
    return jsonResponse(context, 200, { updated: n, counts })
  }
  return jsonResponse(context, 405, { error: 'Method not allowed' })
})
