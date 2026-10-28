'use strict'
const { query, jsonResponse, requireAuth } = require('../db')
const R = require('../rates')

/**
 * GET  /api/utilization?year=YYYY&month=MM[&jobId=Job-XXX-NNNNN]
 *   Returns { rows: [ { label, jobId, toolId, dtNumber, days: {...},
 *                       rate: {...} } ] }
 *   StatusType: '1' = Operations, 'S' = Standby
 *
 * GET  /api/utilization/options?jobId=&toolSerial=
 *   The rate rows this tool's contract holds for its category, for the
 *   billing Edit box.
 *
 * POST /api/utilization
 *   Body: { JobID, DTNumber?, ToolID (serial text), LogDate, UtilizationCode }
 *
 * PUT  /api/utilization/:id
 *   Body: { UtilizationCode }                 - change the day's status
 *     or: { RateCharged, RateNote? }          - billing override, locks the rate
 *     or: { ResetRate: true }                 - drop an override, back to contract
 *
 * DELETE /api/utilization/:id
 *
 * Real tbl_DailyFieldLogs columns:
 *   LogID, JobID, DTNumber, ToolSerial, LogDate, StatusType, RateCharged,
 *   CreatedDate, RateSource, RateOriginal, RateEditedBy, RateEditedAt, RateNote
 * (No ToolID/UtilizationCode/PersonnelID columns - those don't exist.
 * ToolSerial is free text holding the tool's SystemID, not a numeric FK.)
 *
 * ── Why rates are written here ──────────────────────────────────────────
 * Nothing in the app used to resolve a rate. RateCharged was read by
 * /api/tool-history for the operating and standby revenue totals but was
 * never written, so those totals were always zero. A day is priced at the
 * moment it is marked, from the contract the job belongs to.
 *
 * A rate set by billing (RateSource 'Edited') is never recalculated. That
 * covers the cases no rate table can hold - redress charged per inch, for
 * instance - and it is why changing a day's status does not silently undo
 * someone's correction.
 */

const EDITORS = ['Admin', 'Operations', 'Finance', 'Billing']

/**
 * Everything needed to price one logged day: the job's contract, the tool's
 * category and size, and the hole section in force - the ticket line's if it
 * carries one, otherwise the ticket's, otherwise the job's.
 */
async function contextFor (jobId, toolSerial, dtNumber) {
  const r = await query(
    `SELECT TOP 1
            j.Contract                                   AS Contract,
            j.HoleSection                                AS JobHole,
            i.ShortDesc                                  AS Category,
            i.Size                                       AS Size,
            dl.holeSection                               AS LineHole,
            d.holeSection                                AS TicketHole
       FROM tbl_Jobs j
       LEFT JOIN tbl_Inventory i
              ON i.SystemID = @tool
       LEFT JOIN tbl_DeliveryTickets d
              ON d.dtNumber = @dt
       LEFT JOIN tbl_DeliveryTicketLines dl
              ON dl.dtNumber = @dt AND dl.serial = @tool
      WHERE j.JobID = @job`,
    [
      { name: 'job',  value: jobId },
      { name: 'tool', value: toolSerial == null ? null : String(toolSerial) },
      { name: 'dt',   value: dtNumber || null },
    ]
  )
  const x = r.recordset[0]
  if (!x) return null
  return {
    contract:    x.Contract,
    category:    x.Category,
    size:        x.Size,
    holeSection: x.LineHole || x.TicketHole || x.JobHole || null,
  }
}

/** Rates for a contract, fetched at most once per request. */
function rateLoader () {
  const cache = new Map()
  return async (contractCode) => {
    const key = R.norm(contractCode)
    if (!cache.has(key)) cache.set(key, await R.loadContractRates(contractCode))
    return cache.get(key)
  }
}

/**
 * Price one day. Returns { rate, source, reason } where rate may be null -
 * a line we cannot price is left unpriced and says why, rather than being
 * given a zero that would bill as free.
 */
