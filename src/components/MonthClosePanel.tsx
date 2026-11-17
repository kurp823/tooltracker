import React, { useState } from 'react'
import { Lock, Unlock, Eye, X, AlertTriangle } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './Toast'
import { api } from '../utils/api'
import { Spinner } from './Spinner'

interface Status { closed: { period: string; source: string }[]; last: string | null; next: string; current: string; nextIsCurrentMonth: boolean; nextIsFuture: boolean }
interface JobRow {
  jobNumber: string; client: string | null; contract: string | null; rig: string | null; productLine: string | null
  prevAccrual: number; jobValue: number; invoiceNo: string | null; invoiceValue: number | null; invoiceDate: string | null
  removal: number; diffAmt: number; newAccrual: number; closing: number
  prevCost: number; costAccrued: number; closingCost: number; unpricedDays: number
  carried?: boolean; legacy?: boolean; notes?: string | null
}
interface Preview {
  month: { period: string; prev: string; rate: number; revenue: number; newAccrual: number; diffAmt: number; opening: number; removed: number
           monthAccrual: number; closing: number; costAccrual: number; totalCost: number; netProfit: number; jobsWithUnpricedDays: number }
  gl: { gl: string; total: number; fishing: number; whipstock: number; rentals: number }[]
  jobs: JobRow[]
  warnings: string[]
  notes: string[]
}

const n2 = (v: number | null | undefined) => v == null ? '—' : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const mon = (p: string) => { const [y, m] = p.split('-').map(Number); return new Date(y, m - 1).toLocaleString('en-GB', { month: 'short', year: 'numeric' }) }

/**
 * Month-end close for the monthly report: which months are closed, the next
 * one to close, a preview of its figures (the accrual method per job), and
 * the close / reopen actions. Finance closes; Admin reopens the latest.
 */
