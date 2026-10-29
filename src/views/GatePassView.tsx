import React, { useState, useMemo, useCallback } from 'react'
import {
  Plus, Search, RefreshCw, X, ChevronRight,
  Trash2, Package, Save, ArrowUpCircle, ArrowDownCircle,
} from 'lucide-react'
import { useRealtimeFetch } from '../hooks/useRealtimeFetch'
import { useFetch }         from '../hooks/useFetch'
import { useAuth }          from '../contexts/AuthContext'
import { useToast }         from '../components/Toast'
import { api }              from '../utils/api'
import { formatDate, statusBadgeClass } from '../utils/format'
import { PageLoader, Spinner } from '../components/Spinner'
import { ListOptions } from '../components/ListOptions'

// ─── Types ───────────────────────────────────────────────────────────────────

interface GatePass {
  GatePassID: number
  GatePassNumber: string
  JobID: string
  Direction: 'In' | 'Out'
  PassDate: string | null
  Status: string
  Notes: string | null
  CreatedDate: string | null
  ItemCount: number
}

interface GPItem {
  ItemID: number
  GatePassID: number
  LineNumber: number
  SerialNumber: string | null
  AssetNo: string | null
  ToolDescription: string | null
  Quantity: number
  Notes: string | null
}

interface InventoryItem {
  SystemID: string
  Serial: string | null
  AssetNo: string | null
  ShortDesc: string | null
  SizeName: string | null
  CategoryName: string | null
}


// ─── Tool Picker ──────────────────────────────────────────────────────────────

