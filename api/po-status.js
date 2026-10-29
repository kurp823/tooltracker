'use strict'
const { sql, query } = require('./db')

/**
 * A purchase order's status follows from its lines rather than being typed.
 *
 * Only the three receiving states are derived. Pending Issue, Closed and
 * Cancelled are decisions a person makes, and recomputing would override
 * them — a cancelled PO that happens to have everything received should
 * stay cancelled.
 *
 * Shared by the PO and GRN endpoints, because receiving is what moves the
 * status and that happens on the GRN side.
 */
async function refreshStatus (poNumber) {
  const r = await query(
    `SELECT COUNT(*) AS lines_,
            SUM(CASE WHEN rec.got >= l.qty THEN 1 ELSE 0 END) AS full_,
            SUM(CASE WHEN rec.got > 0      THEN 1 ELSE 0 END) AS any_
       FROM tbl_PurchaseOrderLines l
       CROSS APPLY (SELECT COALESCE((SELECT SUM(g.qtyReceived)
                                       FROM tbl_GoodsReceiptLines g
                                      WHERE g.poLineId = l.id), 0) AS got) rec
      WHERE l.poNumber = @po`,
    [{ name: 'po', type: sql.NVarChar, value: poNumber }]
  )
  const row = r.recordset[0] || {}
  if (!row.lines_) return null

  const next = row.full_ === row.lines_ ? 'Received'
             : row.any_  > 0            ? 'Part Received'
             : null
  if (!next) return null

  await query(
    `UPDATE tbl_PurchaseOrders
        SET status = @s, updatedAt = GETDATE()
      WHERE poNumber = @po
        AND status NOT IN ('Closed','Cancelled')`,
    [{ name: 'po', type: sql.NVarChar, value: poNumber },
     { name: 's',  type: sql.NVarChar, value: next }]
  )
  return next
}

module.exports = { refreshStatus }
