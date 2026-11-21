import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../utils/api'
import { useToast } from '../components/Toast'
import { useAuth } from '../contexts/AuthContext'
import { Spinner } from '../components/Spinner'
import { HardHat, ShieldCheck, Wrench, ClipboardCheck, AlertTriangle } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { PageLoader } from '../components/Spinner'
import { Stat, Panel, Bar } from '../components/Stat'
import { actionBadge, type InspectionLine } from '../components/InspectionHistory'
import { formatDate } from '../utils/format'

/*
 * Maintenance & QC Dashboard — one server-side summary (/inspections/summary).
 *
 * Work in progress, not history: open inspection lines (awaiting the
 * third-party report), lines awaiting QC validation, open maintenance orders,
 * and the inventory side (tools in the bay / workshop) with the gaps — a tool
 * whose status says Inspection but has no open line, or Maintenance with no
 * open card — because that is work happening without a record.
 */

interface InvRow { SystemID: string; AssetNo: string | null; ShortDesc: string | null; Size: string | null; Status: string | null; Location: string | null }
interface Summary {
  inspTotal: number; inspOpen: number; inspAwaitingQC: number; inspClosed: number
  inspClosedThisMonth: number; dmrThisMonth: number
  maintOpen: number; maintTotal: number
  invInspection: number; invWorkshop: number; invDBR: number
  maintByStatus: { k: string; n: number }[]
  bayNoLine: InvRow[]; workshopNoCard: InvRow[]
  openLines: InspectionLine[]
}

