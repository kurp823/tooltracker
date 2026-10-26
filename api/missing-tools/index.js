'use strict'
const { sql, query, jsonResponse, requireAuth } = require('../db')

/**
 * Tools on live jobs that have no inventory record.
 *
 * Found while chasing CX0697: it was dispatched to rig AD-112 on
 * DT-26-03434 for JOB-26-01836, but tbl_Inventory had no row for it at all.
 * It is not an isolated case — across the 102 jobs that are still live there
 * are 193 distinct assets on delivery tickets with no inventory record, 137
 * of which have never come back on a receiving ticket and so are physically
 * on a rig right now while the system believes they do not exist.
 *
 * GET  /api/missing-tools        -> the reconciliation list
 *        ?onRigOnly=1            -> only those not yet returned on an RT
 * POST /api/missing-tools        -> { tools: [{ AssetNo, ShortDesc, Size,
 *                                     Supplier, Description, Location }] }
 *        creates the inventory rows with Status 'On Rig'.
 *
 * Statuses that count as live are taken from the job register rather than
 * hard-coded here, so a renamed status doesn't silently empty the report.
 */

// Job statuses that mean the job has not been closed out yet. These are the
// real values in tbl_Jobs.Status, counted: Ongoing 55, Draft Invoice
// Submitted 42, Open 4, Waiting on Signed Docs 1.
const LIVE_STATUSES = [
  'Ongoing',
  'Draft Invoice Submitted',
  'Open',
  'Waiting on Signed Docs',
]

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const method = req.method.toUpperCase()

  // ── GET: the reconciliation list ────────────────────────────────────────
  if (method === 'GET') {
    const onRigOnly = ['1', 'true', 'yes'].includes(
      String((req.query || {}).onRigOnly || '').toLowerCase()
    )

    const statusParams = LIVE_STATUSES.map((s, i) => {
      return { name: `st${i}`, type: sql.NVarChar, value: s }
    })
    const statusList = statusParams.map(p => `@${p.name}`).join(', ')

    try {
      const result = await query(
        // Job numbers are stored in two shapes ('Job-026-01836' on the job,
        // 'JOB-26-01836' on the ticket). Stripping non-digits does NOT make
        // them comparable — that gives 02601836 vs 2601836, and the leading
        // zero silently dropped every such job, CX0697's included. The
        // trailing sequence never resets across years, so it is the key.
        //
        // Shape matters for speed too: filter the 3,700 tickets first, then
        // seek their lines by dtNumber. Joining on a computed expression
        // against all 47,106 lines took 14 seconds.
        `WITH live AS (
           SELECT DISTINCT
                  TRY_CAST(RIGHT(JobID, CHARINDEX('-', REVERSE(JobID) + '-') - 1) AS INT) AS seq
             FROM tbl_Jobs
            WHERE Status IN (${statusList})
         ),
         liveTickets AS (
           SELECT dt.dtNumber, dt.jobNumber, dt.rig, dt.deliveryDate
             FROM tbl_DeliveryTickets dt
             JOIN live l
               ON l.seq = TRY_CAST(
                    RIGHT(dt.jobNumber, CHARINDEX('-', REVERSE(dt.jobNumber) + '-') - 1) AS INT)
            WHERE l.seq IS NOT NULL
         ),
         dispatched AS (
           SELECT dtl.serial                AS AssetNo,
                  MAX(dtl.toolDescription)  AS Description,
                  SUM(COALESCE(dtl.qty, 1)) AS Qty,
                  MAX(lt.deliveryDate)      AS LastDateOut,
                  COUNT(DISTINCT lt.dtNumber) AS Dispatches,
                  MAX(lt.rig)               AS Rig,
                  MAX(lt.jobNumber)         AS JobNumber,
                  MAX(lt.dtNumber)          AS DTNumber,
                  -- Carried as a plain INT so the return lookup below compares
                  -- numbers rather than re-deriving the sequence per row.
                  MAX(TRY_CAST(
                    RIGHT(lt.jobNumber, CHARINDEX('-', REVERSE(lt.jobNumber) + '-') - 1) AS INT
                  )) AS JobSeq
             FROM liveTickets lt
             JOIN tbl_DeliveryTicketLines dtl ON dtl.dtNumber = lt.dtNumber
            WHERE NULLIF(LTRIM(RTRIM(dtl.serial)), '') IS NOT NULL
            GROUP BY dtl.serial
         ),
         -- Every identifying key in inventory, flattened once. The previous
         -- shape ran three correlated lookups per candidate asset; as one
         -- materialised set it is a single pass.
         invKeys AS (
           SELECT SystemID  AS k FROM tbl_Inventory WHERE NULLIF(SystemID, '')  IS NOT NULL
           UNION
           SELECT AssetNo     FROM tbl_Inventory WHERE NULLIF(AssetNo, '')    IS NOT NULL
           UNION
           SELECT OEMSerial   FROM tbl_Inventory WHERE NULLIF(OEMSerial, '')  IS NOT NULL
         ),
         -- Returns on the live jobs only. Computing the job sequence per row
         -- of all 58,392 receiving-ticket lines was the 15 seconds: it can use
         -- no index. Filtering the 3,451 ticket headers first and seeking
         -- their lines by rtNumber gives the same answer from a small set.
         liveReturns AS (
           SELECT rl.serial,
                  rh.rtNumber,
                  rh.receivingDate,
                  l.seq
             FROM tbl_ReceivingTickets rh
             JOIN live l
               ON l.seq = TRY_CAST(
                    RIGHT(rh.jobNumber, CHARINDEX('-', REVERSE(rh.jobNumber) + '-') - 1) AS INT)
             JOIN tbl_ReceivingTicketLines rl ON rl.rtNumber = rh.rtNumber
         )
         SELECT d.AssetNo,
                d.Description,
                d.Qty,
                d.LastDateOut,
                d.Dispatches,
                d.Rig,
                d.JobNumber,
                d.DTNumber,
                CASE WHEN rt.rtNumber IS NULL THEN 1 ELSE 0 END AS StillOnRig,
                rt.rtNumber AS ReturnedOn
           FROM dispatched d
           -- Returned on THIS job, not on any job ever. Matching across all
           -- history marked a tool returned because it came back from a
           -- different job years earlier, which collapsed "still on a rig"
           -- from 138 down to 1.
           OUTER APPLY (
             SELECT TOP 1 lr.rtNumber
               FROM liveReturns lr
              WHERE lr.serial = d.AssetNo
                AND lr.seq    = d.JobSeq
              ORDER BY lr.receivingDate DESC
           ) rt
          -- No inventory row under any of the three identifying keys.
          WHERE NOT EXISTS (SELECT 1 FROM invKeys ik WHERE ik.k = d.AssetNo)
            ${onRigOnly ? 'AND rt.rtNumber IS NULL' : ''}
          ORDER BY d.LastDateOut DESC, d.AssetNo`,
        statusParams
      )
      return jsonResponse(context, 200, result.recordset)
    } catch (err) {
      context.log.error('Missing tools error:', err)
      return jsonResponse(context, 500, {
        error: 'Failed to build the missing-tools list',
        detail: err.message,
      })
    }
  }

  // ── POST: add the confirmed rows to inventory ───────────────────────────
  if (method === 'POST') {
    if (!['Admin', 'Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const tools = Array.isArray(req.body && req.body.tools) ? req.body.tools : []
    if (!tools.length) return jsonResponse(context, 400, { error: 'No tools supplied' })
    if (tools.length > 500) return jsonResponse(context, 400, { error: 'Too many rows in one call (max 500)' })

    const added = []
    const skipped = []

    for (const t of tools) {
      const assetNo = String(t.AssetNo || '').trim()
      if (!assetNo) { skipped.push({ AssetNo: t.AssetNo, reason: 'Asset number missing' }); continue }
      if (!String(t.ShortDesc || '').trim()) {
        skipped.push({ AssetNo: assetNo, reason: 'Category required' }); continue
      }

      try {
        // Guard inside the statement, not just above it: two users working the
        // same list must not both insert the same asset.
        const r = await query(
          `INSERT INTO tbl_Inventory
             (SystemID, AssetNo, [Size], ShortDesc, Description, Qty, Location,
              Status, Ownership, IsEmdad, Supplier, AddedDate, AddedBy,
              LastUpdated, LastUpdatedBy)
           OUTPUT INSERTED.SystemID
           SELECT @asset, @asset, @size, @cat, @desc, @qty, @loc,
                  'On Rig', @owner, @isEmdad, @supplier, GETDATE(), @by,
                  GETDATE(), @by
            WHERE NOT EXISTS (
              SELECT 1 FROM tbl_Inventory x
               WHERE x.SystemID = @asset OR x.AssetNo = @asset
            )`,
          [
            { name: 'asset',    type: sql.NVarChar, value: assetNo },
            { name: 'size',     type: sql.NVarChar, value: t.Size || null },
            { name: 'cat',      type: sql.NVarChar, value: String(t.ShortDesc).trim() },
            { name: 'desc',     type: sql.NVarChar, value: t.Description || null },
            { name: 'qty',      type: sql.Int,      value: Number(t.Qty) > 0 ? Number(t.Qty) : 1 },
            { name: 'loc',      type: sql.NVarChar, value: t.Location || t.Rig || null },
            // A supplier that isn't EMDAD means the tool is sub-contracted in;
            // Ownership carries the sub-contractor's own name.
            { name: 'owner',    type: sql.NVarChar, value: t.Supplier || 'EMDAD' },
            { name: 'isEmdad',  type: sql.Bit,
              value: !t.Supplier || /^emdad/i.test(String(t.Supplier).trim()) ? 1 : 0 },
            { name: 'supplier', type: sql.NVarChar, value: t.Supplier || 'EMDAD' },
            { name: 'by',       type: sql.NVarChar, value: user.Username },
          ]
        )
        if (r.recordset && r.recordset.length) added.push(assetNo)
        else skipped.push({ AssetNo: assetNo, reason: 'Already in inventory' })
      } catch (err) {
        context.log.error(`Missing-tools insert failed for ${assetNo}:`, err)
        skipped.push({ AssetNo: assetNo, reason: err.message })
      }
    }

    return jsonResponse(context, 200, { added: added.length, addedAssets: added, skipped })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
