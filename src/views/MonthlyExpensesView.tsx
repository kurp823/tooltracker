import { useState } from 'react'
import { Plus, Trash2, RefreshCw, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { ListOptions } from '../components/ListOptions'
import { PageLoader } from '../components/Spinner'
import { Stat, Panel, Bar } from '../components/Stat'
import { api } from '../utils/api'

/*
 * Monthly Expense Grid & P&L.
 *
 * Revenue already exists in tbl_Invoices; only the cost side was missing.
 * A row with no job is overhead, which is the distinction the P&L turns on.
 *
 * Nothing is converted between currencies. There is no rate table to
 * convert with, and inventing one would produce a confident number that is
 * wrong, so each currency is reported on its own line.
 */

type Tab = 'grid' | 'pl'

interface Expense {
  id: number; period: string; category: string; jobId: string | null
  supplierName: string | null; invoiceRef: string | null
  amount: number; currency: string | null; notes: string | null
}
interface PLRow {
  period: string; currency: string
  revenue: number; cost: number; margin: number; marginPct: number | null
}
interface PL {
  from: string; to: string
  periods: PLRow[]
  byCategory: { period: string; currency: string; category: string; kind: string; entries: number; amount: number }[]
  mixedCurrency: boolean
  currencies: string[]
}

const money = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const thisPeriod = () => new Date().toISOString().slice(0, 7)
function monthsBack(n: number) {
  const d = new Date(); d.setMonth(d.getMonth() - n)
  return d.toISOString().slice(0, 7)
}

export function MonthlyExpensesView() {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canEdit = hasRole('Admin', 'Finance', 'Billing')

  const [tab, setTab]       = useState<Tab>('grid')
  const [period, setPeriod] = useState(thisPeriod())
  const [from, setFrom]     = useState(monthsBack(5))
  const [to, setTo]         = useState(thisPeriod())

  const { data: rows, isLoading, error, refetch } =
    useFetch<Expense[]>(`/monthly-expenses?period=${period}`)
  const { data: pl, refetch: refetchPL } =
    useFetch<PL>(`/monthly-expenses/pl?from=${from}&to=${to}`)

  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    category: '', jobId: '', supplierName: '', invoiceRef: '',
    amount: '', currency: 'USD', notes: '',
  })

  async function add() {
    if (!form.category.trim()) { showToast('Category is required', 'error'); return }
    if (form.amount === '' || !Number.isFinite(Number(form.amount))) {
      showToast('Amount must be a number', 'error'); return
    }
    setBusy(true)
    try {
      await api('/monthly-expenses', { method: 'POST', body: JSON.stringify({ ...form, period }) })
      showToast('Added', 'success')
      setForm(f => ({ ...f, jobId: '', supplierName: '', invoiceRef: '', amount: '', notes: '' }))
      refetch(); refetchPL()
    } catch (e: any) { showToast(e.message || 'Could not add that cost', 'error') }
    finally { setBusy(false) }
  }

  async function remove(id: number) {
    setBusy(true)
    try {
      await api(`/monthly-expenses/${id}`, { method: 'DELETE' })
      refetch(); refetchPL()
    } catch (e: any) { showToast(e.message || 'Could not remove it', 'error') }
    finally { setBusy(false) }
  }

  if (isLoading) return <PageLoader />
  if (error) return <div className="card p-6 text-center text-sm text-red-600">{error}</div>

  const list = rows || []
  const total = list.reduce((a, r) => a + Number(r.amount), 0)
  const overhead = list.filter(r => !r.jobId).reduce((a, r) => a + Number(r.amount), 0)
  const maxCat = Math.max(1, ...(pl?.byCategory || []).map(c => Number(c.amount)))

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Monthly Expenses &amp; P&amp;L</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            The cost side of the month, against the revenue already invoiced
          </p>
        </div>
        <button className="btn-ghost" onClick={() => { refetch(); refetchPL() }}>
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="card">
        <div className="flex border-b border-gray-200">
          {(['grid', 'pl'] as Tab[]).map(x => (
            <button key={x} onClick={() => setTab(x)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 -mb-px ${
                tab === x ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {x === 'grid' ? 'Expense grid' : 'P&L'}
            </button>
          ))}
        </div>

        {/* ── Grid ───────────────────────────────────────────────────── */}
        {tab === 'grid' && (
          <div className="p-4 space-y-3">
            <div className="flex gap-3 items-end flex-wrap">
              <div>
                <label className="label">Month</label>
                <input type="month" className="input mt-1" value={period}
                       onChange={e => setPeriod(e.target.value)} />
              </div>
              <div className="ml-auto flex gap-4">
                <Stat label="Month total" value={money(total)} />
                <Stat label="Of which overhead" value={money(overhead)}
                      sub={total ? `${Math.round((overhead / total) * 100)}% not against a job` : undefined} />
              </div>
            </div>

            <div className="border border-gray-200 rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Category</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Job</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Supplier</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Invoice ref</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Amount</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(r => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 text-gray-800">{r.category}</td>
                      <td className="px-3 py-1.5 text-xs">
                        {r.jobId
                          ? <span className="text-gray-600">{r.jobId}</span>
                          : <span className="text-gray-400">overhead</span>}
                      </td>
                      <td className="px-3 py-1.5 text-gray-600">{r.supplierName || '—'}</td>
                      <td className="px-3 py-1.5 text-gray-500 text-xs">{r.invoiceRef || '—'}</td>
                      <td className="px-3 py-1.5 text-right font-medium text-gray-900">
                        {money(r.amount)} <span className="text-xs text-gray-400">{r.currency}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        {canEdit && (
                          <button className="btn-ghost p-1" disabled={busy} onClick={() => remove(r.id)}>
                            <Trash2 size={13} className="text-red-500" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {list.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-400">
                      Nothing recorded for {period}.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {canEdit && (
              <div className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
                <div className="md:col-span-2">
                  <label className="label">Category</label>
                  <select className="input mt-1" value={form.category}
                          onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    <option value="">Choose…</option>
                    <ListOptions name="ExpenseCategory" current={form.category} />
                  </select>
                </div>
                <div>
                  <label className="label">Job</label>
                  <input className="input mt-1" placeholder="blank = overhead" value={form.jobId}
                         onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Supplier</label>
                  <input className="input mt-1" value={form.supplierName}
                         onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Amount</label>
                  <input type="number" className="input mt-1" value={form.amount}
                         onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Currency</label>
                  <select className="input mt-1" value={form.currency}
                          onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                    <ListOptions name="Currency" current={form.currency} />
                  </select>
                </div>
                <button className="btn-primary" disabled={busy} onClick={add}>
                  <Plus size={15} /> Add
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── P&L ────────────────────────────────────────────────────── */}
        {tab === 'pl' && (
          <div className="p-4 space-y-5">
            <div className="flex gap-3 items-end flex-wrap">
              <div>
                <label className="label">From</label>
                <input type="month" className="input mt-1" value={from} onChange={e => setFrom(e.target.value)} />
              </div>
              <div>
                <label className="label">To</label>
                <input type="month" className="input mt-1" value={to} onChange={e => setTo(e.target.value)} />
              </div>
            </div>

            {pl?.mixedCurrency && (
              <div className="card p-3 border-l-4 border-l-amber-400">
                <p className="text-sm text-gray-700 flex items-start gap-2">
                  <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    This range covers <strong>{pl.currencies.join(', ')}</strong>. Nothing is
                    converted between them — there is no exchange rate held anywhere in the
                    system, and guessing one would give a confident figure that is wrong. Each
                    currency is shown on its own line.
                  </span>
                </p>
              </div>
            )}

            <div className="border border-gray-200 rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Month</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Currency</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Revenue</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Cost</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Margin</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">%</th>
                  </tr>
                </thead>
                <tbody>
                  {(pl?.periods || []).map(p => (
                    <tr key={`${p.period}|${p.currency}`} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-gray-800">{p.period}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{p.currency}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{money(p.revenue)}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{money(p.cost)}</td>
                      <td className={`px-4 py-2 text-right font-medium ${p.margin >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        <span className="inline-flex items-center gap-1">
                          {p.margin >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {money(p.margin)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-500">
                        {p.marginPct == null ? '—' : `${p.marginPct.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                  {(pl?.periods || []).length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                      No revenue or cost in this range.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <Panel title="Cost by category" subtitle="Across the whole range">
              <div className="py-1">
                {(pl?.byCategory || []).map((c, i) => (
                  <Bar key={`${c.period}-${c.category}-${i}`}
                       label={`${c.category} · ${c.period} · ${c.kind} — ${money(c.amount)} ${c.currency}`}
                       value={Number(c.amount)} total={maxCat}
                       tone={c.kind === 'Overhead' ? 'bg-gray-400' : 'bg-blue-500'} />
                ))}
                {(pl?.byCategory || []).length === 0 && (
                  <p className="text-sm text-gray-400 py-4 text-center">No costs recorded.</p>
                )}
              </div>
            </Panel>
          </div>
        )}
      </div>
    </div>
  )
}
