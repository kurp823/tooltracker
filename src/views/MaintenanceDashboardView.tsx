import { Link } from 'react-router-dom'
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
  const { data: s, isLoading, error } = useFetch<Summary>('/inspections/summary')
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
