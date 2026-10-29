import { useEffect, useState } from 'react'
import { RotateCcw, ArrowRight, AlertTriangle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './Toast'
import { api } from '../utils/api'

/*
 * Monthly rollover.
 *
 * On a monthly contract a new job is raised each month, and whatever is
 * still on the rig carries into it. "Still on the rig" means a tool that
 * went out on a delivery ticket and has no return ticket — which is the
 * tickets' own record, not a flag anyone maintains.
 *
 * Shown only on a job set to Monthly, because that is what rollover means.
 * On a per-job job it would quietly carry tools into work billed as one
 * complete job.
 */

interface Tool {
  SystemID: string; AssetNo: string | null; ShortDesc: string | null
  Size: string | null; SourceDTNumber: string | null; SentOn: string | null
  ToolStatus: string | null; ToolLocation: string | null
}
interface Preview {
  target: { JobID: string; InvoicingType: string; RolledFromJobID: string | null }
  source: { JobID: string; Status: string; Rig: string }
  willCarry: Tool[]
  alreadyOnJob: Tool[]
}

export function RolloverPanel({
  jobId, invoicingType, rolledFrom, onDone,
}: {
  jobId: string
  invoicingType: string | null | undefined
  rolledFrom?: string | null
  onDone?: () => void
}) {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canRoll = hasRole('Admin', 'Operations')

  const [from, setFrom]       = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy]       = useState(false)
  const [checking, setChecking] = useState(false)

  useEffect(() => { setPreview(null) }, [from])

  if (invoicingType !== 'Monthly') return null

  async function check() {
    if (!from.trim()) return
    setChecking(true)
    try {
      setPreview(await api.get<Preview>(
        `/jobs/${encodeURIComponent(jobId)}/rollover?from=${encodeURIComponent(from.trim())}`))
    } catch (e: any) {
      setPreview(null)
      showToast(e.message || 'Could not read that job', 'error')
    } finally { setChecking(false) }
  }

  async function apply() {
    setBusy(true)
    try {
      const r = await api(`/jobs/${encodeURIComponent(jobId)}/rollover`, {
        method: 'POST', body: JSON.stringify({ fromJobId: from.trim() }),
      }) as any
      showToast(r.carried
        ? `${r.carried} tool(s) carried over from ${from.trim()}`
        : (r.message || 'Nothing to carry over'),
        r.carried ? 'success' : 'info')
      setPreview(null); setFrom('')
      onDone?.()
    } catch (e: any) {
      showToast(e.message || 'Rollover failed', 'error')
    } finally { setBusy(false) }
  }

  return (
    <div className="card p-4 space-y-3 border-l-4 border-l-brand-500">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-medium text-gray-900 text-sm flex items-center gap-1.5">
            <RotateCcw size={15} /> Roll tools over from last month
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Carries every tool that went out on last month's job and has no return ticket.
          </p>
        </div>
        {rolledFrom && (
          <span className="text-xs text-gray-500">
            already rolled from <strong>{rolledFrom}</strong>
          </span>
        )}
      </div>

      {canRoll && (
        <div className="flex gap-2 items-end">
          <div className="flex-1 max-w-xs">
            <label className="label">Previous month's job</label>
            <input className="input mt-1" placeholder="Job-026-01900" value={from}
                   onChange={e => setFrom(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter') check() }} />
          </div>
          <button className="btn-ghost" disabled={checking || !from.trim()} onClick={check}>
            {checking ? 'Checking…' : 'Check'}
          </button>
        </div>
      )}

      {preview && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <span className="font-medium">{preview.source.JobID}</span>
            <ArrowRight size={14} className="text-gray-400" />
            <span className="font-medium">{preview.target.JobID}</span>
            <span className="text-xs text-gray-500">
              {preview.willCarry.length} tool(s) still out
            </span>
          </div>

          {preview.willCarry.length > 0 ? (
            <div className="border border-gray-200 rounded overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-600">Tool</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-600">Out on</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-600">Since</th>
                    <th className="text-left px-2 py-1.5 font-medium text-gray-600">Where</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.willCarry.map(t => (
                    <tr key={t.SystemID} className="border-t border-gray-100">
                      <td className="px-2 py-1.5 text-gray-800">
                        {t.AssetNo || t.SystemID}
                        {t.ShortDesc && <span className="text-gray-400 ml-1">{t.ShortDesc}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-gray-600">{t.SourceDTNumber || '—'}</td>
                      <td className="px-2 py-1.5 text-gray-600">
                        {t.SentOn ? String(t.SentOn).slice(0, 10) : '—'}
                      </td>
                      <td className="px-2 py-1.5 text-gray-500">{t.ToolLocation || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500 flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-500" />
              Nothing is still out on {preview.source.JobID} — every tool has a return ticket.
            </p>
          )}

          {preview.alreadyOnJob.length > 0 && (
            <p className="text-xs text-gray-500">
              {preview.alreadyOnJob.length} of them are already on this job and will be left alone.
            </p>
          )}

          {canRoll && preview.willCarry.length > 0 && (
            <button className="btn-primary" disabled={busy} onClick={apply}>
              <RotateCcw size={15} /> Carry {preview.willCarry.length} tool(s) over
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Each tool keeps the delivery ticket it originally went out on, so its days on this
        job still price against the right contract and hole section.
      </p>
    </div>
  )
}
