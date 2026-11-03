'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

// tbl_GatePass columns (after migration seed:gate-pass-columns):
//   GatePassID (varchar PK), GPNumber, Supplier, GPDate,
//   PreparedBy, AuthorizedBy, Notes,
//   Direction ('Outward'|'Inward'), Purpose, Status, LinkedGatePassID
//
// tbl_GatePassLines columns (after migration):
//   LineID, GatePassID, Serial, AssetNo, ShortDesc, Size, Qty, Condition,
//   OriginalSupplier
//
// Business rules:
//  - Outward GP: tools leave EMDAD (for Repair, Return to Supplier, or Other)
//  - Inward GP: tools come back from repair; linked to the outward GP they left on
//  - Return to Supplier: one-way out — no inward GP expected
//  - OriginalSupplier on lines is looked up from tbl_Inventory when adding a tool

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const id     = context.bindingData.id
  const sub    = context.bindingData.sub
  const subId  = context.bindingData.subId
  const method = req.method.toUpperCase()

  // ── /gate-passes/{id}/items ──────────────────────────────────────────────
  if (id && sub === 'items') {
    if (method === 'GET') {
      const result = await query(
        `SELECT gi.LineID AS ItemID, gi.GatePassID,
                gi.Serial AS SerialNumber, gi.AssetNo,
                gi.ShortDesc AS ToolDescription, gi.Size,
                gi.Qty AS Quantity, gi.Condition,
                gi.OriginalSupplier
           FROM tbl_GatePassLines gi
          WHERE gi.GatePassID = @id
          ORDER BY gi.LineID`,
        [{ name: 'id', value: id }]
      )
      return jsonResponse(context, 200, result.recordset)
    }

    if (method === 'POST') {
      if (!['Admin','Operations'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })

      const b = req.body
      // Look up the tool's registered supplier from inventory
      let origSupplier = b.OriginalSupplier || null
      if (!origSupplier && (b.Serial || b.AssetNo)) {
        const inv = await query(
          `SELECT TOP 1 Supplier FROM tbl_Inventory
            WHERE (@serial IS NOT NULL AND Serial = @serial)
               OR (@asset  IS NOT NULL AND AssetNo = @asset)`,
          [
            { name: 'serial', value: b.Serial  || null },
            { name: 'asset',  value: b.AssetNo || null },
          ]
        )
        if (inv.recordset.length) origSupplier = inv.recordset[0].Supplier
      }

      const r = await query(
        `INSERT INTO tbl_GatePassLines
           (GatePassID, Serial, AssetNo, ShortDesc, Size, Qty, Condition, OriginalSupplier)
         OUTPUT INSERTED.LineID
         VALUES (@gid, @serial, @asset, @desc, @size, @qty, @cond, @origSup)`,
        [
          { name: 'gid',     value: id },
          { name: 'serial',  value: b.Serial          || null },
          { name: 'asset',   value: b.AssetNo         || null },
          { name: 'desc',    value: b.ToolDescription || null },
          { name: 'size',    value: b.Size            || null },
          { name: 'qty',     value: b.Quantity        || 1    },
          { name: 'cond',    value: b.Condition       || null },
          { name: 'origSup', value: origSupplier              },
        ]
      )
      return jsonResponse(context, 201, { ItemID: r.recordset[0].LineID })
    }

    if (method === 'DELETE' && subId) {
      if (!['Admin','Operations'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })
      await query('DELETE FROM tbl_GatePassLines WHERE LineID = @lid',
        [{ name: 'lid', value: Number(subId) }])
      return jsonResponse(context, 200, { ok: true })
    }
  }

  // ── /gate-passes/{id}/unreturned-tools ───────────────────────────────────
  // For creating an Inward GP: returns tools on the outward GP that haven't
  // appeared on any linked inward GP yet.
  if (id && sub === 'unreturned-tools' && method === 'GET') {
    const result = await query(
      `SELECT ol.LineID AS ItemID, ol.Serial AS SerialNumber, ol.AssetNo,
              ol.ShortDesc AS ToolDescription, ol.Size, ol.Qty AS Quantity,
              ol.Condition, ol.OriginalSupplier
         FROM tbl_GatePassLines ol
        WHERE ol.GatePassID = @id
          AND NOT EXISTS (
            SELECT 1
              FROM tbl_GatePassLines il
              JOIN tbl_GatePass ig ON il.GatePassID = ig.GatePassID
             WHERE ig.LinkedGatePassID = @id
               AND ig.Direction = 'Inward'
               AND COALESCE(il.Serial, il.AssetNo) = COALESCE(ol.Serial, ol.AssetNo)
          )`,
      [{ name: 'id', value: id }]
    )
    return jsonResponse(context, 200, result.recordset)
  }

  // ── GET /gate-passes?filter=outward-open ──────────────────────────────────
  // Lists outward GPs that still have unreturned tools (for the inward GP
  // "select which outward GP" dropdown). Only Repair purpose — Return to
  // Supplier is one-way.
  if (!id && !sub && method === 'GET' && (req.query || {}).filter === 'outward-open') {
    const result = await query(
      `SELECT g.GatePassID, g.GPNumber AS GatePassNumber, g.Supplier,
              g.GPDate AS PassDate, g.Purpose,
              (SELECT COUNT(*) FROM tbl_GatePassLines WHERE GatePassID = g.GatePassID) AS TotalTools,
              unreturned.cnt AS UnreturnedTools
         FROM tbl_GatePass g
        CROSS APPLY (
          SELECT COUNT(*) AS cnt
            FROM tbl_GatePassLines ol
           WHERE ol.GatePassID = g.GatePassID
             AND NOT EXISTS (
               SELECT 1 FROM tbl_GatePassLines il
               JOIN tbl_GatePass ig ON il.GatePassID = ig.GatePassID
               WHERE ig.LinkedGatePassID = g.GatePassID
                 AND ig.Direction = 'Inward'
                 AND COALESCE(il.Serial, il.AssetNo) = COALESCE(ol.Serial, ol.AssetNo)
             )
        ) unreturned
        WHERE g.Direction = 'Outward'
          AND g.Purpose IN ('Repair', 'Other')
          AND g.Status IN ('Released', 'Draft')
          AND unreturned.cnt > 0
        ORDER BY g.GPDate DESC`,
      []
    )
    return jsonResponse(context, 200, result.recordset)
  }

  // ── GET list ─────────────────────────────────────────────────────────────
  if (!id && !sub && method === 'GET') {
    const result = await query(
      `SELECT g.GatePassID, g.GPNumber AS GatePassNumber, g.Supplier,
              g.GPDate AS PassDate, g.PreparedBy, g.AuthorizedBy, g.Notes,
              g.Direction, g.Purpose, g.Status, g.LinkedGatePassID,
              (SELECT COUNT(*) FROM tbl_GatePassLines WHERE GatePassID = g.GatePassID) AS ItemCount
         FROM tbl_GatePass g
        ORDER BY g.GPDate DESC, g.GatePassID DESC`,
      []
    )
    return jsonResponse(context, 200, result.recordset)
  }

  // ── GET single ───────────────────────────────────────────────────────────
  if (id && !sub && method === 'GET') {
    const result = await query(
      `SELECT g.GatePassID, g.GPNumber AS GatePassNumber, g.Supplier,
              g.GPDate AS PassDate, g.PreparedBy, g.AuthorizedBy, g.Notes,
              g.Direction, g.Purpose, g.Status, g.LinkedGatePassID
         FROM tbl_GatePass g WHERE g.GatePassID = @id`,
      [{ name: 'id', value: id }]
    )
    if (!result.recordset.length) return jsonResponse(context, 404, { error: 'Not found' })
    return jsonResponse(context, 200, result.recordset[0])
  }

  // ── POST create ──────────────────────────────────────────────────────────
  if (!id && !sub && method === 'POST') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    if (!b.Supplier)
      return jsonResponse(context, 400, { error: 'Supplier required' })

    const direction = b.Direction || 'Outward'
    const purpose   = b.Purpose   || null
    const status    = 'Draft'
    const linkedGP  = b.LinkedGatePassID || null

    const yr = new Date().getFullYear()
    const lastRow = await query(
      `SELECT TOP 1 GPNumber FROM tbl_GatePass
        WHERE GPNumber LIKE 'GP-${yr}-%'
        ORDER BY GPNumber DESC`, []
    )
    let seq = 1
    if (lastRow.recordset.length) {
      const parts = lastRow.recordset[0].GPNumber.split('-')
      seq = parseInt(parts[parts.length - 1], 10) + 1
    }
    const GPNumber = `GP-${yr}-${String(seq).padStart(5, '0')}`

    await query(
      `INSERT INTO tbl_GatePass
         (GatePassID, GPNumber, Supplier, GPDate, PreparedBy, AuthorizedBy, Notes,
          Direction, Purpose, Status, LinkedGatePassID)
       VALUES (@id, @num, @supplier, @date, @prepared, @authorized, @notes,
               @dir, @purpose, @status, @linkedGP)`,
      [
        { name: 'id',         value: GPNumber },
        { name: 'num',        value: GPNumber },
        { name: 'supplier',   value: b.Supplier },
        { name: 'date',       value: b.PassDate || new Date().toISOString().split('T')[0] },
        { name: 'prepared',   value: user.FullName || user.Username },
        { name: 'authorized', value: b.AuthorizedBy || null },
        { name: 'notes',      value: b.Notes || null },
        { name: 'dir',        value: direction },
        { name: 'purpose',    value: purpose },
        { name: 'status',     value: status },
        { name: 'linkedGP',   value: linkedGP },
      ]
    )
    return jsonResponse(context, 201, { GatePassID: GPNumber, GatePassNumber: GPNumber })
  }

  // ── PUT update ───────────────────────────────────────────────────────────
  if (id && !sub && method === 'PUT') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })
    const b = req.body
    await query(
      `UPDATE tbl_GatePass
          SET GPDate       = COALESCE(@date, GPDate),
              AuthorizedBy = COALESCE(@authorized, AuthorizedBy),
              Notes        = COALESCE(@notes, Notes),
              Status       = COALESCE(@status, Status),
              Purpose      = COALESCE(@purpose, Purpose)
        WHERE GatePassID = @id`,
      [
        { name: 'id',         value: id },
        { name: 'date',       value: b.PassDate      || null },
        { name: 'authorized', value: b.AuthorizedBy  || null },
        { name: 'notes',      value: b.Notes         || null },
        { name: 'status',     value: b.Status        || null },
        { name: 'purpose',    value: b.Purpose       || null },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
