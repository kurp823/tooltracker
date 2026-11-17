import { Fragment, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Search, Download, RefreshCw, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useFetch } from '../hooks/useFetch'
import { PageLoader } from '../components/Spinner'
import { Tile, Notice } from '../components/Kpi'

/*
 * Revenue vs Cost by job.
 * Revenue = value of the days marked on the utilization grid.
 * Cost    = sub-contract hire + maintenance/redress + job-linked expenses (bonus, third-party repairs ...).
 * A hired-in tool with no rate yet is flagged, never costed at zero. No currency conversion.
 * Jobs worked before the rate engine take revenue (job value) and sub-contract cost from the monthly report's latest month for that job - marked R.
 */
interface Row {
  jobId: string; client: string | null; rig: string | null; well: string | null; status: string | null
  currency: string; revenueSource?: string; opsDays: number; standbyDays: number; revenue: number
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

/** The cost lines behind one job, in a window over the register so the table stays put. */
function DetailModal({ row, onClose }: { row: Row; onClose: () => void }) {
  const jobId = row.jobId
  const { data, isLoading } = useFetch<Detail>(`/job-profitability/${encodeURIComponent(jobId)}`)
  const m = row.revenue - costOf(row)
  const T = ({ title, children }: { title: string; children: ReactNode }) => (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col min-h-0">
      <div className="px-3 py-1 bg-slate-100 text-[11px] font-semibold uppercase text-slate-600 shrink-0">{title}</div>
      <div className="overflow-auto">{children}</div>
    </div>)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-6xl mx-4 flex flex-col max-h-[88vh]">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200">
          <div>
            <div className="font-semibold text-slate-900 font-mono">{jobId}</div>
            <div className="text-[12px] text-slate-500">{[row.client, row.rig, row.status].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="ml-auto grid grid-cols-5 gap-4 text-right text-[12px]">
            {([['Revenue', row.revenue, ''], ['Sub-contract', row.subCost, ''], ['Maint. & redress', row.maintCost, ''], ['Other', row.otherCost, ''],
               ['Margin', m, m < 0 ? 'text-red-700' : 'text-emerald-700']] as [string, number, string][]).map(([l, v, c]) => (
              <div key={l}><div className="text-[10px] uppercase text-slate-500">{l}</div><div className={`font-mono font-semibold ${c}`}>{num(v)} <span className="text-[10px] text-slate-400">{row.currency}</span></div></div>))}
          </div>
          <button className="text-slate-400 hover:text-slate-600 ml-2" onClick={onClose}><X size={18} /></button>
        </div>
        {row.unpricedTools > 0 && (
          <div className="px-5 py-1.5 text-[12px] bg-amber-50 text-amber-800 border-b border-amber-200">
            {row.unpricedTools} hired-in tool{row.unpricedTools === 1 ? '' : 's'} on this job have no rate — their cost is left out. Add the supplier's rate on Sub-Contractor Rate Sheets.
          </div>
        )}
        {isLoading || !data ? <div className="p-6 text-[12px] text-slate-500">Loading cost lines…</div> : (
    <div className="grid md:grid-cols-3 gap-3 p-4 bg-slate-50 flex-1 min-h-0 overflow-auto rounded-b-xl">
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
        )}
      </div>
    </div>
  )
}

export function JobProfitabilityView() {
  const { data, isLoading, error, refetch } = useFetch<Row[]>('/job-profitability')
  const [q, setQ] = useState('')
  const [cur, setCur] = useState('All')
  const [loss, setLoss] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  // Newest job first by default (year segment, then number - the Jobs register's
  // order); any money column sorts on click.
  type SortKey = 'job' | 'revenue' | 'subCost' | 'maintCost' | 'otherCost' | 'margin' | 'pct'
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'job', dir: -1 })
  const jobOrd = (id: string) => { const m = /^[A-Za-z]+-(\d+)-(\d+)/.exec(id || ''); return m ? Number(m[1]) * 1e6 + Number(m[2]) : -1 }
  const valOf = (r: Row, k: SortKey) => k === 'job' ? jobOrd(r.jobId) : k === 'margin' ? r.revenue - costOf(r)
    : k === 'pct' ? (r.revenue ? (r.revenue - costOf(r)) / r.revenue : -Infinity) : (r as any)[k]
  const clickSort = (key: SortKey) => setSort(s => s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'job' ? -1 : -1 })
  const arrow = (key: SortKey) => sort.key === key ? (sort.dir === -1 ? ' ▼' : ' ▲') : ''

  const rows = useMemo(() => (data || []).filter(r =>
    (cur === 'All' || r.currency === cur) &&
    (!loss || costOf(r) > r.revenue) &&
    (!q || `${r.jobId} ${r.client} ${r.rig} ${r.well}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => { const x = valOf(a, sort.key), y = valOf(b, sort.key); return x === y ? String(b.jobId).localeCompare(String(a.jobId)) : (x < y ? -sort.dir : sort.dir) }),
    [data, q, cur, loss, sort])
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
      {open && rows.find(r => r.jobId === open) && (
        <DetailModal row={rows.find(r => r.jobId === open)!} onClose={() => setOpen(null)} />
      )}
      <div className="flex-1 min-h-0 overflow-auto bg-white border border-slate-200 rounded-lg">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-10"><tr>
            <th className="table-th cursor-pointer select-none" onClick={() => clickSort('job')}>Job{arrow('job')}</th><th className="table-th">Client</th>
            <th className="table-th">Rig</th><th className="table-th">Status</th><th className="table-th">Cur</th>
            <th className="table-th !text-right cursor-pointer select-none" onClick={() => clickSort('revenue')}>Revenue{arrow('revenue')}</th>
            <th className="table-th !text-right cursor-pointer select-none" onClick={() => clickSort('subCost')}>Sub-contract{arrow('subCost')}</th>
            <th className="table-th !text-right cursor-pointer select-none" onClick={() => clickSort('maintCost')}>Maint. & redress{arrow('maintCost')}</th>
            <th className="table-th !text-right cursor-pointer select-none" onClick={() => clickSort('otherCost')}>Other{arrow('otherCost')}</th>
            <th className="table-th !text-right cursor-pointer select-none" onClick={() => clickSort('margin')}>Margin{arrow('margin')}</th>
            <th className="table-th !text-right cursor-pointer select-none" onClick={() => clickSort('pct')}>%{arrow('pct')}</th></tr></thead>
          <tbody>
            {rows.map(r => {
              const m = r.revenue - costOf(r)
              return (<Fragment key={r.jobId}>
                <tr className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(r.jobId)} title="Open the cost lines">
                  <td className="table-td font-mono font-medium text-brand-700">{r.jobId}</td><td className="table-td">{r.client || '—'}</td>
                  <td className="table-td">{r.rig || '—'}</td><td className="table-td">{r.status || '—'}</td>
                  <td className="table-td">{r.currency}</td>
                  <td className="table-td text-right tabular-nums" title={`Source: ${r.revenueSource || 'App'}`}>{num(r.revenue)}{r.revenueSource?.startsWith('Report') && <span className="text-slate-400 text-[10px]"> R</span>}</td>
                  <td className="table-td text-right tabular-nums">{num(r.subCost)}{r.unpricedTools > 0 && <span className="text-red-600" title="Tools without a rate"> ⚠{r.unpricedTools}</span>}</td>
                  <td className="table-td text-right tabular-nums">{num(r.maintCost)}</td>
                  <td className="table-td text-right tabular-nums">{num(r.otherCost)}</td>
                  <td className={`table-td text-right tabular-nums font-medium ${m < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{num(m)}</td>
                  <td className="table-td text-right tabular-nums">{r.revenue ? (m / r.revenue * 100).toFixed(1) : '—'}</td>
                </tr>
              </Fragment>)
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
