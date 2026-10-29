import { useEffect, useState } from 'react'
import {
  Plus, Trash2, Search, RefreshCw, ClipboardPaste, PackageCheck,
  FileText, AlertTriangle, CheckCircle2, Receipt,
} from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { ListOptions } from '../components/ListOptions'
import { PageLoader } from '../components/Spinner'
import { Stat } from '../components/Stat'
import { api } from '../utils/api'

/*
 * PO & Goods Inward.
 *
 * Tab 1 is the Epicor PO copied in — header plus lines, pasted straight
 * from a spreadsheet. Epicor stays the master; this copy exists for the
 * tracking it does not surface here: POs still to issue, POs against a
 * job, and which supplier invoices have arrived.
 *
 * Tab 2 is the GRN: the same PO lines with a tick box and, per line, where
 * the item goes — Asset, Inventory or Consumable.
 */

type Tab = 'po' | 'grn'

interface POLine {
  id: number; lineNo: number
  partNumber: string | null; description: string | null; size: string | null
  qty: number; uom: string | null; unitRate: number | null; lineAmount: number | null
  currency: string | null; jobId: string | null; destination: string | null
  qtyReceived?: number
}
interface PO {
  id: number; poNumber: string; supplierName: string | null; poDate: string | null
  currency: string | null; poValue: number | null; status: string
  invoiceNumber: string | null; invoiceDate: string | null; invoiceAmount: number | null
  notes: string | null; lineCount?: number; linesReceived?: number
  lines?: POLine[]
}
interface OpenLine extends POLine {
  poLineId: number; expectedDestination: string | null
  qtyReceived: number; outstanding: number
}
interface Summary {
  pendingIssue: number; openOrders: number
  invoicePending: number; invoiceReceived: number
  total: number; openValue: number
}

