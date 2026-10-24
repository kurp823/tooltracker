'use strict'
const { query, jsonResponse, requireAuth } = require('../db')

module.exports = async function (context, req) {
  const user   = requireAuth(context, req)
  if (!user) return

  const id     = context.bindingData.id
  const sub    = context.bindingData.sub
  const subId  = context.bindingData.subId
  const method = req.method.toUpperCase()

  // ── /invoices/{id}/lines ─────────────────────────────────────────────────
  if (id && sub === 'lines') {
    if (method === 'GET') {
      const rows = await query(
        `SELECT il.*, t.SerialNumber, t.AssetNo, t.Description AS ToolDescription
           FROM tbl_InvoiceLines il
           LEFT JOIN tbl_Tools t ON il.ToolID = t.ToolID
          WHERE il.InvoiceID = @id
          ORDER BY il.LineNumber`,
        [{ name: 'id', value: Number(id) }]
      )
      return jsonResponse(context, 200, rows)
    }

    if (method === 'POST') {
      if (!['Admin','Billing','Finance'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })

      const b = req.body
      const r = await query(
        `INSERT INTO tbl_InvoiceLines
           (InvoiceID, LineNumber, ToolID, Description, Quantity, UnitRate, LineAmount, Notes)
         OUTPUT INSERTED.LineID
         VALUES (@inv,
                 COALESCE((SELECT MAX(LineNumber) FROM tbl_InvoiceLines WHERE InvoiceID=@inv),0)+1,
                 @tool, @desc, @qty, @rate, @amount, @notes)`,
        [
          { name: 'inv',    value: Number(id)         },
          { name: 'tool',   value: b.ToolID || null    },
          { name: 'desc',   value: b.Description || null },
          { name: 'qty',    value: b.Quantity || 1      },
          { name: 'rate',   value: b.UnitRate || null    },
          { name: 'amount', value: b.LineAmount || null  },
          { name: 'notes',  value: b.Notes || null       },
        ]
      )

      // Recalculate TotalAmount
      await query(
        `UPDATE tbl_Invoices
            SET TotalAmount = (SELECT COALESCE(SUM(LineAmount),0) FROM tbl_InvoiceLines WHERE InvoiceID=@id)
          WHERE InvoiceID = @id`,
        [{ name: 'id', value: Number(id) }]
      )

      return jsonResponse(context, 201, { LineID: r[0].LineID })
    }

    if (method === 'DELETE' && subId) {
      if (!['Admin','Billing','Finance'].includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })
      await query('DELETE FROM tbl_InvoiceLines WHERE LineID = @lid',
        [{ name: 'lid', value: Number(subId) }])
      await query(
        `UPDATE tbl_Invoices
            SET TotalAmount = (SELECT COALESCE(SUM(LineAmount),0) FROM tbl_InvoiceLines WHERE InvoiceID=@id)
          WHERE InvoiceID = @id`,
        [{ name: 'id', value: Number(id) }]
      )
      return jsonResponse(context, 200, { ok: true })
    }
  }

  // ── GET list ─────────────────────────────────────────────────────────────
  if (!id && method === 'GET') {
    const rows = await query(
      `SELECT i.InvoiceID, i.InvoiceNumber, i.JobID, i.InvoiceDate, i.DueDate,
              i.Currency, i.TotalAmount, i.Status, i.FiscalYear, i.CreatedDate,
              c.ClientName AS Client
         FROM tbl_Invoices i
         LEFT JOIN tbl_Jobs j   ON i.JobID = j.JobID
         LEFT JOIN tbl_Clients c ON j.ClientID = c.ClientID
        ORDER BY i.InvoiceDate DESC, i.CreatedDate DESC`,
      []
    )
    return jsonResponse(context, 200, rows)
  }

  // ── GET single ───────────────────────────────────────────────────────────
  if (id && !sub && method === 'GET') {
    const rows = await query(
      `SELECT i.*, c.ClientName AS Client
         FROM tbl_Invoices i
         LEFT JOIN tbl_Jobs j   ON i.JobID = j.JobID
         LEFT JOIN tbl_Clients c ON j.ClientID = c.ClientID
        WHERE i.InvoiceID = @id`,
      [{ name: 'id', value: Number(id) }]
    )
    if (!rows.length) return jsonResponse(context, 404, { error: 'Not found' })
    return jsonResponse(context, 200, rows[0])
  }

  // ── POST create ──────────────────────────────────────────────────────────
  if (!id && method === 'POST') {
    if (!['Admin','Billing','Finance'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    if (!b.JobID) return jsonResponse(context, 400, { error: 'JobID required' })

    const yr = new Date().getFullYear()
    const lastRow = await query(
      `SELECT TOP 1 InvoiceNumber FROM tbl_Invoices
        WHERE InvoiceNumber LIKE 'INV-${yr}-%'
        ORDER BY InvoiceNumber DESC`, []
    )
    let seq = 1
    if (lastRow.length) {
      const parts = lastRow[0].InvoiceNumber.split('-')
      seq = parseInt(parts[parts.length - 1], 10) + 1
    }
    const InvoiceNumber = `INV-${yr}-${String(seq).padStart(5, '0')}`

    const r = await query(
      `INSERT INTO tbl_Invoices
         (InvoiceNumber, JobID, InvoiceDate, DueDate, Currency, FiscalYear, TotalAmount, Status, Notes, CreatedBy, CreatedDate)
       OUTPUT INSERTED.InvoiceID
       VALUES (@num, @job, @date, @due, @currency, @fy, 0, 'Draft', @notes, @by, GETDATE())`,
      [
        { name: 'num',      value: InvoiceNumber           },
        { name: 'job',      value: b.JobID                 },
        { name: 'date',     value: b.InvoiceDate || new Date().toISOString().split('T')[0] },
        { name: 'due',      value: b.DueDate || null       },
        { name: 'currency', value: b.Currency || 'USD'     },
        { name: 'fy',       value: b.FiscalYear || yr      },
        { name: 'notes',    value: b.Notes || null          },
        { name: 'by',       value: user.Username            },
      ]
    )
    return jsonResponse(context, 201, { InvoiceID: r[0].InvoiceID, InvoiceNumber })
  }

  // ── PUT update ───────────────────────────────────────────────────────────
  if (id && !sub && method === 'PUT') {
    if (!['Admin','Billing','Finance'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    await query(
      `UPDATE tbl_Invoices
          SET InvoiceDate = @date, DueDate = @due, Status = @status,
              Currency = @currency, Notes = @notes
        WHERE InvoiceID = @id`,
      [
        { name: 'id',       value: Number(id)          },
        { name: 'date',     value: b.InvoiceDate || null },
        { name: 'due',      value: b.DueDate || null    },
        { name: 'status',   value: b.Status || null     },
        { name: 'currency', value: b.Currency || null   },
        { name: 'notes',    value: b.Notes || null      },
      ]
    )
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
