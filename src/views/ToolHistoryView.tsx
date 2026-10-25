import React, { useCallback, useEffect, useState } from 'react'
import { Search, RefreshCw, History } from 'lucide-react'
import { api } from '../utils/api'
import { Spinner } from '../components/Spinner'
import { useToast } from '../components/Toast'
import { formatDate } from '../utils/format'
import type { ToolMovement } from '../types'

/**
 * Tool Movement History — laid out like the printed "Tools List" report:
 * one row per dispatched tool, pairing the delivery ticket (out) with the
 * receiving ticket that brought it back (in), plus operating/standby days
 * and the money charged against each line.
 */
export function ToolHistoryView() {
  const { showToast } = useToast()
  const [search,  setSearch]  = useState('')
  const [job,     setJob]     = useState('')
  const [applied, setApplied] = useState<{ search: string; job: string }>({ search: '', job: '' })
  const [rows,    setRows]    = useState<ToolMovement[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (f: { search: string; job: string }) => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (f.job)    p.set('job', f.job)
      if (f.search) p.set('search', f.search)
      p.set('limit', f.job || f.search ? '2000' : '300')
      setRows((await api.get<ToolMovement[]>(`/tool-history?${p.toString()}`)) || [])
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load tool history', 'error')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load(applied) }, [applied, load])

  function apply() {
    setApplied({ search: search.trim(), job: job.trim() })
  }

  const num = (v: number | null | undefined) => Number(v ?? 0)
  const totals = rows.reduce(
    (a, r) => ({
      ops:     a.ops     + num(r.OpsDays),
      standby: a.standby + num(r.StandbyDays),
      opsAmt:  a.opsAmt  + num(r.OpsAmount),
      sbAmt:   a.sbAmt   + num(r.StandbyAmount),
      total:   a.total   + num(r.TotalAmount),
    }),
    { ops: 0, standby: 0, opsAmt: 0, sbAmt: 0, total: 0 }
  )
  const money = (v: number) =>
    v ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-56">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Asset no, serial or description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') apply() }}
          />
        </div>
        <input
          className="input w-56"
          placeholder="Job No (e.g. JOB-26-01834)"
          value={job}
          onChange={e => setJob(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') apply() }}
        />
        <button className="btn-primary" onClick={apply}>Search</button>
        <button className="btn-ghost" onClick={() => load(applied)} title="Refresh">
          <RefreshCw size={15} />
        </button>
      </div>

      {!loading && rows.length > 0 && (
        <div className="flex items-center gap-5 text-sm flex-wrap">
          <span className="font-medium text-gray-700">{rows.length} tool lines</span>
          <span className="text-gray-500">Operating: <b className="text-gray-800">{totals.ops}</b> d</span>
          <span className="text-gray-500">Standby: <b className="text-gray-800">{totals.standby}</b> d</span>
          <span className="text-gray-500">Operating value: <b className="text-gray-800">{money(totals.opsAmt)}</b></span>
          <span className="text-gray-500">Standby value: <b className="text-gray-800">{money(totals.sbAmt)}</b></span>
          <span className="ml-auto text-base font-semibold text-brand-800">Total {money(totals.total)}</span>
        </div>
      )}

      {!loading && !applied.job && !applied.search && (
        <p className="text-xs text-gray-400">
          Showing the 300 most recent lines — search a tool or enter a Job No for a full list.
        </p>
      )}

      {/* Report table */}
      <div className="card overflow-auto">
        {loading ? (
          <div className="p-12 flex justify-center"><Spinner size="md" /></div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <History size={28} className="mx-auto mb-2 opacity-50" />
            No tool movements found.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-600">
                <th className="table-th">Ticket No</th>
                <th className="table-th">Date Out</th>
                <th className="table-th">Item</th>
                <th className="table-th">Part No</th>
                <th className="table-th">Description</th>
                <th className="table-th">Size</th>
                <th className="table-th">RGT No</th>
                <th className="table-th">Date In</th>
                <th className="table-th">Comments</th>
                <th className="table-th">Supplier</th>
                <th className="table-th text-right">Ops d</th>
                <th className="table-th text-right">SB d</th>
                <th className="table-th text-right">Ops Value</th>
                <th className="table-th text-right">SB Value</th>
                <th className="table-th text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.TicketNo}-${r.Serial}-${r.Item}-${i}`} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="table-td font-mono">{r.TicketNo}</td>
                  <td className="table-td whitespace-nowrap">{formatDate(r.DateOut) || '—'}</td>
                  <td className="table-td text-center">{r.Item ?? '—'}</td>
                  <td className="table-td font-mono font-medium">{r.PartNo || '—'}</td>
                  <td className="table-td max-w-sm truncate" title={r.Description || ''}>{r.Description || '—'}</td>
                  <td className="table-td">{r.Size || '—'}</td>
                  <td className="table-td font-mono">{r.RgtNo || '—'}</td>
                  <td className="table-td whitespace-nowrap">{formatDate(r.DateIn) || '—'}</td>
                  <td className="table-td">
                    {r.Comments
                      ? <span className={`badge ${/^not/i.test(r.Comments) ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}`}>{r.Comments}</span>
                      : '—'}
                  </td>
                  <td className="table-td">{r.Supplier || '—'}</td>
                  <td className="table-td text-right">{num(r.OpsDays) || '—'}</td>
                  <td className="table-td text-right">{num(r.StandbyDays) || '—'}</td>
                  <td className="table-td text-right">{money(num(r.OpsAmount))}</td>
                  <td className="table-td text-right">{money(num(r.StandbyAmount))}</td>
                  <td className="table-td text-right font-semibold">{money(num(r.TotalAmount))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                <td className="table-td" colSpan={10}>Totals — {rows.length} lines</td>
                <td className="table-td text-right">{totals.ops || '—'}</td>
                <td className="table-td text-right">{totals.standby || '—'}</td>
                <td className="table-td text-right">{money(totals.opsAmt)}</td>
                <td className="table-td text-right">{money(totals.sbAmt)}</td>
                <td className="table-td text-right text-brand-800">{money(totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
