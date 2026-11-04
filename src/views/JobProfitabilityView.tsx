import { Fragment, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Search, Download, RefreshCw, ChevronRight, ChevronDown } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useFetch } from '../hooks/useFetch'
import { PageLoader } from '../components/Spinner'
import { Tile, Notice } from '../components/Kpi'

/*
 * Revenue vs Cost by job.
 * Revenue = value of the days marked on the utilization grid.
 * Cost    = sub-contract hire + maintenance/redress + job-linked expenses (bonus, third-party repairs ...).
 * A hired-in tool with no rate yet is flagged, never costed at zero. No currency conversion.
 */
interface Row {
  jobId: string; client: string | null; rig: string | null; well: string | null; status: string | null
  currency: string; opsDays: number; standbyDays: number; revenue: number
  subCost: number; unpricedTools: number; maintCost: number; otherCost: number
}
interface Detail {
  expenses: { period: string; category: string; supplierName: string | null; invoiceRef: string | null; amount: number; currency: string | null }[]
  maintenance: { jobCardNumber: string; serial: string | null; jobType: string | null; supplierName: string | null; status: string | null; cost: number | null }[]
  subcontract: { tool: string; supplier: string | null; days: number; amount: number | null; currency: string | null }[]
}
const num = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const costOf = (r: Row) => r.subCost + r.maintCost + r.otherCost

function DetailPanel({ jobId }: { jobId: string }) {
  const { data, isLoading } = useFetch<Detail>(`/job-profitability/${encodeURIComponent(jobId)}`)
  if (isLoading || !data) return <div className="p-3 text-[12px] text-slate-500">Loading cost lines…</div>
  const T = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-3 py-1 bg-slate-100 text-[11px] font-semibold uppercase text-slate-600">{title}</div>{children}
    </div>)
  return (
    <div className="grid md:grid-cols-3 gap-3 p-3 bg-slate-50">
      <T title={`Sub-contract hire (${data.subcontract.length})`}>
        <table className="w-full text-[12px]"><tbody>
          {data.subcontract.map((s, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="px-2 py-1 font-mono">{s.tool}</td><td className="px-2">{s.supplier}</td>
              <td className="px-2 text-right">{s.days}d</td>
              <td className={`px-2 text-right ${s.amount == null ? 'text-red-600' : ''}`}>{s.amount == null ? 'no rate' : num(s.amount)}</td>
            </tr>))}
          {!data.subcontract.length && <tr><td className="px-2 py-2 text-slate-400">None</td></tr>}
        </tbody></table>
      </T>
      <T title={`Maintenance & redress (${data.maintenance.length})`}>
        <table className="w-full text-[12px]"><tbody>
          {data.maintenance.map((m, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="px-2 py-1 font-mono">{m.jobCardNumber}</td><td className="px-2">{m.jobType}</td>
              <td className="px-2">{m.supplierName}</td><td className="px-2 text-right">{num(m.cost)}</td>
            </tr>))}
          {!data.maintenance.length && <tr><td className="px-2 py-2 text-slate-400">None</td></tr>}
        </tbody></table>
      </T>
      <T title={`Other job costs (${data.expenses.length})`}>
        <table className="w-full text-[12px]"><tbody>
          {data.expenses.map((e, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="px-2 py-1">{e.period}</td><td className="px-2">{e.category}</td>
              <td className="px-2">{e.supplierName}</td><td className="px-2 text-right">{num(e.amount)}</td>
            </tr>))}
          {!data.expenses.length && <tr><td className="px-2 py-2 text-slate-400">None</td></tr>}
        </tbody></table>
      </T>
    </div>
  )
}

