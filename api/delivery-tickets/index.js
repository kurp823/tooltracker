'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

// Real tbl_DeliveryTickets columns (confirmed via INFORMATION_SCHEMA):
//   id, dtNumber, jobNumber, clientCode, deliveryDate, rig, well, poNumber,
//   clientRef, vehicleVessel, driverName, emdadRep, emdadSignDate,
//   clientSignedBy, clientSignDate, status, notes, attachmentRef,
//   createdBy, createdAt, updatedAt, calloutRef, lockStage, lockedAt, lockedBy
// Real tbl_DeliveryTicketLines columns:
//   id, dtNumber, itemNo, serial, toolDescription, qty, remarks
// (No AssetNo/Size/UnitRate/LineAmount/Condition columns on lines — those
// fields don't exist in this schema.)
//
// `serial` is used as the join key back to tbl_Inventory.SystemID — on
// create we store the tool's SystemID there (not its human AssetNo/Serial,
// which can be edited later), and on read we resolve the *live* AssetNo via
// a join so the displayed asset number always matches Inventory. Rows whose
// `serial` doesn't match any SystemID (manual/free-text/legacy entries)
// fall back to showing the raw stored value instead of nothing.
//
// SQL columns are aliased back to the PascalCase names the frontend already
// expects, so no frontend changes are needed.

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const id    = context.bindingData.id
  const sub   = context.bindingData.sub
  const subId = context.bindingData.subId
  const method = req.method.toUpperCase()

  // ── /delivery-tickets/{id}/lines ────────────────────────────────────────
  // `id` here is the ticket's numeric id — lines are keyed by dtNumber, so
  // resolve id -> dtNumber first.
  if (id && sub === 'lines') {
    if (method === 'GET') {
      const result = await query(
        `SELECT l.id AS LineID, l.dtNumber AS DTID, l.itemNo AS LineNumber,
                l.serial AS SerialNumber, COALESCE(i.AssetNo, l.serial) AS AssetNo,
                l.toolDescription AS ToolDescription,
                l.qty AS Quantity, l.remarks AS Notes
           FROM tbl_DeliveryTicketLines l
           OUTER APPLY (
             -- `serial` on ticket lines mostly holds the ASSET NUMBER, not the
             -- SystemID (inventory: SystemID 'EMD-5794' / AssetNo 'STB578-01';
             -- line serials read 'STB578-09'). Joining on SystemID alone missed
             -- ~72%% of lines. Match any key, prefer SystemID, take one row.
             SELECT TOP 1 i2.AssetNo, i2.ShortDesc, i2.[Size], i2.IsEmdad,
                          i2.Supplier, i2.Ownership
             FROM   tbl_Inventory i2
             WHERE  i2.SystemID = l.serial
                OR  i2.AssetNo  = l.serial
                OR  NULLIF(i2.OEMSerial, '') = l.serial
             ORDER BY CASE WHEN i2.SystemID = l.serial THEN 0
                           WHEN i2.AssetNo  = l.serial THEN 1
                           ELSE 2 END
           ) i
          WHERE l.dtNumber = (SELECT dtNumber FROM tbl_DeliveryTickets WHERE id = @id)
          ORDER BY l.itemNo`,
        [{ name: 'id', value: Number(id) }]
      )
      return jsonResponse(context, 200, result.recordset)
    }

    if (method === 'POST') {
      if (!['Admin','Operations'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })
      const b = req.body
      const r = await query(
        `INSERT INTO tbl_DeliveryTicketLines (dtNumber, itemNo, serial, toolDescription, qty, remarks)
         OUTPUT INSERTED.id
         VALUES (
           (SELECT dtNumber FROM tbl_DeliveryTickets WHERE id = @id),
           COALESCE((SELECT MAX(itemNo) FROM tbl_DeliveryTicketLines WHERE dtNumber=(SELECT dtNumber FROM tbl_DeliveryTickets WHERE id = @id)),0)+1,
           @serial, @desc, @qty, @notes
         )`,
        [
          { name: 'id',       value: Number(id) },
          { name: 'serial',   value: b.SystemID || b.Serial || null },
          { name: 'desc',     value: b.ToolDescription || null },
          { name: 'qty',      value: b.Quantity         || 1   },
          { name: 'notes',    value: b.Notes            || null },
        ]
      )
      return jsonResponse(context, 201, { LineID: r.recordset[0].id })
    }

    if (method === 'DELETE' && subId) {
      if (!['Admin','Operations'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })
      await query('DELETE FROM tbl_DeliveryTicketLines WHERE id = @lid',
        [{ name: 'lid', value: Number(subId) }])
      return jsonResponse(context, 200, { ok: true })
    }
  }

  // ── /delivery-tickets (list) ─────────────────────────────────────────────
  if (!id && method === 'GET') {
    const result = await query(
      `SELECT d.id AS DTID, d.dtNumber AS DTNumber, d.jobNumber AS JobID,
              d.deliveryDate AS DTDate, d.status AS Status,
              d.createdAt AS CreatedDate, d.createdBy AS CreatedBy,
              c.clientName AS Client,
              (SELECT COUNT(*) FROM tbl_DeliveryTicketLines WHERE dtNumber = d.dtNumber) AS LineCount
         FROM tbl_DeliveryTickets d
         LEFT JOIN tbl_Clients c ON d.clientCode = c.clientCode
        ORDER BY d.createdAt DESC`,
      []
    )
    return jsonResponse(context, 200, result.recordset)
  }

  // ── /delivery-tickets/:id (single) ───────────────────────────────────────
  if (id && !sub && method === 'GET') {
    const result = await query(
      `SELECT d.id AS DTID, d.dtNumber AS DTNumber, d.jobNumber AS JobID,
              d.deliveryDate AS DTDate, d.rig AS Rig, d.well AS Well,
              d.poNumber AS PONumber, d.clientRef AS ClientRef,
              d.vehicleVessel AS VehicleVessel, d.driverName AS DriverName,
              d.status AS Status, d.notes AS Notes,
              d.createdAt AS CreatedDate, d.createdBy AS CreatedBy,
              d.updatedAt AS UpdatedDate,
              c.clientName AS Client
         FROM tbl_DeliveryTickets d
         LEFT JOIN tbl_Clients c ON d.clientCode = c.clientCode
        WHERE d.id = @id`,
      [{ name: 'id', value: Number(id) }]
    )
    if (!result.recordset.length) return jsonResponse(context, 404, { error: 'Not found' })
    return jsonResponse(context, 200, result.recordset[0])
  }

  // ── POST /delivery-tickets (create) ─────────────────────────────────────
  if (!id && method === 'POST') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    if (!b.JobID) return jsonResponse(context, 400, { error: 'JobID required' })

    const yr = new Date().getFullYear()
    const lastRow = await query(
      `SELECT TOP 1 dtNumber FROM tbl_DeliveryTickets
        WHERE dtNumber LIKE 'DT-${yr}-%'
        ORDER BY dtNumber DESC`, []
    )
    let seq = 1
    if (lastRow.recordset.length) {
      const parts = lastRow.recordset[0].dtNumber.split('-')
      seq = parseInt(parts[parts.length - 1], 10) + 1
    }
    const DTNumber = `DT-${yr}-${String(seq).padStart(5, '0')}`

    const r = await query(
      `INSERT INTO tbl_DeliveryTickets (dtNumber, jobNumber, deliveryDate, status, notes, createdBy, createdAt)
       OUTPUT INSERTED.id
       VALUES (@num, @job, @date, 'Draft', @notes, @by, GETDATE())`,
      [
        { name: 'num',   value: DTNumber },
        { name: 'job',   value: b.JobID  },
        { name: 'date',  value: b.DTDate || new Date().toISOString().split('T')[0] },
        { name: 'notes', value: b.Notes || null },
        { name: 'by',    value: user.Username },
      ]
    )
    return jsonResponse(context, 201, { DTID: r.recordset[0].id, DTNumber })
  }

  // ── PUT /delivery-tickets/:id (update) ──────────────────────────────────
  if (id && !sub && method === 'PUT') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })
    const b = req.body
    await query(
      `UPDATE tbl_DeliveryTickets
          SET deliveryDate = @date, status = @status, notes = @notes, updatedAt = GETDATE()
        WHERE id = @id`,
      [
        { name: 'id',     value: Number(id) },
        { name: 'date',   value: b.DTDate   || null },
        { name: 'status', value: b.Status   || null },
        { name: 'notes',  value: b.Notes    || null },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
