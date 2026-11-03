import { useMemo, useState } from 'react'
import { AlertTriangle, PencilLine, RefreshCw } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { PageLoader } from '../components/Spinner'
import { Tile, Notice } from '../components/Kpi'

/*
 * Tool Revenue & Utilization.
 *
 * Days come from tbl_DailyFieldLogs; money comes from the rate resolved
 * when each day was marked.
 *
 * Unpriced days are shown rather than counted as zero. Nothing wrote
 * RateCharged before the rate engine existed, so history carries days with
 * no money against them, and a total that silently absorbed those would be
 * wrong in a way nobody could see. The banner says how many.
 */

type GroupBy = 'category' | 'contract' | 'job' | 'rig' | 'tool' | 'month'

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: 'category', label: 'Category' },
  { id: 'contract', label: 'Contract' },
  { id: 'job',      label: 'Job' },
  { id: 'rig',      label: 'Rig' },
  { id: 'tool',     label: 'Tool' },
  { id: 'month',    label: 'Month' },
]

interface Row {
  group: string
  opsDays: number; standbyDays: number
  opsAmount: number; standbyAmount: number; amount: number
  unpricedDays: number; editedDays: number
  tools: number; jobs: number
  subDays: number; cost: number; margin: number
  unpricedSubDays: number; subDaysNoHireRecord: number
}
interface Payload {
  from: string; to: string
  groupBy: GroupBy; groupLabel: string
  rows: Row[]
  totals: Row & { days: number }
  currencies: { currency: string; days: number; amount: number }[]
}

const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function monthEnd(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
}

