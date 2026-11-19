import React, { useEffect, useState } from 'react'
import { Check, RefreshCw, ScanSearch } from 'lucide-react'
import { api } from '../utils/api'
import { useToast } from './Toast'
import { Spinner } from './Spinner'
import { useAuth } from '../contexts/AuthContext'

/**
 * Inventory Dashboard → Status check.
 *
 * Compares every tool's stored Status / Location with what its tickets say
 * (last delivery vs last return, and whether that job is still open) and
 * lists the differences by case, each with an Apply. Admin / Operations.
 */
interface Case { code: string; label: string; count: number; sample: any[] }
interface Report { total: number; currentByStatus: Record<string, number>; expected: { onRigOpenJobs: number; outOnClosedJobs: number; atBase: number }; differences: number; cases: Case[] }

export function ReconcilePanel({ onApplied }: { onApplied?: () => void }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [rep, setRep] = useState<Report | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string[] | null>(null)
  const canApply = !!user && ['Admin', 'Operations'].includes(String((user as any).Role))

  const load = () => { setBusy('load'); api.get<Report>('/reconcile/inventory').then(setRep).catch(e => showToast(e.message, 'error')).finally(() => setBusy(null)) }
  useEffect(() => { load() }, [])

  const apply = async (codes: string[]) => {
    setConfirm(null); setBusy(codes.join(''))
    try {
      const r = await api.post<{ updated: number; counts: Record<string, number> }>('/reconcile/inventory', { cases: codes })
      showToast(`${r.updated} tool(s) corrected`, 'success'); load(); onApplied && onApplied()
    } catch (e: any) { showToast(e.message || 'Failed', 'error'); setBusy(null) }
  }

  if (!rep) return <div className="card p-4 text-sm text-gray-500 flex items-center gap-2"><Spinner size="sm" /> Checking tool status against tickets…</div>
  const REVIEW: Record<string, string> = { B: 'the tool may still be on the rig; apply only if you know it came back', E: 'DBR may be genuine (scrapped); apply only for tools that are back in service' }
  const safeCodes = rep.cases.filter(c => !REVIEW[c.code]).map(c => c.code)
  return (
    <div className={`card p-4 border-l-4 ${rep.differences ? 'border-l-amber-400' : 'border-l-green-500'}`}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[280px]">
          <p className="text-sm font-medium text-gray-900 flex items-center gap-2"><ScanSearch size={16} /> Status check against tickets</p>
          <p className="text-xs text-gray-600 mt-1">
            From the tickets: <b>{rep.expected.onRigOpenJobs.toLocaleString()}</b> tools are out on Ongoing jobs (should read On Rig), <b>{rep.expected.atBase.toLocaleString()}</b> are back at base
            {rep.expected.outOnClosedJobs > 0 && <>, <b>{rep.expected.outOnClosedJobs.toLocaleString()}</b> went out on a job that is no longer Ongoing, with no return ticket on record</>}.
            {rep.differences === 0 ? <> Stored status and location agree everywhere.</> : <> <b className="text-amber-700">{rep.differences.toLocaleString()}</b> records disagree:</>}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn-mini" onClick={load} disabled={!!busy}><RefreshCw size={12} className={busy === 'load' ? 'animate-spin' : ''} /></button>
          {canApply && safeCodes.length > 0 && (
            <button className="btn-accent" disabled={!!busy} onClick={() => setConfirm(safeCodes)}>
              {busy && busy !== 'load' ? <Spinner size="sm" /> : <Check size={12} />} Apply all clear-cut cases
            </button>
          )}
        </div>
      </div>
      {confirm && (
        <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200 text-xs flex items-center gap-2 flex-wrap">
          <span>Correct {rep.cases.filter(c => confirm.includes(c.code)).reduce((n, c) => n + c.count, 0).toLocaleString()} tool records ({confirm.join(', ')})? Each change is written to the Audit Log.</span>
          <button className="btn-accent !py-0.5" onClick={() => apply(confirm)}>Confirm</button>
          <button className="btn-mini" onClick={() => setConfirm(null)}>Cancel</button>
        </div>
      )}
      {rep.cases.length > 0 && (
        <table className="w-full text-xs mt-3 border-collapse">
          <tbody>
            {rep.cases.map(c => (
              <React.Fragment key={c.code}>
                <tr className="border-t border-gray-100">
                  <td className="py-1.5 pr-2 font-mono text-gray-500 w-6">{c.code}</td>
                  <td className="py-1.5 pr-2">{c.label}{REVIEW[c.code] && <span className="ml-1 text-amber-700">(review — {REVIEW[c.code]})</span>}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold tabular-nums w-16">{c.count.toLocaleString()}</td>
                  <td className="py-1.5 whitespace-nowrap w-40 text-right">
                    <button className="btn-mini" onClick={() => setOpen(open === c.code ? null : c.code)}>{open === c.code ? 'Hide' : 'Examples'}</button>
                    {canApply && <button className="btn-mini ml-1" disabled={!!busy} onClick={() => setConfirm([c.code])}>Apply</button>}
                  </td>
                </tr>
                {open === c.code && (
                  <tr><td colSpan={4} className="pb-2">
                    <table className="w-full text-[11px] bg-gray-50 rounded">
                      <thead><tr className="text-gray-500"><th className="text-left px-2 py-1">Asset</th><th className="text-left px-2">Category</th><th className="text-left px-2">Now</th><th className="text-left px-2">Last DT</th><th className="text-left px-2">Last RT</th><th className="text-left px-2">Job</th><th className="text-left px-2">→ Will become</th></tr></thead>
                      <tbody>{c.sample.map(s => (
                        <tr key={s.SystemID}><td className="px-2 py-0.5 font-mono">{s.AssetNo}</td><td className="px-2">{s.ShortDesc}</td><td className="px-2">{s.Status} @ {s.Location || '—'}</td><td className="px-2">{s.lastDT || '—'}</td><td className="px-2">{s.lastRT || '—'}</td><td className="px-2">{s.job || '—'}{s.jobStatus ? ` (${s.jobStatus})` : ''}</td><td className="px-2 text-green-700">{s.to}</td></tr>
                      ))}</tbody>
                    </table>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