export function JobProfitabilityView() {
  const { data, isLoading, error, refetch } = useFetch<Row[]>('/job-profitability')
  const [q, setQ] = useState('')
  const [cur, setCur] = useState('All')
  const [loss, setLoss] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const rows = useMemo(() => (data || []).filter(r =>
    (cur === 'All' || r.currency === cur) &&
    (!loss || costOf(r) > r.revenue) &&
    (!q || `${r.jobId} ${r.client} ${r.rig} ${r.well}`.toLowerCase().includes(q.toLowerCase()))), [data, q, cur, loss])
  const currencies = useMemo(() => [...new Set((data || []).map(r => r.currency))], [data])

  // totals only when a single currency is in view
  const single = cur !== 'All' ? cur : currencies.length === 1 ? currencies[0] : null
  const tot = rows.reduce((a, r) => ({ rev: a.rev + r.revenue, sub: a.sub + r.subCost, mnt: a.mnt + r.maintCost, oth: a.oth + r.otherCost }),
    { rev: 0, sub: 0, mnt: 0, oth: 0 })
  const cost = tot.sub + tot.mnt + tot.oth
  const unpriced = rows.reduce((s, r) => s + r.unpricedTools, 0)

  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      Job: r.jobId, Client: r.client, Rig: r.rig, Well: r.well, Status: r.status, Currency: r.currency,
      'Ops days': r.opsDays, 'Standby days': r.standbyDays, Revenue: r.revenue,
      'Sub-contract': r.subCost, 'Maintenance & redress': r.maintCost, 'Other job costs': r.otherCost,
      'Total cost': costOf(r), Margin: r.revenue - costOf(r),
      'Margin %': r.revenue ? Math.round((r.revenue - costOf(r)) / r.revenue * 1000) / 10 : null,
      'Unpriced tools': r.unpricedTools })))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Revenue vs Cost')
    XLSX.writeFile(wb, 'Revenue_vs_Cost_by_Job.xlsx')
  }

  if (isLoading) return <PageLoader />
  if (error) return <p className="p-4 text-red-600 text-sm">{String(error)}</p>

  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 shrink-0">
        <Tile label="Revenue" value={single ? num(tot.rev) : '—'} sub={single ? single : 'pick a currency'} />
        <Tile label="Sub-contract" value={single ? num(tot.sub) : '—'} />
        <Tile label="Maintenance & other" value={single ? num(tot.mnt + tot.oth) : '—'} />
        <Tile label="Margin" value={single ? num(tot.rev - cost) : '—'} tone={tot.rev - cost < 0 ? 'bad' : 'good'}
              sub={single && tot.rev ? `${((tot.rev - cost) / tot.rev * 100).toFixed(1)}%` : undefined} />
        <Tile label="Unpriced hired tools" value={String(unpriced)} tone={unpriced ? 'warn' : undefined} sub="cost not yet known" />
      </div>
      {unpriced > 0 && (
        <Notice title="Some hired-in tools have no rate yet">
          Their cost is left out, so those jobs look better than they are. Add the supplier on Sub-Contractor Rate Sheets.
        </Notice>)}
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <div className="relative"><Search size={13} className="absolute left-2 top-2 text-slate-400" />
          <input className="field-input !pl-7 w-56" placeholder="Job, client, rig, well" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select className="field-input w-28" value={cur} onChange={e => setCur(e.target.value)}>
          <option>All</option>{currencies.map(c => <option key={c}>{c}</option>)}
        </select>
        <label className="text-[12px] flex items-center gap-1"><input type="checkbox" checked={loss} onChange={e => setLoss(e.target.checked)} />Loss-making only</label>
        <span className="text-[12px] text-slate-500">{rows.length} jobs</span>
        <button className="btn-mini ml-auto" onClick={refetch}><RefreshCw size={12} /></button>
        <button className="btn-mini" onClick={exportXlsx}><Download size={12} /> Excel</button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto bg-white border border-slate-200 rounded-lg">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-10"><tr>
            <th className="table-th w-6"></th><th className="table-th">Job</th><th className="table-th">Client</th>
            <th className="table-th">Rig</th><th className="table-th">Status</th><th className="table-th">Cur</th>
            <th className="table-th !text-right">Revenue</th><th className="table-th !text-right">Sub-contract</th>
            <th className="table-th !text-right">Maint. & redress</th><th className="table-th !text-right">Other</th>
            <th className="table-th !text-right">Margin</th><th className="table-th !text-right">%</th></tr></thead>
          <tbody>
            {rows.map(r => {
              const m = r.revenue - costOf(r), isOpen = open === r.jobId
              return (<Fragment key={r.jobId}>
                <tr className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(isOpen ? null : r.jobId)}>
                  <td className="table-td">{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</td>
                  <td className="table-td font-mono">{r.jobId}</td><td className="table-td">{r.client || '—'}</td>
                  <td className="table-td">{r.rig || '—'}</td><td className="table-td">{r.status || '—'}</td>
                  <td className="table-td">{r.currency}</td>
                  <td className="table-td text-right tabular-nums">{num(r.revenue)}</td>
                  <td className="table-td text-right tabular-nums">{num(r.subCost)}{r.unpricedTools > 0 && <span className="text-red-600" title="Tools without a rate"> ⚠{r.unpricedTools}</span>}</td>
                  <td className="table-td text-right tabular-nums">{num(r.maintCost)}</td>
                  <td className="table-td text-right tabular-nums">{num(r.otherCost)}</td>
                  <td className={`table-td text-right tabular-nums font-medium ${m < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{num(m)}</td>
                  <td className="table-td text-right tabular-nums">{r.revenue ? (m / r.revenue * 100).toFixed(1) : '—'}</td>
                </tr>
                {isOpen && <tr><td colSpan={12} className="p-0"><DetailPanel jobId={r.jobId} /></td></tr>}
              </Fragment>)
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
