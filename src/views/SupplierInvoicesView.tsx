import React, { useMemo, useState } from 'react'
import { Plus, RefreshCw, Search, Receipt, X } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { api } from '../utils/api'
import { PageLoader, Spinner } from '../components/Spinner'
import { ListOptions } from '../components/ListOptions'
import { formatDate } from '../utils/format'
import { JobPicker } from '../components/JobPicker'

interface Row {
  rowKey: string; source: string; supplierName: string | null; invoiceNo: string | null; invoiceDate: string | null
  amount: number | null; currency: string | null; glCategory: string | null; poNumber: string | null; jobId: string | null
  status: string; paidDate: string | null; notes: string | null; sourceRef: string | null
}
interface Summary {
  year: string; total: number; byStatus: { status: string; n: number }[]
  bySupplier: { key: string; invoices: number; byCurrency: Record<string, number>; paid: number; open: number }[]
  byGl: { key: string; invoices: number; byCurrency: Record<string, number>; paid: number; open: number }[]
  bySource: { key: string; invoices: number }[]
  unallocatedGl: number
}
const STATUSES = ['Received', 'Approved', 'Paid', 'Disputed']
const money = (n: number | null | undefined) => n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const curStr = (m: Record<string, number>) => Object.entries(m).map(([c, v]) => `${money(v)} ${c}`).join(' · ')
const statusClass = (s: string) =>
  s === 'Paid' ? 'bg-emerald-100 text-emerald-800' : s === 'Approved' ? 'bg-blue-100 text-blue-800'
  : s === 'Disputed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'

/**
 * Supplier invoice register. One list of every supplier invoice the app
 * holds - from purchase orders, sub-contract hires, the expense grid and
 * direct entry - with a status that Finance moves through Received →
 * Approved → Paid. The figures of a sourced invoice are edited where they
 * were recorded; this screen keeps the status, paid date, GL line and notes.
 */
