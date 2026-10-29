import { useState } from 'react'
import { Plus, Search, RefreshCw, AlertTriangle, Boxes, ArrowDownUp } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { ListOptions } from '../components/ListOptions'
import { PageLoader } from '../components/Spinner'
import { Stat } from '../components/Stat'
import { api } from '../utils/api'

/*
 * Consumables & Store.
 *
 * A register, not an issuing screen. Consumables are used on maintenance
 * jobs, so issuing happens there — this shows what is held, what it cost,
 * and every movement behind the balance.
 *
 * The balance is the sum of its movements rather than a stored number, so
 * the figure and its history cannot disagree.
 */

interface Item {
  id: number; itemCode: string; itemName: string; uom: string | null
  reorderLevel: number | null; lastUnitCost: number | null; currency: string | null
  activeFlag: boolean; notes: string | null
  qtyOnHand: number; low: boolean
}
interface Movement {
  id: number; movedOn: string; qty: number; unitCost: number | null
  sourceType: string; sourceRef: string | null; jobId: string | null
  issuedTo: string | null; notes: string | null; createdBy: string | null
}

const num = (n: number | null | undefined, dp = 2) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })

export function ConsumablesView() {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canEdit = hasRole('Admin', 'Operations')

  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const { data: items, isLoading, error, refetch } = useFetch<Item[]>(
    `/consumables?${search ? `search=${encodeURIComponent(search)}&` : ''}${lowOnly ? 'low=1' : ''}`)

  const [open, setOpen] = useState<(Item & { movements: Movement[] }) | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ itemCode: '', itemName: '', uom: 'EA', reorderLevel: '', lastUnitCost: '' })
  const [adjust, setAdjust] = useState({ qty: '', reason: '' })

  async function openItem(id: number) {
    try { setOpen(await api.get(`/consumables/${id}`)) }
    catch (e: any) { showToast(e.message || 'Could not load that item', 'error') }
  }

  async function addItem() {
    if (!form.itemCode.trim() || !form.itemName.trim()) {
      showToast('Item code and name are required', 'error'); return
    }
    setBusy(true)
    try {
      await api('/consumables', { method: 'POST', body: JSON.stringify(form) })
      showToast('Item added', 'success')
      setAdding(false); setForm({ itemCode: '', itemName: '', uom: 'EA', reorderLevel: '', lastUnitCost: '' })
      refetch()
    } catch (e: any) { showToast(e.message || 'Could not add the item', 'error') }
    finally { setBusy(false) }
  }

  async function doAdjust() {
    if (!open) return
    setBusy(true)
    try {
      await api(`/consumables/${open.id}/adjust`, { method: 'POST', body: JSON.stringify(adjust) })
      showToast('Adjustment recorded', 'success')
      setAdjust({ qty: '', reason: '' })
      openItem(open.id); refetch()
    } catch (e: any) { showToast(e.message || 'Could not adjust', 'error') }
    finally { setBusy(false) }
  }

  if (isLoading) return <PageLoader />
  if (error) return <div className="card p-6 text-center text-sm text-red-600">{error}</div>

  const rows = items || []
  const lowCount = rows.filter(r => r.low).length
  const stockValue = rows.reduce((a, r) => a + (r.lastUnitCost ? r.qtyOnHand * r.lastUnitCost : 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Consumables &amp; Store</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Stock held at base. Items are issued from a maintenance job, not from here.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9 w-56" placeholder="code or name…"
                   value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap">
            <input type="checkbox" checked={lowOnly} onChange={e => setLowOnly(e.target.checked)} />
            Low stock only
          </label>
          <button className="btn-ghost" onClick={refetch}><RefreshCw size={15} /></button>
          {canEdit && (
            <button className="btn-primary" onClick={() => setAdding(v => !v)}>
              <Plus size={15} /> Add item
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat label="Items held" value={rows.length.toLocaleString()}
              icon={<Boxes size={22} className="text-blue-600" />} iconBg="bg-blue-100" />
        <Stat label="At or below reorder level" value={lowCount.toLocaleString()}
              tone={lowCount ? 'warn' : 'default'}
              sub={lowCount ? 'needs ordering' : undefined}
              icon={<AlertTriangle size={22} className="text-amber-600" />} iconBg="bg-amber-100" />
        <Stat label="Stock value" value={num(stockValue)}
              sub="at last known unit cost" />
      </div>

      {adding && canEdit && (
        <div className="card p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="label">Item code</label>
              <input className="input mt-1" value={form.itemCode}
                     onChange={e => setForm(f => ({ ...f, itemCode: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Item name</label>
              <input className="input mt-1" value={form.itemName}
                     onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))} />
            </div>
            <div>
              <label className="label">Unit</label>
              <select className="input mt-1" value={form.uom}
                      onChange={e => setForm(f => ({ ...f, uom: e.target.value }))}>
                <ListOptions name="ConsumableUOM" current={form.uom} />
              </select>
            </div>
            <div>
              <label className="label">Reorder level</label>
              <input type="number" className="input mt-1" value={form.reorderLevel}
                     onChange={e => setForm(f => ({ ...f, reorderLevel: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={addItem}>Add</button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Code</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Item</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">On hand</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Reorder at</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Unit cost</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} onClick={() => openItem(r.id)}
                  className={`border-t border-gray-100 cursor-pointer hover:bg-gray-50 ${open?.id === r.id ? 'bg-blue-50' : ''}`}>
                <td className="px-4 py-2 text-gray-500 text-xs">{r.itemCode}</td>
                <td className="px-4 py-2 text-gray-900">{r.itemName}</td>
                <td className={`px-4 py-2 text-right font-medium ${r.low ? 'text-amber-700' : 'text-gray-900'}`}>
                  {num(r.qtyOnHand, 0)} {r.uom || ''}
                </td>
                <td className="px-4 py-2 text-right text-gray-500">{r.reorderLevel == null ? '—' : num(r.reorderLevel, 0)}</td>
                <td className="px-4 py-2 text-right text-gray-600">{num(r.lastUnitCost)}</td>
                <td className="px-4 py-2">
                  {r.low && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-800">
                      <AlertTriangle size={10} /> low
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                {lowOnly ? 'Nothing is below its reorder level.' : 'No consumables yet — they arrive through a GRN.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="card p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold text-gray-900">{open.itemName}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {open.itemCode} · {num(open.qtyOnHand, 0)} {open.uom || ''} on hand
              </p>
            </div>
            {canEdit && (
              <div className="flex gap-2 items-end">
                <div>
                  <label className="label">Adjust by</label>
                  <input type="number" className="input mt-1 w-24" placeholder="+/−" value={adjust.qty}
                         onChange={e => setAdjust(a => ({ ...a, qty: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Reason</label>
                  <input className="input mt-1 w-56" placeholder="required" value={adjust.reason}
                         onChange={e => setAdjust(a => ({ ...a, reason: e.target.value }))} />
                </div>
                <button className="btn-ghost" disabled={busy || !adjust.qty || !adjust.reason.trim()}
                        onClick={doAdjust}>
                  <ArrowDownUp size={15} /> Adjust
                </button>
              </div>
            )}
          </div>

          <div className="border border-gray-200 rounded overflow-hidden max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Source</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Reference</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">In / out</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Note</th>
                </tr>
              </thead>
              <tbody>
                {open.movements.map(m => (
                  <tr key={m.id} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 text-gray-600">{String(m.movedOn).slice(0, 10)}</td>
                    <td className="px-3 py-1.5 text-gray-600">{m.sourceType}</td>
                    <td className="px-3 py-1.5 text-gray-600">{m.sourceRef || '—'}</td>
                    <td className={`px-3 py-1.5 text-right font-medium ${Number(m.qty) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                      {Number(m.qty) > 0 ? '+' : ''}{num(m.qty, 0)}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500 text-xs truncate max-w-xs">
                      {m.notes || m.issuedTo || m.jobId || ''}
                    </td>
                  </tr>
                ))}
                {open.movements.length === 0 && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">
                    No movements yet.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-500">
            The balance is the sum of these movements, not a stored figure, so the two can
            never disagree. Receipts come in through a GRN; issues go out against a
            maintenance job.
          </p>
        </div>
      )}
    </div>
  )
}
