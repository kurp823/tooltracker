import React, { useState, useEffect, useRef, useCallback } from 'react'
import { RefreshCw, ChevronLeft, ChevronRight, PlusCircle, X, Search, Edit2 } from 'lucide-react'
import { useRealtimeFetch } from '../hooks/useRealtimeFetch'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { api } from '../utils/api'
import { normalizeJobId } from '../utils/format'
import { Spinner, PageLoader } from '../components/Spinner'
import { ToolMultiPicker, type PickItem } from '../components/ToolMultiPicker'
import { JobPicker } from '../components/JobPicker'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Cell { code: '1' | 'S'; logId: number; rate: number | null; source: string | null }
interface UtilRow {
  label: string; jobId: string; toolId: string | number | null; dtNumber: string | null
  days: Record<number, Cell>
  opsDays: number; standbyDays: number; amount: number; unpriced: number; edited: number
}
interface RateOption { rateId: number; label: string; ops: number | null; standby: number | null; redress: number | null; currency: string | null }
interface RateOptionsData {
  contract: string | null; category: string | null; size: string | null
  holeSection: string | null; matchedOn: string
  options: RateOption[]; holeSections: string[]
  redress: number | null; redressNote: string | null
}

// ─── Rate Edit Modal ──────────────────────────────────────────────────────────
function RateEditModal({
  row, onSaved, onClose,
}: {
  row: UtilRow
  onSaved: () => void
  onClose: () => void
}) {
  const { success, error: toastErr } = useToast()
  const qp = `jobId=${encodeURIComponent(row.jobId)}&toolSerial=${encodeURIComponent(String(row.toolId ?? ''))}&dtNumber=${encodeURIComponent(row.dtNumber ?? '')}`
  const { data: optData, isLoading: optLoading } = useFetch<RateOptionsData>(`/utilization/options?${qp}`)

  const [selOption, setSelOption] = useState<RateOption | null>(null)
  const [customOps, setCustomOps] = useState('')
  const [customSby, setCustomSby] = useState('')
  const [note, setNote]           = useState('')
  const [saving, setSaving]       = useState(false)
  const [resetting, setResetting] = useState(false)

  // Pre-select the first matched option when options arrive
  useEffect(() => {
    if (optData?.options?.length && !selOption) {
      const first = optData.options[0]
      setSelOption(first)
      setCustomOps(first.ops   != null ? String(first.ops)   : '')
      setCustomSby(first.standby != null ? String(first.standby) : '')
    }
  }, [optData])

  const opsRate = parseFloat(customOps) || 0
  const sbyRate = parseFloat(customSby) || 0
  const cells   = Object.values(row.days) as Cell[]
  const opsDays = cells.filter(c => c.code === '1').length
  const sbyDays = cells.filter(c => c.code === 'S').length
  const preview = Math.round((opsDays * opsRate + sbyDays * sbyRate) * 100) / 100

  async function handleSave() {
    setSaving(true)
    try {
      await Promise.all(
        cells.map(cell =>
          api.put(`/utilization/${cell.logId}`, {
            RateCharged: cell.code === '1' ? opsRate : sbyRate,
            ...(note ? { RateNote: note } : {}),
          })
        )
      )
      success(`Rate set for ${cells.length} day${cells.length !== 1 ? 's' : ''}`)
      onSaved()
    } catch {
      toastErr('Failed to save rate override')
    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    setResetting(true)
    try {
      await Promise.all(
        cells.map(cell => api.put(`/utilization/${cell.logId}`, { ResetRate: true }))
      )
      success('Reset to contract rates')
      onSaved()
    } catch {
      toastErr('Failed to reset rates')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-semibold text-gray-800">Edit Billing Rate</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{row.label} · {row.jobId}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {optLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : (
            <>
              {/* Contract context */}
              {optData && (
                <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-xs space-y-1">
                  <div className="flex gap-4 flex-wrap">
                    <span><span className="text-gray-400">Contract</span>{' '}
                      <span className="font-medium text-gray-700">{optData.contract || '—'}</span>
                    </span>
                    <span><span className="text-gray-400">Category</span>{' '}
                      <span className="font-medium text-gray-700">{optData.category || '—'}</span>
                    </span>
                    {optData.size && (
                      <span><span className="text-gray-400">Size</span>{' '}
                        <span className="font-medium text-gray-700">{optData.size}</span>
                      </span>
                    )}
                    {optData.holeSection && (
                      <span><span className="text-gray-400">Hole</span>{' '}
                        <span className="font-medium text-gray-700">{optData.holeSection}</span>
                      </span>
                    )}
                  </div>
                  {optData.matchedOn && (
                    <div className="text-gray-400">
                      Matched: <span className="text-gray-600">{optData.matchedOn.replace(/-/g, ' ')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Contract rate options */}
              {optData?.options?.length ? (
                <div className="space-y-2">
                  <label className="label">Contract Rate Options</label>
                  <div className="space-y-1.5">
                    {optData.options.map(opt => (
                      <label
                        key={opt.rateId}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                          selOption?.rateId === opt.rateId
                            ? 'border-brand-500 bg-brand-50'
                            : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="rateOption"
                          checked={selOption?.rateId === opt.rateId}
                          onChange={() => {
                            setSelOption(opt)
                            setCustomOps(opt.ops     != null ? String(opt.ops)     : '')
                            setCustomSby(opt.standby != null ? String(opt.standby) : '')
                          }}
                          className="accent-brand-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800">{opt.label}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            Ops: <b>{opt.ops != null ? opt.ops.toFixed(2) : '—'}</b>
                            {' · '}
                            Standby: <b>{opt.standby != null ? opt.standby.toFixed(2) : '—'}</b>
                            {opt.currency ? ` ${opt.currency}` : ''}
                            {opt.redress != null ? ` · Redress: ${opt.redress}` : ''}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ) : optData ? (
                <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                  No contract rates found for this tool — enter amounts manually below.
                </div>
              ) : null}

              {/* Manual rate entry */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Ops Rate / day</label>
                  <input
                    className="input"
                    type="number" min="0" step="0.01"
                    placeholder="0.00"
                    value={customOps}
                    onChange={e => { setCustomOps(e.target.value); setSelOption(null) }}
                  />
                </div>
                <div>
                  <label className="label">Standby Rate / day</label>
                  <input
                    className="input"
                    type="number" min="0" step="0.01"
                    placeholder="0.00"
                    value={customSby}
                    onChange={e => { setCustomSby(e.target.value); setSelOption(null) }}
                  />
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="label">Note <span className="text-gray-400 font-normal">(optional)</span></label>
                <input
                  className="input"
                  placeholder="e.g. Redress per SOR clause 4.2 charged per inch"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </div>

              {/* Preview */}
              {cells.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs">
                  <div className="font-semibold text-blue-800 mb-1">Preview — {cells.length} day{cells.length !== 1 ? 's' : ''}</div>
                  <div className="text-blue-700 space-y-0.5">
                    {opsDays > 0 && (
                      <div>{opsDays} ops × {opsRate.toFixed(2)} = <b>{(opsDays * opsRate).toFixed(2)}</b></div>
                    )}
                    {sbyDays > 0 && (
                      <div>{sbyDays} standby × {sbyRate.toFixed(2)} = <b>{(sbyDays * sbyRate).toFixed(2)}</b></div>
                    )}
                    <div className="border-t border-blue-200 pt-1 font-semibold text-blue-900">
                      Total: {preview.toFixed(2)}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t bg-gray-50 rounded-b-xl">
          <button
            className="text-sm text-red-600 hover:text-red-700 hover:underline disabled:opacity-40 flex items-center gap-1"
            onClick={handleReset}
            disabled={resetting || saving || cells.length === 0}
          >
            {resetting ? <><Spinner size="sm" /> Resetting…</> : 'Reset to Contract'}
          </button>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose} disabled={saving || resetting}>Cancel</button>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={saving || resetting || cells.length === 0}
            >
              {saving
                ? <><Spinner size="sm" /> Saving…</>
                : `Apply to ${cells.length} day${cells.length !== 1 ? 's' : ''}`
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Add Tool Modal ───────────────────────────────────────────────────────────
interface Movement {
  Serial: string | null; PartNo: string | null; Description: string | null
  TicketNo: string | null; DateOut: string | null; DateIn: string | null; Size: string | null
}

/**
 * Mark a run of days for one or more of the job's tools in one go. The old
 * modal searched the whole inventory (not the job's tools), marked a single
 * day and defaulted that day to today's date (bug 31). Tools come from the
 * job's dispatch history; days go to POST /utilization/bulk per tool.
 */
function AddToolModal({
  jobId, year, month, onAdded, onClose,
}: {
  jobId: string; year: number; month: number
  onAdded: () => void
  onClose: () => void
}) {
  const { success, error: toastErr } = useToast()
  const { data: moves, isLoading } = useFetch<Movement[]>(`/tool-history?job=${encodeURIComponent(jobId)}&limit=2000`)
  const daysInMonth = new Date(year, month, 0).getDate()
  const today = new Date()
  const isThisMonth = today.getFullYear() === year && today.getMonth() + 1 === month
  const [from, setFrom] = useState(1)
  const [to, setTo]     = useState(isThisMonth ? today.getDate() : daysInMonth)
  const [code, setCode] = useState<'1' | 'S'>('1')

  const items: PickItem[] = React.useMemo(() => {
    const seen = new Set<string>()
    const out: PickItem[] = []
    for (const m of moves || []) {
      const serial = m.Serial || m.PartNo
      if (!serial) continue
      const key = `${m.TicketNo ?? ''}|${serial}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        key,
        primary: m.PartNo || serial,
        secondary: m.Description,
        tag: [m.TicketNo, m.DateOut ? m.DateOut.slice(0, 10) : null].filter(Boolean).join(' · '),
        note: m.Size,
      })
    }
    return out
  }, [moves])

  const dateOf = (d: number) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  const handleConfirm = async (picked: PickItem[]) => {
    if (from > to) { toastErr('From day must not be after To day'); return }
    let inserted = 0, skipped = 0, unpriced = 0, failed = 0
    for (const it of picked) {
      const [dt, serial] = it.key.split('|')
      try {
        const res = await api.post<{ inserted: number; skipped: number; RateCharged: number | null }>('/utilization/bulk', {
          JobID: jobId, ToolID: serial, DTNumber: dt || undefined,
          FromDate: dateOf(from), ToDate: dateOf(to), UtilizationCode: code,
        })
        inserted += res.inserted; skipped += res.skipped
        if (res.RateCharged == null && res.inserted) unpriced++
      } catch (err: any) {
        failed++
        toastErr(`${it.primary}: ${err.message || 'failed'}`)
      }
    }
    if (inserted) {
      success(`${inserted} day${inserted === 1 ? '' : 's'} marked on ${picked.length - failed} tool${picked.length - failed === 1 ? '' : 's'}` +
              (skipped ? ` · ${skipped} already marked` : '') +
              (unpriced ? ` · ${unpriced} tool${unpriced === 1 ? '' : 's'} unpriced` : ''))
    } else if (!failed) {
      toastErr('Nothing to add — those days are already marked')
    }
    onAdded()
    onClose()
  }

  const dayOpts = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  return (
    <ToolMultiPicker
      open
      title={`Mark days on ${jobId}`}
      onClose={onClose}
      onConfirm={handleConfirm}
      items={items}
      loading={isLoading}
      emptyText="No tools have been dispatched on this job yet — raise a delivery ticket first"
      confirmLabel={n => `Mark ${to - from + 1} day${to - from === 0 ? '' : 's'} on ${n || ''} tool${n === 1 ? '' : 's'}`}
    >
      <div className="flex items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5">From day
          <select className="input !py-0.5 w-auto" value={from} onChange={e => setFrom(Number(e.target.value))}>
            {dayOpts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5">To day
          <select className="input !py-0.5 w-auto" value={to} onChange={e => setTo(Number(e.target.value))}>
            {dayOpts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5">Code
          <select className="input !py-0.5 w-auto" value={code} onChange={e => setCode(e.target.value as '1' | 'S')}>
            <option value="1">1 – Operations</option>
            <option value="S">S – Standby</option>
          </select>
        </label>
        <span className="text-gray-400 ml-auto">Days already marked are left as they are</span>
      </div>
    </ToolMultiPicker>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────
export function UtilizationView() {
  const { hasRole } = useAuth()
  const { success, error: toastErr } = useToast()
  const canEdit = hasRole('Admin', 'Operations')
  const canBill = hasRole('Admin', 'Operations', 'Finance', 'Billing')

  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [jobId, setJobId] = useState('')
  const [showAddTool, setShowAddTool] = useState(false)
  const [rateEditRow, setRateEditRow] = useState<UtilRow | null>(null)
  const [repricing, setRepricing] = useState(false)

  // Local rows for optimistic updates
  const [localRows, setLocalRows] = useState<UtilRow[]>([])
  // Track which cells have in-flight API calls: "rowIdx:day"
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set())
  const pendingRef = useRef<Set<string>>(new Set())

  // Historical job numbers were saved in inconsistent formats (e.g.
  // "Job-026-01836" vs "JOB-26-01836" for the same job), so an exact
  // server-side jobId match misses rows. Always fetch the whole month and
  // filter client-side by normalized job number instead.
  const path = `/utilization?year=${year}&month=${month}`

  const { data, isLoading, error, refetch } = useRealtimeFetch<{ rows: UtilRow[] }>(path)

  // Sync from API data — skip if any cell is mid-flight to avoid stomping optimistic state
  useEffect(() => {
    if (pendingRef.current.size === 0 && data?.rows) {
      const normJobId = jobId ? normalizeJobId(jobId) : null
      setLocalRows(normJobId ? data.rows.filter(r => normalizeJobId(r.jobId) === normJobId) : data.rows)
    }
  }, [data, jobId])

  const daysInMonth = new Date(year, month, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const monthName = new Date(year, month - 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  function markPending(key: string) {
    pendingRef.current.add(key)
    setPendingCells(new Set(pendingRef.current))
  }
  function unmarkPending(key: string) {
    pendingRef.current.delete(key)
    setPendingCells(new Set(pendingRef.current))
  }

  // Optimistic cell click: cycles empty → '1' → 'S' → empty
  const handleCellClick = useCallback(async (rowIdx: number, day: number) => {
    if (!canEdit) return
    const cellKey = `${rowIdx}:${day}`
    if (pendingRef.current.has(cellKey)) return  // already in flight

    const row = localRows[rowIdx]
    if (!row) return

    const current: Cell | undefined = row.days[day]
    // Determine next state in cycle
    const nextCode: '1' | 'S' | null =
      !current      ? '1'  :
      current.code === '1' ? 'S'  : null

    // ── Optimistic update ─────────────────────────────────────────
    const prevRows = localRows
    setLocalRows(prev => {
      const updated = prev.map((r, idx) => {
        if (idx !== rowIdx) return r
        const newDays = { ...r.days }
        if (nextCode) {
          newDays[day] = { code: nextCode, logId: current?.logId ?? -1, rate: current?.rate ?? null, source: current?.source ?? null }
        } else {
          delete newDays[day]
        }
        return { ...r, days: newDays }
      })
      return updated
    })
    markPending(cellKey)

    try {
      if (!current) {
        // ── CREATE ─────────────────────────────────────────────────
        const logDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const res = await api.post<{ LogID: number }>('/utilization', {
          JobID: row.jobId,
          ToolID: row.toolId,
          LogDate: logDate,
          UtilizationCode: '1',
        })
        // Patch in the real LogID
        setLocalRows(prev => prev.map((r, idx) => {
          if (idx !== rowIdx) return r
          const cell = r.days[day]
          if (!cell || cell.code !== '1') return r
          return { ...r, days: { ...r.days, [day]: { code: '1', logId: (res as any).LogID, rate: (res as any).RateCharged ?? null, source: (res as any).RateSource ?? null } } }
        }))

      } else if (nextCode) {
        // ── UPDATE ─────────────────────────────────────────────────
        await api.put(`/utilization/${current.logId}`, { UtilizationCode: nextCode })

      } else {
        // ── DELETE ─────────────────────────────────────────────────
        await api.delete(`/utilization/${current.logId}`)
      }

    } catch {
      // ── ROLLBACK ───────────────────────────────────────────────
      setLocalRows(prevRows)
      toastErr('Failed to update — rolled back')
    } finally {
      unmarkPending(cellKey)
    }
  }, [canEdit, localRows, year, month])

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalOps = localRows.reduce((sum, row) =>
    sum + (Object.values(row.days) as Cell[]).filter(c => c.code === '1').length, 0)
  const totalStb = localRows.reduce((sum, row) =>
    sum + (Object.values(row.days) as Cell[]).filter(c => c.code === 'S').length, 0)
  const totalAmount = Math.round(localRows.reduce((sum, r) => sum + (r.amount || 0), 0) * 100) / 100
  const totalUnpriced = localRows.reduce((sum, r) => sum + (r.unpriced || 0), 0)

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Month nav */}
        <div className="flex items-center gap-1 card px-2 py-1">
          <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-medium px-2 min-w-40 text-center">{monthName}</span>
          <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Job filter: the active jobs, picked rather than typed */}
        <JobPicker value={jobId} onChange={setJobId} allLabel="All jobs this month" className="w-80"
                   inputClassName="input w-full pr-9" placeholder="All jobs this month — type to pick one" />

        <button onClick={refetch} className="btn-ghost" title="Refresh">
          <RefreshCw size={15} />
        </button>

        {/* Add Tool button */}
        {canEdit && (
          <button
            className="btn-primary flex items-center gap-1.5"
            onClick={() => {
              if (!jobId) { toastErr('Pick a job first'); return }
              setShowAddTool(true)
            }}
          >
            <PlusCircle size={15} />
            Mark Days
          </button>
        )}

        {/* Reprice: price the days that have no rate (after rates or a
            category mapping were added). Never touches priced, hand-edited
            or already-invoiced days. */}
        {canBill && jobId && totalUnpriced > 0 && (
          <button className="btn-secondary flex items-center gap-1.5" disabled={repricing}
                  title="Resolve a rate for the unpriced days on this job"
                  onClick={async () => {
                    setRepricing(true)
                    try {
                      const r = await api.post<{ considered: number; priced: number; skippedInvoiced: number;
                        stillUnpriced: { tool: string; days: number; reason: string }[] }>('/utilization/reprice',
                        { JobID: jobId, YearMonth: `${year}-${String(month).padStart(2, '0')}` })
                      if (r.priced) success(`${r.priced} day${r.priced === 1 ? '' : 's'} priced` +
                        (r.skippedInvoiced ? ` · ${r.skippedInvoiced} left alone (already invoiced)` : ''))
                      else toastErr(r.considered === 0 ? 'No unpriced days this month' :
                        `Nothing could be priced: ${r.stillUnpriced.slice(0, 3).map(x => `${x.tool} (${x.reason})`).join('; ')}`)
                      refetch()
                    } catch (e: any) { toastErr(e.message || 'Reprice failed') }
                    finally { setRepricing(false) }
                  }}>
            <RefreshCw size={14} className={repricing ? 'animate-spin' : ''} />
            Reprice {totalUnpriced} unpriced
          </button>
        )}

        {/* Legend + stats */}
        <div className="flex items-center gap-4 ml-auto text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-6 bg-blue-500 text-white rounded flex items-center justify-center font-bold text-xs">1</span>
            <span>Operations <b className="text-blue-600">{totalOps}</b></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-6 h-6 bg-amber-400 text-white rounded flex items-center justify-center font-bold text-xs">S</span>
            <span>Standby <b className="text-amber-500">{totalStb}</b></span>
          </span>
          {totalAmount > 0 && (
            <span className="flex items-center gap-1.5 text-green-700">
              <b>{totalAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}</b>
              {totalUnpriced > 0 && <span className="text-amber-500">+{totalUnpriced}?</span>}
            </span>
          )}
          {localRows.some(r => r.edited > 0) && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-orange-400 rounded-full" />
              <span className="text-orange-600">Rate edited</span>
            </span>
          )}
          {!canEdit && (
            <span className="text-gray-400 italic">View only</span>
          )}
        </div>
      </div>

      {error && <div className="card p-3 text-red-600 text-sm">{error}</div>}

      {isLoading && localRows.length === 0 ? <PageLoader /> : (
        <div className="card overflow-auto">
          <table
            className="text-xs border-collapse select-none"
            style={{ minWidth: `${200 + daysInMonth * 34}px` }}
          >
            <thead>
              <tr className="bg-gray-50">
                {/* Sticky label column */}
                <th className="text-left px-3 py-2.5 font-semibold text-gray-600 w-48 sticky left-0 z-10 bg-gray-50 border-b border-gray-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                  Tool / Personnel
                </th>
                {days.map(d => {
                  const date = new Date(year, month - 1, d)
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6
                  const isToday   = d === today.getDate()
                                 && month === today.getMonth() + 1
                                 && year === today.getFullYear()
                  return (
                    <th
                      key={d}
                      className={`text-center px-0 py-2.5 w-8 font-medium border-b border-gray-200 ${
                        isToday   ? 'bg-brand-100 text-brand-700 font-bold' :
                        isWeekend ? 'bg-gray-100 text-gray-400' : 'text-gray-500'
                      }`}
                    >
                      {d}
                    </th>
                  )
                })}
                <th className="text-center px-2 py-2.5 font-semibold text-gray-600 border-b border-gray-200 w-20">
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              {localRows.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth + 2} className="text-center text-gray-400 py-16">
                    {jobId
                      ? `No utilization data for ${monthName} on job ${jobId}`
                      : `No utilization data for ${monthName} — enter a Job ID or add tools`
                    }
                  </td>
                </tr>
              ) : (
                localRows.map((row, rowIdx) => {
                  const opsDays = (Object.values(row.days) as Cell[]).filter(c => c.code === '1').length
                  const stbDays = (Object.values(row.days) as Cell[]).filter(c => c.code === 'S').length

                  return (
                    <tr
                      key={rowIdx}
                      className={`group ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                    >
                      {/* Sticky label */}
                      <td className="px-3 py-1.5 sticky left-0 z-10 bg-inherit border-b border-gray-100 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                        <div className="font-medium text-gray-800 truncate max-w-[11rem] leading-tight">
                          {row.label}
                        </div>
                        {row.jobId && (
                          <div className="text-gray-400 font-normal text-[10px] mt-0.5">{row.jobId}</div>
                        )}
                      </td>

                      {/* Day cells */}
                      {days.map(d => {
                        const cell      = row.days[d]
                        const cellKey   = `${rowIdx}:${d}`
                        const isPending = pendingCells.has(cellKey)
                        const date      = new Date(year, month - 1, d)
                        const isWeekend = date.getDay() === 0 || date.getDay() === 6
                        const isToday   = d === today.getDate()
                                       && month === today.getMonth() + 1
                                       && year === today.getFullYear()

                        return (
                          <td
                            key={d}
                            className={`text-center px-0 py-1 border-b border-gray-100 relative ${
                              isToday   ? 'bg-brand-50/60' :
                              isWeekend ? 'bg-gray-50/80'  : ''
                            } ${canEdit ? 'cursor-pointer' : ''}`}
                            onClick={() => handleCellClick(rowIdx, d)}
                          >
                            {isPending ? (
                              /* Pending overlay */
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded opacity-60">
                                <Spinner size="sm" />
                              </span>
                            ) : cell?.code === '1' ? (
                              <span className="relative inline-flex">
                                <span
                                  className={`inline-flex items-center justify-center w-6 h-6 rounded font-bold text-xs transition-all
                                    bg-blue-500 text-white
                                    ${canEdit ? 'hover:bg-blue-400 active:scale-90' : ''}`}
                                >
                                  1
                                </span>
                                {cell.source === 'Edited' && (
                                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-orange-400 rounded-full border border-white pointer-events-none" title="Rate manually edited" />
                                )}
                              </span>
                            ) : cell?.code === 'S' ? (
                              <span className="relative inline-flex">
                                <span
                                  className={`inline-flex items-center justify-center w-6 h-6 rounded font-bold text-xs transition-all
                                    bg-amber-400 text-white
                                    ${canEdit ? 'hover:bg-amber-300 active:scale-90' : ''}`}
                                >
                                  S
                                </span>
                                {cell.source === 'Edited' && (
                                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-orange-400 rounded-full border border-white pointer-events-none" title="Rate manually edited" />
                                )}
                              </span>
                            ) : canEdit ? (
                              /* Empty + hoverable */
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded text-gray-200
                                hover:bg-gray-100 hover:text-gray-400 transition-all text-xs font-bold">
                                +
                              </span>
                            ) : null}
                          </td>
                        )
                      })}

                      {/* Row totals + rate edit */}
                      <td className="text-center px-2 py-1.5 border-b border-gray-100 font-medium min-w-[5rem]">
                        <div>
                          {opsDays > 0 && (
                            <span className="text-blue-600 font-semibold">{opsDays}</span>
                          )}
                          {opsDays > 0 && stbDays > 0 && (
                            <span className="text-gray-300 mx-0.5">/</span>
                          )}
                          {stbDays > 0 && (
                            <span className="text-amber-500 font-semibold">{stbDays}S</span>
                          )}
                        </div>
                        {row.amount > 0 ? (
                          <div className={`text-[10px] font-normal mt-0.5 ${row.edited > 0 ? 'text-orange-600' : 'text-green-700'}`}>
                            {row.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            {row.unpriced > 0 && <span className="text-amber-500 ml-0.5">+{row.unpriced}?</span>}
                          </div>
                        ) : row.unpriced > 0 ? (
                          <div className="text-[10px] text-amber-500 font-normal mt-0.5">{row.unpriced}?</div>
                        ) : null}
                        {canBill && Object.keys(row.days).length > 0 && (
                          <button
                            className="mt-0.5 p-0.5 hover:bg-gray-100 rounded text-gray-300 hover:text-brand-600 transition-colors"
                            title="Edit billing rate"
                            onClick={e => { e.stopPropagation(); setRateEditRow(row) }}
                          >
                            <Edit2 size={11} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>

            {/* Footer totals */}
            {localRows.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-3 py-2 sticky left-0 z-10 bg-gray-50 font-semibold text-gray-700 text-xs shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                    Day Totals
                  </td>
                  {days.map(d => {
                    const ops = localRows.filter(r => r.days[d]?.code === '1').length
                    const stb = localRows.filter(r => r.days[d]?.code === 'S').length
                    return (
                      <td key={d} className="text-center px-0 py-2 text-[10px] leading-tight">
                        {ops > 0 && <div className="text-blue-600 font-bold">{ops}</div>}
                        {stb > 0 && <div className="text-amber-500 font-bold">{stb}S</div>}
                      </td>
                    )
                  })}
                  <td className="text-center px-2 py-2">
                    <div className="text-blue-600 font-bold text-xs">{totalOps}</div>
                    {totalStb > 0 && (
                      <div className="text-amber-500 font-bold text-xs">{totalStb}S</div>
                    )}
                    {totalAmount > 0 && (
                      <div className="text-green-700 font-bold text-xs">
                        {totalAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </div>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Instructions for editors */}
      {canEdit && localRows.length > 0 && (
        <p className="text-xs text-gray-400 text-center">
          Click a cell to cycle: empty → <b className="text-blue-500">1</b> (Operations) →{' '}
          <b className="text-amber-500">S</b> (Standby) → empty · Changes save instantly
        </p>
      )}

      {/* Rate Edit Modal */}
      {rateEditRow && (
        <RateEditModal
          row={rateEditRow}
          onSaved={() => { refetch(); setRateEditRow(null) }}
          onClose={() => setRateEditRow(null)}
        />
      )}

      {/* Add Tool Modal */}
      {showAddTool && (
        <AddToolModal
          jobId={jobId}
          year={year}
          month={month}
          onAdded={() => refetch()}
          onClose={() => setShowAddTool(false)}
        />
      )}
    </div>
  )
}
