import React, { useState, useEffect, useRef, useCallback } from 'react'
import { RefreshCw, ChevronLeft, ChevronRight, PlusCircle, X, Search } from 'lucide-react'
import { useRealtimeFetch } from '../hooks/useRealtimeFetch'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { api } from '../utils/api'
import { normalizeJobId } from '../utils/format'
import { Spinner, PageLoader } from '../components/Spinner'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Cell { code: '1' | 'S'; logId: number }
interface UtilRow { label: string; jobId: string; toolId: string | number | null; days: Record<number, Cell> }

// ─── Add Tool Modal ───────────────────────────────────────────────────────────
interface InventoryItem { SystemID: string; Serial: string; AssetNo: string; ShortDesc: string }

function AddToolModal({
  jobId, year, month, onAdded, onClose,
}: {
  jobId: string; year: number; month: number
  onAdded: (row: UtilRow, firstLogId: number, firstDay: number) => void
  onClose: () => void
}) {
  const { success, error: toastErr } = useToast()
  const { data: invData } = useFetch<InventoryItem[]>('/inventory')
  const [search, setSearch]     = useState('')
  const [selected, setSelected] = useState<InventoryItem | null>(null)
  const [day, setDay]           = useState(new Date().getDate())
  const [code, setCode]         = useState<'1' | 'S'>('1')
  const [saving, setSaving]     = useState(false)

  const daysInMonth = new Date(year, month, 0).getDate()

  const filtered = (invData || []).filter(i => {
    const q = search.toLowerCase()
    return !q || [i.Serial, i.AssetNo, i.ShortDesc].some(v => v?.toLowerCase().includes(q))
  }).slice(0, 20)

  async function handleAdd() {
    if (!selected) return
    setSaving(true)
    try {
      const logDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const res = await api.post<{ LogID: number }>('/utilization', {
        JobID: jobId,
        ToolID: selected.SystemID,
        LogDate: logDate,
        UtilizationCode: code,
      })
      const label = [selected.Serial || selected.AssetNo, selected.ShortDesc]
        .filter(Boolean).join(' – ') || selected.AssetNo || 'Unknown Tool'
      const newRow: UtilRow = {
        label,
        jobId,
        toolId: selected.SystemID,
        days: { [day]: { code, logId: (res as any).LogID } },
      }
      onAdded(newRow, res.LogID, day)
      success('Tool added to grid')
      onClose()
    } catch {
      toastErr('Failed to add tool')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-800">Add Tool to Grid</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Search inventory */}
          <div>
            <label className="label">Search Inventory</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="input pl-8"
                placeholder="Serial, asset no, description…"
                value={search}
                onChange={e => { setSearch(e.target.value); setSelected(null) }}
                autoFocus
              />
            </div>

            {search && !selected && (
              <div className="mt-1 border rounded-lg shadow-sm max-h-44 overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-gray-400 text-center">No results</div>
                ) : filtered.map(item => (
                  <button
                    key={item.SystemID}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0 text-sm"
                    onClick={() => { setSelected(item); setSearch(item.Serial || item.AssetNo || item.ShortDesc || '') }}
                  >
                    <div className="font-medium text-gray-800">{item.Serial || item.AssetNo}</div>
                    <div className="text-gray-500 text-xs">{item.ShortDesc}</div>
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <div className="mt-1 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
                <div className="font-medium text-green-800">{selected.Serial || selected.AssetNo}</div>
                <div className="text-green-600 text-xs">{selected.ShortDesc} — {selected.AssetNo}</div>
              </div>
            )}
          </div>

          {/* Day + code */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Starting Day</label>
              <select
                className="input"
                value={day}
                onChange={e => setDay(Number(e.target.value))}
              >
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => (
                  <option key={d} value={d}>Day {d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Initial Code</label>
              <select className="input" value={code} onChange={e => setCode(e.target.value as '1' | 'S')}>
                <option value="1">1 – Operations</option>
                <option value="S">S – Standby</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={handleAdd}
            disabled={!selected || !jobId || saving}
          >
            {saving ? <><Spinner size="sm" /> Adding…</> : 'Add to Grid'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────
export function UtilizationView() {
  const { hasRole } = useAuth()
  const { success, error: toastErr } = useToast()
  const canEdit = hasRole('Admin', 'Operations')

  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [jobId, setJobId] = useState('')
  const [showAddTool, setShowAddTool] = useState(false)

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
          newDays[day] = { code: nextCode, logId: current?.logId ?? -1 }
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
          return { ...r, days: { ...r.days, [day]: { code: '1', logId: (res as any).LogID } } }
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

  // When "Add Tool" modal adds a new row (already created in DB)
  function handleToolAdded(newRow: UtilRow) {
    setLocalRows(prev => {
      // Replace if same toolId + jobId already exists, else append
      const exists = prev.findIndex(r => r.toolId === newRow.toolId && r.jobId === newRow.jobId)
      if (exists >= 0) {
        const updated = [...prev]
        updated[exists] = { ...prev[exists], days: { ...prev[exists].days, ...newRow.days } }
        return updated
      }
      return [...prev, newRow]
    })
  }

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalOps = localRows.reduce((sum, row) =>
    sum + (Object.values(row.days) as Cell[]).filter(c => c.code === '1').length, 0)
  const totalStb = localRows.reduce((sum, row) =>
    sum + (Object.values(row.days) as Cell[]).filter(c => c.code === 'S').length, 0)

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

        {/* Job filter */}
        <input
          className="input w-52"
          placeholder="Filter by Job ID…"
          value={jobId}
          onChange={e => setJobId(e.target.value)}
        />

        <button onClick={refetch} className="btn-ghost" title="Refresh">
          <RefreshCw size={15} />
        </button>

        {/* Add Tool button */}
        {canEdit && (
          <button
            className="btn-primary flex items-center gap-1.5"
            onClick={() => {
              if (!jobId) { toastErr('Enter a Job ID first'); return }
              setShowAddTool(true)
            }}
          >
            <PlusCircle size={15} />
            Add Tool
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
                              <span
                                className={`inline-flex items-center justify-center w-6 h-6 rounded font-bold text-xs transition-all
                                  bg-blue-500 text-white
                                  ${canEdit ? 'hover:bg-blue-400 active:scale-90' : ''}`}
                              >
                                1
                              </span>
                            ) : cell?.code === 'S' ? (
                              <span
                                className={`inline-flex items-center justify-center w-6 h-6 rounded font-bold text-xs transition-all
                                  bg-amber-400 text-white
                                  ${canEdit ? 'hover:bg-amber-300 active:scale-90' : ''}`}
                              >
                                S
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

                      {/* Row totals */}
                      <td className="text-center px-2 py-1.5 border-b border-gray-100 font-medium min-w-[4rem]">
                        {opsDays > 0 && (
                          <span className="text-blue-600 font-semibold">{opsDays}</span>
                        )}
                        {opsDays > 0 && stbDays > 0 && (
                          <span className="text-gray-300 mx-0.5">/</span>
                        )}
                        {stbDays > 0 && (
                          <span className="text-amber-500 font-semibold">{stbDays}S</span>
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

      {/* Add Tool Modal */}
      {showAddTool && (
        <AddToolModal
          jobId={jobId}
          year={year}
          month={month}
          onAdded={(newRow) => handleToolAdded(newRow)}
          onClose={() => setShowAddTool(false)}
        />
      )}
    </div>
  )
}
