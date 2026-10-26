'use strict'
const { sql, query, jsonResponse, requireAuth } = require('../db')

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

module.exports = async function (context, req) {
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
    where.push(`(dtl.serial LIKE @q OR dtl.toolDescription LIKE @q OR i.AssetNo LIKE @q OR i.ShortDesc LIKE @q)`)
    params.push({ name: 'q', type: sql.NVarChar, value: `%${search}%` })
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  try {
    const result = await query(
      `SELECT TOP (@limit)
          dt.dtNumber                                            AS TicketNo,
          dt.deliveryDate                                        AS DateOut,
          dtl.itemNo                                             AS Item,
          COALESCE(NULLIF(i.AssetNo, ''), dtl.serial)            AS PartNo,
          dtl.serial                                             AS Serial,
          COALESCE(NULLIF(dtl.toolDescription, ''), i.ShortDesc) AS Description,
          i.[Size]                                               AS [Size],
          dtl.qty                                                AS Qty,
          r.rtNumber                                             AS RgtNo,
          r.receivingDate                                        AS DateIn,
          r.usedStatus                                           AS Comments,
          r.condition                                            AS Condition,
          -- Show the actual sub-contractor name, not a generic label.
          -- Ownership is the reliable field here (only 1 blank across 269
          -- sub-contract tools); Supplier has 41 blanks and wrongly reads
          -- 'EMDAD' on 10 of them.
          CASE WHEN i.IsEmdad = 1 THEN 'EMDAD'
               ELSE COALESCE(NULLIF(i.Ownership, ''), NULLIF(i.Supplier, '')) END AS Supplier,
          dt.jobNumber                                           AS JobID,
          dt.rig                                                 AS Rig,
          dt.well                                                AS Well,
          dt.poNumber                                            AS PONumber,
          COALESCE(u.OpsDays, 0)                                 AS OpsDays,
          COALESCE(u.StandbyDays, 0)                             AS StandbyDays,
          COALESCE(u.OpsAmount, 0)                               AS OpsAmount,
          COALESCE(u.StandbyAmount, 0)                           AS StandbyAmount,
          COALESCE(u.OpsAmount, 0) + COALESCE(u.StandbyAmount, 0) AS TotalAmount
        FROM      tbl_DeliveryTicketLines dtl
        JOIN      tbl_DeliveryTickets     dt ON dtl.dtNumber = dt.dtNumber
        OUTER APPLY (
          -- Resolved by SystemID, else AssetNo, else OEMSerial. Written as
          -- separate UNION ALL branches rather than an OR so each branch can
          -- seek its own index; the OR form scanned tbl_Inventory per line.
          SELECT TOP 1 u.AssetNo, u.ShortDesc, u.[Size], u.IsEmdad,
                       u.Supplier, u.Ownership
          FROM (
            SELECT 0 AS pref, a.AssetNo, a.ShortDesc, a.[Size], a.IsEmdad, a.Supplier, a.Ownership
              FROM tbl_Inventory a WHERE a.SystemID = dtl.serial
            UNION ALL
            SELECT 1, b.AssetNo, b.ShortDesc, b.[Size], b.IsEmdad, b.Supplier, b.Ownership
              FROM tbl_Inventory b WHERE b.AssetNo = dtl.serial AND NULLIF(b.AssetNo, '') IS NOT NULL
            UNION ALL
            SELECT 2, c.AssetNo, c.ShortDesc, c.[Size], c.IsEmdad, c.Supplier, c.Ownership
              FROM tbl_Inventory c WHERE c.OEMSerial = dtl.serial AND NULLIF(c.OEMSerial, '') IS NOT NULL
          ) u
          ORDER BY u.pref
        ) i
        OUTER APPLY (
          -- The receiving ticket that brought this same tool back on this job.
          SELECT TOP 1 rth.rtNumber, rth.receivingDate, rtl.usedStatus, rtl.condition
          FROM      tbl_ReceivingTicketLines rtl
          JOIN      tbl_ReceivingTickets     rth ON rtl.rtNumber = rth.rtNumber
          WHERE     rtl.serial     = dtl.serial
            AND     rth.jobNumber  = dt.jobNumber
          ORDER BY  rth.receivingDate DESC
        ) r
        OUTER APPLY (
          -- Operating / standby days and money, from the daily field logs.
          SELECT
            SUM(CASE WHEN d.StatusType = '1' THEN 1 ELSE 0 END) AS OpsDays,
            SUM(CASE WHEN d.StatusType = 'S' THEN 1 ELSE 0 END) AS StandbyDays,
            SUM(CASE WHEN d.StatusType = '1' THEN COALESCE(d.RateCharged, 0) ELSE 0 END) AS OpsAmount,
            SUM(CASE WHEN d.StatusType = 'S' THEN COALESCE(d.RateCharged, 0) ELSE 0 END) AS StandbyAmount
          FROM  tbl_DailyFieldLogs d
          WHERE d.ToolSerial = dtl.serial
            AND d.DTNumber   = dt.dtNumber
        ) u
        ${whereClause}
        ORDER BY dt.deliveryDate DESC, dt.dtNumber DESC, dtl.itemNo`,
      params
    )
    return jsonResponse(context, 200, result.recordset)
  } catch (err) {
    context.log.error('Tool history error:', err)
    return jsonResponse(context, 500, { error: 'Failed to load tool history', detail: err.message })
  }
}
