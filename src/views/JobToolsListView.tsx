import React, { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Printer, Search, FileText } from 'lucide-react'
import { api } from '../utils/api'
import { Spinner } from '../components/Spinner'
import { useToast } from '../components/Toast'
import { formatDate } from '../utils/format'
import type { ToolMovement } from '../types'

/**
 * JOB — Tools List
 *
 * The printed EMDAD report: a job header block, then one row per dispatched
 * tool pairing the delivery ticket (out) with the receiving ticket (in),
 * extended with operating/standby days and value per line.
 */
export function JobToolsListView() {
  const { showToast } = useToast()
  const [params, setParams] = useSearchParams()
  const jobParam = params.get('job') || ''

  const [job,     setJob]     = useState(jobParam)
  const [rows,    setRows]    = useState<ToolMovement[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded,  setLoaded]  = useState(false)

  const load = useCallback(async (jobNo: string) => {
    if (!jobNo) { setRows([]); setLoaded(false); return }
    setLoading(true)
    try {
      setRows((await api.get<ToolMovement[]>(`/tool-history?job=${encodeURIComponent(jobNo)}&limit=5000`)) || [])
      setLoaded(true)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load tools list', 'error')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => { load(jobParam) }, [jobParam, load])

  function apply() {
    const v = job.trim()
    setParams(v ? { job: v } : {})
  }

  const num = (v: number | null | undefined) => Number(v ?? 0)
  const money = (v: number) =>
    v ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

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

  const head = rows[0]

  return (
    <div className="space-y-4">
      {/* Controls — hidden when printing */}
      <div className="flex items-center gap-3 flex-wrap print:hidden">
        <div className="relative flex-1 min-w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Enter Job No (e.g. JOB-26-01834)"
            value={job}
            onChange={e => setJob(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') apply() }}
          />
        </div>
        <button className="btn-primary" onClick={apply}>Load</button>
        <button
          className="btn-secondary"
          onClick={() => window.print()}
          disabled={!rows.length}
        >
          <Printer size={15} /> Print
        </button>
      </div>

      {loading ? (
        <div className="card p-12 flex justify-center"><Spinner size="md" /></div>
      ) : !jobParam ? (
        <div className="card p-12 text-center text-gray-400">
          <FileText size={28} className="mx-auto mb-2 opacity-50" />
          Enter a Job No above to produce its tools list.
        </div>
      ) : loaded && rows.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          No tools dispatched on <span className="font-mono">{jobParam}</span>.
        </div>
      ) : rows.length > 0 ? (
        <div className="card p-6 print:shadow-none print:border-0">
          {/* Report header */}
          <div className="border-b-2 border-brand-800 pb-3 mb-4">
            <h2 className="text-center text-xl font-bold text-brand-900 tracking-wide">
              JOB &ndash; Tools List
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-x-10 gap-y-1 text-sm mb-5">
            <div className="flex gap-3">
              <span className="w-24 text-gray-500">Job Order</span>
              <span className="font-semibold">{head?.JobID || jobParam}</span>
            </div>
            <div className="flex gap-3">
              <span className="w-24 text-gray-500">Rig</span>
              <span className="font-semibold">{head?.Rig || '—'}</span>
            </div>
            <div className="flex gap-3">
              <span className="w-24 text-gray-500">Well</span>
              <span className="font-semibold">{head?.Well || '—'}</span>
            </div>
            <div className="flex gap-3">
              <span className="w-24 text-gray-500">Taskorder</span>
              <span className="font-semibold">{head?.PONumber || '—'}</span>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-2 py-1.5 text-left font-semibold text-amber-800">Ticket No</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-left font-semibold text-amber-800">Date Out</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-center font-semibold text-amber-800">Item</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-left font-semibold text-amber-800">Part No</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-left font-semibold text-amber-800">Description</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-left font-semibold text-amber-800">RGT No</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-left font-semibold text-amber-800">Date In</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-left font-semibold text-amber-800">Comments</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-left font-semibold text-amber-800">Supplier</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-amber-800">Ops d</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-amber-800">SB d</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-amber-800">Ops Value</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-amber-800">SB Value</th>
                  <th className="border border-gray-300 px-2 py-1.5 text-right font-semibold text-amber-800">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.TicketNo}-${r.Serial}-${r.Item}-${i}`}>
                    <td className="border border-gray-300 px-2 py-1.5 text-center">{r.TicketNo}</td>
                    <td className="border border-gray-300 px-2 py-1.5 whitespace-nowrap">{formatDate(r.DateOut) || '—'}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center">{r.Item ?? '—'}</td>
                    <td className="border border-gray-300 px-2 py-1.5 font-mono">{r.PartNo || '—'}</td>
                    <td className="border border-gray-300 px-2 py-1.5">{r.Description || '—'}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center">{r.RgtNo || '—'}</td>
                    <td className="border border-gray-300 px-2 py-1.5 whitespace-nowrap">{formatDate(r.DateIn) || '—'}</td>
                    <td className="border border-gray-300 px-2 py-1.5">{r.Comments || '—'}</td>
                    <td className="border border-gray-300 px-2 py-1.5">{r.Supplier || '—'}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{num(r.OpsDays) || '—'}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{num(r.StandbyDays) || '—'}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{money(num(r.OpsAmount))}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">{money(num(r.StandbyAmount))}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right font-semibold">{money(num(r.TotalAmount))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td className="border border-gray-300 px-2 py-1.5" colSpan={9}>
                    Totals — {rows.length} tool lines
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right">{totals.ops || '—'}</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right">{totals.standby || '—'}</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right">{money(totals.opsAmt)}</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right">{money(totals.sbAmt)}</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right text-brand-800">{money(totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-xs text-gray-400 mt-4">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      ) : null}
    </div>
  )
}
