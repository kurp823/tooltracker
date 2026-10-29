import { useState } from 'react'
import { Plus, Search, RefreshCw, PackagePlus, Undo2, Building2, AlertTriangle } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { ListOptions } from '../components/ListOptions'
import { PageLoader } from '../components/Spinner'
import { Stat, Panel, Bar } from '../components/Stat'
import { api } from '../utils/api'

/*
 * Third-Party Rental Inward, with the Sub-Contractor Rentals report as its
 * second tab — the report is a view over the same data, so it lives beside
 * it rather than fetching the same rows from a separate screen.
 *
 * This is the record that was missing behind the orphan serials: a
 * sub-contractor's tool arrived, went out on a ticket, and had no inward
 * record anywhere.
 */

type Tab = 'hires' | 'report'

interface Hire {
  id: number; rentalRef: string | null; supplierName: string
  poNumber: string | null; assetNo: string | null; shortDesc: string | null
  size: string | null; oemSerial: string | null; jobId: string | null
  dateIn: string; expectedOut: string | null; dateOut: string | null
  dayRate: number | null; currency: string | null; status: string
  systemId: string | null; notes: string | null
  daysOnHire: number; costToDate: number
}
interface Summary {
  bySupplier: { supplierName: string; tools: number; onHire: number; days: number; cost: number }[]
  byJob: { jobId: string; tools: number; days: number; cost: number }[]
  totals: { tools: number; onHire: number; lostInHole: number; noRate: number; cost: number }
}