export function SupplierInvoicesView() {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canEdit = hasRole('Admin', 'Finance', 'Billing', 'CostController')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [status, setStatus] = useState('')
  const [supplier, setSupplier] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'register' | 'supplier' | 'gl'>('register')
  const [showNew, setShowNew] = useState(false)

  const qs = new URLSearchParams()
  if (year !== 'All') qs.set('year', year)
  if (status) qs.set('status', status)
  if (supplier) qs.set('supplier', supplier)
  if (search.trim()) qs.set('search', search.trim())
  const { data: rows, isLoading, error, refetch } = useFetch<Row[]>(`/supplier-invoices?${qs.toString()}`)
  const { data: sum, refetch: refetchSum } = useFetch<Summary>(`/supplier-invoices/summary?year=${year === 'All' ? new Date().getFullYear() : year}`)
  const reload = () => { refetch(); refetchSum() }

  const suppliers = useMemo(() => (sum?.bySupplier || []).map(s => s.key).filter(k => k !== '(not set)').sort(), [sum])
  const totals = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of rows || []) { const c = r.currency || 'USD'; m[c] = (m[c] || 0) + Number(r.amount || 0) }
    return m
  }, [rows])

  const save = async (r: Row, patch: Partial<Row>) => {
    try { await api.put(`/supplier-invoices/${encodeURIComponent(r.rowKey)}`, patch); reload() }
    catch (e: any) { showToast(e.message || 'Could not save', 'error') }
  }

  if (isLoading && !rows) return <PageLoader />

  return (
    <div className="screen gap-1.5">
      <NewInvoiceModal open={showNew} onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); reload() }} suppliers={suppliers} />

      {sum && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 shrink-0">
          <div className="card px-4 py-2.5"><div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Invoices {sum.year}</div>
            <div className="text-xl font-bold text-navy-900">{sum.total}</div></div>
          {sum.byStatus.map(s => (
            <div key={s.status} className="card px-4 py-2.5"><div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{s.status}</div>
              <div className="text-xl font-bold text-navy-900">{s.n}</div></div>))}
          <div className="card px-4 py-2.5"><div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">No GL line</div>
            <div className={`text-xl font-bold ${sum.unallocatedGl ? 'text-amber-700' : 'text-navy-900'}`}>{sum.unallocatedGl}</div>
            <div className="text-[11px] text-gray-500">set the GL to report them</div></div>
        </div>
      )}

      <div className="screen-bar">
        <div className="flex rounded border border-gray-300 overflow-hidden">
          {([['register', 'Register'], ['supplier', 'By supplier'], ['gl', 'By GL line']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 text-xs font-medium ${tab === k ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>))}
        </div>
        <select className="field-input w-auto" value={year} onChange={e => setYear(e.target.value)}>
          {['All', ...[0, 1, 2].map(i => String(new Date().getFullYear() - i))].map(y => <option key={y} value={y}>{y === 'All' ? 'All years' : y}</option>)}
        </select>
        <select className="field-input w-auto" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>{STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="field-input w-auto max-w-[220px]" value={supplier} onChange={e => setSupplier(e.target.value)}>
          <option value="">All suppliers</option>{suppliers.map(s => <option key={s}>{s}</option>)}
        </select>
        <div className="relative w-64">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="field-input !pl-7" placeholder="Invoice no, supplier, PO, job…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn-mini" onClick={reload} title="Refresh"><RefreshCw size={12} /></button>
        <span className="text-[11px] text-gray-500">{(rows || []).length} invoices · {curStr(totals) || '—'}</span>
        {canEdit && <button className="btn-accent ml-auto" onClick={() => setShowNew(true)}><Plus size={12} /> Record Invoice</button>}
      </div>

      {error && <div className="card p-2 text-red-600 text-xs shrink-0">{error}</div>}

      <div className="flex-1 min-h-0 overflow-auto bg-white border border-gray-300 rounded">
        {tab === 'register' ? (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10"><tr>
              <th className="table-th">Supplier</th><th className="table-th">Invoice no</th><th className="table-th">Date</th>
              <th className="table-th !text-right">Amount</th><th className="table-th">Ccy</th><th className="table-th">GL line</th>
              <th className="table-th">PO</th><th className="table-th">Job</th><th className="table-th">Source</th>
              <th className="table-th">Status</th><th className="table-th">Paid</th><th className="table-th">Notes</th>
            </tr></thead>
            <tbody>
              {(rows || []).length === 0 ? (
                <tr><td colSpan={12} className="table-td text-center text-gray-400 py-10"><Receipt size={22} className="mx-auto mb-1 opacity-40" />No supplier invoices match.</td></tr>
              ) : (rows || []).map(r => (
                <tr key={r.rowKey} className="table-tr whitespace-nowrap">
                  <td className="table-td font-medium max-w-[200px] truncate" title={r.supplierName || ''}>{r.supplierName || '—'}</td>
                  <td className="table-td font-mono">{r.invoiceNo || '—'}</td>
                  <td className="table-td text-gray-500">{formatDate(r.invoiceDate) || '—'}</td>
                  <td className="table-td !text-right font-mono">{money(r.amount)}</td>
                  <td className="table-td text-gray-400">{r.currency || '—'}</td>
                  <td className="table-td">
                    {canEdit ? (
                      <select className={`field-input !h-6 !py-0 w-48 ${r.glCategory ? '' : 'border-amber-400'}`} value={r.glCategory || ''}
                              onChange={e => save(r, { glCategory: e.target.value })}>
                        <ListOptions name="ExpenseCategory" current={r.glCategory} blank blankLabel="— set GL —" />
                      </select>
                    ) : (r.glCategory || <span className="text-amber-700">not set</span>)}
                  </td>
                  <td className="table-td font-mono text-gray-500">{r.poNumber || '—'}</td>
                  <td className="table-td font-mono text-gray-500">{r.jobId || '—'}</td>
                  <td className="table-td text-[11px] text-gray-500">{r.source}</td>
                  <td className="table-td">
                    {canEdit ? (
                      <select className="field-input !h-6 !py-0 w-28" value={r.status} onChange={e => save(r, { status: e.target.value })}>
                        {STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    ) : <span className={`badge ${statusClass(r.status)}`}>{r.status}</span>}
                  </td>
                  <td className="table-td">
                    {canEdit ? (
                      <input type="date" className="field-input !h-6 !py-0 w-36" value={r.paidDate ? String(r.paidDate).slice(0, 10) : ''}
                             onChange={e => save(r, { paidDate: e.target.value || null, status: e.target.value ? 'Paid' : r.status })} />
                    ) : (formatDate(r.paidDate) || '—')}
                  </td>
                  <td className="table-td">
                    {canEdit ? (
                      <input className="field-input !h-6 !py-0 w-44" defaultValue={r.notes || ''}
                             onBlur={e => e.target.value !== (r.notes || '') && save(r, { notes: e.target.value })} />
                    ) : (r.notes || '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10"><tr>
              <th className="table-th">{tab === 'supplier' ? 'Supplier' : 'GL line'}</th>
              <th className="table-th !text-right">Invoices</th><th className="table-th">Total</th>
              <th className="table-th !text-right">Paid</th><th className="table-th !text-right">Open</th>
            </tr></thead>
            <tbody>
              {((tab === 'supplier' ? sum?.bySupplier : sum?.byGl) || []).map(s => (
                <tr key={s.key} className="table-tr">
                  <td className={`table-td font-medium ${s.key === '(not set)' ? 'text-amber-700' : ''}`}>{s.key}</td>
                  <td className="table-td !text-right">{s.invoices}</td>
                  <td className="table-td font-mono">{curStr(s.byCurrency)}</td>
                  <td className="table-td !text-right text-emerald-700">{s.paid}</td>
                  <td className="table-td !text-right text-amber-700">{s.open}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function NewInvoiceModal({ open, onClose, onCreated, suppliers }: { open: boolean; onClose: () => void; onCreated: () => void; suppliers: string[] }) {
  const { showToast } = useToast()
  const { data: regSuppliers } = useFetch<{ SupplierName: string }[]>(open ? '/suppliers' : null)
  const [f, setF] = useState({ supplierName: '', invoiceNo: '', invoiceDate: new Date().toISOString().slice(0, 10), amount: '', currency: 'AED', glCategory: '', poNumber: '', jobId: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const set = (k: string, v: string) => setF(x => ({ ...x, [k]: v }))
  const names = Array.from(new Set([...(regSuppliers || []).map(s => s.SupplierName), ...suppliers])).sort()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.post('/supplier-invoices', f)
      showToast(`Invoice ${f.invoiceNo} recorded`, 'success'); onCreated()
      setF(x => ({ ...x, invoiceNo: '', amount: '', poNumber: '', jobId: '', notes: '' }))
    } catch (err: any) { showToast(err.message || 'Could not record the invoice', 'error') }
    finally { setSaving(false) }
  }
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Receipt size={16} className="text-brand-600" /> Record Supplier Invoice</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <p className="text-xs text-gray-500">For an invoice against a purchase order or a sub-contract hire, record it on that screen — it appears here automatically. Use this for anything else.</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Supplier *</label>
              <input className="input w-full" value={f.supplierName} onChange={e => set('supplierName', e.target.value)} required list="si-suppliers" autoFocus />
              <datalist id="si-suppliers">{names.map(n => <option key={n} value={n} />)}</datalist></div>
            <div><label className="label">Invoice no *</label>
              <input className="input w-full font-mono" value={f.invoiceNo} onChange={e => set('invoiceNo', e.target.value)} required /></div>
            <div><label className="label">Invoice date</label>
              <input type="date" className="input w-full" value={f.invoiceDate} onChange={e => set('invoiceDate', e.target.value)} /></div>
            <div><label className="label">Amount *</label>
              <input type="number" step="0.01" className="input w-full" value={f.amount} onChange={e => set('amount', e.target.value)} required /></div>
            <div><label className="label">Currency</label>
              <select className="input w-full" value={f.currency} onChange={e => set('currency', e.target.value)}><ListOptions name="Currency" current={f.currency} /></select></div>
            <div><label className="label">GL line</label>
              <select className="input w-full" value={f.glCategory} onChange={e => set('glCategory', e.target.value)}>
                <ListOptions name="ExpenseCategory" current={f.glCategory} blank blankLabel="— set later —" /></select></div>
            <div><label className="label">PO number</label>
              <input className="input w-full" value={f.poNumber} onChange={e => set('poNumber', e.target.value)} /></div>
            <div><label className="label">Job</label>
              <JobPicker value={f.jobId} onChange={id => set('jobId', id)} scope="all" allLabel="— no job —" inputClassName="input w-full pr-9" /></div>
          </div>
          <div><label className="label">Notes</label>
            <input className="input w-full" value={f.notes} onChange={e => set('notes', e.target.value)} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? <Spinner size="sm" /> : <Plus size={14} />} Record</button>
          </div>
        </form>
      </div>
    </div>
  )
}