async function priceDay (load, ctx, statusType) {
  if (!ctx)            return { rate: null, source: null, reason: 'job-not-found' }
  if (!ctx.contract)   return { rate: null, source: null, reason: 'job-has-no-contract' }
  const rates = await load(ctx.contract)
  if (!rates.length)   return { rate: null, source: null, reason: 'contract-has-no-rates' }

  const hit = R.pickRate(rates, ctx)
  if (!hit.rate)       return { rate: null, source: null, reason: hit.matchedOn }

  const day = R.dayRate(hit.rate, statusType)
  if (day == null)     return { rate: null, source: null, reason: 'no-rate-for-this-status' }

  return { rate: day, source: 'Contract', reason: hit.matchedOn }
}

module.exports = async function (context, req) {
  const user = requireAuth(context, req)
  if (!user) return

  const id     = context.bindingData.id
  const method = req.method.toUpperCase()
  const qs     = req.query || {}
  const load   = rateLoader()

  // ── GET rate options for the Edit box ────────────────────────────────────
  if (id === 'options' && method === 'GET') {
    const ctx = await contextFor(qs.jobId, qs.toolSerial, qs.dtNumber)
    if (!ctx) return jsonResponse(context, 404, { error: 'Job not found' })

    const rates = ctx.contract ? await load(ctx.contract) : []
    const hit   = rates.length ? R.pickRate(rates, ctx)
                               : { rate: null, matchedOn: 'contract-has-no-rates' }

    return jsonResponse(context, 200, {
      contract:     ctx.contract,
      category:     ctx.category,
      size:         ctx.size,
      holeSection:  ctx.holeSection,
      matchedOn:    hit.matchedOn,
      // every rate this contract holds for the category, so billing picks
      // rather than reading figures off a PDF
      options:      rates.length ? R.listRateOptions(rates, ctx.category) : [],
      // hole sections the contract prices by, empty when it does not
      holeSections: rates.length ? R.listHoleSections(rates) : [],
      // the contract's redress figure, shown beside the blank box as a
      // reference - never applied automatically
      redress:      hit.rate && hit.rate.Redress != null ? Number(hit.rate.Redress) : null,
      redressNote:  hit.rate ? (hit.rate.Notes || null) : null,
    })
  }

  // ── GET calendar data ────────────────────────────────────────────────────
  if (!id && method === 'GET') {
    const year  = parseInt(qs.year  || new Date().getFullYear(), 10)
    const month = parseInt(qs.month || (new Date().getMonth() + 1), 10)
    const jobId = qs.jobId || null

    const result = await query(
      `SELECT d.LogID, d.JobID, d.ToolSerial, d.DTNumber,
              d.LogDate, d.StatusType, d.RateCharged, d.RateSource,
              d.RateEditedBy, d.RateEditedAt, d.RateNote,
              i.AssetNo   AS AssetNo,
              i.ShortDesc AS ToolDescription
         FROM tbl_DailyFieldLogs d
         LEFT JOIN tbl_Inventory i
                ON i.SystemID = d.ToolSerial
        WHERE YEAR(d.LogDate)  = @year
          AND MONTH(d.LogDate) = @month
          AND (@jobId IS NULL OR d.JobID = @jobId)
          AND d.StatusType IN ('1','S')
        ORDER BY d.JobID,
                 COALESCE(d.ToolSerial, i.AssetNo, ''),
                 d.LogDate`,
      [
        { name: 'year',  value: year  },
        { name: 'month', value: month },
        { name: 'jobId', value: jobId },
      ]
    )

    // Grouped per DISPATCH CYCLE - (JobID + DTNumber + ToolSerial) - not per
    // tool. The same tool can go out, come back and go out again on one job,
    // and those are separate charge periods; collapsing them into one row made
    // the second run look like a continuation of the first.
    const rowMap = new Map()
    for (const r of result.recordset) {
      const key = `${r.JobID}|${r.DTNumber ?? ''}|${r.ToolSerial ?? 'null'}`

      const serial = r.ToolSerial || r.AssetNo || ''
      const desc   = r.ToolDescription || ''
      const label  = [serial, desc].filter(Boolean).join(' – ')
                  || (r.ToolSerial ? `Tool ${r.ToolSerial}` : 'Unknown')

      const day = new Date(r.LogDate).getDate()

      if (!rowMap.has(key)) {
        rowMap.set(key, {
          label, jobId: r.JobID, toolId: r.ToolSerial,
          dtNumber: r.DTNumber || null, days: {},
          opsDays: 0, standbyDays: 0, amount: 0,
          unpriced: 0, edited: 0,
        })
      }
      const row = rowMap.get(key)
      row.days[day] = {
        code: r.StatusType, logId: r.LogID,
        rate: r.RateCharged == null ? null : Number(r.RateCharged),
        source: r.RateSource || null,
      }

      if (r.StatusType === '1') row.opsDays++
      else                      row.standbyDays++

      if (r.RateCharged == null)        row.unpriced++
      else                              row.amount += Number(r.RateCharged)
      if (r.RateSource === 'Edited')    row.edited++
    }

    const rows = Array.from(rowMap.values())
    rows.forEach(r => { r.amount = Math.round(r.amount * 100) / 100 })

    return jsonResponse(context, 200, {
      rows,
      totals: {
        rows:     rows.length,
        amount:   Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
        unpriced: rows.reduce((s, r) => s + r.unpriced, 0),
        edited:   rows.reduce((s, r) => s + r.edited, 0),
      },
    })
  }

  // ── POST create log entry ────────────────────────────────────────────────
  if (!id && method === 'POST') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    const b = req.body
    if (!b.JobID || !b.LogDate || !b.UtilizationCode)
      return jsonResponse(context, 400, { error: 'JobID, LogDate, UtilizationCode required' })
    if (!['1','S'].includes(b.UtilizationCode))
      return jsonResponse(context, 400, { error: 'UtilizationCode must be "1" or "S"' })

    const tool  = b.ToolID != null ? String(b.ToolID) : null
    const ctx   = await contextFor(b.JobID, tool, b.DTNumber)
    const price = await priceDay(load, ctx, b.UtilizationCode)

    const r = await query(
      // DTNumber is written here now. It was being left NULL, and the revenue
      // rollup in /api/tool-history joins the logs on (ToolSerial, DTNumber) —
      // so every day marked through this app was invisible to the operating
      // and standby totals it is supposed to feed.
      `INSERT INTO tbl_DailyFieldLogs
         (JobID, DTNumber, ToolSerial, LogDate, StatusType,
          RateCharged, RateSource, CreatedDate)
       OUTPUT INSERTED.LogID
       VALUES (@job, @dt, @tool, @date, @code, @rate, @src, GETDATE())`,
      [
        { name: 'job',  value: b.JobID            },
        { name: 'dt',   value: b.DTNumber || null },
        { name: 'tool', value: tool               },
        { name: 'date', value: b.LogDate          },
        { name: 'code', value: b.UtilizationCode  },
        { name: 'rate', value: price.rate         },
        { name: 'src',  value: price.source       },
      ]
    )
    return jsonResponse(context, 201, {
      LogID: r.recordset[0].LogID,
      RateCharged: price.rate,
      RateSource:  price.source,
      // present when the day could not be priced, so the screen can say why
      // instead of showing a bare zero
      reason: price.rate == null ? price.reason : undefined,
    })
  }

  // ── PUT ──────────────────────────────────────────────────────────────────
  if (id && method === 'PUT') {
    const b = req.body || {}

    // ── billing override: set the rate by hand and lock it ────────────────
    if (b.RateCharged !== undefined || b.ResetRate) {
      if (!EDITORS.includes(user.Role))
        return jsonResponse(context, 403, { error: 'Forbidden' })

      const cur = await query(
        `SELECT LogID, JobID, ToolSerial, DTNumber, StatusType,
                RateCharged, RateSource, RateOriginal
           FROM tbl_DailyFieldLogs WHERE LogID = @id`,
        [{ name: 'id', value: Number(id) }]
      )
      const log = cur.recordset[0]
      if (!log) return jsonResponse(context, 404, { error: 'Not found' })

      // ResetRate drops the override and re-resolves from the contract.
      if (b.ResetRate) {
        const ctx   = await contextFor(log.JobID, log.ToolSerial, log.DTNumber)
        const price = await priceDay(load, ctx, log.StatusType)
        await query(
          `UPDATE tbl_DailyFieldLogs
              SET RateCharged = @rate, RateSource = @src, RateOriginal = NULL,
                  RateEditedBy = NULL, RateEditedAt = NULL, RateNote = NULL
            WHERE LogID = @id`,
          [
            { name: 'id',   value: Number(id)   },
            { name: 'rate', value: price.rate   },
            { name: 'src',  value: price.source },
          ]
        )
        return jsonResponse(context, 200, {
          ok: true, RateCharged: price.rate, RateSource: price.source,
          reason: price.rate == null ? price.reason : undefined,
        })
      }

      const newRate = Number(b.RateCharged)
      if (!Number.isFinite(newRate) || newRate < 0)
        return jsonResponse(context, 400, { error: 'RateCharged must be a number of 0 or more' })

      await query(
        `UPDATE tbl_DailyFieldLogs
            SET RateCharged  = @rate,
                RateSource   = 'Edited',
                -- keep the first original, so a second edit does not erase
                -- what the contract actually said
                RateOriginal = COALESCE(RateOriginal, RateCharged),
                RateEditedBy = @who,
                RateEditedAt = GETDATE(),
                RateNote     = @note
          WHERE LogID = @id`,
        [
          { name: 'id',   value: Number(id) },
          { name: 'rate', value: newRate    },
          { name: 'who',  value: user.Username || String(user.UserID || '') },
          { name: 'note', value: b.RateNote ? String(b.RateNote).slice(0, 300) : null },
        ]
      )
      return jsonResponse(context, 200, {
        ok: true, RateCharged: newRate, RateSource: 'Edited',
        RateOriginal: log.RateOriginal != null ? Number(log.RateOriginal)
                    : log.RateCharged != null ? Number(log.RateCharged) : null,
      })
    }

    // ── change the day's status ───────────────────────────────────────────
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })
    if (!['1','S'].includes(b.UtilizationCode))
      return jsonResponse(context, 400, { error: 'UtilizationCode must be "1" or "S"' })

    const cur = await query(
      `SELECT LogID, JobID, ToolSerial, DTNumber, RateSource
         FROM tbl_DailyFieldLogs WHERE LogID = @id`,
      [{ name: 'id', value: Number(id) }]
    )
    const log = cur.recordset[0]
    if (!log) return jsonResponse(context, 404, { error: 'Not found' })

    // An operating day and a standby day are priced differently, so the rate
    // is re-resolved - unless billing set it by hand, which always wins.
    if (log.RateSource === 'Edited') {
      await query(
        `UPDATE tbl_DailyFieldLogs SET StatusType = @code WHERE LogID = @id`,
        [{ name: 'id', value: Number(id) }, { name: 'code', value: b.UtilizationCode }]
      )
      return jsonResponse(context, 200, { ok: true, RateSource: 'Edited', rateKept: true })
    }

    const ctx   = await contextFor(log.JobID, log.ToolSerial, log.DTNumber)
    const price = await priceDay(load, ctx, b.UtilizationCode)

    await query(
      `UPDATE tbl_DailyFieldLogs
          SET StatusType = @code, RateCharged = @rate, RateSource = @src
        WHERE LogID = @id`,
      [
        { name: 'id',   value: Number(id)       },
        { name: 'code', value: b.UtilizationCode },
        { name: 'rate', value: price.rate       },
        { name: 'src',  value: price.source     },
      ]
    )
    return jsonResponse(context, 200, {
      ok: true, RateCharged: price.rate, RateSource: price.source,
      reason: price.rate == null ? price.reason : undefined,
    })
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (id && method === 'DELETE') {
    if (!['Admin','Operations'].includes(user.Role))
      return jsonResponse(context, 403, { error: 'Forbidden' })

    await query('DELETE FROM tbl_DailyFieldLogs WHERE LogID = @id',
      [{ name: 'id', value: Number(id) }])
    return jsonResponse(context, 200, { ok: true })
  }

  return jsonResponse(context, 405, { error: 'Method not allowed' })
}
