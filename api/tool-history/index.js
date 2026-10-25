'use strict'
const { sql, query, jsonResponse, requireAuth } = require('../db')

/**
 * GET /api/tool-history
 *   ?serial=   exact tool serial / SystemID
 *   ?search=   matches serial, asset no or description
 *   ?job=      job number
 *   ?limit=    max rows (default 500, max 5000)
 *
 * Tool movement is not kept in tbl_MovementLog (that holds a single row).
 * The real movement record is the ticket lines: a delivery-ticket line is a
 * tool going OUT to a rig, a receiving-ticket line is it coming back IN.
 * Together those are ~105k rows (47,106 DT lines + 58,392 RT lines), so this
 * unions them into one chronological per-tool history.
 *
 * Real columns (confirmed via INFORMATION_SCHEMA):
 *   tbl_DeliveryTicketLines:  id, dtNumber, itemNo, serial, toolDescription, qty, remarks
 *   tbl_DeliveryTickets:      dtNumber, jobNumber, clientCode, deliveryDate, rig, well,
 *                             vehicleVessel, status, ...
 *   tbl_ReceivingTicketLines: id, rtNumber, itemNo, serial, toolDescription, qty,
 *                             usedStatus, condition, remarks, routedTo, ...
 *   tbl_ReceivingTickets:     rtNumber, jobNumber, linkedDtNumber, clientCode,
 *                             receivingDate, rig, well, vehicleVessel, status, ...
 *
 * `serial` on the line tables holds the tool's SystemID, so it joins to
 * tbl_Inventory.SystemID to resolve the live AssetNo and description.
 */
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

  // Filters are applied inside both halves of the union. Built from fixed
  // clause strings with real parameters — never interpolated user input.
  const dtWhere = []
  const rtWhere = []
  const params  = [{ name: 'limit', type: sql.Int, value: limit }]

  if (serial) {
    dtWhere.push(`l.serial = @serial`)
    rtWhere.push(`l.serial = @serial`)
    params.push({ name: 'serial', type: sql.NVarChar, value: serial })
  }
  if (search) {
    dtWhere.push(`(l.serial LIKE @q OR l.toolDescription LIKE @q OR i.AssetNo LIKE @q OR i.ShortDesc LIKE @q)`)
    rtWhere.push(`(l.serial LIKE @q OR l.toolDescription LIKE @q OR i.AssetNo LIKE @q OR i.ShortDesc LIKE @q)`)
    params.push({ name: 'q', type: sql.NVarChar, value: `%${search}%` })
  }
  if (job) {
    dtWhere.push(`h.jobNumber = @job`)
    rtWhere.push(`h.jobNumber = @job`)
    params.push({ name: 'job', type: sql.NVarChar, value: job })
  }

  const dtClause = dtWhere.length ? `WHERE ${dtWhere.join(' AND ')}` : ''
  const rtClause = rtWhere.length ? `WHERE ${rtWhere.join(' AND ')}` : ''

  try {
    const result = await query(
      `SELECT TOP (@limit) *
         FROM (
           SELECT
             'OUT'                                             AS Direction,
             h.deliveryDate                                    AS MovementDate,
             h.dtNumber                                        AS TicketNumber,
             'DT'                                              AS TicketType,
             h.jobNumber                                       AS JobID,
             h.rig                                             AS Rig,
             h.well                                            AS Well,
             l.serial                                          AS Serial,
             COALESCE(NULLIF(i.AssetNo, ''), l.serial)         AS AssetNo,
             COALESCE(NULLIF(l.toolDescription, ''), i.ShortDesc) AS ToolDescription,
             i.Size                                            AS Size,
             l.qty                                             AS Qty,
             NULL                                              AS Condition,
             NULL                                              AS UsedStatus,
             l.remarks                                         AS Remarks,
             h.vehicleVessel                                   AS Vehicle,
             h.status                                          AS TicketStatus
           FROM      tbl_DeliveryTicketLines l
           JOIN      tbl_DeliveryTickets     h ON l.dtNumber = h.dtNumber
           LEFT JOIN tbl_Inventory           i ON i.SystemID = l.serial
           ${dtClause}

           UNION ALL

           SELECT
             'IN'                                              AS Direction,
             h.receivingDate                                   AS MovementDate,
             h.rtNumber                                        AS TicketNumber,
             'RT'                                              AS TicketType,
             h.jobNumber                                       AS JobID,
             h.rig                                             AS Rig,
             h.well                                            AS Well,
             l.serial                                          AS Serial,
             COALESCE(NULLIF(i.AssetNo, ''), l.serial)         AS AssetNo,
             COALESCE(NULLIF(l.toolDescription, ''), i.ShortDesc) AS ToolDescription,
             i.Size                                            AS Size,
             l.qty                                             AS Qty,
             l.condition                                       AS Condition,
             l.usedStatus                                      AS UsedStatus,
             l.remarks                                         AS Remarks,
             h.vehicleVessel                                   AS Vehicle,
             h.status                                          AS TicketStatus
           FROM      tbl_ReceivingTicketLines l
           JOIN      tbl_ReceivingTickets     h ON l.rtNumber = h.rtNumber
           LEFT JOIN tbl_Inventory            i ON i.SystemID = l.serial
           ${rtClause}
         ) m
        ORDER BY m.MovementDate DESC, m.TicketNumber DESC`,
      params
    )
    return jsonResponse(context, 200, result.recordset)
  } catch (err) {
    context.log.error('Tool history error:', err)
    return jsonResponse(context, 500, { error: 'Failed to load tool history', detail: err.message })
  }
}