export function ToolRevenueView() {
  const [from, setFrom]       = useState(monthStart())
  const [to, setTo]           = useState(monthEnd())
  const [groupBy, setGroupBy] = useState<GroupBy>('category')

  const path = `/tool-revenue?from=${from}&to=${to}&groupBy=${groupBy}`
  const { data, isLoading, error, refetch } = useFetch<Payload>(path)

  const maxAmount = useMemo(
    () => Math.max(1, ...(data?.rows || []).map(r => r.amount)),
    [data]
  )

  if (isLoading) return <PageLoader />
  if (error) return <div className="card p-6 text-center text-sm text-red-600">{error}</div>

  const t = data?.totals
  const rows = data?.rows || []
  const multiCurrency = (data?.currencies || []).filter(c => c.amount > 0).length > 1

  return (
    <div className="screen gap-2">
      <div className="screen-bar !mb-0">
        <h2 className="text-[15px] font-bold text-slate-900">Tool revenue &amp; utilization</h2>
        <span className="text-[12px] text-slate-500">days on hire and what they earned, from the daily field logs</span>
        <div className="ml-auto flex gap-1.5 items-center flex-wrap">
          <input type="date" className="field-input w-auto" value={from} onChange={e => setFrom(e.target.value)} />
          <span className="text-slate-400 text-[12px]">to</span>
          <input type="date" className="field-input w-auto" value={to} onChange={e => setTo(e.target.value)} />
          <select className="field-input w-auto" value={groupBy}
                  onChange={e => setGroupBy(e.target.value as GroupBy)}>
            {GROUPS.map(g => <option key={g.id} value={g.id}>By {g.label}</option>)}
          </select>
          <button className="btn-mini" onClick={refetch} title="Refresh"><RefreshCw size={12} /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
        <Tile label="Revenue" value={t ? money(t.amount) : '—'}
              sub={multiCurrency ? 'mixed currencies, see below' : undefined} />
        <Tile label="Operating days" value={(t?.opsDays ?? 0).toLocaleString()}
              sub={t ? `${money(t.opsAmount)} earned` : undefined} />
        <Tile label="Standby days" value={(t?.standbyDays ?? 0).toLocaleString()}
              sub={t ? `${money(t.standbyAmount)} earned` : undefined} />
        <Tile label="Tools on hire" value={(t?.tools ?? 0).toLocaleString()}
              sub={t ? `across ${t.jobs} job(s)` : undefined} />
      </div>

      {/* Sub-contractor cost is the other side of the ledger from the revenue
          tiles above, so it sits in its own row, shown only when hired-in
          tools were actually on hire in the period. */}
      {!!t?.subDays && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
          <Tile label="Sub-contractor cost" value={money(t.cost)}
                sub={`${t.subDays.toLocaleString()} hired-in tool-day(s)`} />
          <Tile label="Margin after hire cost" value={money(t.margin)}
                tone={t.margin < 0 ? 'bad' : 'good'}
                sub="revenue less what we pay their owners" />
          <Tile label="Hired-in days with no rate" value={t.unpricedSubDays.toLocaleString()}
                tone={t.unpricedSubDays ? 'warn' : undefined}
                sub={t.unpricedSubDays ? 'waiting in Pending Rental Costs' : undefined} />
          <Tile label="Hired-in, no inward record" value={t.subDaysNoHireRecord.toLocaleString()}
                tone={t.subDaysNoHireRecord ? 'warn' : undefined}
                sub={t.subDaysNoHireRecord ? 'nothing to price, needs a receipt' : undefined} />
        </div>
      )}

      {!!(t?.unpricedSubDays || t?.subDaysNoHireRecord) && (
        <Notice tone="blue" title="The cost side is incomplete, so the margin is flattering">
          {!!t?.unpricedSubDays && <>
            {t.unpricedSubDays.toLocaleString()} hired-in day(s) sit against a tool that has been
            received but not yet priced. Billing sets those in Pending Rental Costs, which prices
            every past day of that hire at once.{' '}
          </>}
          {!!t?.subDaysNoHireRecord && <>
            {t.subDaysNoHireRecord.toLocaleString()} day(s) are on a tool marked as someone else's
            with no inward record, so there is nothing to price until the receipt is entered.
          </>}
        </Notice>
      )}

      {!!t?.unpricedDays && (
        <Notice title={`${t.unpricedDays.toLocaleString()} of ${t.days.toLocaleString()} days carry no rate`}>
          They are counted in the day totals but add nothing to the money, so revenue is a floor,
          not the full figure. A day is priced when it is marked; days recorded before the contract
          rates were loaded were never priced, and a tool whose category has no rate on its
          contract cannot be priced at all.
        </Notice>
      )}

      {multiCurrency && (
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 shrink-0 text-[12px] text-slate-700">
          <span className="text-slate-500 mr-3">Rates are held per contract, so totals are not one currency:</span>
          {data!.currencies.filter(c => c.days > 0).map(c => (
            <span key={c.currency} className="mr-4">
              <strong className="text-slate-900">{c.currency}</strong> {money(c.amount)}
              <span className="text-slate-400"> · {c.days.toLocaleString()} days</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-200 shrink-0 flex items-baseline gap-2">
          <h3 className="text-[13px] font-semibold text-slate-900">By {data?.groupLabel?.toLowerCase() || 'category'}</h3>
          <span className="text-[12px] text-slate-500">{rows.length} row(s), highest earning first</span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="table-th">{data?.groupLabel}</th>
                <th className="table-th !text-right">Ops days</th>
                <th className="table-th !text-right">Standby</th>
                <th className="table-th !text-right">Revenue</th>
                <th className="table-th w-28">Share</th>
                <th className="table-th">Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.group} className="table-tr whitespace-nowrap">
                  <td className="table-td max-w-xs truncate" title={r.group}>{r.group}</td>
                  <td className="table-td !text-right tabular-nums">{r.opsDays.toLocaleString()}</td>
                  <td className="table-td !text-right tabular-nums text-slate-500">{r.standbyDays.toLocaleString()}</td>
                  <td className="table-td !text-right tabular-nums font-medium">{money(r.amount)}</td>
                  <td className="table-td">
                    <div className="w-20 h-2 bg-slate-100 rounded-sm overflow-hidden">
                      <div className="h-full" style={{ width: `${Math.round((r.amount / maxAmount) * 100)}%`, background: '#1a3055' }} />
                    </div>
                  </td>
                  <td className="table-td">
                    <div className="flex gap-1.5">
                      {r.unpricedDays > 0 && (
                        <span title={`${r.unpricedDays} day(s) with no rate`}
                              className="inline-flex items-center gap-1 px-1.5 rounded text-[11px] bg-amber-100 text-amber-800">
                          <AlertTriangle size={10} />{r.unpricedDays} unpriced
                        </span>
                      )}
                      {r.editedDays > 0 && (
                        <span title={`${r.editedDays} day(s) priced by hand`}
                              className="inline-flex items-center gap-1 px-1.5 rounded text-[11px] bg-blue-100 text-blue-800">
                          <PencilLine size={10} />{r.editedDays} by hand
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="table-td text-center text-slate-400 py-10">
                  No days recorded between {from} and {to}.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
