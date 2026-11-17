import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Package, Search, X } from 'lucide-react'
import { api } from '../utils/api'
import { Spinner } from './Spinner'

/**
 * One tool as the picker shows it. `key` must be unique in the list and is
 * what the caller gets back; the other fields are display only.
 */
export interface PickItem {
  key: string
  primary: string            // serial / asset number
  secondary?: string | null  // description
  tag?: string | null        // size, ticket number…
  note?: string | null       // category, supplier…
}

type Props = {
  open: boolean
  title: string
  onClose: () => void
  /** Called with everything ticked when the user presses the action button. */
  onConfirm: (items: PickItem[]) => Promise<void> | void
  /**
   * Either a fixed list to tick from (filtered in the browser), or an async
   * search against the server. With `items` the search box filters; with
   * `search` it queries after two characters.
   */
  items?: PickItem[] | null
  search?: (q: string) => Promise<PickItem[]>
  loading?: boolean
  emptyText?: string
  confirmLabel?: (n: number) => string
  /** Extra controls rendered under the search box (filters, day range…). */
  children?: React.ReactNode
  /** Allow the action button with nothing ticked (e.g. the form itself is the action). */
  allowEmpty?: boolean
}

/**
 * Tick-list tool picker. Replaces the one-tool-per-request modals on the
 * ticket screens: pick everything first, then one call adds the lot
 * (go-live bug 30: a 16-tool DT took over 10 s one request at a time).
 */
export function ToolMultiPicker({
  open, title, onClose, onConfirm, items, search, loading,
  emptyText = 'No tools found', confirmLabel, children, allowEmpty,
}: Props) {
  const [q, setQ]             = useState('')
  const [found, setFound]     = useState<PickItem[]>([])
  const [busy, setBusy]       = useState(false)
  const [saving, setSaving]   = useState(false)
  const [picked, setPicked]   = useState<Record<string, PickItem>>({})
  const seq = useRef(0)

  useEffect(() => {
    if (!open) { setQ(''); setFound([]); setPicked({}); setSaving(false) }
  }, [open])

  // Server search mode: query after two characters, ignore stale replies.
  useEffect(() => {
    if (!open || !search) return
    const term = q.trim()
    if (term.length < 2) { setFound([]); return }
    const id = ++seq.current
    setBusy(true)
    const t = setTimeout(async () => {
      try {
        const res = await search(term)
        if (id === seq.current) setFound(res)
      } catch {
        if (id === seq.current) setFound([])
      } finally {
        if (id === seq.current) setBusy(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, open, search])

  const list = useMemo(() => {
    if (search) return found
    const src = items || []
    const term = q.trim().toLowerCase()
    if (!term) return src
    return src.filter(i =>
      [i.primary, i.secondary, i.tag, i.note].some(v => (v || '').toLowerCase().includes(term)))
  }, [items, found, q, search])

  const pickedList = Object.values(picked)
  const toggle = (it: PickItem) =>
    setPicked(p => {
      const n = { ...p }
      if (n[it.key]) delete n[it.key]
      else n[it.key] = it
      return n
    })
  const allShownPicked = list.length > 0 && list.every(i => picked[i.key])
  const toggleAll = () =>
    setPicked(p => {
      const n = { ...p }
      if (allShownPicked) list.forEach(i => { delete n[i.key] })
      else list.forEach(i => { n[i.key] = i })
      return n
    })

  const confirm = async () => {
    if (!allowEmpty && pickedList.length === 0) return
    setSaving(true)
    try {
      await onConfirm(pickedList)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 text-gray-900 font-semibold">
            <Package size={16} className="text-brand-600" />
            {title}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-4 py-3 border-b border-gray-100 space-y-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              className="input pl-9 w-full"
              placeholder={search ? 'Search serial, asset no, description… (2+ characters)' : 'Filter the list…'}
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          {children}
        </div>

        <div className="flex-1 overflow-y-auto">
          {(busy || loading) && <div className="flex justify-center py-8"><Spinner /></div>}
          {!busy && !loading && search && q.trim().length < 2 && (
            <p className="text-center text-gray-400 text-sm py-8">Type at least 2 characters to search</p>
          )}
          {!busy && !loading && (!search || q.trim().length >= 2) && list.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">{emptyText}</p>
          )}
          {!busy && !loading && list.length > 0 && (
            <table className="w-full text-[12px] border-collapse">
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr>
                  <th className="table-th w-8">
                    <input type="checkbox" checked={allShownPicked} onChange={toggleAll} title="Tick all shown" />
                  </th>
                  <th className="table-th">Part / Asset No</th>
                  <th className="table-th">Description</th>
                  <th className="table-th">Size / Ticket</th>
                  <th className="table-th">Category / Owner</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 500).map(it => (
                  <tr key={it.key} className="border-b border-gray-100 hover:bg-brand-50/40 cursor-pointer"
                      onClick={() => toggle(it)}>
                    <td className="table-td">
                      <input type="checkbox" checked={!!picked[it.key]} onChange={() => toggle(it)}
                             onClick={e => e.stopPropagation()} />
                    </td>
                    <td className="table-td font-mono font-medium">{it.primary || '—'}</td>
                    <td className="table-td text-gray-600 max-w-[320px] truncate" title={it.secondary || ''}>{it.secondary || '—'}</td>
                    <td className="table-td text-gray-500">{it.tag || '—'}</td>
                    <td className="table-td text-gray-500">{it.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {list.length > 500 && (
            <p className="text-center text-gray-400 text-xs py-2">Showing the first 500 — narrow the filter</p>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <span className="text-xs text-gray-500">
            {pickedList.length} selected
            {pickedList.length > 0 && (
              <button className="ml-2 text-brand-600 hover:underline" onClick={() => setPicked({})}>clear</button>
            )}
          </span>
          <button className="btn-ghost ml-auto" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={confirm}
                  disabled={saving || (!allowEmpty && pickedList.length === 0)}>
            {saving ? <><Spinner size="sm" /> Adding…</>
                    : (confirmLabel ? confirmLabel(pickedList.length) : `Add ${pickedList.length || ''} tool${pickedList.length === 1 ? '' : 's'}`)}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Inventory search shared by the ticket screens. Field names are exactly what /api/inventory returns. */
export async function searchInventory(q: string): Promise<PickItem[]> {
  const rows = await api.get<Array<{
    SystemID: string; Serial: string | null; AssetNo: string | null; ShortDesc: string | null
    Size: string | null; Status: string | null; Supplier: string | null; Ownership: string | null; IsEmdad: boolean | number | null
  }>>(`/inventory?search=${encodeURIComponent(q)}&limit=100`)
  return (Array.isArray(rows) ? rows : []).map(r => ({
    key: r.SystemID,
    primary: r.AssetNo || r.Serial || r.SystemID,
    secondary: r.ShortDesc,
    tag: r.Size,
    note: [r.Status, r.IsEmdad ? 'EMDAD' : (r.Supplier || r.Ownership)].filter(Boolean).join(' · '),
  }))
}