const money = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function RentalInwardView() {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canEdit = hasRole('Admin', 'Operations')

  const [tab, setTab] = useState<Tab>('hires')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const { data: hires, isLoading, error, refetch } = useFetch<Hire[]>(
    `/rental-inward?${search ? `search=${encodeURIComponent(search)}&` : ''}${status ? `status=${encodeURIComponent(status)}` : ''}`)
  const { data: summary, refetch: refetchSummary } = useFetch<Summary>('/rental-inward/summary')

  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({
    supplierName: '', rentalRef: '', assetNo: '', shortDesc: '', size: '',
    oemSerial: '', jobId: '', dateIn: new Date().toISOString().slice(0, 10),
    expectedOut: '', dayRate: '', currency: 'USD', addToInventory: true,
  })

  async function take() {
    if (!form.supplierName.trim()) { showToast('Supplier is required', 'error'); return }
    setBusy(true)
    try {
      const r = await api('/rental-inward', { method: 'POST', body: JSON.stringify(form) }) as any
      showToast(r.addedToInventory
        ? `On hire, and added to inventory as ${form.assetNo}`
        : 'Recorded as on hire', 'success')
      setAdding(false)
      setForm(f => ({ ...f, rentalRef: '', assetNo: '', shortDesc: '', size: '', oemSerial: '', jobId: '' }))
      refetch(); refetchSummary()
    } catch (e: any) { showToast(e.message || 'Could not record the hire', 'error') }
    finally { setBusy(false) }
  }

  async function sendBack(h: Hire, st: string) {
    setBusy(true)
    try {
      await api(`/rental-inward/${h.id}/return`, {
        method: 'POST',
        body: JSON.stringify({ dateOut: new Date().toISOString().slice(0, 10), status: st }),
      })
      showToast(st === 'Lost in Hole' ? 'Marked lost in hole' : 'Returned to supplier', 'success')
      refetch(); refetchSummary()
    } catch (e: any) { showToast(e.message || 'Could not close the hire', 'error') }
    finally { setBusy(false) }
  }

  if (isLoading) return <PageLoader />
  if (error) return <div className="card p-6 text-center text-sm text-red-600">{error}</div>

  const rows = hires || []
  const t = summary?.totals
  const maxCost = Math.max(1, ...(summary?.bySupplier || []).map(s => Number(s.cost)))

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Third-Party Rentals</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Tools hired in from sub-contractors — what we hold, and what it is costing
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9 w-52" placeholder="supplier, asset or serial…"
                   value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <ListOptions name="RentalInStatus" />
          </select>
          <button className="btn-ghost" onClick={() => { refetch(); refetchSummary() }}>
            <RefreshCw size={15} />
          </button>
          {canEdit && (
            <button className="btn-primary" onClick={() => setAdding(v => !v)}>
              <Plus size={15} /> Take on hire
            </button>
          )}
        </div>
      </div>

      {t && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="On hire now" value={Number(t.onHire || 0).toLocaleString()}
                icon={<PackagePlus size={22} className="text-blue-600" />} iconBg="bg-blue-100" />
          <Stat label="Cost to date" value={money(t.cost)}
                sub="day rate × days held" />
          <Stat label="Lost in hole" value={Number(t.lostInHole || 0).toLocaleString()}
                tone={Number(t.lostInHole) ? 'warn' : 'default'}
                sub={Number(t.lostInHole) ? 'will be invoiced at replacement cost' : undefined} />
          <Stat label="No day rate set" value={Number(t.noRate || 0).toLocaleString()}
                tone={Number(t.noRate) ? 'warn' : 'default'}
                sub={Number(t.noRate) ? 'these cost nothing in the figures above' : undefined}
                icon={<AlertTriangle size={22} className="text-amber-600" />} iconBg="bg-amber-100" />
        </div>
      )}

      {adding && canEdit && (
        <div className="card p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="label">Supplier</label>
              <input className="input mt-1" placeholder="Goss, Coretrax…" value={form.supplierName}
                     onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))} />
            </div>
            <div>
              <label className="label">Their reference</label>
              <input className="input mt-1" value={form.rentalRef}
                     onChange={e => setForm(f => ({ ...f, rentalRef: e.target.value }))} />
            </div>
            <div>
              <label className="label">Our asset no</label>
              <input className="input mt-1" placeholder="what we will call it" value={form.assetNo}
                     onChange={e => setForm(f => ({ ...f, assetNo: e.target.value }))} />
            </div>
            <div>
              <label className="label">Their serial</label>
              <input className="input mt-1" value={form.oemSerial}
                     onChange={e => setForm(f => ({ ...f, oemSerial: e.target.value }))} />
            </div>
            <div>
              <label className="label">Category</label>
              <input className="input mt-1" placeholder="as in inventory" value={form.shortDesc}
                     onChange={e => setForm(f => ({ ...f, shortDesc: e.target.value }))} />
            </div>
            <div>
              <label className="label">Size</label>
              <input className="input mt-1" value={form.size}
                     onChange={e => setForm(f => ({ ...f, size: e.target.value }))} />
            </div>
            <div>
              <label className="label">For job</label>
              <input className="input mt-1" placeholder="optional" value={form.jobId}
                     onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))} />
            </div>
            <div>
              <label className="label">Day rate we pay</label>
              <input type="number" className="input mt-1" value={form.dayRate}
                     onChange={e => setForm(f => ({ ...f, dayRate: e.target.value }))} />
            </div>
            <div>
              <label className="label">Date in</label>
              <input type="date" className="input mt-1" value={form.dateIn}
                     onChange={e => setForm(f => ({ ...f, dateIn: e.target.value }))} />
            </div>
            <div>
              <label className="label">Expected back</label>
              <input type="date" className="input mt-1" value={form.expectedOut}
                     onChange={e => setForm(f => ({ ...f, expectedOut: e.target.value }))} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.addToInventory}
                   onChange={e => setForm(f => ({ ...f, addToInventory: e.target.checked }))} />
            Add to inventory so it can go out on a ticket
            <span className="text-xs text-gray-500">— marked as the supplier's, not ours</span>
          </label>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={take}>Take on hire</button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex border-b border-gray-200">
          {(['hires', 'report'] as Tab[]).map(x => (
            <button key={x} onClick={() => setTab(x)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 -mb-px ${
                tab === x ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {x === 'hires' ? 'Hires' : 'Sub-contractor rentals report'}
            </button>
          ))}
        </div>

        {tab === 'hires' && (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Supplier</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Tool</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Job</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">In</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Days</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Cost</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
                <th className="w-36"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(h => (
                <tr key={h.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-900">{h.supplierName}</td>
                  <td className="px-4 py-2 text-gray-700">
                    {h.assetNo || h.oemSerial || '—'}
                    {h.shortDesc && <span className="text-gray-400 text-xs ml-1">{h.shortDesc}</span>}
                  </td>
                  <td className="px-4 py-2 text-gray-600 text-xs">{h.jobId || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{String(h.dateIn).slice(0, 10)}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{h.daysOnHire}</td>
                  <td className="px-4 py-2 text-right text-gray-900">
                    {h.dayRate == null
                      ? <span className="text-amber-600 text-xs">no rate</span>
                      : money(h.costToDate)}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      h.status === 'On Hire' ? 'bg-blue-100 text-blue-800'
                      : h.status === 'Lost in Hole' ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-600'}`}>{h.status}</span>
                  </td>
                  <td className="px-4 py-2">
                    {canEdit && !h.dateOut && (
                      <div className="flex gap-1">
                        <button className="btn-ghost text-xs" disabled={busy}
                                onClick={() => sendBack(h, 'Returned')}>
                          <Undo2 size={13} /> Return
                        </button>
                        <button className="btn-ghost text-xs text-red-600" disabled={busy}
                                onClick={() => sendBack(h, 'Lost in Hole')}>LIH</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                  No third-party hires recorded.
                </td></tr>
              )}
            </tbody>
          </table>
        )}

        {tab === 'report' && summary && (
          <div className="p-4 space-y-5">
            {Number(t?.noRate) > 0 && (
              <div className="card p-3 border-l-4 border-l-amber-400">
                <p className="text-sm text-gray-700">
                  <strong>{t!.noRate}</strong> hire(s) have no day rate, so they contribute
                  nothing to the costs below. The figures are a floor, not the full cost.
                </p>
              </div>
            )}

            <Panel title="By supplier" subtitle="Cost is day rate × days held">
              <div className="py-1">
                {summary.bySupplier.map(s => (
                  <Bar key={s.supplierName}
                       label={`${s.supplierName} — ${money(s.cost)} · ${s.tools} tool(s), ${s.onHire} still out`}
                       value={Number(s.cost)} total={maxCost} tone="bg-blue-500" />
                ))}
                {summary.bySupplier.length === 0 && (
                  <p className="text-sm text-gray-400 py-4 text-center">Nothing yet.</p>
                )}
              </div>
            </Panel>

            <Panel title="By job" subtitle="What sub-contractor tools cost each job">
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-600">Job</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">Tools</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">Days</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-600">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byJob.map(j => (
                      <tr key={j.jobId} className="border-t border-gray-100">
                        <td className="px-4 py-2 text-gray-800">{j.jobId}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{j.tools}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{j.days}</td>
                        <td className="px-4 py-2 text-right font-medium text-gray-900">{money(j.cost)}</td>
                      </tr>
                    ))}
                    {summary.byJob.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">
                        Nothing yet.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        )}
      </div>
    </div>
  )
}
