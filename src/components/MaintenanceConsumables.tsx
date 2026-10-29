import { useEffect, useState } from 'react'
import { Boxes, Plus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './Toast'
import { api } from '../utils/api'

/*
 * Consumables used on a maintenance job.
 *
 * Issuing lives here rather than on a store screen, because consumables
 * are used on maintenance work and this is where the person doing it is.
 * Each issue writes a negative movement against the item, so the stock
 * balance follows from the work without anyone keying it twice.
 */

interface Item { id: number; itemCode: string; itemName: string; uom: string | null; qtyOnHand: number }
interface Used {
  id: number; consumableId: number; movedOn: string; qtyUsed: number
  unitCost: number | null; value: number | null
  itemCode: string; itemName: string; uom: string | null
  notes: string | null; createdBy: string | null
}

const num = (n: number | null | undefined, dp = 2) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })

export function MaintenanceConsumables({ mjNumber }: { mjNumber: string }) {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canIssue = hasRole('Admin', 'Operations', 'QAQC')

  const [used, setUsed]   = useState<Used[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy]   = useState(false)
  const [pick, setPick]   = useState({ consumableId: '', qty: '' })

  async function load() {
    try {
      const [u, i] = await Promise.all([
        api.get<Used[]>(`/consumables/for/${encodeURIComponent(mjNumber)}`),
        api.get<Item[]>('/consumables'),
      ])
      setUsed(u); setItems(i)
    } catch { /* the panel simply stays empty rather than breaking the job screen */ }
  }
  useEffect(() => { if (mjNumber) load() }, [mjNumber])

  async function issue() {
    const id = Number(pick.consumableId)
    if (!id) { showToast('Choose an item', 'error'); return }
    setBusy(true)
    try {
      const r = await api(`/consumables/${id}/issue`, {
        method: 'POST',
        body: JSON.stringify({ qty: Number(pick.qty), maintenanceJob: mjNumber }),
      }) as any
      showToast(`Issued — ${num(r.remaining, 0)} left on hand`, 'success')
      setPick({ consumableId: '', qty: '' })
      load()
    } catch (e: any) {
      // The API refuses rather than letting stock go negative, and its
      // message carries what is actually on hand.
      showToast(e.message || 'Could not issue that', 'error')
    } finally { setBusy(false) }
  }

  const totalValue = used.reduce((a, u) => a + (u.value || 0), 0)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="label flex items-center gap-1.5"><Boxes size={13} /> Consumables used</label>
        {totalValue > 0 && <span className="text-xs text-gray-500">{num(totalValue)} total</span>}
      </div>

      {used.length > 0 && (
        <div className="border border-gray-200 rounded overflow-hidden">
          <table className="w-full text-xs">
            <tbody>
              {used.map(u => (
                <tr key={u.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-2 py-1.5 text-gray-800">{u.itemName}</td>
                  <td className="px-2 py-1.5 text-right text-gray-700 whitespace-nowrap">
                    {num(u.qtyUsed, 0)} {u.uom || ''}
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-500 whitespace-nowrap">
                    {u.value == null ? '' : num(u.value)}
                  </td>
                  <td className="px-2 py-1.5 text-gray-400 whitespace-nowrap">
                    {String(u.movedOn).slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {used.length === 0 && (
        <p className="text-xs text-gray-400">Nothing issued to this job yet.</p>
      )}

      {canIssue && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <select className="input py-1 text-sm" value={pick.consumableId}
                    onChange={e => setPick(p => ({ ...p, consumableId: e.target.value }))}>
              <option value="">Choose an item…</option>
              {items.map(i => (
                // The balance is on the option, so nobody has to leave the
                // job screen to find out whether there is enough.
                <option key={i.id} value={i.id} disabled={i.qtyOnHand <= 0}>
                  {i.itemName} — {num(i.qtyOnHand, 0)} {i.uom || ''} on hand
                  {i.qtyOnHand <= 0 ? ' (none left)' : ''}
                </option>
              ))}
            </select>
          </div>
          <input type="number" className="input py-1 text-sm w-20" placeholder="qty"
                 value={pick.qty} onChange={e => setPick(p => ({ ...p, qty: e.target.value }))} />
          <button className="btn-ghost" disabled={busy || !pick.consumableId || !pick.qty}
                  onClick={issue}>
            <Plus size={14} /> Issue
          </button>
        </div>
      )}
    </div>
  )
}
