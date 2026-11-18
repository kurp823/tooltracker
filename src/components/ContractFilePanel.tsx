import React, { useMemo, useState } from 'react'
import { X, Save, Plus, ClipboardPaste, RefreshCw, Pencil, Check, Ban, RotateCcw } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './Toast'
import { api } from '../utils/api'
import { Spinner } from './Spinner'
import { ListOptions } from './ListOptions'
import { formatDate } from '../utils/format'
import { HistoryPanel } from './HistoryPanel'

interface ContractFull {
  ContractID: string; ContractNumber: string | null; ClientName: string | null; PONumber: string | null
  Currency: string | null; StartDate: string | null; EndDate: string | null; Status: string | null; Description: string | null
  ContractValue: number | null; InvoicedToDate: number | null; PBGNumber: string | null; PBGValue: number | null
  PBGIssueDate: string | null; PBGExpiryDate: string | null; PrimeEndDate: string | null; ExtensionRef: string | null
  rateCount: number; jobCount: number; openJobs: number; scopes: string[]
}
interface Rate {
  RateID: number; ContractCode: string; ContractRef: string | null; Category: string; EMDADShortDesc: string | null
  Size: string | null; HoleSection: string | null; OpsRate: number | null; StandbyRate: number | null; RunCharges: number | null
  Redress: number | null; MonthlyCharges: number | null; Currency: string | null; Notes: string | null; ActiveFlag: boolean | number
}

const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '')
const n2 = (v: number | null | undefined) => v == null ? '' : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const RATE_FIELDS = ['Category', 'EMDADShortDesc', 'Size', 'HoleSection', 'OpsRate', 'StandbyRate', 'Redress', 'MonthlyCharges', 'RunCharges', 'Currency', 'ContractCode', 'Notes'] as const
type RateDraft = Record<(typeof RATE_FIELDS)[number], string>
const blankDraft = (code: string, cur: string): RateDraft => ({
  Category: '', EMDADShortDesc: '', Size: '', HoleSection: '', OpsRate: '', StandbyRate: '', Redress: '', MonthlyCharges: '',
  RunCharges: '', Currency: cur, ContractCode: code, Notes: '',
})
const draftOf = (r: Rate): RateDraft => ({
  Category: r.Category || '', EMDADShortDesc: r.EMDADShortDesc || '', Size: r.Size || '', HoleSection: r.HoleSection || '',
  OpsRate: r.OpsRate == null ? '' : String(r.OpsRate), StandbyRate: r.StandbyRate == null ? '' : String(r.StandbyRate),
  Redress: r.Redress == null ? '' : String(r.Redress), MonthlyCharges: r.MonthlyCharges == null ? '' : String(r.MonthlyCharges),
  RunCharges: r.RunCharges == null ? '' : String(r.RunCharges), Currency: r.Currency || '', ContractCode: r.ContractCode || '', Notes: r.Notes || '',
})

/**
 * The contract file: header (client, validity, value, PBG) and the rate
 * schedule that prices every job on it. Admin and Finance edit the header;
 * Admin, Finance and Billing keep the rates. Rates are never deleted - a
 * superseded rate is deactivated so history still prices the way it was.
 */
