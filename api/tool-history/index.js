'use strict'
const { sql, query, jsonResponse, requireAuth, safe } = require('../db')

/**
 * GET /api/tool-history
 *   ?job=      job number  -> "JOB - Tools List" report for that job
 *   ?serial=   exact tool serial / SystemID
 *   ?search=   matches serial, asset no or description
 *   ?limit=    max rows (default 500, max 5000)
 *
 * One row per dispatched tool line, pairing the delivery ticket (out) with
 * the matching receiving ticket (in) — the layout of the printed
 * "JOB - Tools List" report: TicketNo, Date Out, Item, PartNo, Description,
 * RGT_No, Date_In, Comments, Supplier.
 *
 * Each row also carries utilization from tbl_DailyFieldLogs: operating days
 * (StatusType '1'), standby days ('S') and the money charged for each. Those
 * logs are keyed by DTNumber + ToolSerial, which is used here deliberately —
 * job IDs are stored in several formats across tables ('Job-026-01834' vs
 * 'JOB-26-01834'), so matching on the ticket number avoids that entirely.
 *
 * Real columns (confirmed via INFORMATION_SCHEMA):
 *   tbl_DeliveryTicketLines:  id, dtNumber, itemNo, serial, toolDescription, qty, remarks
 *   tbl_DeliveryTickets:      dtNumber, jobNumber, deliveryDate, rig, well, poNumber, status
 *   tbl_ReceivingTicketLines: id, rtNumber, itemNo, serial, toolDescription, qty,
 *                             usedStatus, condition, remarks
 *   tbl_ReceivingTickets:     rtNumber, jobNumber, receivingDate, ...
 *   tbl_DailyFieldLogs:       LogID, JobID, DTNumber, ToolSerial, LogDate,
 *                             StatusType, RateCharged, CreatedDate
 */

/**
 * Job numbers appear in multiple formats across tables, so build the likely
 * spellings and match on any of them rather than trying to normalise in SQL.
 * 'Job-026-01834' -> JOB-026-01834, JOB-26-01834, JOB-026-1834, JOB-26-1834
 */
function jobIdVariants(raw) {
  const id = String(raw || '').trim().toUpperCase()
  if (!id) return []
  const parts = id.split('-')
  const variants = new Set([id])
  if (parts.length === 3) {
    const [p, a, b] = parts
    const strip = (v) => (/^\d+$/.test(v) ? String(parseInt(v, 10)) : v)
    const pad = (v, n) => (/^\d+$/.test(v) ? v.padStart(n, '0') : v)
    for (const aa of new Set([a, strip(a), pad(strip(a), 3)])) {
      for (const bb of new Set([b, strip(b), pad(strip(b), 5)])) {
        variants.add(`${p}-${aa}-${bb}`)
      }
    }
  }
  return [...variants].slice(0, 12)
}

