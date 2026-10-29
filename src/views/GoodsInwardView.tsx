import { useEffect, useState } from 'react'
import { Plus, Trash2, PackageCheck, Search, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { ListOptions } from '../components/ListOptions'
import { PageLoader } from '../components/Spinner'
import { api } from '../utils/api'

/*
 * Goods Inward (GRN).
 *
 * Epicor owns the purchase order, so there is no PO register here — the PO
 * number is a reference typed in alongside the supplier's delivery note.
 * What this screen owns is what physically arrived and turning it into an
 * inventory asset, which is the step that currently leaves orphan serials:
 * tools appear on tickets having never been taken into stock.
 */

interface Line {
  id: number; itemNo: number
  assetNo: string | null; shortDesc: string | null; size: string | null
  oemSerial: string | null; qty: number; unitCost: number | null
  currency: string | null; condition: string | null; remarks: string | null
  systemId: string | null; acceptedAt: string | null; acceptedBy: string | null
}
interface Receipt {
  id: number; grnNumber: string; poNumber: string | null
  supplierName: string | null; receiptDate: string; deliveryNote: string | null
  receivedBy: string | null; status: string; notes: string | null
  lineCount?: number; acceptedCount?: number
  lines?: Line[]
}

const blankLine = {
  assetNo: '', shortDesc: '', size: '', oemSerial: '',
  qty: '1', unitCost: '', currency: 'USD', condition: 'Good', remarks: '',
}

export function GoodsInwardView() {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canEdit = hasRole('Admin', 'Operations')

  const [search, setSearch]   = useState('')
  const { data: list, isLoading, error, refetch } =
    useFetch<Receipt[]>(`/goods-receipts${search ? `?search=${encodeURIComponent(search)}` : ''}`)

  const [openId, setOpenId]   = useState<number | null>(null)
  const [detail, setDetail]   = useState<Receipt | null>(null)
  const [busy, setBusy]       = useState(false)
  const [newLine, setNewLine] = useState({ ...blankLine })
  const [creating, setCreating] = useState(false)
  const [head, setHead] = useState({
    poNumber: '', supplierName: '', deliveryNote: '',
    receiptDate: new Date().toISOString().slice(0, 10),
  })

  async function loadDetail(id: number) {
    setOpenId(id); setDetail(null)
    try { setDetail(await api.get<Receipt>(`/goods-receipts/${id}`)) }
    catch (e: any) { showToast(e.message || 'Could not load that receipt', 'error') }
  }
  useEffect(() => { if (openId) loadDetail(openId) }, [])

  async function createReceipt() {
    setBusy(true)
    try {
      const r = await api('/goods-receipts', { method: 'POST', body: JSON.stringify(head) }) as any
      showToast(`${r.grnNumber} created`, 'success')
      setCreating(false)
      setHead({ poNumber: '', supplierName: '', deliveryNote: '',
                receiptDate: new Date().toISOString().slice(0, 10) })
      refetch(); loadDetail(r.id)
    } catch (e: any) { showToast(e.message || 'Could not create the receipt', 'error') }
    finally { setBusy(false) }
  }

  async function addLine() {
    if (!detail) return
    if (!newLine.shortDesc.trim()) { showToast('Category is required', 'error'); return }
    setBusy(true)
    try {
      await api(`/goods-receipts/${detail.id}/lines`, { method: 'POST', body: JSON.stringify(newLine) })
      setNewLine({ ...blankLine })
      loadDetail(detail.id); refetch()
    } catch (e: any) { showToast(e.message || 'Could not add the line', 'error') }
    finally { setBusy(false) }
  }

  async function removeLine(lineId: number) {
    if (!detail) return
    setBusy(true)
    try {
      await api(`/goods-receipts/${detail.id}/lines/${lineId}`, { method: 'DELETE' })
      loadDetail(detail.id); refetch()
    } catch (e: any) { showToast(e.message || 'Could not remove the line', 'error') }
    finally { setBusy(false) }
  }

  async function accept() {
    if (!detail) return
    setBusy(true)
    try {
      const r = await api(`/goods-receipts/${detail.id}/accept`, { method: 'POST', body: '{}' }) as any
      // Partial success is reported honestly: one clashing asset number
      // should not look like the whole delivery failed, nor like it worked.
      if (r.created > 0) showToast(`${r.created} asset(s) taken into inventory`, 'success')
      if (r.skipped?.length) {
        showToast(
          `${r.skipped.length} line(s) skipped: ` +
          r.skipped.map((s: any) => `#${s.itemNo} ${s.reason}`).join('; '),
          'error'
        )
      }
      if (!r.created && !r.skipped?.length) showToast(r.message || 'Nothing to accept', 'info')
      loadDetail(detail.id); refetch()
    } catch (e: any) { showToast(e.message || 'Could not accept the receipt', 'error') }
    finally { setBusy(false) }
  }

  if (isLoading) return <PageLoader />
  if (error) return <div className="card p-6 text-center text-sm text-red-600">{error}</div>

  const rows = list || []
  const pendingLines = (detail?.lines || []).filter(l => !l.systemId).length

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">PO &amp; Goods Inward (GRN)</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            What arrived at base, against the Epicor PO. Accepting a receipt takes its items into inventory.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9 w-64" placeholder="GRN, PO, supplier or DN…"
                   value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn-ghost" onClick={refetch}><RefreshCw size={15} /></button>
          {canEdit && (
            <button className="btn-primary" onClick={() => setCreating(v => !v)}>
              <Plus size={15} /> New receipt
            </button>
          )}
        </div>
      </div>

      {creating && canEdit && (
        <div className="card p-4 space-y-3">
          <h3 className="font-medium text-gray-900 text-sm">New goods receipt</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="label">Receipt date</label>
              <input type="date" className="input mt-1" value={head.receiptDate}
                     onChange={e => setHead(h => ({ ...h, receiptDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">Epicor PO number</label>
              <input className="input mt-1" placeholder="as it reads in Epicor"
                     value={head.poNumber}
                     onChange={e => setHead(h => ({ ...h, poNumber: e.target.value }))} />
            </div>
            <div>
              <label className="label">Supplier</label>
              <input className="input mt-1" value={head.supplierName}
                     onChange={e => setHead(h => ({ ...h, supplierName: e.target.value }))} />
            </div>
            <div>
              <label className="label">Supplier delivery note</label>
              <input className="input mt-1" value={head.deliveryNote}
                     onChange={e => setHead(h => ({ ...h, deliveryNote: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={createReceipt}>Create</button>
            <button className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">GRN</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Epicor PO</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Supplier</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Items</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}
                  onClick={() => loadDetail(r.id)}
                  className={`border-t border-gray-100 cursor-pointer hover:bg-gray-50 ${openId === r.id ? 'bg-blue-50' : ''}`}>
                <td className="px-4 py-2 font-medium text-gray-900">{r.grnNumber}</td>
                <td className="px-4 py-2 text-gray-600">{String(r.receiptDate).slice(0, 10)}</td>
                <td className="px-4 py-2 text-gray-600">{r.poNumber || '—'}</td>
                <td className="px-4 py-2 text-gray-600 truncate max-w-xs">{r.supplierName || '—'}</td>
                <td className="px-4 py-2 text-gray-600">
                  {r.acceptedCount ?? 0}/{r.lineCount ?? 0} taken in
                </td>
                <td className="px-4 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    r.status === 'Accepted' ? 'bg-emerald-100 text-emerald-800'
                    : r.status === 'Rejected' ? 'bg-red-100 text-red-800'
                    : 'bg-amber-100 text-amber-800'}`}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                No goods receipts yet.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="card p-4 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold text-gray-900">{detail.grnNumber}</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {String(detail.receiptDate).slice(0, 10)}
                {detail.poNumber    ? <> · Epicor PO {detail.poNumber}</> : null}
                {detail.supplierName ? <> · {detail.supplierName}</> : null}
                {detail.deliveryNote ? <> · DN {detail.deliveryNote}</> : null}
              </p>
            </div>
            {canEdit && pendingLines > 0 && (
              <button className="btn-primary" disabled={busy} onClick={accept}>
                <PackageCheck size={15} /> Accept {pendingLines} item(s) into inventory
              </button>
            )}
          </div>

          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600 w-10">#</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Asset no</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Category</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Size</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Qty</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Condition</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">In stock</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {(detail.lines || []).map(l => (
                  <tr key={l.id} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 text-gray-400">{l.itemNo}</td>
                    <td className="px-3 py-1.5 text-gray-800">{l.assetNo || <span className="text-amber-600">not set</span>}</td>
                    <td className="px-3 py-1.5 text-gray-600">{l.shortDesc || '—'}</td>
                    <td className="px-3 py-1.5 text-gray-600">{l.size || '—'}</td>
                    <td className="px-3 py-1.5 text-right text-gray-600">{Number(l.qty)}</td>
                    <td className="px-3 py-1.5 text-gray-600">{l.condition || '—'}</td>
                    <td className="px-3 py-1.5">
                      {l.systemId
                        ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                            <CheckCircle2 size={12} />{l.systemId}
                          </span>
                        : <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                            <AlertTriangle size={12} />not yet
                          </span>}
                    </td>
                    <td className="px-3 py-1.5">
                      {canEdit && !l.systemId && (
                        <button className="btn-ghost p-1" disabled={busy}
                                title="Remove this line" onClick={() => removeLine(l.id)}>
                          <Trash2 size={13} className="text-red-500" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {(detail.lines || []).length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-gray-400">
                    No items on this receipt yet.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {canEdit && (
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
              <div>
                <label className="label">Asset no</label>
                <input className="input mt-1" value={newLine.assetNo}
                       onChange={e => setNewLine(l => ({ ...l, assetNo: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="label">Category</label>
                <input className="input mt-1" placeholder="as in inventory" value={newLine.shortDesc}
                       onChange={e => setNewLine(l => ({ ...l, shortDesc: e.target.value }))} />
              </div>
              <div>
                <label className="label">Size</label>
                <input className="input mt-1" value={newLine.size}
                       onChange={e => setNewLine(l => ({ ...l, size: e.target.value }))} />
              </div>
              <div>
                <label className="label">Qty</label>
                <input className="input mt-1" type="number" value={newLine.qty}
                       onChange={e => setNewLine(l => ({ ...l, qty: e.target.value }))} />
              </div>
              <div>
                <label className="label">Condition</label>
                <select className="input mt-1" value={newLine.condition}
                        onChange={e => setNewLine(l => ({ ...l, condition: e.target.value }))}>
                  <ListOptions name="GRNCondition" current={newLine.condition} />
                </select>
              </div>
              <button className="btn-primary" disabled={busy} onClick={addLine}>
                <Plus size={15} /> Add
              </button>
            </div>
          )}

          <p className="text-xs text-gray-500">
            Accepting creates one inventory record per item, using the asset number as its
            system id. An item already in inventory is skipped and reported rather than
            duplicated, and a damaged item is taken in as “Inspection” rather than ready
            to mobilise.
          </p>
        </div>
      )}
    </div>
  )
}