export function ContractFilePanel({ contractId, onClose, onChanged }: { contractId: string; onClose: () => void; onChanged: () => void }) {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canHead = hasRole('Admin', 'Finance')
  const canRate = hasRole('Admin', 'Finance', 'Billing')
  const { data: c, refetch: refetchC } = useFetch<ContractFull>(`/contracts/${encodeURIComponent(contractId)}`)
  const { data: rates, refetch: refetchR, isLoading: ratesLoading } = useFetch<Rate[]>(`/contracts/${encodeURIComponent(contractId)}/rates`)

  const [head, setHead] = useState<Record<string, string> | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [q, setQ] = useState('')
  const [editId, setEditId] = useState<number | 'new' | null>(null)
  const [draft, setDraft] = useState<RateDraft | null>(null)
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [showHist, setShowHist] = useState(false)

  React.useEffect(() => {
    if (c && !head) setHead({
      ClientName: c.ClientName || '', PONumber: c.PONumber || '', Currency: c.Currency || 'USD',
      StartDate: day(c.StartDate), EndDate: day(c.EndDate), Status: c.Status || 'Active', Description: c.Description || '',
      ContractValue: c.ContractValue == null ? '' : String(c.ContractValue), InvoicedToDate: c.InvoicedToDate == null ? '' : String(c.InvoicedToDate),
      PBGNumber: c.PBGNumber || '', PBGValue: c.PBGValue == null ? '' : String(c.PBGValue),
      PBGIssueDate: day(c.PBGIssueDate), PBGExpiryDate: day(c.PBGExpiryDate),
      PrimeEndDate: day(c.PrimeEndDate), ExtensionRef: c.ExtensionRef || '',
    })
  }, [c, head])

  const setH = (k: string, v: string) => { setHead(h => ({ ...(h || {}), [k]: v })); setDirty(true) }
  const saveHead = async () => {
    if (!head) return
    setSaving(true)
    try {
      await api.put(`/contracts/${encodeURIComponent(contractId)}`, head)
      setDirty(false); showToast('Contract saved', 'success'); refetchC(); onChanged()
    } catch (e: any) { showToast(e.message || 'Save failed', 'error') }
    finally { setSaving(false) }
  }

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (rates || []).filter(r => (showInactive || r.ActiveFlag) &&
      (!term || [r.Category, r.EMDADShortDesc, r.Size, r.HoleSection, r.ContractCode].some(v => (v || '').toLowerCase().includes(term))))
  }, [rates, showInactive, q])

  const startNew = () => { setEditId('new'); setDraft(blankDraft(c?.scopes?.[0] || c?.ContractNumber || '', c?.Currency || 'USD')) }
  const startEdit = (r: Rate) => { setEditId(r.RateID); setDraft(draftOf(r)) }
  const cancel = () => { setEditId(null); setDraft(null) }
  const saveRate = async () => {
    if (!draft) return
    setBusy(true)
    try {
      if (editId === 'new') await api.post(`/contracts/${encodeURIComponent(contractId)}/rates`, draft)
      else await api.put(`/contracts/${encodeURIComponent(contractId)}/rates/${editId}`, draft)
      showToast(editId === 'new' ? 'Rate added' : 'Rate updated', 'success')
      cancel(); refetchR(); refetchC()
    } catch (e: any) { showToast(e.message || 'Could not save the rate', 'error') }
    finally { setBusy(false) }
  }
  const toggleActive = async (r: Rate) => {
    const on = !r.ActiveFlag
    if (!on && !window.confirm(`Deactivate this ${r.Category} rate? Days already priced keep their rate; new days will not use it.`)) return
    try {
      await api.put(`/contracts/${encodeURIComponent(contractId)}/rates/${r.RateID}`, { ActiveFlag: on })
      refetchR(); refetchC()
    } catch (e: any) { showToast(e.message || 'Could not change the rate', 'error') }
  }
  const doPaste = async () => {
    if (!paste.trim()) return
    setBusy(true)
    try {
      const r: any = await api.post(`/contracts/${encodeURIComponent(contractId)}/rates/paste`, { text: paste })
      showToast(`${r.added} rate(s) added` + (r.rejected?.length ? `, ${r.rejected.length} not read` : ''), r.rejected?.length ? 'error' : 'success')
      if (r.rejected?.length) showToast(r.rejected.slice(0, 3).map((x: any) => `line ${x.line}: ${x.reason}`).join('; '), 'error')
      setPaste(''); refetchR(); refetchC()
    } catch (e: any) { showToast(e.message || 'Paste failed', 'error') }
    finally { setBusy(false) }
  }

  if (!c || !head) return <div className="flex-1 flex items-center justify-center"><Spinner /></div>

  // A plain render helper, not a component: a component defined inside the
  // render is a new type every time and remounts its input on each keystroke.
  const F = ({ label, k, type = 'text', list, tip }: { label: string; k: string; type?: string; list?: string; tip?: string }) => (
    <React.Fragment key={k}>
      <span className="field-label" title={tip}>{label}</span>
      {list ? (
        <select className="field-input" value={head[k] || ''} disabled={!canHead} onChange={e => setH(k, e.target.value)}>
          <ListOptions name={list} current={head[k]} />
        </select>
      ) : (
        <input type={type} className="field-input" value={head[k] || ''} disabled={!canHead} onChange={e => setH(k, e.target.value)} />
      )}
    </React.Fragment>
  )

  const rateInput = (k: keyof RateDraft, w = 'w-full', ph = '') => (
    <input className={`field-input !h-6 !py-0 ${w}`} value={draft?.[k] || ''} placeholder={ph}
           onChange={e => setDraft(d => d ? { ...d, [k]: e.target.value } : d)} />
  )
  const editRow = (
    <tr className="bg-amber-50/60">
      <td className="table-td">{rateInput('ContractCode', 'w-28 font-mono', c.ContractNumber || '')}</td>
      <td className="table-td">{rateInput('Category', 'w-44')}</td>
      <td className="table-td">{rateInput('EMDADShortDesc', 'w-40')}</td>
      <td className="table-td">{rateInput('Size', 'w-20')}</td>
      <td className="table-td">{rateInput('HoleSection', 'w-28')}</td>
      <td className="table-td">{rateInput('OpsRate', 'w-20 text-right')}</td>
      <td className="table-td">{rateInput('StandbyRate', 'w-20 text-right')}</td>
      <td className="table-td">{rateInput('Redress', 'w-20 text-right')}</td>
      <td className="table-td">{rateInput('MonthlyCharges', 'w-20 text-right')}</td>
      <td className="table-td">{rateInput('RunCharges', 'w-20 text-right')}</td>
      <td className="table-td">{rateInput('Currency', 'w-14')}</td>
      <td className="table-td">{rateInput('Notes', 'w-32')}</td>
      <td className="table-td whitespace-nowrap">
        <button className="btn-mini !py-px" onClick={saveRate} disabled={busy} title="Save"><Check size={11} /></button>
        <button className="btn-mini !py-px ml-1" onClick={cancel} disabled={busy} title="Cancel"><X size={11} /></button>
      </td>
    </tr>
  )

  return (
    <div className="screen">
      {showHist && <HistoryPanel entity="contract" id={String(c.ContractNumber)} title={`Contract ${c.ContractNumber}`} onClose={() => setShowHist(false)} />}
      <div className="flex items-center gap-2 px-2 h-[30px] bg-navy-head text-white shrink-0 rounded-t">
        <button onClick={() => { if (dirty && !window.confirm('Unsaved changes — leave?')) return; onClose() }} className="hover:text-accent-400" title="Back to register"><X size={15} /></button>
        <span className="text-[13px] font-bold tracking-wide">CONTRACT</span>
        <span className="ml-auto font-mono font-bold text-accent-400 text-[14px]">{c.ContractNumber}</span>
        <button className="btn-mini !py-px ml-2" onClick={() => setShowHist(true)} title="Who changed this contract or its rates">History</button>
        <span className="text-[11px] text-slate-300 ml-3">{c.rateCount} active rate{c.rateCount === 1 ? '' : 's'} · {c.jobCount} job{c.jobCount === 1 ? '' : 's'} ({c.openJobs} open)
          {c.scopes.length > 1 ? ` · scopes ${c.scopes.join(', ')}` : ''}</span>
      </div>

      <div className="field-row bg-white border-x border-b border-gray-300 px-2 py-1.5 shrink-0
                      grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_auto_1fr] xl:grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto_1fr]">
        {F({ label: "Client", k: "ClientName" })}
        {F({ label: "PO Number", k: "PONumber" })}
        {F({ label: "Currency", k: "Currency", list: "Currency" })}
        <span className="field-label">Status</span>
        <select className="field-input" value={head.Status} disabled={!canHead} onChange={e => setH('Status', e.target.value)}>
          <option value="Active">Active</option><option value="Closed">Closed</option>
        </select>
        {F({ label: "Start", k: "StartDate", type: "date" })}
        {F({ label: "Current End", k: "EndDate", type: "date", tip: "Validity end including any extension — drives expiry and active status" })}
        {F({ label: "Prime End", k: "PrimeEndDate", type: "date", tip: "End date of the original (prime) contract before any extension; leave blank if never extended" })}
        {F({ label: "Extension Ref", k: "ExtensionRef", tip: "Extension letter / amendment reference, e.g. Ext-1 dated …" })}
        {F({ label: "Contract Value", k: "ContractValue", type: "number" })}
        {F({ label: "Invoiced To Date", k: "InvoicedToDate", type: "number" })}
        {F({ label: "PBG Number", k: "PBGNumber" })}
        {F({ label: "PBG Value (AED)", k: "PBGValue", type: "number" })}
        {F({ label: "PBG Issued", k: "PBGIssueDate", type: "date" })}
        {F({ label: "PBG Expiry", k: "PBGExpiryDate", type: "date" })}
        <span className="field-label">Description</span>
        <div className="flex items-center gap-1.5 xl:col-span-7">
          <input className="field-input" value={head.Description} disabled={!canHead} onChange={e => setH('Description', e.target.value)} />
          {canHead && (
            <button className="btn-accent shrink-0" onClick={saveHead} disabled={saving || !dirty} title={dirty ? 'Save the contract header' : 'No unsaved changes'}>
              {saving ? <Spinner size="sm" /> : <Save size={12} />} {dirty ? 'Save' : 'Saved'}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col bg-white border-x border-b border-gray-300 rounded-b">
        <div className="flex items-center gap-2 px-2 h-[28px] bg-gray-100 border-b border-gray-300 shrink-0">
          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Rate schedule ({list.length})</span>
          <input className="field-input !h-5 !py-0 w-56 ml-2" placeholder="Filter category, size, hole…" value={q} onChange={e => setQ(e.target.value)} />
          <label className="flex items-center gap-1 text-[11px] text-gray-600 ml-2">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> show inactive
          </label>
          <button className="btn-mini !py-px" onClick={refetchR} title="Refresh"><RefreshCw size={11} /></button>
          {canRate && editId === null && (
            <button className="btn-mini ml-auto !py-px" onClick={startNew}><Plus size={11} /> Add rate</button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {ratesLoading ? <div className="flex justify-center py-8"><Spinner /></div> : (
            <table className="w-full text-[12px] border-collapse">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="table-th">Scope</th>
                  <th className="table-th">Category</th>
                  <th className="table-th">EMDAD description</th>
                  <th className="table-th">Size</th>
                  <th className="table-th">Hole section</th>
                  <th className="table-th !text-right">Ops / day</th>
                  <th className="table-th !text-right">Standby / day</th>
                  <th className="table-th !text-right">Redress</th>
                  <th className="table-th !text-right">Monthly</th>
                  <th className="table-th !text-right">Run charge</th>
                  <th className="table-th">Ccy</th>
                  <th className="table-th">Notes</th>
                  <th className="table-th w-16"></th>
                </tr>
              </thead>
              <tbody>
                {editId === 'new' && editRow}
                {list.map(r => editId === r.RateID ? <React.Fragment key={r.RateID}>{editRow}</React.Fragment> : (
                  <tr key={r.RateID} className={`border-b border-gray-100 hover:bg-brand-50/40 ${r.ActiveFlag ? '' : 'text-gray-400 line-through'}`}>
                    <td className="table-td font-mono text-[11px]">{r.ContractCode}</td>
                    <td className="table-td font-medium">{r.Category}</td>
                    <td className="table-td text-gray-600 max-w-[240px] truncate" title={r.EMDADShortDesc || ''}>{r.EMDADShortDesc || '—'}</td>
                    <td className="table-td">{r.Size || '—'}</td>
                    <td className="table-td">{r.HoleSection || '—'}</td>
                    <td className="table-td text-right font-mono">{n2(r.OpsRate)}</td>
                    <td className="table-td text-right font-mono">{n2(r.StandbyRate)}</td>
                    <td className="table-td text-right font-mono">{n2(r.Redress)}</td>
                    <td className="table-td text-right font-mono">{n2(r.MonthlyCharges)}</td>
                    <td className="table-td text-right font-mono">{n2(r.RunCharges)}</td>
                    <td className="table-td">{r.Currency || '—'}</td>
                    <td className="table-td text-gray-500 max-w-[160px] truncate" title={r.Notes || ''}>{r.Notes || ''}</td>
                    <td className="table-td whitespace-nowrap">
                      {canRate && editId === null && (
                        <>
                          <button className="text-gray-400 hover:text-brand-600" onClick={() => startEdit(r)} title="Edit"><Pencil size={12} /></button>
                          <button className="text-gray-400 hover:text-red-500 ml-2" onClick={() => toggleActive(r)}
                                  title={r.ActiveFlag ? 'Deactivate' : 'Reactivate'}>
                            {r.ActiveFlag ? <Ban size={12} /> : <RotateCcw size={12} />}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {list.length === 0 && editId !== 'new' && (
                  <tr><td colSpan={13} className="table-td text-center text-gray-400 py-8">
                    No rates on this contract yet — add one, or paste the schedule below. Jobs on it cannot be priced until rates exist.
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {canRate && (
          <div className="border-t border-gray-300 bg-gray-50 px-2 py-1.5 shrink-0 flex items-start gap-2">
            <ClipboardPaste size={13} className="mt-1 text-gray-500 shrink-0" />
            <textarea className="field-input font-mono text-[11px] h-14 flex-1"
                      placeholder={'Paste from Excel — one rate a line, tab-separated:\nCategory\tSize\tHole section\tOps\tStandby\tRedress\tMonthly\tRun charge\tCurrency\tScope'}
                      value={paste} onChange={e => setPaste(e.target.value)} />
            <button className="btn-mini self-end" disabled={busy || !paste.trim()} onClick={doPaste}>
              {busy ? <Spinner size="sm" /> : <Plus size={11} />} Add pasted rates
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
