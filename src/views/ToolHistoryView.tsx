import React, { useCallback, useEffect, useState } from 'react'
import { Search, RefreshCw, ArrowUpRight, ArrowDownLeft, History } from 'lucide-react'
import { api } from '../utils/api'
import { Spinner } from '../components/Spinner'
import { useToast } from '../components/Toast'
import { formatDate } from '../utils/format'

/**
 * Tool Movement History
 *
 * Every time a tool leaves for a rig it appears on a Delivery Ticket line,
 * and every time it comes back it appears on a Receiving Ticket line. This
 * screen unions both into one chronological trail per tool.
 */
interface Movement {
  Direction: 'OUT' | 'IN'
  MovementDate: string | null
  TicketNumber: string
  TicketType: 'DT' | 'RT'
  JobID: string | null
  Rig: string | null
  Well: string | null
  Serial: string | null
  AssetNo: string | null
  ToolDescription: string | null
  Size: string | null
  Qty: number | null
  Condition: string | null
  UsedStatus: string | null
  Remarks: string | null
  Vehicle: string | null
  TicketStatus: string | null
}

export function ToolHistoryView() {
  const { showToast } = useToast()
  const [search,  setSearch]  = useState('')
  const [applied, setApplied] = useState('')
  const [rows,    setRows]    = useState<Movement[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (term: string) => {
    setLoading(true)
    try {
      const qs = term ? `?search=${encodeURIComponent(term)}&limit=1000` : '?limit=300'
      const data = await api.get<Movement[]>(`/tool-history${qs}`)
      setRows(data || [])
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load tool history', 'error')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load(applied) }, [applied, load])

  const outCount = rows.filter(r => r.Direction === 'OUT').length
  const inCount  = rows.filter(r => r.Direction === 'IN').length

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search asset no, serial or description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') setApplied(search.trim()) }}
          />
        </div>
        <button className="btn-primary" onClick={() => setApplied(search.trim())}>
          Search
        </button>
        <button className="btn-ghost" onClick={() => load(applied)} title="Refresh">
          <RefreshCw size={15} />
        </button>
      </div>

      {/* Summary */}
      {!loading && (
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <span className="font-medium text-gray-700">{rows.length} movements</span>
          <span className="flex items-center gap-1">
            <ArrowUpRight size={14} className="text-amber-600" /> {outCount} out
          </span>
          <span className="flex items-center gap-1">
            <ArrowDownLeft size={14} className="text-green-600" /> {inCount} returned
          </span>
          {!applied && (
            <span className="ml-auto text-xs text-gray-400">
              Showing the 300 most recent — search for a specific tool's full history
            </span>
          )}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-auto">
        {loading ? (
          <div className="p-12 flex justify-center"><Spinner size="md" /></div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <History size={28} className="mx-auto mb-2 opacity-50" />
            No movements found{applied ? ` for “${applied}”` : ''}.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="table-th">Date</th>
                <th className="table-th">Direction</th>
                <th className="table-th">Ticket</th>
                <th className="table-th">Asset No</th>
                <th className="table-th">Description</th>
                <th className="table-th">Size</th>
                <th className="table-th">Job</th>
                <th className="table-th">Rig / Well</th>
                <th className="table-th">Qty</th>
                <th className="table-th">Condition</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={`${r.TicketType}-${r.TicketNumber}-${r.Serial}-${idx}`} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="table-td whitespace-nowrap">{formatDate(r.MovementDate) || '—'}</td>
                  <td className="table-td">
                    {r.Direction === 'OUT' ? (
                      <span className="badge bg-amber-100 text-amber-700 inline-flex items-center gap-1">
                        <ArrowUpRight size={12} /> Out
                      </span>
                    ) : (
                      <span className="badge bg-green-100 text-green-700 inline-flex items-center gap-1">
                        <ArrowDownLeft size={12} /> In
                      </span>
                    )}
                  </td>
                  <td className="table-td font-mono text-xs">{r.TicketNumber}</td>
                  <td className="table-td font-mono text-xs font-medium">{r.AssetNo || '—'}</td>
                  <td className="table-td max-w-xs truncate" title={r.ToolDescription || ''}>
                    {r.ToolDescription || '—'}
                  </td>
                  <td className="table-td">{r.Size || '—'}</td>
                  <td className="table-td font-mono text-xs">{r.JobID || '—'}</td>
                  <td className="table-td text-xs">
                    {r.Rig || '—'}{r.Well ? <span className="text-gray-400"> / {r.Well}</span> : null}
                  </td>
                  <td className="table-td text-center">{r.Qty ?? '—'}</td>
                  <td className="table-td text-xs">
                    {r.Condition || r.UsedStatus || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