function ToolPickerModal({
  open, onClose, onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (item: InventoryItem) => void
}) {
  const [search,  setSearch]  = useState('')
  const [results, setResults] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(false)

  const handleSearch = useCallback(async (q: string) => {
    setSearch(q)
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const data = await api.get<InventoryItem[]>(`/inventory?search=${encodeURIComponent(q)}`)
      setResults(Array.isArray(data) ? data.slice(0, 20) : [])
    } catch { setResults([]) }
    finally  { setLoading(false) }
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="font-semibold text-gray-900 flex items-center gap-2">
            <Package size={16} className="text-brand-600" /> Select Tool
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus className="input pl-9 w-full"
              placeholder="Search serial, asset, description…"
              value={search} onChange={e => handleSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-8"><Spinner /></div>}
          {!loading && search.length < 2 && (
            <p className="text-center text-gray-400 text-sm py-8">Type at least 2 characters</p>
          )}
          {!loading && search.length >= 2 && results.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">No tools found</p>
          )}
          {results.map(item => (
            <button key={item.SystemID}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
              onClick={() => { onSelect(item); onClose(); setSearch(''); setResults([]) }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sm text-gray-900">{item.Serial || item.AssetNo || '—'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.ShortDesc}</p>
                </div>
                <div className="text-right shrink-0">
                  {item.SizeName && (
                    <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{item.SizeName}</span>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">{item.CategoryName}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateGPModal({
  open, onClose, onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const { success, error: toastErr } = useToast()
  const [form, setForm] = useState({
    JobID: '',
    Direction: 'Out' as 'In' | 'Out',
    PassDate: new Date().toISOString().split('T')[0],
    Notes: '',
  })
  const [saving, setSaving] = useState(false)

  const { data: jobs } = useFetch<{ JobID: string; Rig: string; Well: string }[]>('/jobs?status=Active')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.JobID) { toastErr('Job is required'); return }
    setSaving(true)
    try {
      const res = await api.post<{ GatePassID: number; GatePassNumber: string }>('/gate-passes', form)
      success(`Created ${res.GatePassNumber}`)
      onCreated()
      setForm({ JobID: '', Direction: 'Out', PassDate: new Date().toISOString().split('T')[0], Notes: '' })
    } catch (err: any) {
      toastErr(err.message || 'Failed to create gate pass')
    } finally { setSaving(false) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">New Gate Pass</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Job *</label>
            <select className="input w-full" value={form.JobID}
              onChange={e => setForm(f => ({ ...f, JobID: e.target.value }))} required>
              <option value="">— Select job —</option>
              {(jobs || []).map(j => (
                <option key={j.JobID} value={j.JobID}>{j.JobID} — {j.Rig} / {j.Well}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Direction *</label>
              <select className="input w-full" value={form.Direction}
                onChange={e => setForm(f => ({ ...f, Direction: e.target.value as 'In'|'Out' }))}>
                <option value="Out">Out — Sending to site</option>
                <option value="In">In — Returning from site</option>
              </select>
            </div>
            <div>
              <label className="label">Pass Date</label>
              <input type="date" className="input w-full" value={form.PassDate}
                onChange={e => setForm(f => ({ ...f, PassDate: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input w-full" rows={2} value={form.Notes}
              onChange={e => setForm(f => ({ ...f, Notes: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <Spinner size="sm" /> : <Plus size={14} />}
              Create GP
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function GPDetailPanel({
  gp, onClose, onRefresh,
}: {
  gp: GatePass
  onClose: () => void
  onRefresh: () => void
}) {
  const { hasRole } = useAuth()
  const { success, error: toastErr } = useToast()
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    PassDate: gp.PassDate?.split('T')[0] ?? '',
    Status: gp.Status,
    Notes: gp.Notes ?? '',
  })

  const { data: items, refetch: refetchItems } =
    useFetch<GPItem[]>(`/gate-passes/${gp.GatePassID}/items`)

  const canEdit = hasRole('Admin', 'Operations')

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/gate-passes/${gp.GatePassID}`, form)
      success('Saved')
      onRefresh()
    } catch (err: any) {
      toastErr(err.message || 'Save failed')
    } finally { setSaving(false) }
  }

  const handleAddTool = async (item: InventoryItem) => {
    try {
      await api.post(`/gate-passes/${gp.GatePassID}/items`, {
        Serial: item.Serial || item.AssetNo,
        AssetNo: item.AssetNo,
        ToolDescription: item.ShortDesc,
        Quantity: 1,
      })
      refetchItems()
      success('Tool added')
    } catch (err: any) {
      toastErr(err.message || 'Failed to add tool')
    }
  }

  const handleRemove = async (itemId: number) => {
    try {
      await api.delete(`/gate-passes/${gp.GatePassID}/items/${itemId}`)
      refetchItems()
      success('Removed')
    } catch (err: any) {
      toastErr(err.message || 'Failed to remove')
    }
  }

  const directionColor = gp.Direction === 'Out'
    ? 'bg-amber-100 text-amber-700'
    : 'bg-green-100 text-green-700'

  return (
    <>
      <ToolPickerModal open={showPicker} onClose={() => setShowPicker(false)} onSelect={handleAddTool} />

      <div className="w-[480px] shrink-0 bg-white border-l border-gray-200 flex flex-col h-full overflow-hidden shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900">{gp.GatePassNumber}</p>
              <span className={`badge text-xs ${directionColor} flex items-center gap-1`}>
                {gp.Direction === 'Out'
                  ? <><ArrowUpCircle size={11} /> Out</>
                  : <><ArrowDownCircle size={11} /> In</>}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Job: {gp.JobID}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 border-b border-gray-100 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Pass Date</label>
              <input type="date" className="input w-full" value={form.PassDate}
                onChange={e => setForm(f => ({ ...f, PassDate: e.target.value }))}
                disabled={!canEdit} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input w-full" value={form.Status}
                onChange={e => setForm(f => ({ ...f, Status: e.target.value }))}
                disabled={!canEdit}>
                <ListOptions name="GatePassStatus" />
              </select>
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input w-full" rows={2} value={form.Notes}
              onChange={e => setForm(f => ({ ...f, Notes: e.target.value }))}
              disabled={!canEdit} />
          </div>
          {canEdit && (
            <div className="flex justify-end">
              <button className="btn-primary text-xs py-1.5 px-3" onClick={handleSave} disabled={saving}>
                {saving ? <Spinner size="sm" /> : <Save size={12} />}
                Save Header
              </button>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">
              Tool Manifest ({items?.length ?? 0})
            </p>
            {canEdit && (
              <button className="btn-primary text-xs py-1.5 px-3" onClick={() => setShowPicker(true)}>
                <Plus size={12} /> Add Tool
              </button>
            )}
          </div>

          {(!items || items.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Package size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No tools in manifest</p>
              {canEdit && (
                <button className="mt-3 text-brand-600 text-sm hover:text-brand-700"
                  onClick={() => setShowPicker(true)}>
                  + Add first tool
                </button>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="table-th text-xs">#</th>
                  <th className="table-th text-xs">Serial / Asset</th>
                  <th className="table-th text-xs">Description</th>
                  <th className="table-th text-xs">Qty</th>
                  {canEdit && <th className="table-th w-8"></th>}
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.ItemID} className="table-tr">
                    <td className="table-td text-xs text-gray-400">{item.LineNumber}</td>
                    <td className="table-td text-xs font-mono">
                      {item.SerialNumber || item.AssetNo || '—'}
                    </td>
                    <td className="table-td text-xs text-gray-600 max-w-[150px] truncate">
                      {item.ToolDescription || '—'}
                    </td>
                    <td className="table-td text-xs">{item.Quantity}</td>
                    {canEdit && (
                      <td className="table-td">
                        <button onClick={() => handleRemove(item.ItemID)}
                          className="text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
          {items?.length ?? 0} tool(s) · Created {formatDate(gp.CreatedDate)}
        </div>
      </div>
    </>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function GatePassView() {
  const { hasRole } = useAuth()
  const [search,     setSearch]     = useState('')
  const [direction,  setDirection]  = useState('All')
  const [status,     setStatus]     = useState('All')
  const [selected,   setSelected]   = useState<GatePass | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: passes, isLoading, error, refetch } =
    useRealtimeFetch<GatePass[]>('/gate-passes')

  const filtered = useMemo(() => {
    if (!passes) return []
    return passes.filter(p => {
      if (direction !== 'All' && p.Direction !== direction) return false
      if (status    !== 'All' && p.Status    !== status)    return false
      if (!search) return true
      const q = search.toLowerCase()
      return (
        (p.GatePassNumber || '').toLowerCase().includes(q) ||
        (p.JobID          || '').toLowerCase().includes(q)
      )
    })
  }, [passes, direction, status, search])

  if (isLoading) return <PageLoader />

  return (
    <>
      <CreateGPModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); refetch() }}
      />

      <div className="flex gap-0 h-full">
        {/* Left: list */}
        <div className="flex-1 min-w-0 space-y-4 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input pl-9" placeholder="Search GP number, Job ID…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="input w-auto" value={direction}
              onChange={e => setDirection(e.target.value)}>
              <option value="All">All Directions</option>
              <option value="Out">Out</option>
              <option value="In">In</option>
            </select>
            <select className="input w-auto" value={status}
              onChange={e => setStatus(e.target.value)}>
              <ListOptions name="GatePassStatus" includeAll allLabel="All Statuses" />
            </select>
            <button onClick={refetch} className="btn-ghost"><RefreshCw size={15} /></button>
            {hasRole('Admin', 'Operations') && (
              <button className="btn-primary" onClick={() => setShowCreate(true)}>
                <Plus size={15} /> New GP
              </button>
            )}
          </div>

          {error && <div className="card p-3 text-red-600 text-sm">{error}</div>}
          <p className="text-xs text-gray-500">{filtered.length} gate passes</p>

          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">GP Number</th>
                  <th className="table-th">Job ID</th>
                  <th className="table-th">Direction</th>
                  <th className="table-th">Pass Date</th>
                  <th className="table-th">Items</th>
                  <th className="table-th">Status</th>
                  <th className="table-th w-6"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-td text-center text-gray-400 py-12">
                      No gate passes found
                    </td>
                  </tr>
                ) : (
                  filtered.map(p => (
                    <tr key={p.GatePassID}
                      className={`table-tr cursor-pointer ${
                        selected?.GatePassID === p.GatePassID
                          ? 'bg-brand-50 border-l-2 border-l-brand-500' : ''
                      }`}
                      onClick={() => setSelected(p)}>
                      <td className="table-td font-medium text-brand-600">{p.GatePassNumber}</td>
                      <td className="table-td">{p.JobID}</td>
                      <td className="table-td">
                        <span className={`badge text-xs flex items-center gap-1 w-fit ${
                          p.Direction === 'Out'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {p.Direction === 'Out'
                            ? <><ArrowUpCircle size={10} /> Out</>
                            : <><ArrowDownCircle size={10} /> In</>}
                        </span>
                      </td>
                      <td className="table-td text-gray-500">{formatDate(p.PassDate)}</td>
                      <td className="table-td text-gray-500">{p.ItemCount ?? 0}</td>
                      <td className="table-td">
                        <span className={`badge ${statusBadgeClass(p.Status)}`}>{p.Status}</span>
                      </td>
                      <td className="table-td">
                        <ChevronRight size={13} className={
                          selected?.GatePassID === p.GatePassID ? 'text-brand-400' : 'text-gray-300'
                        } />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: detail */}
        {selected && (
          <GPDetailPanel
            key={selected.GatePassID}
            gp={selected}
            onClose={() => setSelected(null)}
            onRefresh={refetch}
          />
        )}
      </div>
    </>
  )
}
