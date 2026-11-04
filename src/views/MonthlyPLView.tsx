import { useState } from 'react'
import { Download, RefreshCw, Search, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { api } from '../utils/api'
import { PageLoader } from '../components/Spinner'
import { Notice } from '../components/Kpi'

/*
 * Monthly report: months across, every cell traceable.
 *  - P&L Performance : Budget, Revenue, Cost, Net profit, % per month
 *  - Itemized Cost Ledger : each GL line by month
 * Click any figure (magnifier) to see the records it is made of; the list adds up to the cell.
 * Revenue = value of days marked on utilization in the month. Cost = sub-contract hire (by days worked),
 * maintenance on jobs, and the Monthly Expense Grid entries. AED; USD at the invoice AED rate.
 */
interface Year {
  year: number; months: string[]; rate: number
  revenue: number[]; budget: (number | null)[]
  lines: { gl: string; values: number[]; source: string }[]
  warnCurrencies: string[]; unpricedTools: number
  closed: boolean[]; exclFromReportProfit: string[]
  ledger: ({ opening: number; removed: number; added: number; closing: number; newAccrual: number; diff: number; costAccrual: number; netProfit: number } | null)[]
}
interface DRow { kind: string; ref: string | null; date: string | null; party: string | null; description: string | null
  asset: string | null; qty: string; currency: string; amount: number; amountAed: number | null }
interface Detail { period: string; gl: string; rows: DRow[] }

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const n0 = (v: number) => (v === 0 ? '—' : Math.round(v).toLocaleString())
const sgn = (v: number) => (v === 0 ? '—' : (v > 0 ? '+' : '−') + Math.abs(Math.round(v)).toLocaleString())
const n2 = (v: number | null) => v == null ? '—' : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const thisYear = () => new Date().getFullYear()
const thisPeriod = () => new Date().toISOString().slice(0, 7)

function DetailModal({ period, gl, label, onClose }: { period: string; gl: string; label: string; onClose: () => void }) {
  const { data, isLoading } = useFetch<Detail>(`/monthly-expenses/gl-detail?period=${period}&gl=${encodeURIComponent(gl)}`)
  const rows = data?.rows || []
  const total = rows.reduce((s, r) => s + (r.amountAed || 0), 0)
  const m = MON[Number(period.slice(5)) - 1]
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1a3055] text-white px-5 py-3 flex items-start">
          <div>
            <div className="font-bold text-[15px]">{label} — {m} {period.slice(0, 4)} Audit Breakdown</div>
            <div className="text-[12px] text-slate-300">The records this figure is made of</div>
          </div>
          <button className="ml-auto" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="px-5 py-2 text-[12px] flex gap-6 border-b bg-slate-50">
          <span>Period: <b>{m} {period.slice(0, 4)}</b></span><span>Records: <b>{rows.length}</b></span>
        </div>
        <div className="flex-1 overflow-auto">
          {isLoading ? <p className="p-4 text-sm text-slate-500">Loading…</p> : (
            <table className="w-full text-[12px] border-collapse">
              <thead className="sticky top-0 bg-slate-100"><tr>
                {['Type', 'Reference', 'Date', 'Vendor / Client', 'Description', 'Asset / Job', 'Qty'].map(h => <th key={h} className="table-th">{h}</th>)}
                <th className="table-th !text-right">Original</th><th className="table-th !text-right">Amount (AED)</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="table-td">{r.kind}</td><td className="table-td font-mono">{r.ref}</td>
                    <td className="table-td">{r.date ? String(r.date).slice(0, 10) : ''}</td>
                    <td className="table-td">{r.party}</td><td className="table-td max-w-[260px]">{r.description}</td>
                    <td className="table-td">{r.asset}</td><td className="table-td">{r.qty}</td>
                    <td className="table-td text-right tabular-nums">{n2(r.amount)} {r.currency}</td>
                    <td className="table-td text-right tabular-nums font-semibold">{n2(r.amountAed)}</td>
                  </tr>))}
                {!rows.length && <tr><td colSpan={9} className="p-4 text-slate-400">No records behind this figure.</td></tr>}
              </tbody>
            </table>)}
        </div>
        <div className="px-5 py-3 border-t flex items-center">
          <span className="text-[11px] text-slate-500">Every figure here comes from a job, a maintenance order or an expense entry.</span>
          <span className="ml-auto text-[13px] font-bold">TOTAL RECONCILED TO CELL: AED {n2(total)}</span>
          <button className="btn-accent ml-4" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export function MonthlyPLView() {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canEdit = hasRole('Admin', 'Finance', 'Billing')
  const [year, setYear] = useState(thisYear())
  const [mode, setMode] = useState<'pl' | 'accrual' | 'cost'>('pl')
  const [pick, setPick] = useState<{ period: string; gl: string; label: string } | null>(null)
  const { data, isLoading, error, refetch } = useFetch<Year>(`/monthly-expenses/gl-year?year=${year}`)
  if (isLoading) return <PageLoader />
  if (error || !data) return <p className="p-4 text-red-600 text-sm">{String(error || 'No data')}</p>

  const cur = thisPeriod()
  const cost = data.months.map((_, i) => data.lines.reduce((s, l) => s + l.values[i], 0))
  const net = data.revenue.map((r, i) => r - cost[i])
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
  const budSum = sum(data.budget.map(b => b || 0))
  const ytdIdx = data.months.map((m, i) => (m <= cur ? i : -1)).filter(i => i >= 0)
  const ytd = (a: number[]) => ytdIdx.reduce((s, i) => s + a[i], 0)
  const ytdBud = ytdIdx.reduce((s, i) => s + (data.budget[i] || 0), 0)
  const revY = ytd(data.revenue), costY = ytd(cost)
  const excl = data.lines.filter(l => data.exclFromReportProfit.includes(l.gl))
  const exclM = data.months.map((_, i) => excl.reduce((a, l) => a + l.values[i], 0))
  const repCost = cost.map((c, i) => c - exclM[i])            // cost as the monthly report counts it
  const repNet = data.revenue.map((r, i) => r - repCost[i])
  const lastClosed = data.closed.lastIndexOf(true)
  const L = data.ledger
  const opening = (i: number) => L[i] ? L[i]!.opening : (i > 0 && L[i - 1] ? L[i - 1]!.closing : null)

  const setBudget = async (period: string, old: number | null) => {
    const v = window.prompt(`Budget for ${period} (AED)`, old == null ? '' : String(old))
    if (v == null || v.trim() === '') return
    try { await api.put('/monthly-expenses/budget', { period, amount: Number(v) }); refetch() }
    catch (e: any) { showToast(e.message || 'Could not save budget', 'error') }
  }

  const Cell = ({ v, i, gl, label, bold }: { v: number; i: number; gl: string; label: string; bold?: boolean }) => (
    <td className={`px-3 py-1.5 text-right tabular-nums font-mono border-b border-slate-100 ${data.months[i] > cur ? 'text-slate-300' : ''} ${bold ? 'font-bold' : ''}`}>
      {v !== 0 && (
        <button className="inline-flex items-center gap-1 hover:text-blue-700 hover:bg-blue-50 rounded px-1"
                onClick={() => setPick({ period: data.months[i], gl, label })} title="Show the records behind this figure">
          <Search size={10} className="opacity-40" />{n0(v)}
        </button>)}
      {v === 0 && '—'}
    </td>)

  const exportXlsx = () => {
    const rows: any[][] = [['', ...MON, 'YTD']]
    rows.push(['Budget', ...data.budget.map(b => b ?? ''), ytdBud])
    rows.push(['Revenue', ...data.revenue, revY])
    data.lines.forEach(l => rows.push([l.gl, ...l.values, ytd(l.values)]))
    rows.push(['Total cost', ...cost, costY]); rows.push(['Net profit', ...net, revY - costY])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), `FY${data.year}`)
    XLSX.writeFile(wb, `Monthly_Report_FY${data.year}.xlsx`)
  }

  const Kpi = ({ t, v, s, tone }: { t: string; v: string; s?: string; tone?: string }) => (
    <div className={`bg-white rounded-xl border px-4 py-3 ${tone || 'border-slate-200'}`}>
      <div className="text-[11px] tracking-wide uppercase font-semibold text-slate-500">{t}</div>
      <div className="text-[22px] font-bold text-slate-900">{v}</div>{s && <div className="text-[11px] text-slate-500">{s}</div>}
    </div>)

  const head = (
    <tr>{['METRIC / LINE', ...MON.map((m, i) => `${m}'${String(year).slice(2)}${data.closed[i] ? ' ✓' : ''}`), 'YTD TOTAL'].map((h, i) => (
      <th key={i} className={`px-3 py-2 text-[11px] font-bold tracking-wide ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>))}</tr>)

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-3">
      <div className="bg-[#1a3055] text-white rounded-xl px-5 py-4 flex flex-wrap items-center gap-4">
        <div className="bg-amber-500 text-[#1a3055] font-extrabold rounded-lg px-3 py-2 text-[18px]">AED</div>
        <div>
          <div className="text-[18px] font-bold">MONTHLY REVENUE & COST REPORT — FY{year}</div>
          <div className="text-[12px] text-slate-300">EMDAD Services · Well Intervention · USD at {data.rate} AED</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select className="field-input !text-black w-24" value={year} onChange={e => setYear(Number(e.target.value))}>
            {[thisYear() - 1, thisYear(), thisYear() + 1].map(y => <option key={y}>{y}</option>)}</select>
          <div className="flex rounded overflow-hidden border border-slate-500 text-[12px]">
            {([['pl', 'P&L Performance'], ['accrual', 'Accrual Ledger'], ['cost', 'Itemized Cost Ledger']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)} className={`px-3 py-1.5 ${mode === k ? 'bg-blue-600' : ''}`}>{l}</button>))}
          </div>
          <button className="btn-mini" onClick={refetch}><RefreshCw size={12} /></button>
          <button className="btn-accent" onClick={exportXlsx}><Download size={12} /> Excel</button>
        </div>
      </div>

      {data.unpricedTools > 0 && <Notice title="Some hired-in tools have no rate yet">{data.unpricedTools} tool-month(s) are left out of Lease Rental-Equipment until a rate is set on Sub-Contractor Rate Sheets.</Notice>}
      {data.warnCurrencies.length > 0 && <Notice title="Amounts in other currencies were left out">{data.warnCurrencies.join(', ')} has no AED conversion.</Notice>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi t="Annual budget" v={`AED ${Math.round(budSum).toLocaleString()}`} s="click a Budget cell to set it" />
        <Kpi t="Revenue earned (YTD)" v={`AED ${Math.round(revY).toLocaleString()}`} tone="border-blue-200"
             s={ytdBud ? `${(revY / ytdBud * 100).toFixed(1)}% of YTD budget · balance ${Math.round(ytdBud - revY).toLocaleString()}` : 'no budget set'} />
        <Kpi t="Total cost (YTD)" v={`AED ${Math.round(costY).toLocaleString()}`} tone="border-red-200" />
        <Kpi t="Net profit (YTD)" v={`AED ${Math.round(revY - costY).toLocaleString()}`} tone="border-emerald-200"
             s={revY ? `${((revY - costY) / revY * 100).toFixed(1)}% margin` : undefined} />
      </div>

      {mode === 'pl' ? (
        <div className="rounded-xl overflow-hidden border border-amber-300 bg-white">
          <div className="bg-amber-500 text-white px-4 py-2 font-bold text-[13px]">OPERATIONS DATA — MONTHLY PERFORMANCE VIEW <span className="ml-2 text-[11px] opacity-80">FY{year} · click a figure to audit</span></div>
          <div className="overflow-x-auto"><table className="w-full border-collapse text-[12px]">
            <thead className="bg-amber-100 text-amber-900">{head}</thead>
            <tbody>
              <tr><td className="px-3 py-1.5 font-semibold border-b">Budget (AED)</td>
                {data.budget.map((b, i) => (
                  <td key={i} className="px-3 py-1.5 text-right font-mono border-b border-slate-100">
                    {canEdit ? <button className="hover:bg-amber-50 rounded px-1" onClick={() => setBudget(data.months[i], b)}>{b == null ? '＋' : n0(b)}</button> : (b == null ? '—' : n0(b))}</td>))}
                <td className="px-3 py-1.5 text-right font-mono font-bold bg-amber-50 border-b">{n0(ytdBud)}</td></tr>
              <tr><td className="px-3 py-1.5 border-b">New accruals this month<div className="text-[10px] text-slate-500">net new work not yet invoiced</div></td>
                {data.months.map((_, i) => <td key={i} className="px-3 py-1.5 text-right font-mono border-b border-slate-100">{L[i] ? n0(L[i]!.newAccrual) : '—'}</td>)}
                <td className="px-3 py-1.5 text-right font-mono font-bold bg-amber-50 border-b">{n0(L.reduce((a, x) => a + (x ? x.newAccrual : 0), 0))}</td></tr>
              <tr><td className="px-3 py-1.5 border-b">Revenue diff: accrued vs legal invoiced</td>
                {data.months.map((_, i) => <td key={i} className="px-3 py-1.5 text-right font-mono border-b border-slate-100">{L[i] ? n0(L[i]!.diff) : '—'}</td>)}
                <td className="px-3 py-1.5 text-right font-mono font-bold bg-amber-50 border-b">{n0(L.reduce((a, x) => a + (x ? x.diff : 0), 0))}</td></tr>
              <tr className="bg-blue-50"><td className="px-3 py-1.5 font-bold text-blue-900 border-b">Revenue earned (AED)<div className="text-[10px] font-normal text-slate-500">days marked × rate</div></td>
                {data.revenue.map((v, i) => <Cell key={i} v={v} i={i} gl="__REVENUE__" label="Revenue" bold />)}
                <td className="px-3 py-1.5 text-right font-mono font-bold bg-blue-100 border-b">{n0(revY)}</td></tr>
              <tr className="bg-red-50"><td className="px-3 py-1.5 font-bold text-red-900 border-b">Total cost (AED)<div className="text-[10px] font-normal text-slate-500">all GL lines incl. salary &amp; prior-year</div></td>
                {cost.map((v, i) => <td key={i} className={`px-3 py-1.5 text-right font-mono font-bold border-b ${data.months[i] > cur ? 'text-slate-300' : ''}`}>{n0(v)}</td>)}
                <td className="px-3 py-1.5 text-right font-mono font-bold bg-red-100 border-b">{n0(costY)}</td></tr>
              <tr className="bg-emerald-50"><td className="px-3 py-1.5 font-bold text-emerald-900 border-b">Net profit (AED)</td>
                {net.map((v, i) => <td key={i} className={`px-3 py-1.5 text-right font-mono border-b ${v < 0 ? 'text-red-700' : 'text-emerald-700'} ${data.months[i] > cur ? 'opacity-30' : ''}`}>{sgn(v)}</td>)}
                <td className="px-3 py-1.5 text-right font-mono font-bold bg-emerald-100 border-b">{sgn(revY - costY)}</td></tr>
              <tr className="bg-emerald-50/60"><td className="px-3 py-1.5 font-semibold text-emerald-900 border-b">Net profit — report basis<div className="text-[10px] font-normal text-slate-500">excludes {data.exclFromReportProfit.join(' and ')}</div></td>
                {repNet.map((v, i) => <td key={i} className={`px-3 py-1.5 text-right font-mono border-b ${v < 0 ? 'text-red-700' : 'text-emerald-700'} ${data.months[i] > cur ? 'opacity-30' : ''}`}>{data.revenue[i] || cost[i] ? sgn(v) : '—'}</td>)}
                <td className="px-3 py-1.5 text-right font-mono font-bold bg-emerald-100 border-b">{sgn(ytdIdx.reduce((a, i) => a + repNet[i], 0))}</td></tr>
              <tr><td className="px-3 py-1.5 font-bold">Net profit %</td>
                {net.map((v, i) => <td key={i} className={`px-3 py-1.5 text-right font-mono ${v < 0 ? 'text-red-700' : 'text-emerald-700'} ${data.months[i] > cur ? 'opacity-30' : ''}`}>{data.revenue[i] ? `${Math.round(v / data.revenue[i] * 100)}%` : '—'}</td>)}
                <td className="px-3 py-1.5 text-right font-mono font-bold">{revY ? `${Math.round((revY - costY) / revY * 100)}%` : '—'}</td></tr>
              <tr className="bg-slate-50"><td className="px-3 py-1.5 font-semibold">Variance vs budget <span className="font-normal text-[10px] text-slate-500">+ over / (under)</span></td>
                {data.budget.map((b, i) => <td key={i} className={`px-3 py-1.5 text-right font-mono ${b && data.revenue[i] - b < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{b && data.revenue[i] ? sgn(data.revenue[i] - b) : '—'}</td>)}
                <td className="px-3 py-1.5 text-right font-mono font-bold">{sgn(revY - ytdBud)}</td></tr>
              <tr className="bg-slate-50"><td className="px-3 py-1.5 font-semibold">% target achieved</td>
                {data.budget.map((b, i) => <td key={i} className="px-3 py-1.5 text-right font-mono text-[11px]">{b && data.revenue[i] ? `${Math.round(data.revenue[i] / b * 100)}%` : '—'}</td>)}
                <td className="px-3 py-1.5 text-right font-mono font-bold">{ytdBud ? `${Math.round(revY / ytdBud * 100)}%` : '—'}</td></tr>
            </tbody></table></div>
        </div>
      ) : mode === 'accrual' ? (
        <div className="rounded-xl overflow-hidden border border-blue-300 bg-white">
          <div className="bg-blue-700 text-white px-4 py-2 font-bold text-[13px]">ACCRUAL LEDGER (AED) <span className="ml-2 text-[11px] opacity-80">opening − invoiced + new = closing · each year's closing is next January's opening</span></div>
          <div className="overflow-x-auto"><table className="w-full border-collapse text-[12px]">
            <thead className="bg-blue-100 text-blue-900">{head}</thead>
            <tbody>
              {([['Opening accrual balance', (i: number) => opening(i)],
                 ['Less: invoiced from accrual (removal)', (i: number) => L[i] ? L[i]!.removed : null],
                 ['Add: current month accrual', (i: number) => L[i] ? L[i]!.added : null],
                 ['Closing accrual balance', (i: number) => L[i] ? L[i]!.closing : null]] as [string, (i: number) => number | null][]).map(([lab, f], k) => (
                <tr key={lab} className={k === 3 ? 'bg-blue-50 font-bold' : ''}><td className="px-3 py-1.5 border-b">{lab}</td>
                  {data.months.map((_, i) => { const v = f(i); return <td key={i} className="px-3 py-1.5 text-right font-mono border-b border-slate-100">{v == null ? '—' : n0(v)}</td> })}
                  <td className="px-3 py-1.5 border-b" /></tr>))}
            </tbody></table></div>
          <p className="px-4 py-2 text-[11px] text-slate-500">Closed months show the figures reported in the monthly report. {lastClosed >= 0 && lastClosed < 11 ? `${data.months[lastClosed + 1]} opens at AED ${n0(L[lastClosed]!.closing)} (closing of ${data.months[lastClosed]}).` : ''}</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border border-slate-300 bg-white">
          <div className="bg-[#1a3055] text-white px-4 py-2 font-bold text-[13px]">ITEMIZED OPERATIONAL COST LEDGER <span className="ml-2 text-[11px] bg-red-500/80 rounded px-2 py-0.5">Total: AED {Math.round(sum(cost)).toLocaleString()}</span></div>
          <div className="overflow-x-auto"><table className="w-full border-collapse text-[12px]">
            <thead className="bg-slate-200 text-slate-700">{head}</thead>
            <tbody>
              {data.lines.map(l => (
                <tr key={l.gl}><td className="px-3 py-1.5 border-b border-slate-100">
                    <div className="font-semibold">{l.gl}</div><div className="text-[10px] text-slate-400">{l.source}</div></td>
                  {l.values.map((v, i) => <Cell key={i} v={v} i={i} gl={l.gl} label={l.gl} />)}
                  <td className="px-3 py-1.5 text-right font-mono font-bold bg-slate-50 border-b">{n0(ytd(l.values))}</td></tr>))}
              <tr className="bg-red-100 font-bold"><td className="px-3 py-1.5">TOTAL COSTS (AED)</td>
                {cost.map((v, i) => <td key={i} className="px-3 py-1.5 text-right font-mono">{n0(v)}</td>)}
                <td className="px-3 py-1.5 text-right font-mono">{n0(costY)}</td></tr>
            </tbody></table></div>
        </div>
      )}
      {pick && <DetailModal {...pick} onClose={() => setPick(null)} />}
    </div>
  )
}