export function MonthClosePanel({ onChanged }: { onChanged: () => void }) {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canClose = hasRole('Admin', 'Finance', 'Billing')
  const { data: st, refetch } = useFetch<Status>('/monthly-expenses/close-status')
  const [period, setPeriod] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)

  const target = period || st?.next || ''

  const doPreview = async () => {
    if (!target) return
    setBusy(true)
    try { setPreview(await api.get<Preview>(`/monthly-expenses/close-preview?period=${target}`)) }
    catch (e: any) { showToast(e.message || 'Could not work the month out', 'error') }
    finally { setBusy(false) }
  }
  const doClose = async () => {
    if (!preview) return
    if (!window.confirm(`Close ${mon(preview.month.period)}? Revenue ${n2(preview.month.revenue)} AED, closing accrual ${n2(preview.month.closing)} AED. The figures are then fixed.`)) return
    setBusy(true)
    try {
      const r: any = await api.post('/monthly-expenses/close-month', { period: preview.month.period })
      showToast(`${mon(r.period)} closed — ${r.jobs} job(s)`, 'success')
      setPreview(null); setPeriod(''); refetch(); onChanged()
    } catch (e: any) { showToast(e.message || 'Close failed', 'error') }
    finally { setBusy(false) }
  }
  // Opening accrual for a job the app never priced: typed from the workbook.
  const [openEdit, setOpenEdit] = useState<{ job: string; value: string } | null>(null)
  const setOpening = (j: JobRow) => setOpenEdit({ job: j.jobNumber, value: j.carried ? String(j.prevAccrual) : '' })
  const saveOpening = async () => {
    if (!preview || !openEdit) return
    const v = openEdit.value.trim()
    const job = openEdit.job
    setOpenEdit(null)
    setBusy(true)
    try {
      await api.put('/monthly-expenses/accrual-opening', { jobNumber: job, prevAccrual: v === '' ? '' : Number(v) })
      setPreview(await api.get<Preview>(`/monthly-expenses/close-preview?period=${preview.month.period}`))
    } catch (e: any) { showToast(e.message || 'Could not save', 'error') }
    finally { setBusy(false) }
  }
  const doReopen = async () => {
    if (!st?.last) return
    if (!window.confirm(`Reopen ${mon(st.last)}? Its closed figures are discarded and the month is calculated live again until it is closed.`)) return
    setBusy(true)
    try {
      await api.post('/monthly-expenses/reopen-month', { period: st.last })
      showToast(`${mon(st.last)} reopened`, 'success'); refetch(); onChanged()
    } catch (e: any) { showToast(e.message || 'Reopen failed', 'error') }
    finally { setBusy(false) }
  }

  if (!st) return null
  const options: string[] = []
  if (st.next && !st.nextIsFuture) options.push(st.next)
  if (st.last) options.unshift(st.last)

  return (
    <>
      <div className="flex items-center gap-2 text-[12px]">
        <Lock size={12} className="text-slate-300" />
        <span className="text-slate-300">
          {st.last ? `Closed to ${mon(st.last)}` : 'No month closed yet'}
        </span>
        {canClose && options.length > 0 && (
          <>
            <select className="field-input !text-black w-auto !h-7 !py-0" value={target} onChange={e => setPeriod(e.target.value)}>
              {options.map(p => <option key={p} value={p}>{p === st.last ? `${mon(p)} (re-close)` : mon(p)}</option>)}
            </select>
            <button className="btn-mini" onClick={doPreview} disabled={busy} title="Work the month out and show the figures before closing">
              {busy ? <Spinner size="sm" /> : <Eye size={12} />} Preview &amp; close
            </button>
          </>
        )}
        {hasRole('Admin') && st.last && st.closed.find(c => c.period === st.last)?.source?.startsWith('Month close') && (
          <button className="btn-mini" onClick={doReopen} disabled={busy} title={`Reopen ${mon(st.last)}`}>
            <Unlock size={12} /> Reopen {mon(st.last)}
          </button>
        )}
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPreview(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-6xl mx-4 flex flex-col max-h-[90vh] text-slate-900">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200">
              <Lock size={16} className="text-brand-600" />
              <div className="font-semibold">Close {mon(preview.month.period)} — preview</div>
              <span className="text-xs text-slate-500">USD at {preview.month.rate} AED · all figures AED</span>
              <button className="ml-auto text-gray-400 hover:text-gray-600" onClick={() => setPreview(null)}><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
              {(preview.notes.length > 0 || preview.warnings.length > 0) && (
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 space-y-0.5">
                  {[...preview.notes, ...preview.warnings].map((w, i) => <div key={i} className="flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{w}</div>)}
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-px bg-slate-200 border border-slate-200 rounded text-[12px]">
                {([
                  ['Opening accrual (ledger)', preview.month.opening], ['Less removals (invoiced)', preview.month.removed],
                  ['Add new accruals', preview.month.monthAccrual], ['Closing accrual', preview.month.closing],
                  ['Invoice differences', preview.month.diffAmt], ['Revenue', preview.month.revenue],
                  ['Cost (GL)', preview.month.totalCost], ['Net profit', preview.month.netProfit],
                ] as [string, number][]).map(([l, v]) => (
                  <div key={l} className="bg-white px-3 py-2">
                    <div className="text-[11px] text-slate-500">{l}</div>
                    <div className={`font-mono font-semibold ${v < 0 ? 'text-red-700' : ''}`}>{n2(v)}</div>
                  </div>
                ))}
              </div>

              <div>
                <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1">
                  Jobs ({preview.jobs.length}){preview.month.jobsWithUnpricedDays ? ` · ${preview.month.jobsWithUnpricedDays} with unpriced days` : ''}
                </div>
                <div className="border border-gray-200 rounded overflow-auto max-h-[40vh]">
                  <table className="w-full text-[11px]">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        {['Job', 'Client', 'Line', 'Prev accrual', 'Value to date', 'Invoice', 'Invoice value', 'Removal', 'Diff', 'New accrual', 'Closing', 'Sub cost', 'Closing cost'].map(h => (
                          <th key={h} className={`px-2 py-1.5 font-medium text-gray-600 ${/accrual|Value|Removal|Diff|Closing|cost/.test(h) ? 'text-right' : 'text-left'}`}>{h}</th>))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.jobs.map(j => (
                        <tr key={j.jobNumber} className="border-t border-gray-100">
                          <td className="px-2 py-1 font-mono">{j.jobNumber}{j.unpricedDays ? <span className="ml-1 text-amber-700" title={`${j.unpricedDays} unpriced day(s)`}>!</span> : null}</td>
                          <td className="px-2 py-1 max-w-[180px] truncate">{j.client || '—'}</td>
                          <td className="px-2 py-1">{j.productLine || '—'}</td>
                          <td className="px-2 py-1 text-right font-mono">
                            {openEdit && openEdit.job === j.jobNumber
                              ? <input autoFocus type="number" className="field-input !h-6 !py-0 w-28 text-right" value={openEdit.value} placeholder="AED"
                                       onChange={e => setOpenEdit(x => x && ({ ...x, value: e.target.value }))}
                                       onBlur={saveOpening} onKeyDown={e => { if (e.key === 'Enter') saveOpening(); if (e.key === 'Escape') setOpenEdit(null) }} />
                              : j.carried
                              ? <button className="hover:underline decoration-dotted" title="Click to set the opening accrual by hand" onClick={() => setOpening(j)}>{n2(j.prevAccrual)}</button>
                              : <button className={`underline decoration-dotted ${j.legacy ? 'text-amber-700' : 'text-gray-400'}`}
                                        title="No carried accrual — click to set the opening accrual from the workbook" onClick={() => setOpening(j)}>
                                  {j.legacy ? 'set…' : '0.00'}
                                </button>}
                          </td>
                          <td className="px-2 py-1 text-right font-mono">{n2(j.jobValue)}</td>
                          <td className="px-2 py-1 font-mono">{j.invoiceNo || ''}</td>
                          <td className="px-2 py-1 text-right font-mono">{j.invoiceValue == null ? '' : n2(j.invoiceValue)}</td>
                          <td className="px-2 py-1 text-right font-mono">{j.removal ? n2(j.removal) : ''}</td>
                          <td className={`px-2 py-1 text-right font-mono ${j.diffAmt < 0 ? 'text-red-700' : ''}`}>{j.diffAmt ? n2(j.diffAmt) : ''}</td>
                          <td className={`px-2 py-1 text-right font-mono ${j.newAccrual < 0 ? 'text-red-700' : ''}`}>{n2(j.newAccrual)}</td>
                          <td className="px-2 py-1 text-right font-mono">{n2(j.closing)}</td>
                          <td className="px-2 py-1 text-right font-mono">{j.costAccrued ? n2(j.costAccrued) : ''}</td>
                          <td className="px-2 py-1 text-right font-mono">{j.closingCost ? n2(j.closingCost) : ''}</td>
                        </tr>
                      ))}
                      {preview.jobs.length === 0 && <tr><td colSpan={13} className="px-3 py-6 text-center text-gray-400">No jobs with activity, accruals or invoices in this month</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Cost by GL line</div>
                <div className="border border-gray-200 rounded overflow-auto max-h-[30vh]">
                  <table className="w-full text-[11px]">
                    <thead className="bg-gray-50 sticky top-0"><tr>
                      {['GL line', 'Fishing', 'Whipstock', 'Rentals', 'Total'].map(h => <th key={h} className={`px-2 py-1.5 font-medium text-gray-600 ${h === 'GL line' ? 'text-left' : 'text-right'}`}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {preview.gl.map(g => (
                        <tr key={g.gl} className="border-t border-gray-100">
                          <td className="px-2 py-1">{g.gl}</td>
                          <td className="px-2 py-1 text-right font-mono">{n2(g.fishing)}</td>
                          <td className="px-2 py-1 text-right font-mono">{n2(g.whipstock)}</td>
                          <td className="px-2 py-1 text-right font-mono">{n2(g.rentals)}</td>
                          <td className="px-2 py-1 text-right font-mono font-semibold">{n2(g.total)}</td>
                        </tr>
                      ))}
                      {preview.gl.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">No cost recorded in this month</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <span className="text-xs text-slate-500">Closing stores these figures as the reported month. Days, rates and expenses inside it should not change afterwards.</span>
              <button className="btn-ghost ml-auto" onClick={() => setPreview(null)} disabled={busy}>Cancel</button>
              <button className="btn-primary" onClick={doClose} disabled={busy}>
                {busy ? <Spinner size="sm" /> : <Lock size={14} />} Close {mon(preview.month.period)}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
