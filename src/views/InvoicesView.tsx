import React, { useState, useMemo } from 'react'
import { Plus, Search, RefreshCw, FileText, X, Save, Trash2 } from 'lucide-react'
import { useRealtimeFetch } from '../hooks/useRealtimeFetch'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { api } from '../utils/api'
import { formatDate, formatCurrency, billingStatusClass } from '../utils/format'
import { PageLoader, Spinner } from '../components/Spinner'
import { ListOptions } from '../components/ListOptions'
import { usePagedRows, Pager } from '../components/usePagedRows'
import { AdnocTaxInvoice } from '../components/AdnocTaxInvoice'
import { JobPicker } from '../components/JobPicker'
import { HistoryPanel } from '../components/HistoryPanel'
import { AttachmentsPanel } from '../components/AttachmentsPanel'

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
  InvoiceType?: 'Monthly' | 'Job' | 'Legacy' | string | null
  LegalInvoiceNumber?: string | null
  LegalInvoiceDate?: string | null
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
  // Monthly: one invoice per billing period. Job: one invoice for the whole
  // job, every marked day (decision 2). The job decides: its InvoicingType is
  // set when the job is created, so it is not asked again here.
  const [kind, setKind] = useState<'Monthly' | 'Job'>('Job')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const pickJob = (id: string, j?: { InvoicingType?: string | null; Currency?: string | null; PONumber?: string | null }) => {
    set('JobID', id)
    if (j) {
      setKind(/month/i.test(j.InvoicingType || '') ? 'Monthly' : 'Job')
      if (j.Currency) set('Currency', j.Currency)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.JobID) { toastErr('Job is required'); return }
    setSaving(true)
    try {
      const res = kind === 'Job'
        ? await api.post<{ InvoiceID: string; InvoiceNumber: string; lines: number; unpricedDays: number; warning?: string }>(
            '/invoices/from-job', { JobID: form.JobID, InvoiceDate: form.InvoiceDate, PONumber: form.PONumber, Currency: form.Currency, Notes: form.Notes })
        : await api.post<{ InvoiceID: string; InvoiceNumber: string }>('/invoices', form)
      const r: any = res
      success(`Created ${res.InvoiceNumber}` + (kind === 'Job'
        ? ` — ${r.lines} line(s)` + (r.unpricedDays ? `, ${r.unpricedDays} day(s) have no rate` : '') + (r.warning ? ` (${r.warning})` : '')
        : ''))
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
            New Invoice
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Job */}
          <div>
            <label className="label">Job *</label>
            <JobPicker value={form.JobID} onChange={pickJob} scope="all" inputClassName="input w-full pr-9" autoFocus />
          </div>

          {/* Kind — read from the job */}
          {form.JobID && (
            <div className="text-sm text-gray-700">
              {kind === 'Monthly'
                ? <>Monthly job — <span className="text-gray-500">one invoice per billing period</span></>
                : <>Per-job billing — <span className="text-gray-500">one invoice for the whole job, all marked days</span></>}
            </div>
          )}

          {/* Billing period (monthly only) */}
          {kind === 'Monthly' && (
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
          )}
          {kind === 'Job' && form.JobID && (
            <p className="text-xs text-gray-500">
              Lines are built from every day marked on the job's utilization grid, priced from the contract.
              A job that already has a legal invoice number, or already has a job invoice, is refused.
            </p>
          )}

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
                <ListOptions name="Currency" current={form.Currency} />
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

// ─── Billing status ──────────────────────────────────────────────────────────

/**
 * The billing team's status for a job: chosen from the BillingStatus list
 * (Settings → Lists) and saved the moment it changes. Drilling Jobs shows it.
 */
function BillingStatusSelect({
  value, id, disabled, onSaved, compact,
}: {
  value: string | null
  id: string
  disabled?: boolean
  onSaved: () => void
  compact?: boolean
}) {
  const { success, error: toastErr } = useToast()
  const [saving, setSaving] = useState(false)

  const change = async (next: string) => {
    if (!next || next === value) return
    setSaving(true)
    try {
      await api.put(`/invoices/${encodeURIComponent(id)}`, { Status: next })
      success(`Status set to ${next}`)
      onSaved()
    } catch (err: any) {
      toastErr(err.message || 'Status was not saved')
    } finally {
      setSaving(false)
    }
  }

  if (disabled) {
    return (
      <span className={`badge ${billingStatusClass(value)}`}>{value || '—'}</span>
    )
  }
  return (
    <select
      className={compact ? 'field-input !h-[24px] !py-0 w-full min-w-[190px]' : 'field-input'}
      value={value || ''}
      disabled={saving}
      onClick={e => e.stopPropagation()}
      onChange={e => change(e.target.value)}
    >
      <ListOptions name="BillingStatus" current={value} blank blankLabel="— set status —" />
    </select>
  )
}

/** Where a job stands in billing, read from the dates the job already holds. */
function BillingMilestones({ jobId }: { jobId: string }) {
  const { data: j } = useFetch<any>(`/jobs/${encodeURIComponent(jobId)}`)
  if (!j) return null
  const rows: [string, string | null][] = [
    ['Docs signed',        j.DocsSignedDate],
    ['To billing',         j.SubmittedToBillingDate],
    ['Draft invoiced',     j.DraftInvoicedDate],
    ['SES submitted',      j.SesSubmittedDate],
    ['Final invoiced',     j.FinalInvoicedDate],
  ]
  const nums: [string, string | null][] = [
    ['Draft invoice no',   j.DraftInvoiceNumber],
    ['SES no',             j.SesNumber],
    ['Legal invoice no',   j.LegalInvoiceNumber],
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-px bg-slate-200 border border-slate-200 rounded">
      {[...rows.map(([l, v]) => [l, v ? formatDate(v) : null] as [string, string | null]),
        ...nums].map(([label, v]) => (
        <div key={label} className="bg-white px-3 py-2">
          <div className="text-[11px] text-slate-500">{label}</div>
          <div className={`text-[13px] mt-0.5 ${v ? 'text-slate-900 font-medium' : 'text-slate-300'}`}>
            {v || '—'}
          </div>
        </div>
      ))}
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
  // isMonthly = an app invoice (a tbl_Invoices row), Monthly or Job type.
  // A legacy row is derived from the job's own milestone fields.
  const isMonthly = inv.Source === 'monthly'
  const isJobType = isMonthly && String(inv.InvoiceType || '').toLowerCase() === 'job'
  const hasLegal  = !!String(inv.LegalInvoiceNumber || '').trim()
  // Once a legal number is on an app invoice its figures are final.
  const canEdit = isMonthly && !hasLegal && hasRole('Admin', 'Billing', 'Finance')
  // Status is the billing team's to set, on any invoice row - monthly or per-job.
  const canSetStatus = hasRole('Admin', 'Billing', 'Finance')
  const [legal, setLegal] = useState({ no: inv.LegalInvoiceNumber ?? '', date: day(inv.LegalInvoiceDate) })
  const [savingLegal, setSavingLegal] = useState(false)
  const [generating, setGenerating] = useState(false)

  const [form, setForm] = useState({
    InvoiceDate: day(inv.InvoiceDate),
    PeriodFrom:  day(inv.PeriodFrom),
    PeriodTo:    day(inv.PeriodTo),
    PONumber:    inv.PONumber ?? '',
    Currency:    inv.Currency ?? 'USD',
    Notes:       '',
  })
  const [dirty,  setDirty]  = useState(false)
  const [showTax, setShowTax] = useState(false)
  const [showHist, setShowHist] = useState(false)
  const [showAtt, setShowAtt] = useState(false)
  const isOnshore = /adnoc|onshore/i.test(inv.Client || '')
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

  // A manual line (something the utilization grid does not carry - a redress
  // charge, a run charge): typed into a row at the top of the lines table.
  const [newLine, setNewLine] = useState<{ desc: string; days: string; rate: string } | null>(null)
  const [addingLine, setAddingLine] = useState(false)
  const handleAddLine = () => { if (isMonthly) setNewLine({ desc: '', days: '1', rate: '' }) }
  const saveNewLine = async () => {
    if (!newLine || !newLine.desc.trim()) { toastErr('Describe the line'); return }
    const days = Number(newLine.days) || 1, rate = newLine.rate === '' ? null : Number(newLine.rate)
    if (rate != null && !Number.isFinite(rate)) { toastErr('Rate must be a number'); return }
    setAddingLine(true)
    try {
      await api.post(`/invoices/${inv.InvoiceID}/lines`, {
        ToolDescription: newLine.desc.trim(), Quantity: days, UnitRate: rate, LineAmount: rate != null ? rate * days : null,
      })
      refetchLines(); onRefresh(); setNewLine(null); success('Line added')
    } catch (err: any) {
      toastErr(err.message || 'Failed to add line')
    } finally { setAddingLine(false) }
  }
  const newLineRow = newLine && (
    <tr className="bg-amber-50/60">
      <td className="table-td text-gray-400">+</td>
      <td className="table-td text-gray-400">manual</td>
      <td className="table-td"><input autoFocus className="field-input !h-6 !py-0 w-full" placeholder="Description (e.g. redress charge)" value={newLine.desc}
            onChange={e => setNewLine(n => n && ({ ...n, desc: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') saveNewLine(); if (e.key === 'Escape') setNewLine(null) }} /></td>
      <td className="table-td"><input type="number" className="field-input !h-6 !py-0 w-16 text-right" value={newLine.days} onChange={e => setNewLine(n => n && ({ ...n, days: e.target.value }))} /></td>
      <td className="table-td"><input type="number" step="0.01" className="field-input !h-6 !py-0 w-24 text-right" placeholder="rate" value={newLine.rate} onChange={e => setNewLine(n => n && ({ ...n, rate: e.target.value }))} /></td>
      <td className="table-td text-right font-mono">{newLine.rate !== '' ? formatCurrency((Number(newLine.rate) || 0) * (Number(newLine.days) || 1)) : '—'}</td>
      <td className="table-td" colSpan={2}>
        <button className="btn-mini !py-px" onClick={saveNewLine} disabled={addingLine}>{addingLine ? <Spinner size="sm" /> : <Save size={11} />} Add</button>
        <button className="btn-mini !py-px ml-1" onClick={() => setNewLine(null)}><X size={11} /></button>
      </td>
    </tr>
  )

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

  // Legacy row without a legal number: the job is billed from the app from
  // here on (decision 2). One invoice for the whole job.
  const handleGenerateJobInvoice = async () => {
    if (!inv.JobID) return
    if (!window.confirm(`Generate the invoice for ${inv.JobID} from its utilization? Every marked day on the job is priced from the contract.`)) return
    setGenerating(true)
    try {
      const res: any = await api.post('/invoices/from-job', { JobID: inv.JobID })
      success(`${res.InvoiceNumber} created — ${res.lines} line(s)` +
        (res.unpricedDays ? `, ${res.unpricedDays} day(s) have no rate` : '') +
        (res.warning ? ` (${res.warning})` : ''))
      onRefresh()
      onClose()
    } catch (err: any) {
      toastErr(err.message || 'Could not generate the invoice')
    } finally {
      setGenerating(false)
    }
  }

  const handleSaveLegal = async () => {
    if (!legal.no.trim()) { toastErr('Enter the legal invoice number'); return }
    if (!window.confirm(`Record legal invoice ${legal.no.trim()} on ${inv.InvoiceNumber}? The invoice and the job's final figures are then fixed.`)) return
    setSavingLegal(true)
    try {
      await api.put(`/invoices/${inv.InvoiceID}`, { LegalInvoiceNumber: legal.no.trim(), LegalInvoiceDate: legal.date || null })
      success(`Legal invoice ${legal.no.trim()} recorded`)
      onRefresh()
    } catch (err: any) {
      toastErr(err.message || 'Could not save the legal number')
    } finally {
      setSavingLegal(false)
    }
  }

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
          <span className="text-[10px] text-brand-300 ml-1">{isJobType ? 'JOB' : 'MONTHLY'}</span>
        )}
        {hasLegal && (
          <span className="text-[10px] text-emerald-300 ml-1" title="Legal invoice recorded — figures are final">
            LEGAL {inv.LegalInvoiceNumber}
          </span>
        )}
        <button className="btn-mini !py-px ml-2" onClick={() => setShowAtt(true)} title="SES, client approval, signed documents">Attachments</button>
        <button className="btn-mini !py-px ml-1" onClick={() => setShowHist(true)} title="Who changed this and when">History</button>
        {isMonthly && isOnshore && (
          <button className="btn-mini !py-px ml-2" onClick={() => setShowTax(true)}
                  title="ADNOC Onshore final tax invoice (print / PDF)">
            <FileText size={11} /> Tax Invoice
          </button>
        )}
      </div>
      {showTax && <AdnocTaxInvoice inv={inv} onClose={() => setShowTax(false)} />}
      {showAtt && <AttachmentsPanel entity={isMonthly ? 'invoice' : 'job'} id={isMonthly ? String(inv.InvoiceID) : String(inv.JobID)} title={inv.InvoiceNumber || inv.JobID || ''} onClose={() => setShowAtt(false)} />}
      {showHist && <HistoryPanel entity={isMonthly ? 'invoice' : 'job'} id={isMonthly ? String(inv.InvoiceID) : String(inv.JobID)} title={inv.InvoiceNumber || inv.JobID || ''} onClose={() => setShowHist(false)} />}

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
            <ListOptions name="Currency" current={form.Currency} />
          </select>
        ) : (
          <div className="field-value">{inv.Currency || 'USD'}</div>
        )}

        <span className="field-label">Billing status</span>
        {/* Once a legal invoice exists the job is finally invoiced; the status is no longer a choice. */}
        <BillingStatusSelect value={inv.Status} id={inv.InvoiceID} disabled={!canSetStatus || hasLegal}
                             onSaved={onRefresh} />

        {isMonthly && (
          <>
            <span className="field-label">Legal invoice no</span>
            {hasLegal || !canSetStatus ? (
              <div className="field-value font-mono">{inv.LegalInvoiceNumber || '—'}</div>
            ) : (
              <input className="field-input font-mono" value={legal.no} placeholder="from the ERP"
                     onChange={e => setLegal(l => ({ ...l, no: e.target.value }))} />
            )}
            <span className="field-label">Legal invoice date</span>
            {hasLegal || !canSetStatus ? (
              <div className="field-value">{formatDate(inv.LegalInvoiceDate) || '—'}</div>
            ) : (
              <div className="flex items-center gap-1.5">
                <input type="date" className="field-input" value={legal.date}
                       onChange={e => setLegal(l => ({ ...l, date: e.target.value }))} />
                <button className="btn-mini shrink-0" onClick={handleSaveLegal} disabled={savingLegal || !legal.no.trim()}
                        title="Record the legal invoice number; the invoice and job figures become final">
                  {savingLegal ? <Spinner size="sm" /> : <Save size={11} />} Record
                </button>
              </div>
            )}
          </>
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
          <div className="flex-1 min-h-0 overflow-auto p-4 space-y-3">
            {hasLegal ? (
              <p className="text-[12px] text-slate-500">
                Finally invoiced under legal invoice <b>{inv.LegalInvoiceNumber}</b>. These figures are final and are
                not regenerated.
              </p>
            ) : (
              <div className="flex items-start gap-3 rounded border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[12px] text-amber-900 flex-1">
                  No legal invoice yet. Generate this job's invoice from the app: every day marked on the
                  utilization grid, priced from the contract, one invoice for the whole job. The job's
                  draft milestone fills from it; record the legal number on the invoice when the ERP issues it.
                </p>
                {canSetStatus && (
                  <button className="btn-primary shrink-0" onClick={handleGenerateJobInvoice} disabled={generating}>
                    {generating ? <Spinner size="sm" /> : <RefreshCw size={12} />} Generate job invoice
                  </button>
                )}
              </div>
            )}
            <BillingMilestones jobId={inv.JobID || ''} />
          </div>
        ) : (!lines || lines.length === 0) && !newLine ? (
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
                {newLineRow}
                {(lines || []).map((l, i) => (
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

const rowKey = (i: Invoice) => `${i.Source}-${i.InvoiceID}`

export function InvoicesView() {
  const { hasRole } = useAuth()
  const [search,     setSearch]     = useState('')
  const [status,     setStatus]     = useState('All')
  const [year,       setYear]       = useState('All')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const { data: invoices, isLoading, error, refetch } = useRealtimeFetch<Invoice[]>('/invoices', 30000)

  const filtered = useMemo(() => {
    if (!invoices) return []
    const q = search.trim().toLowerCase()
    return invoices.filter(inv => {
      if (status !== 'All' && inv.Status !== status) return false
      if (year   !== 'All' && invoiceYear(inv) !== year) return false
      if (!q) return true
      return (
        (inv.InvoiceNumber || '').toLowerCase().includes(q) ||
        (inv.JobID         || '').toLowerCase().includes(q) ||
        (inv.Client        || '').toLowerCase().includes(q) ||
        (inv.PONumber      || '').toLowerCase().includes(q)
      )
    })
  }, [invoices, status, year, search])

  // Totals per currency - adding USD to AED gives a number that means nothing.
  const totals = useMemo(() => {
    const m = new Map<string, number>()
    filtered.forEach(i => {
      const c = i.Currency || 'USD'
      m.set(c, (m.get(c) || 0) + (i.TotalAmount || 0))
    })
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [filtered])

  const statusCounts = useMemo(() => {
    const m = new Map<string, number>()
    ;(invoices || []).forEach(i => {
      const s = String(i.Status || '').trim()
      if (s) m.set(s, (m.get(s) || 0) + 1)
    })
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [invoices])

  const yearOptions = useMemo(() => {
    const ys = new Set((invoices || []).map(invoiceYear).filter(Boolean))
    return ['All', ...Array.from(ys).sort().reverse()]
  }, [invoices])

  const { scrollRef, visible, page, pageCount, setPage, from, to, total } = usePagedRows(filtered)

  if (isLoading) return <PageLoader />

  const selected = selectedKey ? (invoices || []).find(i => rowKey(i) === selectedKey) : null
  if (selected) {
    return (
      <InvoiceDetailPanel
        key={rowKey(selected)}
        inv={selected}
        onClose={() => setSelectedKey(null)}
        onRefresh={refetch}
      />
    )
  }

  const canSetStatus = hasRole('Admin', 'Billing', 'Finance')

  return (
    <>
      <CreateInvoiceModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); refetch() }}
      />

      <div className="screen gap-1.5">
        {/* Toolbar */}
        <div className="screen-bar">
          <div className="relative w-72">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="field-input !pl-7" placeholder="Search invoice, job, client, PO…"
                   value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="field-input w-auto" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="All">All statuses</option>
            {statusCounts.map(([s, n]) => <option key={s} value={s}>{s} ({n.toLocaleString()})</option>)}
          </select>
          <select className="field-input w-auto" value={year} onChange={e => setYear(e.target.value)}>
            {yearOptions.map(y => <option key={y} value={y}>{y === 'All' ? 'All years' : y}</option>)}
          </select>
          <button onClick={refetch} className="btn-mini" title="Refresh"><RefreshCw size={12} /></button>

          <div className="flex items-center gap-3 text-[12px] text-slate-600 ml-2">
            <span><strong className="text-slate-900">{filtered.length.toLocaleString()}</strong> invoices</span>
            {totals.map(([c, v]) => (
              <span key={c}><strong className="text-slate-900 tabular-nums">{formatCurrency(v)}</strong> {c}</span>
            ))}
          </div>

          {hasRole('Admin', 'Billing', 'Finance') && (
            <button className="btn-accent ml-auto" onClick={() => setShowCreate(true)}>
              <Plus size={12} /> New Invoice
            </button>
          )}
        </div>

        {error && <div className="card p-2 text-red-600 text-xs shrink-0">{error}</div>}

        {/* Register: scrolls inside its own box, header stays put, a page at a time */}
        <div ref={scrollRef}
             className="flex-1 min-h-0 overflow-auto bg-white border border-gray-300 rounded-t">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="table-th pin-l">Invoice</th>
                <th className="table-th">Job</th>
                <th className="table-th">Client</th>
                <th className="table-th">Date</th>
                <th className="table-th">Period</th>
                <th className="table-th">PO</th>
                <th className="table-th">Ccy</th>
                <th className="table-th !text-right">Amount</th>
                <th className="table-th pin-r">Billing status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="table-td text-center py-10 text-gray-400">
                    {search || status !== 'All' || year !== 'All'
                      ? 'No invoices match these filters.'
                      : 'No invoices yet.'}
                  </td>
                </tr>
              ) : visible.map(inv => (
                <tr key={rowKey(inv)} className="table-tr whitespace-nowrap cursor-pointer"
                    onClick={() => setSelectedKey(rowKey(inv))}>
                  <td className="table-td pin-l font-medium text-brand-600">
                    {inv.InvoiceNumber || '—'}
                    {inv.Source === 'monthly' && (
                      <span className="ml-1.5 text-[10px] text-slate-400 font-normal">
                        {String(inv.InvoiceType || '').toLowerCase() === 'job' ? 'job' : 'monthly'}
                      </span>
                    )}
                    {inv.LegalInvoiceNumber && inv.Source === 'monthly' && (
                      <span className="ml-1 text-[10px] text-emerald-600 font-normal" title="Legal invoice recorded">
                        {inv.LegalInvoiceNumber}
                      </span>
                    )}
                  </td>
                  <td className="table-td font-mono text-slate-700">{inv.JobID || '—'}</td>
                  <td className="table-td max-w-[220px] truncate" title={inv.Client || ''}>{inv.Client || '—'}</td>
                  <td className="table-td text-slate-500">{formatDate(inv.InvoiceDate) || '—'}</td>
                  <td className="table-td text-slate-500">
                    {inv.PeriodFrom ? `${formatDate(inv.PeriodFrom)} – ${formatDate(inv.PeriodTo)}` : '—'}
                  </td>
                  <td className="table-td font-mono text-slate-500">{inv.PONumber || '—'}</td>
                  <td className="table-td text-slate-400">{inv.Currency || 'USD'}</td>
                  <td className="table-td !text-right font-medium tabular-nums">
                    {formatCurrency(inv.TotalAmount ?? 0)}
                  </td>
                  <td className="table-td pin-r">
                    {canSetStatus && !inv.LegalInvoiceNumber
                      ? <BillingStatusSelect compact value={inv.Status} id={inv.InvoiceID} onSaved={refetch} />
                      : <span className={`badge ${billingStatusClass(inv.Status)}`}
                              title={inv.LegalInvoiceNumber ? `Legal invoice ${inv.LegalInvoiceNumber} — final` : ''}>
                          {inv.Status || '—'}
                        </span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pager page={page} pageCount={pageCount} setPage={setPage}
               from={from} to={to} total={total} noun="invoice" />
      </div>
    </>
  )
}
