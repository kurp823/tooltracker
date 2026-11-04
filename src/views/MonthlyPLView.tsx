import { useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useFetch } from '../hooks/useFetch'
import { PageLoader } from '../components/Spinner'
import { Notice } from '../components/Kpi'

/*
 * Monthly P&L in the report's GL layout (AED): Fishing | Whipstock | Rentals | Total.
 * Revenue  = value of the days marked on utilization in the period (USD x rate to AED).
 * Cost     = sub-contract hire (Lease Rental-Equipment) and maintenance on jobs, plus every
 *            manual entry on the Monthly Expense Grid, each under its GL line.
 */
type M = { Fishing: number; Whipstock: number; Rentals: number; Unallocated: number }
interface GL {
  period: string; rate: number; revenue: { month: M; ytd: M }
  lines: { gl: string; month: M; ytd: M }[]
  warnCurrencies: string[]; unpricedTools: number
}
const COLS: (keyof M)[] = ['Fishing', 'Whipstock', 'Rentals']
const sum = (m: M) => m.Fishing + m.Whipstock + m.Rentals + m.Unallocated
const f = (n: number) => (n === 0 ? '–' : n.toLocaleString(undefined, { maximumFractionDigits: 0 }))
const thisPeriod = () => new Date().toISOString().slice(0, 7)

export function MonthlyPLView() {
  const [period, setPeriod] = useState(thisPeriod())
  const [mode, setMode] = useState<'month' | 'ytd'>('month')
  const { data, isLoading, error, refetch } = useFetch<GL>(`/monthly-expenses/gl-pl?period=${period}`)
  if (isLoading) return <PageLoader />
  if (error || !data) return <p className="p-4 text-red-600 text-sm">{String(error || 'No data')}</p>

  const pick = (x: { month: M; ytd: M }) => x[mode]
  const rev = pick(data.revenue)
  const cost: M = { Fishing: 0, Whipstock: 0, Rentals: 0, Unallocated: 0 }
  data.lines.forEach(l => (Object.keys(cost) as (keyof M)[]).forEach(k => { cost[k] += pick(l)[k] }))
  const gp: M = { Fishing: rev.Fishing - cost.Fishing, Whipstock: rev.Whipstock - cost.Whipstock,
                  Rentals: rev.Rentals - cost.Rentals, Unallocated: rev.Unallocated - cost.Unallocated }
  const showUn = [rev, cost].some(m => m.Unallocated !== 0)
  const cols: (keyof M)[] = showUn ? [...COLS, 'Unallocated'] : COLS
  const pct = (g: number, r: number) => (r ? `${(g / r * 100).toFixed(1)}%` : '–')

  const exportXlsx = () => {
    const rows: any[][] = [['GL', ...cols, 'Total']]
    rows.push(['Revenue', ...cols.map(c => rev[c]), sum(rev)])
    data.lines.forEach(l => rows.push([l.gl, ...cols.map(c => pick(l)[c]), sum(pick(l))]))
    rows.push(['Total cost', ...cols.map(c => cost[c]), sum(cost)])
    rows.push(['Gross profit', ...cols.map(c => gp[c]), sum(gp)])
    const ws = XLSX.utils.aoa_to_sheet(rows); const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, mode === 'month' ? data.period : `YTD ${data.period}`)
    XLSX.writeFile(wb, `Monthly_PL_${data.period}_${mode}.xlsx`)
  }

  const td = 'px-3 py-1 text-right tabular-nums border-b border-slate-100'
  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <input type="month" className="field-input w-40" value={period} onChange={e => e.target.value && setPeriod(e.target.value)} />
        <div className="flex border border-slate-300 rounded overflow-hidden text-[12px]">
          {(['month', 'ytd'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
                    className={`px-3 py-1 ${mode === m ? 'bg-[#1a3055] text-white' : 'bg-white text-slate-600'}`}>
              {m === 'month' ? 'This month' : 'Year to date'}</button>))}
        </div>
        <span className="text-[12px] text-slate-500">AED · USD converted at {data.rate}</span>
        <button className="btn-mini ml-auto" onClick={refetch}><RefreshCw size={12} /></button>
        <button className="btn-mini" onClick={exportXlsx}><Download size={12} /> Excel</button>
      </div>
      {data.unpricedTools > 0 && (
        <Notice title="Some hired-in tools have no rate yet">
          {data.unpricedTools} tool(s) are left out of Lease Rental-Equipment until a rate is set on Sub-Contractor Rate Sheets.
        </Notice>)}
      {data.warnCurrencies.length > 0 && (
        <Notice title="Amounts in other currencies were left out">
          {data.warnCurrencies.join(', ')} has no conversion rate to AED.
        </Notice>)}
      <div className="flex-1 min-h-0 overflow-auto bg-white border border-slate-200 rounded-lg">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-10"><tr>
            <th className="table-th">GL account</th>
            {cols.map(c => <th key={c} className="table-th !text-right">{c}</th>)}
            <th className="table-th !text-right">Total</th></tr></thead>
          <tbody>
            <tr className="bg-[#78350f] text-white font-semibold">
              <td className="px-3 py-1">REVENUE</td>
              {cols.map(c => <td key={c} className={td + ' !border-0'}>{f(rev[c])}</td>)}
              <td className={td + ' !border-0'}>{f(sum(rev))}</td></tr>
            {data.lines.map(l => (
              <tr key={l.gl} className="hover:bg-slate-50">
                <td className="px-3 py-1 border-b border-slate-100">{l.gl}</td>
                {cols.map(c => <td key={c} className={td}>{f(pick(l)[c])}</td>)}
                <td className={td + ' font-medium'}>{f(sum(pick(l)))}</td></tr>))}
            <tr className="bg-slate-100 font-semibold">
              <td className="px-3 py-1">Total cost</td>
              {cols.map(c => <td key={c} className={td}>{f(cost[c])}</td>)}
              <td className={td}>{f(sum(cost))}</td></tr>
            <tr className="bg-[#1a3055] text-white font-bold">
              <td className="px-3 py-1">GROSS PROFIT</td>
              {cols.map(c => <td key={c} className={td + ' !border-0'}>{f(gp[c])}</td>)}
              <td className={td + ' !border-0'}>{f(sum(gp))}</td></tr>
            <tr className="font-semibold">
              <td className="px-3 py-1">GP %</td>
              {cols.map(c => <td key={c} className={td}>{pct(gp[c], rev[c])}</td>)}
              <td className={td}>{pct(sum(gp), sum(rev))}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