function InvTable ({ rows }: { rows: InvRow[] }) {
  return (
    <div className="max-h-80 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 sticky top-0"><tr>
          <th className="text-left px-4 py-2 font-medium text-gray-600">Asset no</th>
          <th className="text-left px-4 py-2 font-medium text-gray-600">Category</th>
          <th className="text-left px-4 py-2 font-medium text-gray-600">Size</th>
          <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
          <th className="text-left px-4 py-2 font-medium text-gray-600">Location</th>
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.SystemID} className="border-t border-gray-100">
              <td className="px-4 py-2 text-gray-800 font-mono text-xs">{r.AssetNo || r.SystemID}</td>
              <td className="px-4 py-2 text-gray-600 truncate max-w-xs">{r.ShortDesc || '—'}</td>
              <td className="px-4 py-2 text-gray-600">{r.Size || '—'}</td>
              <td className="px-4 py-2"><span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">{r.Status}</span></td>
              <td className="px-4 py-2 text-gray-600">{r.Location || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function MaintenanceDashboardView() {
  const { data: s, isLoading, error, refetch } = useFetch<Summary>('/inspections/summary')
  if (isLoading) return <PageLoader />
  if (error || !s) return <div className="card p-6 text-center text-sm text-red-600">{error || 'No data'}</div>

  const awaitingReport = s.openLines.filter(l => l.Status === 'Open')
  const awaitingQC     = s.openLines.filter(l => l.Status === 'Report received')
  const maintTotal = s.maintTotal || 1

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Awaiting inspection report" value={s.inspOpen.toLocaleString()} to="/inspection"
              sub="open lines, third-party report pending" tone={s.inspOpen ? 'warn' : undefined}
              icon={<ShieldCheck size={22} className="text-rose-600" />} iconBg="bg-rose-100" />
        <Stat label="Awaiting QC validation" value={s.inspAwaitingQC.toLocaleString()} to="/inspection"
              sub="report received, QC to decide" tone={s.inspAwaitingQC ? 'warn' : undefined}
              icon={<ClipboardCheck size={22} className="text-blue-600" />} iconBg="bg-blue-100" />
        <Stat label="Open maintenance orders" value={s.maintOpen.toLocaleString()} to="/maintenance"
              sub={`${s.maintTotal.toLocaleString()} cards in total`}
              icon={<Wrench size={22} className="text-amber-600" />} iconBg="bg-amber-100" />
        <Stat label="Closed this month" value={s.inspClosedThisMonth.toLocaleString()} to="/inspection"
              sub={`${s.dmrThisMonth} went to maintenance (DMR) · ${s.inspTotal.toLocaleString()} lines in history`}
              icon={<ShieldCheck size={22} className="text-emerald-600" />} iconBg="bg-emerald-100" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stat label="Tools in inspection bay" value={s.invInspection.toLocaleString()} to="/inventory?status=Inspection"
              sub="inventory status = Inspection" icon={<HardHat size={22} className="text-orange-600" />} iconBg="bg-orange-100" />
        <Stat label="Tools in workshop" value={s.invWorkshop.toLocaleString()} to="/inventory?status=Maintenance"
              sub="Maintenance / Repair / Redress" icon={<Wrench size={22} className="text-gray-600" />} iconBg="bg-gray-100" />
        <Stat label="DBR" value={s.invDBR.toLocaleString()} to="/inventory?status=DBR"
              sub="damaged beyond repair — scrap / write-off list" icon={<AlertTriangle size={22} className="text-red-600" />} iconBg="bg-red-100" />
      </div>

      {awaitingQC.length > 0 && (
        <Panel title="Awaiting QC validation" subtitle={`${awaitingQC.length} lines with the third-party report in — QC to decide Stock or DMR`}
               action={<Link to="/inspection" className="text-xs font-medium text-blue-600 hover:underline">QC Inspection Bay →</Link>}>
          <LineTable rows={awaitingQC} />
        </Panel>
      )}
      {awaitingReport.length > 0 && (
        <Panel title="Awaiting inspection report" subtitle={`${awaitingReport.length} open lines — tools in the bay waiting for the third-party report`}
               action={<Link to="/inspection" className="text-xs font-medium text-blue-600 hover:underline">QC Inspection Bay →</Link>}>
          <LineTable rows={awaitingReport} />
        </Panel>
      )}

      {s.invInspection > 0 && <BaySync onDone={refetch} />}

      {s.bayNoLine.length > 0 && (
        <Panel title="In the inspection bay without an inspection line"
               subtitle={`${s.bayNoLine.length} tools whose inventory status is Inspection but no open inspection line exists — open one from the Receiving Ticket (mark USED) or with New Inspection`}
               action={<Link to="/inspection" className="text-xs font-medium text-blue-600 hover:underline">QC Inspection Bay →</Link>}>
          <InvTable rows={s.bayNoLine} />
        </Panel>
      )}
      {s.workshopNoCard.length > 0 && (
        <Panel title="In the workshop without a maintenance order"
               subtitle={`${s.workshopNoCard.length} tools in Maintenance / Repair / Redress with no open card`}
               action={<Link to="/maintenance" className="text-xs font-medium text-blue-600 hover:underline">Maintenance Orders →</Link>}>
          <InvTable rows={s.workshopNoCard} />
        </Panel>
      )}

      {s.maintByStatus.length > 0 && (
        <Panel title="Maintenance orders by status">
          <div className="py-1">
            {s.maintByStatus.map(({ k, n }) => (
              <Bar key={k} label={k || '(no status)'} value={n} total={maintTotal}
                   tone={/complete|closed|done/i.test(k) ? 'bg-emerald-500' : 'bg-amber-500'} />
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}

function LineTable ({ rows }: { rows: InspectionLine[] }) {
  return (
    <div className="max-h-80 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 sticky top-0"><tr>
          <th className="text-left px-4 py-2 font-medium text-gray-600">WO</th>
          <th className="text-left px-4 py-2 font-medium text-gray-600">Asset</th>
          <th className="text-left px-4 py-2 font-medium text-gray-600">Description</th>
          <th className="text-left px-4 py-2 font-medium text-gray-600">Job</th>
          <th className="text-left px-4 py-2 font-medium text-gray-600">Report No</th>
          <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
          <th className="text-left px-4 py-2 font-medium text-gray-600">Action</th>
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.InspectionID} className="border-t border-gray-100">
              <td className="px-4 py-2 font-mono text-xs">{r.WONumber ?? '—'}{r.LineNum ? `/${r.LineNum}` : ''}</td>
              <td className="px-4 py-2 font-mono text-xs">{r.AssetNo || r.SerialNumber || '—'}</td>
              <td className="px-4 py-2 text-gray-600 truncate max-w-xs">{r.ToolDescription || '—'}</td>
              <td className="px-4 py-2 text-gray-600 text-xs">{r.JobID || '—'}</td>
              <td className="px-4 py-2 font-mono text-xs">{r.CertNumber || '—'}</td>
              <td className="px-4 py-2 text-gray-600 text-xs">{formatDate(r.InspectionDate)}</td>
              <td className="px-4 py-2">{actionBadge(r.Action, r.Result)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Bay sync: inventory 'Inspection' vs the inspection lines ────────────────

interface BayRow { SystemID: string; AssetNo: string | null; ShortDesc: string | null; Size: string | null
  LastRT: string | null; LastRTNo: string | null; WONumber: number | null; InspDate: string | null; CertNumber: string | null
  Action: string | null; InspJob: string | null; Proposal: 'Good' | 'Maintenance' | 'Open line' }

function BaySync ({ onDone }: { onDone: () => void }) {
  const { hasRole } = useAuth()
  const { success, error: toastErr } = useToast()
  const { data, isLoading, refetch } = useFetch<{ rows: BayRow[]; counts: Record<string, number> }>('/inspections/bay-sync')
  const [applying, setApplying] = useState(false)
  const [confirm, setConfirm] = useState(false)
  if (isLoading || !data) return null
  const { rows, counts } = data
  const apply = async () => {
    setApplying(true)
    try {
      const r = await api.post<{ good: number; maintenance: number; opened: number; cards: string[] }>('/inspections/bay-sync', { apply: true })
      success(`Synced: ${r.good} to stock, ${r.maintenance} to workshop (${r.cards.length} cards), ${r.opened} lines opened for QC`)
      setConfirm(false); refetch(); onDone()
    } catch (e: any) { toastErr(e.message || 'Sync failed') } finally { setApplying(false) }
  }
  const tone = (p: string) => p === 'Good' ? 'bg-emerald-100 text-emerald-800' : p === 'Maintenance' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
  return (
    <Panel title="Inspection bay vs inspection records"
           subtitle={`${rows.length} tools in the bay · latest inspection line after the tool's last return: ${counts.Good || 0} Stock → Good, ${counts.Maintenance || 0} DMR → workshop, ${counts['Open line'] || 0} no decision yet → open line for QC`}
           action={hasRole('Admin', 'QAQC') ? (
             confirm ? (
               <span className="flex items-center gap-2 text-xs">
                 <span className="text-gray-600">Apply to {rows.length} tools?</span>
                 <button className="btn-primary" onClick={apply} disabled={applying}>{applying ? <Spinner size="sm" /> : null} Yes, sync</button>
                 <button className="btn-ghost" onClick={() => setConfirm(false)} disabled={applying}>Cancel</button>
               </span>
             ) : <button className="btn-primary" onClick={() => setConfirm(true)}>Sync bay with records</button>
           ) : undefined}>
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0"><tr>
            <th className="text-left px-4 py-2 font-medium text-gray-600">Asset</th>
            <th className="text-left px-4 py-2 font-medium text-gray-600">Category</th>
            <th className="text-left px-4 py-2 font-medium text-gray-600">Last RT</th>
            <th className="text-left px-4 py-2 font-medium text-gray-600">Inspection after it</th>
            <th className="text-left px-4 py-2 font-medium text-gray-600">Report No</th>
            <th className="text-left px-4 py-2 font-medium text-gray-600">Epicor action</th>
            <th className="text-left px-4 py-2 font-medium text-gray-600">Will become</th>
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.SystemID} className="border-t border-gray-100">
                <td className="px-4 py-2 font-mono text-xs">{r.AssetNo || r.SystemID}</td>
                <td className="px-4 py-2 text-gray-600 truncate max-w-xs">{r.ShortDesc || '—'}{r.Size ? ` · ${r.Size}` : ''}</td>
                <td className="px-4 py-2 text-xs text-gray-600">{r.LastRTNo || '—'}{r.LastRT ? ` · ${formatDate(r.LastRT)}` : ''}</td>
                <td className="px-4 py-2 text-xs text-gray-600">{r.WONumber ? `WO ${r.WONumber} · ${formatDate(r.InspDate)}` : '—'}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.CertNumber || '—'}</td>
                <td className="px-4 py-2">{r.Action ? actionBadge(r.Action, null) : <span className="text-xs text-gray-400">none</span>}</td>
                <td className="px-4 py-2"><span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${tone(r.Proposal)}`}>{r.Proposal === 'Good' ? 'Good @ Emdad Base' : r.Proposal === 'Maintenance' ? 'Maintenance @ Workshop + card' : 'Stays in bay — line opened for QC'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
