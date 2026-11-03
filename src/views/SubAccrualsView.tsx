import { useMemo, useState } from 'react'
import { RefreshCw, Search, Download, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useFetch } from '../hooks/useFetch'
import { api } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { PageLoader } from '../components/Spinner'
import { Tile, Notice } from '../components/Kpi'
import { ListOptions } from '../components/ListOptions'
import { usePagedRows, Pager } from '../components/usePagedRows'
import { formatDate } from '../utils/format'

/*
 * Sub-contract POs & Accruals.
 *
 * A hired-in tool is paid for after the job, on the days it actually worked.
 * The final PO is raised when the job is complete and the supplier invoices
 * against it, so between the first day a tool works and the invoice landing
 * the cost is an accrual. This screen is the answer to two questions:
 *
 *   - which POs are still to be issued to a sub-contractor?
 *   - which supplier invoices are still to arrive against an accrual?
 *
 * The accrued figure is worked out by the server from the marked days and the
 * day rate held for each tool - it is not typed here. Only the paperwork is:
 * PO number and date, supplier invoice number, date and amount.
 */

interface Row {
  supplierName: string; jobId: string; client: string | null; rig: string | null
  jobStatus: string | null; jobDone: boolean
  tools: number; days: number; accrued: number; unpricedDays: number
  currency: string | null; firstDay: string | null; lastDay: string | null
  poNumber: string | null; poDate: string | null
  invoiceNo: string | null; invoiceDate: string | null; invoiceAmount: number | null
  poCurrency: string | null; notes: string | null
  stage: 'Accruing' | 'PO to issue' | 'Invoice awaited' | 'Invoiced'
}

const STAGES: Row['stage'][] = ['PO to issue', 'Invoice awaited', 'Accruing', 'Invoiced']
const stageClass: Record<Row['stage'], string> = {
  'PO to issue': 'status-cancelled', 'Invoice awaited': 'status-draft',
  'Accruing': 'status-open', 'Invoiced': 'status-completed',
}
const stageHelp: Record<Row['stage'], string> = {
  'PO to issue': 'Job finished, no PO yet',
  'Invoice awaited': 'PO issued, supplier invoice not in',
  'Accruing': 'Job still running',
  'Invoiced': 'Supplier invoice recorded',
}
const num = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (s: string | null) => (s ? String(s).slice(0, 10) : '')