const money = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function PurchaseOrdersView() {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canEdit = hasRole('Admin', 'Operations', 'Finance')

  const [tab, setTab]       = useState<Tab>('po')
  const [search, setSearch] = useState('')
  const { data: list, isLoading, error, refetch } =
    useFetch<PO[]>(`/purchase-orders${search ? `?search=${encodeURIComponent(search)}` : ''}`)
  const { data: summary, refetch: refetchSummary } = useFetch<Summary>('/purchase-orders/summary')

  const [openPO, setOpenPO] = useState<PO | null>(null)
  const [busy, setBusy]     = useState(false)
  const [creating, setCreating] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [head, setHead] = useState({
    poNumber: '', supplierName: '', poDate: new Date().toISOString().slice(0, 10),
    currency: 'USD', poValue: '',
  })

  // GRN tab state — one entry per ticked PO line
  const [openLines, setOpenLines] = useState<OpenLine[]>([])
  const [ticked, setTicked] = useState<Record<number, {
    qtyReceived: string; destination: string; assetNo: string
    shortDesc: string; condition: string
  }>>({})
  const [grnHead, setGrnHead] = useState({
    receiptDate: new Date().toISOString().slice(0, 10), deliveryNote: '',
  })

  async function loadPO(id: number) {
    try {
      const po = await api.get<PO>(`/purchase-orders/${id}`)
      setOpenPO(po)
      if (tab === 'grn') loadOpenLines(po.poNumber)
    } catch (e: any) { showToast(e.message || 'Could not load that PO', 'error') }
  }

  async function loadOpenLines(poNumber: string) {
    try {
      setOpenLines(await api.get<OpenLine[]>(`/goods-receipts/open/${encodeURIComponent(poNumber)}`))
      setTicked({})
    } catch (e: any) { showToast(e.message || 'Could not load the PO lines', 'error') }
  }
  useEffect(() => {
    if (tab === 'grn' && openPO) loadOpenLines(openPO.poNumber)
  }, [tab, openPO?.poNumber])

  async function createPO() {
    if (!head.poNumber.trim()) { showToast('The Epicor PO number is required', 'error'); return }
    setBusy(true)
    try {
      const r = await api('/purchase-orders', { method: 'POST', body: JSON.stringify(head) }) as any
      showToast(`${r.poNumber} added`, 'success')
      setCreating(false)
      setHead({ poNumber: '', supplierName: '', poDate: new Date().toISOString().slice(0, 10),
                currency: 'USD', poValue: '' })
      refetch(); refetchSummary(); loadPO(r.id)
    } catch (e: any) { showToast(e.message || 'Could not add the PO', 'error') }
    finally { setBusy(false) }
  }

  async function pasteLines() {
    if (!openPO || !pasteText.trim()) return
    setBusy(true)
    try {
      const r = await api(`/purchase-orders/${openPO.id}/lines/paste`,
        { method: 'POST', body: JSON.stringify({ text: pasteText }) }) as any
      showToast(`${r.added} line(s) added`, 'success')
      // Rejected rows are named rather than dropped quietly — a line that
      // did not go in is exactly what someone needs to know about.
      if (r.rejected?.length) {
        showToast(`${r.rejected.length} line(s) not read: ` +
          r.rejected.slice(0, 3).map((x: any) => x.reason).join('; '), 'error')
      }
      setPasteText('')
      loadPO(openPO.id); refetch()
    } catch (e: any) { showToast(e.message || 'Could not paste those lines', 'error') }
    finally { setBusy(false) }
  }

  async function saveHeader(patch: Partial<PO>) {
    if (!openPO) return
    setBusy(true)
    try {
      await api(`/purchase-orders/${openPO.id}`,
        { method: 'PUT', body: JSON.stringify({ ...openPO, ...patch }) })
      showToast('Saved', 'success')
      loadPO(openPO.id); refetch(); refetchSummary()
    } catch (e: any) { showToast(e.message || 'Could not save', 'error') }
    finally { setBusy(false) }
  }

  async function removeLine(lineId: number) {
    if (!openPO) return
    setBusy(true)
    try {
      await api(`/purchase-orders/${openPO.id}/lines/${lineId}`, { method: 'DELETE' })
      loadPO(openPO.id)
    } catch (e: any) { showToast(e.message || 'Could not remove the line', 'error') }
    finally { setBusy(false) }
  }

  function toggle(l: OpenLine) {
    setTicked(t => {
      const next = { ...t }
      if (next[l.poLineId]) delete next[l.poLineId]
      else next[l.poLineId] = {
        qtyReceived: String(l.outstanding),
        destination: l.expectedDestination || 'Asset',
        assetNo: '', shortDesc: l.description || '', condition: 'Good',
      }
      return next
    })
  }

  async function createGRN() {
    if (!openPO) return
    const lines = Object.entries(ticked).map(([poLineId, v]) => ({ poLineId: Number(poLineId), ...v }))
    if (!lines.length) { showToast('Tick at least one line', 'error'); return }
    setBusy(true)
    try {
      const r = await api('/goods-receipts', {
        method: 'POST',
        body: JSON.stringify({ poNumber: openPO.poNumber, ...grnHead, lines }),
      }) as any
      showToast(`${r.grnNumber} created — post it to create the items`, 'success')
      loadOpenLines(openPO.poNumber); refetch(); refetchSummary()
    } catch (e: any) { showToast(e.message || 'Could not create the receipt', 'error') }
    finally { setBusy(false) }
  }

  if (isLoading) return <PageLoader />
  if (error) return <div className="card p-6 text-center text-sm text-red-600">{error}</div>

  const rows = list || []
  const tickCount = Object.keys(ticked).length

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">PO &amp; Goods Inward</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Purchase orders copied from Epicor, and what has been received against them
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9 w-56" placeholder="PO, supplier or invoice…"
                   value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn-ghost" onClick={() => { refetch(); refetchSummary() }}>
            <RefreshCw size={15} />
          </button>
          {canEdit && (
            <button className="btn-primary" onClick={() => setCreating(v => !v)}>
              <Plus size={15} /> Add PO
            </button>
          )}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Pending to issue" value={summary.pendingIssue.toLocaleString()}
                tone={summary.pendingIssue ? 'warn' : 'default'}
                icon={<FileText size={22} className="text-amber-600" />} iconBg="bg-amber-100" />
          <Stat label="Open orders" value={summary.openOrders.toLocaleString()}
                sub={`${money(summary.openValue)} committed`}
                icon={<PackageCheck size={22} className="text-blue-600" />} iconBg="bg-blue-100" />
          <Stat label="Invoices pending" value={summary.invoicePending.toLocaleString()}
                tone={summary.invoicePending ? 'warn' : 'default'}
                icon={<Receipt size={22} className="text-rose-600" />} iconBg="bg-rose-100" />
          <Stat label="Invoices received" value={summary.invoiceReceived.toLocaleString()}
                icon={<CheckCircle2 size={22} className="text-emerald-600" />} iconBg="bg-emerald-100" />
        </div>
      )}

      {creating && canEdit && (
        <div className="card p-4 space-y-3">
          <h3 className="font-medium text-gray-900 text-sm">Copy a PO in from Epicor</h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="label">PO number</label>
              <input className="input mt-1" placeholder="as in Epicor" value={head.poNumber}
                     onChange={e => setHead(h => ({ ...h, poNumber: e.target.value }))} />
            </div>
            <div>
              <label className="label">Supplier</label>
              <input className="input mt-1" value={head.supplierName}
                     onChange={e => setHead(h => ({ ...h, supplierName: e.target.value }))} />
            </div>
            <div>
              <label className="label">PO date</label>
              <input type="date" className="input mt-1" value={head.poDate}
                     onChange={e => setHead(h => ({ ...h, poDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="input mt-1" value={head.currency}
                      onChange={e => setHead(h => ({ ...h, currency: e.target.value }))}>
                <ListOptions name="Currency" current={head.currency} />
              </select>
            </div>
            <div>
              <label className="label">PO value</label>
              <input type="number" className="input mt-1" value={head.poValue}
                     onChange={e => setHead(h => ({ ...h, poValue: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy} onClick={createPO}>Add</button>
            <button className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">PO</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Supplier</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Value</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Received</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Invoice</th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => (
              <tr key={p.id} onClick={() => loadPO(p.id)}
                  className={`border-t border-gray-100 cursor-pointer hover:bg-gray-50 ${openPO?.id === p.id ? 'bg-blue-50' : ''}`}>
                <td className="px-4 py-2 font-medium text-gray-900">{p.poNumber}</td>
                <td className="px-4 py-2 text-gray-600">{p.poDate ? String(p.poDate).slice(0, 10) : '—'}</td>
                <td className="px-4 py-2 text-gray-600 truncate max-w-xs">{p.supplierName || '—'}</td>
                <td className="px-4 py-2 text-right text-gray-700">{money(p.poValue)}</td>
                <td className="px-4 py-2 text-gray-600">{p.linesReceived ?? 0}/{p.lineCount ?? 0} lines</td>
                <td className="px-4 py-2">
                  {p.invoiceNumber
                    ? <span className="text-xs text-emerald-700">{p.invoiceNumber}</span>
                    : <span className="text-xs text-amber-700">pending</span>}
                </td>
                <td className="px-4 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    p.status === 'Received' ? 'bg-emerald-100 text-emerald-800'
                    : p.status === 'Cancelled' ? 'bg-gray-100 text-gray-600'
                    : p.status === 'Pending Issue' ? 'bg-amber-100 text-amber-800'
                    : 'bg-blue-100 text-blue-800'}`}>{p.status}</span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                No purchase orders yet.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {openPO && (
        <div className="card">
          <div className="flex border-b border-gray-200">
            {(['po', 'grn'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-xs font-medium border-b-2 -mb-px ${
                  tab === t ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {t === 'po' ? 'PO details' : 'Goods inward (GRN)'}
              </button>
            ))}
            <div className="ml-auto px-4 py-2 text-xs text-gray-500 self-center">
              {openPO.poNumber}{openPO.supplierName ? ` · ${openPO.supplierName}` : ''}
            </div>
          </div>

          {/* ── PO tab ───────────────────────────────────────────────── */}
          {tab === 'po' && (
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="label">Status</label>
                  <select className="input mt-1" value={openPO.status} disabled={!canEdit}
                          onChange={e => saveHeader({ status: e.target.value })}>
                    <ListOptions name="POStatus" current={openPO.status} />
                  </select>
                </div>
                <div>
                  <label className="label">Supplier invoice no</label>
                  <input className="input mt-1" defaultValue={openPO.invoiceNumber || ''} disabled={!canEdit}
                         placeholder="blank = still pending"
                         onBlur={e => e.target.value !== (openPO.invoiceNumber || '') &&
                                      saveHeader({ invoiceNumber: e.target.value || null })} />
                </div>
                <div>
                  <label className="label">Invoice date</label>
                  <input type="date" className="input mt-1" disabled={!canEdit}
                         defaultValue={openPO.invoiceDate ? String(openPO.invoiceDate).slice(0, 10) : ''}
                         onBlur={e => saveHeader({ invoiceDate: e.target.value || null })} />
                </div>
                <div>
                  <label className="label">Invoice amount</label>
                  <input type="number" className="input mt-1" disabled={!canEdit}
                         defaultValue={openPO.invoiceAmount ?? ''}
                         onBlur={e => saveHeader({ invoiceAmount: e.target.value === '' ? null : Number(e.target.value) })} />
                </div>
              </div>

              <div className="border border-gray-200 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 w-10">#</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Description</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Job</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Qty</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Rate</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Amount</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Received</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(openPO.lines || []).map(l => (
                      <tr key={l.id} className="border-t border-gray-100">
                        <td className="px-3 py-1.5 text-gray-400">{l.lineNo}</td>
                        <td className="px-3 py-1.5 text-gray-800">
                          {l.description || '—'}
                          {l.partNumber && <span className="text-gray-400 text-xs ml-1">{l.partNumber}</span>}
                        </td>
                        <td className="px-3 py-1.5 text-gray-600 text-xs">{l.jobId || '—'}</td>
                        <td className="px-3 py-1.5 text-right text-gray-700">{Number(l.qty)}</td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{money(l.unitRate)}</td>
                        <td className="px-3 py-1.5 text-right text-gray-900">{money(l.lineAmount)}</td>
                        <td className="px-3 py-1.5 text-xs">
                          {Number(l.qtyReceived ?? 0) >= Number(l.qty)
                            ? <span className="text-emerald-700">complete</span>
                            : <span className="text-amber-700">{Number(l.qtyReceived ?? 0)} of {Number(l.qty)}</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          {canEdit && !Number(l.qtyReceived) && (
                            <button className="btn-ghost p-1" disabled={busy} onClick={() => removeLine(l.id)}>
                              <Trash2 size={13} className="text-red-500" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(openPO.lines || []).length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-gray-400">
                        No lines yet — paste them from Epicor below.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {canEdit && (
                <div className="space-y-2">
                  <label className="label flex items-center gap-1.5">
                    <ClipboardPaste size={13} /> Paste lines from Epicor
                  </label>
                  <textarea className="input font-mono text-xs h-24"
                            placeholder={'Part\tDescription\tSize\tQty\tUOM\tRate\nP-1001\tOvershot 8"\t8"\t2\tEA\t1000'}
                            value={pasteText} onChange={e => setPasteText(e.target.value)} />
                  <div className="flex items-center gap-2">
                    <button className="btn-primary" disabled={busy || !pasteText.trim()} onClick={pasteLines}>
                      Add lines
                    </button>
                    <span className="text-xs text-gray-500">
                      One line each, columns separated by tabs — copy straight from the spreadsheet.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── GRN tab ──────────────────────────────────────────────── */}
          {tab === 'grn' && (
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="label">Receipt date</label>
                  <input type="date" className="input mt-1" value={grnHead.receiptDate}
                         onChange={e => setGrnHead(h => ({ ...h, receiptDate: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Supplier delivery note</label>
                  <input className="input mt-1" value={grnHead.deliveryNote}
                         onChange={e => setGrnHead(h => ({ ...h, deliveryNote: e.target.value }))} />
                </div>
              </div>

              <div className="border border-gray-200 rounded overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="w-10 px-3 py-2"></th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Line</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Outstanding</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 w-24">Receiving</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 w-36">Goes to</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Asset no</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600 w-32">Condition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openLines.map(l => {
                      const t = ticked[l.poLineId]
                      const done = l.outstanding <= 0
                      return (
                        <tr key={l.poLineId}
                            className={`border-t border-gray-100 ${done ? 'bg-gray-50 text-gray-400' : ''}`}>
                          <td className="px-3 py-1.5">
                            <input type="checkbox" disabled={done || !canEdit}
                                   checked={!!t} onChange={() => toggle(l)} />
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="text-gray-800">{l.lineNo}. {l.description || '—'}</div>
                            {l.jobId && <div className="text-xs text-gray-400">{l.jobId}</div>}
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            {done
                              ? <span className="text-xs text-emerald-700">complete</span>
                              : <span className="text-gray-700">{l.outstanding} {l.uom || ''}</span>}
                          </td>
                          <td className="px-3 py-1.5">
                            {t && <input type="number" className="input py-1 text-sm" value={t.qtyReceived}
                                         onChange={e => setTicked(x => ({ ...x,
                                           [l.poLineId]: { ...t, qtyReceived: e.target.value } }))} />}
                          </td>
                          <td className="px-3 py-1.5">
                            {t && (
                              <select className="input py-1 text-sm" value={t.destination}
                                      onChange={e => setTicked(x => ({ ...x,
                                        [l.poLineId]: { ...t, destination: e.target.value } }))}>
                                <ListOptions name="GRNDestination" current={t.destination} />
                              </select>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            {t && t.destination !== 'Consumable' && (
                              <input className="input py-1 text-sm" placeholder="required"
                                     value={t.assetNo}
                                     onChange={e => setTicked(x => ({ ...x,
                                       [l.poLineId]: { ...t, assetNo: e.target.value } }))} />
                            )}
                            {t && t.destination === 'Consumable' && (
                              <span className="text-xs text-gray-400">goes to stock balance</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            {t && (
                              <select className="input py-1 text-sm" value={t.condition}
                                      onChange={e => setTicked(x => ({ ...x,
                                        [l.poLineId]: { ...t, condition: e.target.value } }))}>
                                <ListOptions name="GRNCondition" current={t.condition} />
                              </select>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {openLines.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-400">
                        This PO has no lines yet.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {canEdit && (
                <div className="flex items-center gap-3 flex-wrap">
                  <button className="btn-primary" disabled={busy || !tickCount} onClick={createGRN}>
                    <PackageCheck size={15} /> Receive {tickCount || ''} line{tickCount === 1 ? '' : 's'}
                  </button>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <AlertTriangle size={12} className="text-amber-500" />
                    Receiving records what arrived. Posting the GRN is what creates the asset or stock.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
