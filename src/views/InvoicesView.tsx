import React, { useState, useMemo } from 'react'
import { Plus, Search, RefreshCw, FileText, X, ChevronRight, Save, Trash2 } from 'lucide-react'
import { useRealtimeFetch } from '../hooks/useRealtimeFetch'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { api } from '../utils/api'
import { formatDate, formatCurrency, statusBadgeClass } from '../utils/format'
import { PageLoader, Spinner } from '../components/Spinner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Invoice {
  InvoiceID: string
  InvoiceNumber: string | null
  JobID: string | null
  InvoiceDate: string | null
  Currency: string | null
  TotalAmount: number | null
  NetAmount: number | null
  Status: string | null
  Client: string | null
  Rig: string | null
  Well: string | null
  Contract: string | null
  PONumber: string | null
  PeriodFrom: string | null
  PeriodTo: string | null
  Source: 'monthly' | 'job'  // 'monthly' = tbl_Invoices row; 'job' = derived from tbl_Jobs
}

interface InvoiceLine {
  LineID: number
  ToolDescription: string | null
  SerialNumber: string | null
  Quantity: number
  UnitRate: number | null
  LineAmount: number | null
  Notes: string | null
}

/**
 * The year an invoice belongs to. FiscalYear is null on every legacy
 * invoice — fall back to the InvoiceDate year instead.
 */
function invoiceYear(inv: Invoice): string {
  const d = String(inv.InvoiceDate ?? '')
  return /^\d{4}/.test(d) ? d.slice(0, 4) : ''
}

