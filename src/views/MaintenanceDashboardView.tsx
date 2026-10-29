import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { HardHat, ShieldCheck, Wrench } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { PageLoader } from '../components/Spinner'
import { Stat, Panel, Bar } from '../components/Stat'

/*
 * Maintenance & QC Dashboard - from /api/inspection, /api/maintenance and
 * /api/inventory.
 *
 * The inventory side is included on purpose: a tool reading 'Inspection' or
 * 'DBR' in inventory with no matching record is work the workshop is doing
 * that this module never saw. That gap is the thing worth watching, so it
 * is shown rather than hidden.
 *
 * Both record tables may be empty - the screen says so plainly instead of
 * rendering zeros that look like a loading failure.
 */

interface Insp { [k: string]: unknown }
interface Maint { [k: string]: unknown }
interface InvItem { SystemID: string; AssetNo: string | null; ShortDesc: string | null;
                    Size: string | null; Status: string | null; Location: string | null }

const pick = (r: Record<string, unknown>, ...names: string[]) => {
  for (const n of names) {
    const hit = Object.keys(r).find(k => k.toLowerCase() === n.toLowerCase())
    if (hit && r[hit] != null && String(r[hit]).trim() !== '') return String(r[hit])
  }
  return ''
}

export function MaintenanceDashboardView() {
  const { data: insp,  isLoading: l1, error: e1 } = useFetch<Insp[]>('/inspection')
  const { data: maint, isLoading: l2 }            = useFetch<Maint[]>('/maintenance')
  const { data: inv,   isLoading: l3 }            = useFetch<InvItem[]>('/inventory')

  const m = useMemo(() => {
    const inspRows  = Array.isArray(insp)  ? insp  : []
    const maintRows = Array.isArray(maint) ? maint : []
    const invRows   = Array.isArray(inv)   ? inv   : []

    const tally = (rows: Record<string, unknown>[]) => {
      const g: Record<string, number> = {}
      rows.forEach(r => { const k = pick(r, 'Status', 'status', 'Stage') || '(no status)'
                          g[k] = (g[k] || 0) + 1 })
      return Object.entries(g).sort((a, b) => b[1] - a[1])
    }
    const open = (rows: Record<string, unknown>[]) =>
      rows.filter(r => !/complete|closed|done|certified/i.test(pick(r, 'Status', 'status', 'Stage'))).length

    const st = (r: InvItem) => String(r.Status ?? '').trim()
    const inInspection = invRows.filter(r => st(r) === 'Inspection')
    const inWorkshop   = invRows.filter(r => ['Repair', 'Redress', 'Maintenance', 'DBR'].includes(st(r)))

    // tools the workshop holds that have no record in either module
    const known = new Set([...inspRows, ...maintRows].map(r =>
      pick(r as Record<string, unknown>, 'ToolSerial', 'Serial', 'SystemID', 'AssetNo').toUpperCase()))
    const untracked = [...inInspection, ...inWorkshop].filter(r =>
      !known.has(String(r.SystemID ?? '').toUpperCase()) &&
      !known.has(String(r.AssetNo ?? '').toUpperCase()))

    return {
      inspCount: inspRows.length, maintCount: maintRows.length,
      inspOpen: open(inspRows as Record<string, unknown>[]),
      maintOpen: open(maintRows as Record<string, unknown>[]),
      inspByStatus: tally(inspRows as Record<string, unknown>[]),
      maintByStatus: tally(maintRows as Record<string, unknown>[]),
      inInspection, inWorkshop, untracked,
    }
  }, [insp, maint, inv])

  if (l1 || l2 || l3) return <PageLoader />
  if (e1) return <div className="card p-6 text-center text-sm text-red-600">{e1}</div>

  const noRecords = m.inspCount === 0 && m.maintCount === 0

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Maintenance &amp; QC Dashboard</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Inspection and maintenance records, with what inventory says the workshop is holding
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Inspection records" value={m.inspCount.toLocaleString()} to="/inspection"
              sub={m.inspOpen ? `${m.inspOpen} still open` : undefined}
              icon={<ShieldCheck size={22} className="text-rose-600" />} iconBg="bg-rose-100" />
        <Stat label="Maintenance orders" value={m.maintCount.toLocaleString()} to="/maintenance"
              sub={m.maintOpen ? `${m.maintOpen} still open` : undefined}
              icon={<Wrench size={22} className="text-amber-600" />} iconBg="bg-amber-100" />
        <Stat label="Tools in inspection" value={m.inInspection.length.toLocaleString()}
              sub="per inventory status" tone="warn"
              icon={<HardHat size={22} className="text-orange-600" />} iconBg="bg-orange-100" />
        <Stat label="Tools in workshop" value={m.inWorkshop.length.toLocaleString()}
              sub="Repair, Redress or DBR" tone="warn"
              icon={<Wrench size={22} className="text-gray-600" />} iconBg="bg-gray-100" />
      </div>

      {noRecords && (
        <div className="card p-4 border-l-4 border-l-blue-400">
          <p className="text-sm font-medium text-gray-900">No inspection or maintenance records yet</p>
          <p className="text-sm text-gray-600 mt-1">
            Both tables are empty, so the counts above are genuinely zero rather than a load failure.
            Inventory still shows <strong>{(m.inInspection.length + m.inWorkshop.length).toLocaleString()}</strong>{' '}
            tools sitting in inspection or the workshop — work that is happening without a record against it.
          </p>
        </div>
      )}

      {m.untracked.length > 0 && (
        <Panel
          title="In the workshop with no record"
          subtitle={`${m.untracked.length} tools whose inventory status says inspection or repair, but which have no inspection or maintenance record`}
          action={<Link to="/inspection" className="text-xs font-medium text-blue-600 hover:underline">QC Inspection Bay →</Link>}
        >
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Asset no</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Category</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Size</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Location</th>
                </tr>
              </thead>
              <tbody>
                {m.untracked.slice(0, 200).map(r => (
                  <tr key={r.SystemID} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-800">{r.AssetNo || r.SystemID}</td>
                    <td className="px-4 py-2 text-gray-600 truncate max-w-xs">{r.ShortDesc || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{r.Size || '—'}</td>
                    <td className="px-4 py-2">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                        {r.Status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{r.Location || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {m.untracked.length > 200 && (
              <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
                Showing the first 200 of {m.untracked.length}.
              </p>
            )}
          </div>
        </Panel>
      )}

      {(m.inspByStatus.length > 0 || m.maintByStatus.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {m.inspByStatus.length > 0 && (
            <Panel title="Inspections by status">
              <div className="py-1">
                {m.inspByStatus.map(([k, v]) => (
                  <Bar key={k} label={k} value={v} total={m.inspCount}
                       tone={/complete|closed|pass/i.test(k) ? 'bg-emerald-500' : 'bg-rose-500'} />
                ))}
              </div>
            </Panel>
          )}
          {m.maintByStatus.length > 0 && (
            <Panel title="Maintenance orders by status">
              <div className="py-1">
                {m.maintByStatus.map(([k, v]) => (
                  <Bar key={k} label={k} value={v} total={m.maintCount}
                       tone={/complete|closed/i.test(k) ? 'bg-emerald-500' : 'bg-amber-500'} />
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  )
}
