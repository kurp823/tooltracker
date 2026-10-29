import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, Truck, ShieldCheck, Wrench, Building2, CheckCircle } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { PageLoader } from '../components/Spinner'
import { Stat, Panel, Bar } from '../components/Stat'

/*
 * Inventory Dashboard.
 *
 * Everything here is counted from /api/inventory, the same rows the Assets
 * and Inventory screen lists. No figure is typed in: if a number looks wrong
 * it is wrong in the data, and clicking through shows the rows behind it.
 *
 * Note on categories: tbl_Inventory has no category column. The app reads
 * ShortDesc as the category (see api/delivery-tickets), so that is what the
 * category breakdown groups on. 'TO BE CATEGORISED' is a real value, not a
 * placeholder this screen invented.
 */

interface InvItem {
  SystemID: string
  AssetNo: string | null
  ShortDesc: string | null
  Size: string | null
  Status: string | null
  Location: string | null
  Supplier: string | null
  IsEmdad: boolean | number | null
}

const BASE_LOCATIONS = ['emdad base', 'base', 'our base']

export function InventoryDashboardView() {
  const { data, isLoading, error } = useFetch<InvItem[]>('/inventory')

  const m = useMemo(() => {
    const rows = data || []
    const norm = (v: unknown) => String(v ?? '').trim()
    const atBase = (r: InvItem) => BASE_LOCATIONS.includes(norm(r.Location).toLowerCase())

    const count = (pred: (r: InvItem) => boolean) => rows.filter(pred).length
    const group = (pick: (r: InvItem) => string) => {
      const g: Record<string, number> = {}
      rows.forEach(r => { const k = pick(r) || '(not set)'; g[k] = (g[k] || 0) + 1 })
      return Object.entries(g).sort((a, b) => b[1] - a[1])
    }

    return {
      total:       rows.length,
      onRig:       count(r => norm(r.Status) === 'On Rig'),
      good:        count(r => norm(r.Status) === 'Good'),
      readyAtBase: count(r => norm(r.Status) === 'Good' && atBase(r)),
      inspection:  count(r => norm(r.Status) === 'Inspection'),
      workshop:    count(r => ['Repair', 'Redress', 'Maintenance', 'DBR'].includes(norm(r.Status))),
      subContract: count(r => !r.IsEmdad),
      uncategorised: count(r => norm(r.ShortDesc).toUpperCase() === 'TO BE CATEGORISED' || !norm(r.ShortDesc)),
      noSize:      count(r => !norm(r.Size)),
      byStatus:    group(r => norm(r.Status)),
      byLocation:  group(r => norm(r.Location)).filter(([k]) => !BASE_LOCATIONS.includes(k.toLowerCase())),
      byCategory:  group(r => norm(r.ShortDesc)),
      bySupplier:  group(r => norm(r.Supplier)),
    }
  }, [data])

  if (isLoading) return <PageLoader />
  if (error) return <div className="card p-6 text-center text-sm text-red-600">{error}</div>

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Inventory Dashboard</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {m.total.toLocaleString()} assets · counted live from the inventory table
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Stat label="Total assets" value={m.total.toLocaleString()} to="/inventory"
              icon={<Boxes size={22} className="text-gray-600" />} iconBg="bg-gray-100" />
        <Stat label="Ready at base" value={m.readyAtBase.toLocaleString()} tone="good"
              sub={`of ${m.good.toLocaleString()} marked Good`}
              icon={<CheckCircle size={22} className="text-emerald-600" />} iconBg="bg-emerald-100" />
        <Stat label="On rig" value={m.onRig.toLocaleString()} tone="default"
              sub={`${m.total ? Math.round((m.onRig / m.total) * 100) : 0}% of fleet`}
              icon={<Truck size={22} className="text-blue-600" />} iconBg="bg-blue-100" />
        <Stat label="Inspection" value={m.inspection.toLocaleString()} tone="warn"
              icon={<ShieldCheck size={22} className="text-amber-600" />} iconBg="bg-amber-100" />
        <Stat label="Workshop / DBR" value={m.workshop.toLocaleString()} tone="warn"
              icon={<Wrench size={22} className="text-orange-600" />} iconBg="bg-orange-100" />
        <Stat label="Sub-contractor" value={m.subContract.toLocaleString()}
              sub="not Emdad owned"
              icon={<Building2 size={22} className="text-purple-600" />} iconBg="bg-purple-100" />
      </div>

      {(m.uncategorised > 0 || m.noSize > 0) && (
        <div className="card p-4 border-l-4 border-l-amber-400">
          <p className="text-sm font-medium text-gray-900">Records needing attention</p>
          <p className="text-sm text-gray-600 mt-1">
            {m.uncategorised > 0 && (
              <><strong>{m.uncategorised.toLocaleString()}</strong> assets have no category
                (reading <code className="text-xs">TO BE CATEGORISED</code> or blank)</>
            )}
            {m.uncategorised > 0 && m.noSize > 0 && ' · '}
            {m.noSize > 0 && <><strong>{m.noSize.toLocaleString()}</strong> have no size</>}
            .{' '}
            <Link to="/categories" className="text-blue-600 hover:underline">Tool Categories &amp; Sizes</Link>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="By status" subtitle="Every status value present in inventory">
          <div className="py-1">
            {m.byStatus.map(([k, v]) => (
              <Bar key={k} label={k} value={v} total={m.total}
                   tone={k === 'Good' ? 'bg-emerald-500'
                       : k === 'On Rig' ? 'bg-blue-600'
                       : k === 'Inspection' ? 'bg-amber-500' : 'bg-gray-400'} />
            ))}
          </div>
        </Panel>

        <Panel title="Out on location"
               subtitle={`${m.byLocation.length} rigs and yards holding assets`}
               action={<Link to="/inventory" className="text-xs font-medium text-blue-600 hover:underline">Assets →</Link>}>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Location</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Assets</th>
                </tr>
              </thead>
              <tbody>
                {m.byLocation.map(([k, v]) => (
                  <tr key={k} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-800">{k}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">{v}</td>
                  </tr>
                ))}
                {m.byLocation.length === 0 && (
                  <tr><td colSpan={2} className="px-4 py-6 text-center text-gray-400">Nothing out on location</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Largest categories" subtitle={`${m.byCategory.length} in use`}>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Category</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Assets</th>
                </tr>
              </thead>
              <tbody>
                {m.byCategory.slice(0, 20).map(([k, v]) => (
                  <tr key={k} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-800 truncate max-w-xs">{k}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="By supplier" subtitle="Who the asset belongs to">
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Supplier</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Assets</th>
                </tr>
              </thead>
              <tbody>
                {m.bySupplier.slice(0, 20).map(([k, v]) => (
                  <tr key={k} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-800 truncate max-w-xs">{k}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  )
}