module.exports = safe(async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  if (req.method.toUpperCase() !== 'GET') {
    return jsonResponse(context, 405, { error: 'Method not allowed' })
  }

  const qs = req.query || {}
  const serial = (qs.serial || '').trim()
  const search = (qs.search || '').trim()
  const job    = (qs.job    || '').trim()

  let limit = parseInt(qs.limit, 10)
  if (!Number.isFinite(limit) || limit <= 0) limit = 500
  limit = Math.min(limit, 5000)

  const where  = []
  const params = [{ name: 'limit', type: sql.Int, value: limit }]

  if (job) {
    const variants = jobIdVariants(job)
    const names = variants.map((v, idx) => {
      const n = `job${idx}`
      params.push({ name: n, type: sql.NVarChar, value: v })
      return `@${n}`
    })
    where.push(`dt.jobNumber IN (${names.join(', ')})`)
  }
  if (serial) {
    where.push(`dtl.serial = @serial`)
    params.push({ name: 'serial', type: sql.NVarChar, value: serial })
  }
  if (search) {
    where.push(`(dtl.serial LIKE @q OR dtl.toolDescription LIKE @q
                 OR EXISTS (SELECT 1 FROM tbl_Inventory x
                             WHERE (x.SystemID = dtl.serial OR x.AssetNo = dtl.serial OR x.OEMSerial = dtl.serial)
                               AND (x.AssetNo LIKE @q OR x.ShortDesc LIKE @q)))`)
    params.push({ name: 'q', type: sql.NVarChar, value: `%${search}%` })
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  try {
    const result = await query(
      // Performance: the receiving-ticket and field-log lookups used to run
      // as a correlated OUTER APPLY per line, costing 1-2 s per line (a
      // 19-line job took 20 s; a large job exceeded SWA's 45 s limit). They
      // are now computed ONCE, restricted to the jobs / tickets / tools in
      // the result, and joined back. Same output, set-based.
      `WITH base AS (
          SELECT TOP (@limit)
                 dt.dtNumber, dt.deliveryDate, dt.jobNumber, dt.rig, dt.well, dt.poNumber,
                 dtl.itemNo, dtl.serial, dtl.toolDescription, dtl.qty
            FROM tbl_DeliveryTicketLines dtl
            JOIN tbl_DeliveryTickets     dt ON dtl.dtNumber = dt.dtNumber
          ${whereClause}
           ORDER BY dt.deliveryDate DESC, dt.dtNumber DESC, dtl.itemNo
        ),
        rtj AS (
          -- latest receiving ticket that brought each tool back on its job
          SELECT x.serial, x.jobNumber, x.rtNumber, x.receivingDate, x.usedStatus, x.condition
            FROM (
              SELECT rtl.serial, rth.jobNumber, rth.rtNumber, rth.receivingDate,
                     rtl.usedStatus, rtl.condition,
                     ROW_NUMBER() OVER (PARTITION BY rtl.serial, rth.jobNumber
                                        ORDER BY rth.receivingDate DESC) AS rn
                FROM tbl_ReceivingTicketLines rtl
                JOIN tbl_ReceivingTickets     rth ON rtl.rtNumber = rth.rtNumber
               WHERE rth.jobNumber IN (SELECT jobNumber FROM base)
                 AND rtl.serial    IN (SELECT serial    FROM base)
            ) x
           WHERE x.rn = 1
        ),
        ul AS (
          -- operating / standby days and money per tool per ticket
          SELECT d.ToolSerial, d.DTNumber,
                 SUM(CASE WHEN d.StatusType = '1' THEN 1 ELSE 0 END) AS OpsDays,
                 SUM(CASE WHEN d.StatusType = 'S' THEN 1 ELSE 0 END) AS StandbyDays,
                 SUM(CASE WHEN d.StatusType = '1' THEN COALESCE(d.RateCharged, 0) ELSE 0 END) AS OpsAmount,
                 SUM(CASE WHEN d.StatusType = 'S' THEN COALESCE(d.RateCharged, 0) ELSE 0 END) AS StandbyAmount
            FROM tbl_DailyFieldLogs d
           WHERE d.DTNumber IN (SELECT dtNumber FROM base)
           GROUP BY d.ToolSerial, d.DTNumber
        )
       SELECT
          b.dtNumber                                             AS TicketNo,
          b.deliveryDate                                         AS DateOut,
          b.itemNo                                               AS Item,
          COALESCE(NULLIF(i.AssetNo, ''), b.serial)              AS PartNo,
          b.serial                                               AS Serial,
          COALESCE(NULLIF(b.toolDescription, ''), i.ShortDesc)   AS Description,
          i.[Size]                                               AS [Size],
          b.qty                                                  AS Qty,
          r.rtNumber                                             AS RgtNo,
          r.receivingDate                                        AS DateIn,
          r.usedStatus                                           AS Comments,
          r.condition                                            AS Condition,
          -- Show the actual sub-contractor name, not a generic label.
          CASE WHEN i.IsEmdad = 1 THEN 'EMDAD'
               ELSE COALESCE(NULLIF(i.Ownership, ''), NULLIF(i.Supplier, '')) END AS Supplier,
          b.jobNumber                                            AS JobID,
          b.rig                                                  AS Rig,
          b.well                                                 AS Well,
          b.poNumber                                             AS PONumber,
          COALESCE(u.OpsDays, 0)                                 AS OpsDays,
          COALESCE(u.StandbyDays, 0)                             AS StandbyDays,
          COALESCE(u.OpsAmount, 0)                               AS OpsAmount,
          COALESCE(u.StandbyAmount, 0)                           AS StandbyAmount,
          COALESCE(u.OpsAmount, 0) + COALESCE(u.StandbyAmount, 0) AS TotalAmount
        FROM base b
        OUTER APPLY (
          -- Resolved by SystemID, else AssetNo, else OEMSerial (UNION ALL
          -- branches so each can seek its own index).
          SELECT TOP 1 iu.AssetNo, iu.ShortDesc, iu.[Size], iu.IsEmdad,
                       iu.Supplier, iu.Ownership
          FROM (
            SELECT 0 AS pref, a.AssetNo, a.ShortDesc, a.[Size], a.IsEmdad, a.Supplier, a.Ownership
              FROM tbl_Inventory a WHERE a.SystemID = b.serial
            UNION ALL
            SELECT 1, c1.AssetNo, c1.ShortDesc, c1.[Size], c1.IsEmdad, c1.Supplier, c1.Ownership
              FROM tbl_Inventory c1 WHERE c1.AssetNo = b.serial AND NULLIF(c1.AssetNo, '') IS NOT NULL
            UNION ALL
            SELECT 2, c2.AssetNo, c2.ShortDesc, c2.[Size], c2.IsEmdad, c2.Supplier, c2.Ownership
              FROM tbl_Inventory c2 WHERE c2.OEMSerial = b.serial AND NULLIF(c2.OEMSerial, '') IS NOT NULL
          ) iu
          ORDER BY iu.pref
        ) i
        LEFT JOIN rtj r ON r.serial = b.serial AND r.jobNumber = b.jobNumber
        LEFT JOIN ul  u ON u.ToolSerial = b.serial AND u.DTNumber = b.dtNumber
        ORDER BY b.deliveryDate DESC, b.dtNumber DESC, b.itemNo`,
      params
    )
    return jsonResponse(context, 200, result.recordset)
  } catch (err) {
    context.log.error('Tool history error:', err)
    return jsonResponse(context, 500, { error: 'Failed to load tool history', detail: err.message })
  }
})