const day = (v: string | null | undefined) => (v ? v.split('T')[0] : '')

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateInvoiceModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (inv: { InvoiceID: string; InvoiceNumber: string }) => void
}) {
  const { success, error: toastErr } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    JobID:       '',
    PeriodFrom:  '',
    PeriodTo:    '',
    InvoiceDate: new Date().toISOString().split('T')[0],
    PONumber:    '',
    Currency:    'USD',
    Notes:       '',
  })

  const { data: jobs } = useFetch<{ JobID: string; Rig: string; Well: string; Client: string }[]>(
    '/jobs?status=Active'
  )

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.JobID) { toastErr('Job is required'); return }
    setSaving(true)
    try {
      const res = await api.post<{ InvoiceID: string; InvoiceNumber: string }>('/invoices', form)
      success(`Created ${res.InvoiceNumber}`)
      onCreated(res)
      setForm({
        JobID: '', PeriodFrom: '', PeriodTo: '',
        InvoiceDate: new Date().toISOString().split('T')[0],
        PONumber: '', Currency: 'USD', Notes: '',
      })
    } catch (err: any) {
      toastErr(err.message || 'Failed to create invoice')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileText size={16} className="text-brand-600" />
            New Monthly Invoice
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Job */}
          <div>
            <label className="label">Job *</label>
            <select className="input w-full" value={form.JobID}
                    onChange={e => set('JobID', e.target.value)} required>
              <option value="">— Select job —</option>
              {(jobs || []).map(j => (
                <option key={j.JobID} value={j.JobID}>
                  {j.JobID} — {j.Rig} / {j.Well}
                </option>
              ))}
            </select>
          </div>

          {/* Billing period */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Period From *</label>
              <input type="date" className="input w-full" value={form.PeriodFrom}
                     onChange={e => set('PeriodFrom', e.target.value)} required />
            </div>
            <div>
              <label className="label">Period To *</label>
              <input type="date" className="input w-full" value={form.PeriodTo}
                     onChange={e => set('PeriodTo', e.target.value)} required />
            </div>
          </div>

          {/* Invoice date and PO */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Invoice Date</label>
              <input type="date" className="input w-full" value={form.InvoiceDate}
                     onChange={e => set('InvoiceDate', e.target.value)} />
            </div>
            <div>
              <label className="label">PO / Taskorder</label>
              <input className="input w-full" placeholder="PO-12345" value={form.PONumber}
                     onChange={e => set('PONumber', e.target.value)} />
            </div>
          </div>

          {/* Currency and notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Currency</label>
              <select className="input w-full" value={form.Currency}
                      onChange={e => set('Currency', e.target.value)}>
                <option value="USD">USD</option>
                <option value="AED">AED</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div>
              <label className="label">Notes</label>
              <input className="input w-full" placeholder="Optional" value={form.Notes}
                     onChange={e => set('Notes', e.target.value)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <Spinner size="sm" /> : <Plus size={14} />}
              Create Invoice
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Invoice Detail Panel ─────────────────────────────────────────────────────

function InvoiceDetailPanel({
  inv,
  onClose,
  onRefresh,
}: {
  inv: Invoice
  onClose: () => void
  onRefresh: () => void
}) {
  const { hasRole } = useAuth()
  const { success, error: toastErr } = useToast()

  // Only monthly-source invoices (tbl_Invoices rows) can be edited here.
  // Job-derived rows are read-only — their data comes from tbl_Jobs columns
  // and any edits would need to go through the Job Detail screen.
  const isMonthly = inv.Source === 'monthly'
  const canEdit = isMonthly && hasRole('Admin', 'Billing', 'Finance')

  const [form, setForm] = useState({
    InvoiceDate: day(inv.InvoiceDate),
    PeriodFrom:  day(inv.PeriodFrom),
    PeriodTo:    day(inv.PeriodTo),
    PONumber:    inv.PONumber ?? '',
    Currency:    inv.Currency ?? 'USD',
    Status:      inv.Status ?? 'Draft',
    Notes:       '',
  })
  const [dirty,  setDirty]  = useState(false)
  const [saving, setSaving] = useState(false)

  const set = (k: string, v: string) => { setForm(f => ({ ...f, [k]: v })); setDirty(true) }

  // Lines — only available for monthly invoices (numeric tbl_Invoices id)
  const { data: lines, refetch: refetchLines } =
    useFetch<InvoiceLine[]>(isMonthly ? `/invoices/${inv.InvoiceID}/lines` : null)

  const handleSave = async () => {
    if (!isMonthly) return
    setSaving(true)
    try {
      await api.put(`/invoices/${inv.InvoiceID}`, form)
      setDirty(false)
      success('Invoice saved')
      onRefresh()
    } catch (err: any) {
      toastErr(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleAddLine = async () => {
    if (!isMonthly) return
    const desc = window.prompt('Tool description')
    if (!desc) return
    const rateStr = window.prompt('Day rate (USD)')
    const rate    = rateStr ? parseFloat(rateStr) : null
    const daysStr = window.prompt('Ops days')
    const days    = daysStr ? parseFloat(daysStr) : 1
    try {
      await api.post(`/invoices/${inv.InvoiceID}/lines`, {
        ToolDescription: desc,
        Quantity: days,
        UnitRate: rate,
        LineAmount: rate && days ? rate * days : null,
      })
      refetchLines()
      success('Line added')
    } catch (err: any) {
      toastErr(err.message || 'Failed to add line')
    }
  }

  const handleGenerate = async () => {
    if (!isMonthly) return
    if ((lines?.length ?? 0) > 0 &&
        !window.confirm('Replace the existing lines with lines generated from the utilization grid?')) return
    try {
      const res: any = await api.post(`/invoices/${inv.InvoiceID}/generate`, {})
      refetchLines()
      onRefresh()
      success(`${res.lines} line(s) generated` +
        (res.unpricedDays ? ` — ${res.unpricedDays} day(s) have no rate` : ''))
    } catch (err: any) {
      toastErr(err.message || 'Could not generate lines')
    }
  }

  const handleRemoveLine = async (lineId: number) => {
    if (!isMonthly) return
    try {
      await api.delete(`/invoices/${inv.InvoiceID}/lines/${lineId}`)
      refetchLines()
      success('Line removed')
    } catch (err: any) {
      toastErr(err.message || 'Failed to remove line')
    }
  }

  const linesTotal = (lines || []).reduce((s, l) => s + (l.LineAmount ?? 0), 0)

  return (
    <div className="screen">
      {/* Title */}
      <div className="flex items-center gap-2 px-2 h-[30px] bg-navy-head text-white shrink-0 rounded-t">
        <button onClick={onClose} className="hover:text-accent-400" title="Back">
          <X size={15} />
        </button>
        <span className="text-[13px] font-bold tracking-wide">INVOICE</span>
        {inv.InvoiceNumber && (
          <span className="ml-auto font-mono font-bold text-accent-400 text-[14px]">
            {inv.InvoiceNumber}
          </span>
        )}
        {isMonthly && (
          <span className="text-[10px] text-brand-300 ml-1">MONTHLY</span>
        )}
      </div>

      {/* Header fields */}
      <div className="field-row bg-white border-x border-b border-gray-300 px-2 py-1.5 shrink-0
                      grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_auto_1fr] xl:grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto_1fr]">
        <span className="field-label">Customer</span>
        <div className="field-value">{inv.Client || '—'}</div>

        <span className="field-label">Job</span>
        <div className="field-value font-mono">{inv.JobID || '—'}</div>

        <span className="field-label">Contract</span>
        <div className="field-value font-mono">{inv.Contract || '—'}</div>

        <span className="field-label">Rig / Well</span>
        <div className="field-value">{[inv.Rig, inv.Well].filter(Boolean).join(' / ') || '—'}</div>

        <span className="field-label">Invoice Date</span>
        <input type="date" className="field-input" value={form.InvoiceDate}
               disabled={!canEdit} onChange={e => set('InvoiceDate', e.target.value)} />

        <span className="field-label">Period From</span>
        <input type="date" className="field-input" value={form.PeriodFrom}
               disabled={!canEdit} onChange={e => set('PeriodFrom', e.target.value)} />

        <span className="field-label">Period To</span>
        <input type="date" className="field-input" value={form.PeriodTo}
               disabled={!canEdit} onChange={e => set('PeriodTo', e.target.value)} />

        <span className="field-label">PO / Taskorder</span>
        <input className="field-input" value={form.PONumber}
               disabled={!canEdit} onChange={e => set('PONumber', e.target.value)} />

        <span className="field-label">Currency</span>
        {canEdit ? (
          <select className="field-input" value={form.Currency}
                  onChange={e => set('Currency', e.target.value)}>
            <option value="USD">USD</option>
            <option value="AED">AED</option>
            <option value="EUR">EUR</option>
          </select>
        ) : (
          <div className="field-value">{inv.Currency || 'USD'}</div>
        )}

        <span className="field-label">Status</span>
        {canEdit ? (
          <select className="field-input" value={form.Status}
                  onChange={e => set('Status', e.target.value)}>
            {['Draft','Submitted','Under Review','Approved','Paid','Cancelled'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        ) : (
          <div className="field-value">
            <span className={`badge ${statusBadgeClass(inv.Status || '')}`}>{inv.Status || '—'}</span>
          </div>
        )}
      </div>

      {/* Lines table */}
      <div className="flex-1 min-h-0 flex flex-col bg-white border-x border-gray-300">
        <div className="flex items-center gap-2 px-2 h-[26px] bg-gray-100 border-b border-gray-300 shrink-0">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
            Lines ({lines?.length ?? 0})
          </span>
          {isMonthly && (
            <span className="text-[11px] text-gray-500 ml-2">
              Total: {formatCurrency(linesTotal)} {form.Currency}
            </span>
          )}
          {canEdit && (
            <div className="ml-auto flex items-center gap-1">
              <button className="btn-mini !py-px" onClick={handleGenerate}
                      title="Build the lines from the days marked on the Utilization grid for this job and period">
                <RefreshCw size={11} /> Generate from Utilization
              </button>
              <button className="btn-mini !py-px" onClick={handleAddLine}>
                <Plus size={11} /> Add Line
              </button>
            </div>
          )}
        </div>

        {!isMonthly ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-xs">
            <FileText size={24} className="mb-1.5 opacity-30" />
            <p>This invoice is recorded on the Job and has no editable lines here.</p>
            <p className="mt-0.5">Open the job to see its billing history.</p>
          </div>
        ) : !lines || lines.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <FileText size={28} className="mb-1.5 opacity-30" />
            <p className="text-xs">No lines on this invoice yet</p>
            {canEdit && (
              <button className="mt-2 text-brand-600 text-xs hover:text-brand-700"
                      onClick={handleAddLine}>
                + Add the first line
              </button>
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="table-th">#</th>
                  <th className="table-th">Serial / Ref</th>
                  <th className="table-th">Description</th>
                  <th className="table-th !text-right">Days</th>
                  <th className="table-th !text-right">Rate</th>
                  <th className="table-th !text-right">Amount</th>
                  <th className="table-th">Remarks</th>
                  {canEdit && <th className="table-th w-8"></th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={l.LineID} className="border-b border-gray-100 hover:bg-brand-50/40">
                    <td className="table-td text-gray-400">{i + 1}</td>
                    <td className="table-td font-mono text-gray-500">{l.SerialNumber || '—'}</td>
                    <td className="table-td text-gray-600 max-w-[280px] truncate"
                        title={l.ToolDescription || ''}>{l.ToolDescription || '—'}</td>
                    <td className="table-td text-right">{l.Quantity}</td>
                    <td className="table-td text-right">{l.UnitRate != null ? formatCurrency(l.UnitRate) : '—'}</td>
                    <td className="table-td text-right font-medium">
                      {l.LineAmount != null ? formatCurrency(l.LineAmount) : '—'}
                    </td>
                    <td className="table-td text-gray-500 max-w-[160px] truncate"
                        title={l.Notes || ''}>{l.Notes || '—'}</td>
                    {canEdit && (
                      <td className="table-td">
                        <button onClick={() => handleRemoveLine(l.LineID)}
                                className="text-gray-300 hover:text-red-500 transition-colors"
                                title="Remove line">
                          <Trash2 size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="field-row bg-gray-50 border border-gray-300 rounded-b px-2 py-1.5 shrink-0
                      grid-cols-[auto_1fr] lg:grid-cols-[auto_2fr_auto_1fr]">
        <span className="field-label">Notes</span>
        <input className="field-input" value={form.Notes} disabled={!canEdit}
               onChange={e => set('Notes', e.target.value)} placeholder="Invoice notes" />

        <span className="field-label">Amount</span>
        <div className="flex items-center gap-1.5">
          <div className="field-value font-semibold text-gray-900">
            {isMonthly
              ? formatCurrency(linesTotal)
              : formatCurrency(inv.TotalAmount ?? 0)}
            {' '}{form.Currency}
          </div>
          {canEdit && (
            <button className="btn-accent shrink-0 ml-auto" onClick={handleSave}
                    disabled={saving || !dirty}
                    title={dirty ? 'Save invoice' : 'No unsaved changes'}>
              {saving ? <Spinner size="sm" /> : <Save size={12} />}
              {dirty ? 'Save' : 'Saved'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function InvoicesView() {
  const { hasRole } = useAuth()
  const [search,     setSearch]     = useState('')
  const [status,     setStatus]     = useState('All')
  const [year,       setYear]       = useState('All')
  const [showCreate, setShowCreate] = useState(false)
  const [selected,   setSelected]   = useState<Invoice | null>(null)

  const { data: invoices, isLoading, error, refetch } = useRealtimeFetch<Invoice[]>('/invoices', 30000)

  const filtered = useMemo(() => {
    if (!invoices) return []
    return invoices.filter(inv => {
      if (status !== 'All' && inv.Status !== status) return false
      if (year   !== 'All' && invoiceYear(inv) !== year) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          (inv.InvoiceNumber || '').toLowerCase().includes(q) ||
          (inv.JobID         || '').toLowerCase().includes(q) ||
          (inv.Client        || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [invoices, status, year, search])

  const totalAmount = filtered.reduce((sum, inv) => sum + (inv.TotalAmount || 0), 0)

  // Build filter dropdowns from actual data in the register.
  const yearOptions = useMemo(() => {
    const ys = new Set((invoices || []).map(invoiceYear).filter(Boolean))
    return ['All', ...Array.from(ys).sort().reverse()]
  }, [invoices])

  const statusOptions = useMemo(() => {
    const ss = new Set((invoices || []).map(i => String(i.Status || '').trim()).filter(Boolean))
    return ['All', ...Array.from(ss).sort()]
  }, [invoices])

  const topStatuses = useMemo(() => {
    const counts = new Map<string, number>()
    filtered.forEach(i => {
      const s = String(i.Status || '').trim()
      if (s) counts.set(s, (counts.get(s) || 0) + 1)
    })
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2)
  }, [filtered])

  if (isLoading) return <PageLoader />

  if (selected) {
    return (
      <InvoiceDetailPanel
        key={selected.InvoiceID}
        inv={selected}
        onClose={() => setSelected(null)}
        onRefresh={refetch}
      />
    )
  }

  return (
    <>
      <CreateInvoiceModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); refetch() }}
      />

      <div className="space-y-4">
        {/* Summary tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Shown',  value: filtered.length },
            { label: 'Total Amount', value: formatCurrency(totalAmount) },
            ...topStatuses.map(([label, n]) => ({ label, value: n })),
          ].map(card => (
            <div key={card.label} className="card p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{card.label}</p>
              <p className="text-xl font-semibold text-gray-900 mt-1">{String(card.value)}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Search invoice #, job, client…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" value={status} onChange={e => setStatus(e.target.value)}>
            {statusOptions.map(s =>
              <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>
            )}
          </select>
          <select className="input w-auto" value={year} onChange={e => setYear(e.target.value)}>
            {yearOptions.map(y => <option key={y} value={y}>{y === 'All' ? 'All Years' : y}</option>)}
          </select>
          <button onClick={refetch} className="btn-ghost"><RefreshCw size={15} /></button>
          {hasRole('Admin', 'Billing', 'Finance') && (
            <button className="btn-primary ml-auto" onClick={() => setShowCreate(true)}>
              <Plus size={15} /> New Invoice
            </button>
          )}
        </div>

        {error && <div className="card p-3 text-red-600 text-sm">{error}</div>}

        {/* Register */}
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Invoice #</th>
                <th className="table-th">Job ID</th>
                <th className="table-th">Client</th>
                <th className="table-th">Invoice Date</th>
                <th className="table-th">Period</th>
                <th className="table-th">PO</th>
                <th className="table-th">Currency</th>
                <th className="table-th text-right">Amount</th>
                <th className="table-th">Status</th>
                <th className="table-th w-6"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="table-td text-center py-12">
                    <FileText size={32} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-400">No invoices found</p>
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => (
                  <tr key={`${inv.Source}-${inv.InvoiceID}`}
                      className="table-tr whitespace-nowrap cursor-pointer"
                      onClick={() => setSelected(inv)}>
                    <td className="table-td font-medium text-brand-600">
                      {inv.InvoiceNumber || '—'}
                      {inv.Source === 'monthly' && (
                        <span className="ml-1 text-[10px] text-brand-400">●</span>
                      )}
                    </td>
                    <td className="table-td font-mono">{inv.JobID || '—'}</td>
                    <td className="table-td text-gray-500 max-w-[180px] truncate"
                        title={inv.Client || ''}>{inv.Client || '—'}</td>
                    <td className="table-td text-gray-500">{formatDate(inv.InvoiceDate) || '—'}</td>
                    <td className="table-td text-gray-500 text-xs">
                      {inv.PeriodFrom
                        ? `${formatDate(inv.PeriodFrom)} → ${formatDate(inv.PeriodTo)}`
                        : '—'}
                    </td>
                    <td className="table-td text-gray-500">{inv.PONumber || '—'}</td>
                    <td className="table-td text-gray-400 text-xs">{inv.Currency || 'USD'}</td>
                    <td className="table-td text-right font-medium">
                      {formatCurrency(inv.TotalAmount ?? 0)}
                    </td>
                    <td className="table-td">
                      {inv.Status
                        ? <span className={`badge ${statusBadgeClass(inv.Status)}`}>{inv.Status}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="table-td"><ChevronRight size={12} className="text-gray-300" /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
