import { useMemo, useState } from 'react'
import { Coins, AlertTriangle, PencilLine, RefreshCw, Building2 } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { PageLoader } from '../components/Spinner'
import { Stat, Panel, Bar } from '../components/Stat'

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
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Tool Revenue &amp; Utilization</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Days on hire and what they earned, from the daily field logs
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <input type="date" className="input w-auto" value={from} onChange={e => setFrom(e.target.value)} />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" className="input w-auto" value={to} onChange={e => setTo(e.target.value)} />
          <select className="input w-auto" value={groupBy}
                  onChange={e => setGroupBy(e.target.value as GroupBy)}>
            {GROUPS.map(g => <option key={g.id} value={g.id}>By {g.label}</option>)}
          </select>
          <button className="btn-ghost" onClick={refetch} title="Refresh"><RefreshCw size={15} /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Revenue" value={t ? money(t.amount) : '—'}
              sub={multiCurrency ? 'mixed currencies — see below' : undefined}
              icon={<Coins size={22} className="text-emerald-600" />} iconBg="bg-emerald-100" />
        <Stat label="Operating days" value={(t?.opsDays ?? 0).toLocaleString()}
              sub={t ? `${money(t.opsAmount)} earned` : undefined} />
        <Stat label="Standby days" value={(t?.standbyDays ?? 0).toLocaleString()}
              sub={t ? `${money(t.standbyAmount)} earned` : undefined} />
        <Stat label="Tools on hire" value={(t?.tools ?? 0).toLocaleString()}
              sub={t ? `across ${t.jobs} job(s)` : undefined} />
      </div>

      {/* Sub-contractor cost sits apart from the revenue tiles above: it is a
          different side of the ledger and mixing them in one row invites the
          two to be read as comparable totals when one is money in and the
          other money out. Shown only when hired-in tools were actually on
          hire in the period. */}
      {!!t?.subDays && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Sub-contractor cost" value={money(t.cost)}
                sub={`${t.subDays.toLocaleString()} hired-in tool-day(s)`}
                icon={<Building2 size={22} className="text-blue-600" />} iconBg="bg-blue-100" />
          <Stat label="Margin after hire cost" value={money(t.margin)}
                tone={t.margin < 0 ? 'bad' : 'good'}
                sub="revenue less what we pay their owners" />
          <Stat label="Hired-in days with no rate" value={t.unpricedSubDays.toLocaleString()}
                tone={t.unpricedSubDays ? 'warn' : 'default'}
                sub={t.unpricedSubDays ? 'waiting in Pending Rental Costs' : undefined} />
          <Stat label="Hired-in, no inward record" value={t.subDaysNoHireRecord.toLocaleString()}
                tone={t.subDaysNoHireRecord ? 'warn' : 'default'}
                sub={t.subDaysNoHireRecord ? 'nothing to price — needs a receipt' : undefined} />
        </div>
      )}

      {/* The honest caveat, stated before the numbers are read rather than
          buried under them. */}
      {!!(t?.unpricedSubDays || t?.subDaysNoHireRecord) && (
        <div className="card p-4 border-l-4 border-l-blue-400">
          <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
            <AlertTriangle size={15} className="text-blue-600" />
            The cost side is incomplete, so the margin above is flattering
          </p>
          <p className="text-sm text-gray-600 mt-1">
            {!!t?.unpricedSubDays && <>
              {t.unpricedSubDays.toLocaleString()} hired-in day(s) sit against a tool that
              has been received but not yet priced — Billing sets those in Pending Rental
              Costs, and doing so prices every past day of that hire at once.{' '}
            </>}
            {!!t?.subDaysNoHireRecord && <>
              {t.subDaysNoHireRecord.toLocaleString()} day(s) are on a tool marked as someone
              else's with no inward record at all, so there is nothing to price against it
              until the receipt is entered.
            </>}
          </p>
        </div>
      )}

      {!!t?.unpricedDays && (
        <div className="card p-4 border-l-4 border-l-amber-400">
          <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-600" />
            {t.unpricedDays.toLocaleString()} of {t.days.toLocaleString()} days carry no rate
          </p>
          <p className="text-sm text-gray-600 mt-1">
            Those days are counted in the day totals but contribute nothing to the money,
            so the revenue above is a floor, not the full figure. A day is priced when it
            is marked; days recorded before the contract rates were loaded were never
            priced, and a tool whose category has no rate on its contract cannot be
            priced at all.
          </p>
        </div>
      )}

      {multiCurrency && (
        <Panel title="By currency"
               subtitle="Rates are held per contract, so totals across contracts are not one currency">
          <div className="py-1">
            {data!.currencies.filter(c => c.days > 0).map(c => (
              <Bar key={c.currency} label={`${c.currency} — ${money(c.amount)}`}
                   value={c.days} total={t?.days || 1} tone="bg-emerald-500" />
            ))}
          </div>
        </Panel>
      )}

      <Panel title={`By ${data?.groupLabel?.toLowerCase() || 'category'}`}
             subtitle={`${rows.length} row(s), highest earning first`}>
        <div className="max-h-[32rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">{data?.groupLabel}</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Ops days</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Standby</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Revenue</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Share</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 w-28"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.group} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-800 truncate max-w-xs" title={r.group}>{r.group}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{r.opsDays.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{r.standbyDays.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right font-medium text-gray-900">{money(r.amount)}</td>
                  <td className="px-4 py-2 text-right text-gray-500">
                    <div className="inline-block w-16 h-1.5 bg-gray-100 rounded overflow-hidden align-middle">
                      <div className="h-full bg-emerald-500"
                           style={{ width: `${Math.round((r.amount / maxAmount) * 100)}%` }} />
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1.5">
                      {r.unpricedDays > 0 && (
                        <span title={`${r.unpricedDays} day(s) with no rate`}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-800">
                          <AlertTriangle size={10} />{r.unpricedDays}
                        </span>
                      )}
                      {r.editedDays > 0 && (
                        <span title={`${r.editedDays} day(s) priced by hand`}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-800">
                          <PencilLine size={10} />{r.editedDays}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                  No days recorded between {from} and {to}.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