export function SubAccrualsView() {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canEdit = hasRole('Admin', 'Billing', 'Finance', 'CostController')

  const { data, isLoading, error, refetch } = useFetch<Row[]>('/sub-accruals')
  const [stage, setStage] = useState<string>('All')
  const [supplier, setSupplier] = useState('All')
  const [search, setSearch] = useState('')
  const [edit, setEdit] = useState<Row | null>(null)

  const rows = data || []
  const suppliers = useMemo(() => Array.from(new Set(rows.map(r => r.supplierName))).sort(), [rows])

  const counts = useMemo(() => {
    const c: Record<string, { n: number; value: Record<string, number> }> = {}
    for (const s of STAGES) c[s] = { n: 0, value: {} }
    for (const r of rows) {
      const k = c[r.stage]; k.n++
      const ccy = r.currency || '—'
      k.value[ccy] = (k.value[ccy] || 0) + Number(r.accrued || 0)
    }
    return c
  }, [rows])
  const valueText = (s: string) => {
    const v = Object.entries(counts[s]?.value || {}).filter(([, x]) => x > 0)
    return v.length ? v.map(([c, x]) => `${num(x)} ${c}`).join(' · ') : 'nothing accrued'
  }
  const unpriced = rows.reduce((a, r) => a + (r.unpricedDays || 0), 0)
  const unpricedRows = rows.filter(r => r.unpricedDays > 0).length

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r =>
      (stage === 'All' || r.stage === stage) &&
      (supplier === 'All' || r.supplierName === supplier) &&
      (!q || [r.supplierName, r.jobId, r.client, r.poNumber, r.invoiceNo, r.rig].some(x => String(x ?? '').toLowerCase().includes(q))))
  }, [rows, stage, supplier, search])

  const { scrollRef, visible, page, pageCount, setPage, from, to, total } = usePagedRows(filtered)

  function exportXlsx() {
    const head = ['Supplier', 'Job', 'Client', 'Job status', 'Stage', 'Tools', 'Days', 'Accrued', 'Currency',
                  'Unpriced days', 'PO number', 'PO date', 'Invoice no', 'Invoice date', 'Invoice amount', 'Invoice less accrual']
    const aoa = [head, ...filtered.map(r => [r.supplierName, r.jobId, r.client || '', r.jobStatus || '', r.stage, r.tools, r.days,
      Number(r.accrued || 0), r.currency || '', r.unpricedDays, r.poNumber || '', day(r.poDate), r.invoiceNo || '',
      day(r.invoiceDate), r.invoiceAmount ?? '', r.invoiceAmount != null ? Number(r.invoiceAmount) - Number(r.accrued || 0) : ''])]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = head.map(h => ({ wch: Math.max(11, h.length + 2) }))
    XLSX.utils.book_append_sheet(wb, ws, 'Sub-contract accruals')
    XLSX.writeFile(wb, `sub-contract-accruals-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  if (isLoading) return <PageLoader />

  return (
    <div className="screen gap-2">
      {/* The two questions, as numbers. Each tile filters the list below. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
        {STAGES.map(s => (
          <button key={s} type="button" onClick={() => setStage(stage === s ? 'All' : s)}
                  className={`text-left rounded-lg ${stage === s ? 'ring-2 ring-brand-500' : ''}`}>
            <Tile label={s} value={String(counts[s].n)} sub={`${stageHelp[s]} · ${valueText(s)}`}
                  tone={s === 'PO to issue' && counts[s].n ? 'bad' : s === 'Invoice awaited' && counts[s].n ? 'warn' : undefined} />
          </button>
        ))}
      </div>

      {unpriced > 0 && (
        <div className="shrink-0">
          <Notice title={`${unpriced.toLocaleString()} days on hired-in tools have no day rate (${unpricedRows} supplier/job lines)`}>
            Those days are counted but add nothing to the accrual, so the figures below are lower than the real cost.
            Set the rate from the job's Utilization → Sub-contract tab, or from Pending Rental Costs.
          </Notice>
        </div>
      )}

      <div className="screen-bar">
        <div className="relative w-64">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="field-input !pl-7" placeholder="Search supplier, job, PO, invoice…"
                 value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="field-input w-auto" value={stage} onChange={e => setStage(e.target.value)}>
          <option value="All">All stages</option>
          {STAGES.map(s => <option key={s} value={s}>{s} ({counts[s].n})</option>)}
        </select>
        <select className="field-input w-auto" value={supplier} onChange={e => setSupplier(e.target.value)}>
          <option value="All">All suppliers</option>
          {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn-mini" onClick={refetch} title="Refresh"><RefreshCw size={12} /></button>
        <span className="text-[12px] text-slate-600 ml-1"><strong className="text-slate-900">{filtered.length.toLocaleString()}</strong> supplier/job lines</span>
        <button className="btn-mini ml-auto" onClick={exportXlsx}><Download size={12} /> Export</button>
      </div>

      {error && <div className="card p-2 text-red-600 text-xs shrink-0">{error}</div>}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto bg-white border border-gray-300 rounded-t">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="table-th pin-l">Supplier</th>
              <th className="table-th">Job</th>
              <th className="table-th">Client</th>
              <th className="table-th">Job status</th>
              <th className="table-th !text-right">Tools</th>
              <th className="table-th !text-right">Days</th>
              <th className="table-th !text-right">Accrued</th>
              <th className="table-th">Ccy</th>
              <th className="table-th">PO no</th>
              <th className="table-th">Invoice no</th>
              <th className="table-th !text-right">Invoice amount</th>
              <th className="table-th !text-right">Invoice − accrual</th>
              <th className="table-th pin-r">Stage</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={13} className="table-td text-center py-10 text-gray-400">
                {rows.length === 0 ? 'No hired-in tool has worked a day on any job yet.' : 'Nothing matches these filters.'}
              </td></tr>
            ) : visible.map(r => {
              const diff = r.invoiceAmount != null ? Number(r.invoiceAmount) - Number(r.accrued || 0) : null
              return (
                <tr key={`${r.supplierName}|${r.jobId}`} className="table-tr whitespace-nowrap cursor-pointer"
                    onClick={() => setEdit(r)}>
                  <td className="table-td pin-l font-medium text-brand-600">{r.supplierName}</td>
                  <td className="table-td font-mono text-slate-700">{r.jobId}</td>
                  <td className="table-td max-w-[200px] truncate" title={r.client || ''}>{r.client || '—'}</td>
                  <td className="table-td text-slate-500">{r.jobStatus || '—'}</td>
                  <td className="table-td !text-right tabular-nums">{r.tools}</td>
                  <td className="table-td !text-right tabular-nums">{r.days}</td>
                  <td className="table-td !text-right tabular-nums font-medium">
                    {num(r.accrued)}
                    {r.unpricedDays > 0 && <span className="ml-1 text-amber-600 text-[11px]" title={`${r.unpricedDays} days with no day rate`}>+{r.unpricedDays}d unpriced</span>}
                  </td>
                  <td className="table-td text-slate-400">{r.currency || '—'}</td>
                  <td className="table-td font-mono text-slate-600">{r.poNumber || <span className="text-slate-300">—</span>}</td>
                  <td className="table-td font-mono text-slate-600">{r.invoiceNo || <span className="text-slate-300">—</span>}</td>
                  <td className="table-td !text-right tabular-nums">{r.invoiceAmount != null ? num(r.invoiceAmount) : '—'}</td>
                  <td className={`table-td !text-right tabular-nums ${diff != null && Math.abs(diff) > 0.005 ? 'text-amber-700' : 'text-slate-400'}`}>
                    {diff == null ? '—' : num(diff)}</td>
                  <td className="table-td pin-r"><span className={`badge ${stageClass[r.stage]}`}>{r.stage}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageCount={pageCount} setPage={setPage} from={from} to={to} total={total} noun="line" />

      {edit && <PaperworkModal row={edit} canEdit={canEdit} onClose={() => setEdit(null)}
        onSaved={() => { setEdit(null); showToast('Saved', 'success'); refetch() }} />}
    </div>
  )
}

function PaperworkModal({ row, canEdit, onClose, onSaved }: {
  row: Row; canEdit: boolean; onClose: () => void; onSaved: () => void
}) {
  const { showToast } = useToast()
  const [f, setF] = useState({
    poNumber: row.poNumber || '', poDate: day(row.poDate),
    invoiceNo: row.invoiceNo || '', invoiceDate: day(row.invoiceDate),
    invoiceAmount: row.invoiceAmount != null ? String(row.invoiceAmount) : '',
    currency: row.poCurrency || row.currency || 'USD', notes: row.notes || '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }))

  async function save() {
    if (f.invoiceNo.trim() && !f.poNumber.trim()) { showToast('Enter the PO number before the invoice', 'error'); return }
    setBusy(true)
    try {
      await api.put('/sub-accruals', { supplierName: row.supplierName, jobId: row.jobId, ...f })
      onSaved()
    } catch (e: any) { showToast(e?.message || 'Could not save', 'error') }
    finally { setBusy(false) }
  }

  const lab = 'block text-[11px] font-medium text-slate-500 mb-0.5'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-start justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">{row.supplierName} · <span className="font-mono">{row.jobId}</span></h3>
            <p className="text-[12px] text-slate-500 mt-0.5">
              {row.tools} tool{row.tools === 1 ? '' : 's'} · {row.days} days · accrued <b className="text-slate-800">{num(row.accrued)} {row.currency || ''}</b>
              {row.unpricedDays > 0 && <span className="text-amber-700"> (+{row.unpricedDays} days with no rate)</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3">
          <div><label className={lab}>PO number</label>
            <input className="field-input font-mono" disabled={!canEdit} value={f.poNumber} onChange={e => set('poNumber', e.target.value)} /></div>
          <div><label className={lab}>PO date</label>
            <input type="date" className="field-input" disabled={!canEdit} value={f.poDate} onChange={e => set('poDate', e.target.value)} /></div>
          <div><label className={lab}>Supplier invoice no</label>
            <input className="field-input font-mono" disabled={!canEdit} value={f.invoiceNo} onChange={e => set('invoiceNo', e.target.value)} /></div>
          <div><label className={lab}>Invoice date</label>
            <input type="date" className="field-input" disabled={!canEdit} value={f.invoiceDate} onChange={e => set('invoiceDate', e.target.value)} /></div>
          <div><label className={lab}>Invoice amount</label>
            <input inputMode="decimal" className="field-input font-mono text-right" disabled={!canEdit} value={f.invoiceAmount}
                   onChange={e => set('invoiceAmount', e.target.value.replace(/[^0-9.]/g, ''))} /></div>
          <div><label className={lab}>Currency</label>
            <select className="field-input" disabled={!canEdit} value={f.currency} onChange={e => set('currency', e.target.value)}>
              <ListOptions name="Currency" current={f.currency} />
            </select></div>
          <div className="col-span-2"><label className={lab}>Notes</label>
            <input className="field-input" disabled={!canEdit} value={f.notes} onChange={e => set('notes', e.target.value)} /></div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
          {!canEdit && <span className="text-[11px] text-slate-400 mr-auto">View only</span>}
          <button className="btn-mini" onClick={onClose}>Close</button>
          {canEdit && <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>}
        </div>
      </div>
    </div>
  )
}
