import React, { useState, useMemo, useCallback } from 'react'
import {
  Plus, Search, RefreshCw, X, ChevronRight,
  Trash2, Package, Save, FileInput,
} from 'lucide-react'
import { useRealtimeFetch } from '../hooks/useRealtimeFetch'
import { useFetch }         from '../hooks/useFetch'
import { useAuth }          from '../contexts/AuthContext'
import { useToast }         from '../components/Toast'
import { api }              from '../utils/api'
import { formatDate, statusBadgeClass } from '../utils/format'
import { PageLoader, Spinner } from '../components/Spinner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface RT {
  RTID: number
  RTNumber: string
  JobID: string
  RTDate: string | null
  Status: string
  Notes: string | null
  LinkedDTNumber: string | null
  CreatedBy: string | null
  CreatedDate: string | null
  Client: string | null
  LineCount: number
}

interface RTLine {
  LineID: number
  RTID: number
  LineNumber: number
  SerialNumber: string | null
  AssetNo: string | null
  ToolDescription: string | null
  SizeName: string | null
  Quantity: number
  Condition: string | null
  UsedStatus: string | null
  RoutedTo: string | null
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

const STATUS_OPTIONS = ['Draft', 'Received', 'Verified', 'Locked'] as const
const CONDITION_OPTIONS = ['Good', 'Damaged', 'Inspection Required', 'Scrap'] as const
const USED_STATUS_OPTIONS = ['Used', 'Unused'] as const
const ROUTE_OPTIONS = ['Base', 'Workshop', 'Inspection Bay', 'Customer Return'] as const

// ─── Tool Picker Modal ────────────────────────────────────────────────────────

function ToolPickerModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (item: InventoryItem) => void
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(false)

  const handleSearch = useCallback(async (q: string) => {
    setSearch(q)
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const data = await api.get<InventoryItem[]>(`/inventory?search=${encodeURIComponent(q)}`)
      setResults(Array.isArray(data) ? data.slice(0, 20) : [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 text-gray-900 font-semibold">
            <Package size={16} className="text-brand-600" />
            Select Tool
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              className="input pl-9 w-full"
              placeholder="Search serial, asset no, description…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-8"><Spinner /></div>}
          {!loading && search.length >= 2 && results.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">No tools found</p>
          )}
          {!loading && search.length < 2 && (
            <p className="text-center text-gray-400 text-sm py-8">Type at least 2 characters to search</p>
          )}
          {results.map(item => (
            <button
              key={item.SystemID}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
              onClick={() => { onSelect(item); onClose(); setSearch(''); setResults([]) }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sm text-gray-900">
                    {item.Serial || item.AssetNo || '—'}
                  </p>
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

// ─── Create RT Modal ──────────────────────────────────────────────────────────

function CreateRTModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const { success, error: toastErr } = useToast()
  const [form, setForm] = useState({
    JobID: '',
    RTDate: new Date().toISOString().split('T')[0],
    LinkedDTNumber: '',
    Notes: '',
  })
  const [saving, setSaving] = useState(false)

  const { data: jobs } = useFetch<{ JobID: string; Rig: string; Well: string }[]>('/jobs?status=Active')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.JobID) { toastErr('Job is required'); return }
    setSaving(true)
    try {
      const res = await api.post<{ RTID: number; RTNumber: string }>('/receiving-tickets', form)
      success(`Created ${res.RTNumber}`)
      onCreated()
      setForm({ JobID: '', RTDate: new Date().toISOString().split('T')[0], LinkedDTNumber: '', Notes: '' })
    } catch (err: any) {
      toastErr(err.message || 'Failed to create RT')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <FileInput size={16} className="text-brand-600" />
            New Receiving Ticket
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Job *</label>
            <select
              className="input w-full"
              value={form.JobID}
              onChange={e => setForm(f => ({ ...f, JobID: e.target.value }))}
              required
            >
              <option value="">— Select job —</option>
              {(jobs || []).map(j => (
                <option key={j.JobID} value={j.JobID}>
                  {j.JobID} — {j.Rig} / {j.Well}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">RT Date</label>
              <input type="date" className="input w-full" value={form.RTDate}
                onChange={e => setForm(f => ({ ...f, RTDate: e.target.value }))} />
            </div>
            <div>
              <label className="label">Linked DT #</label>
              <input className="input w-full" placeholder="DT-2026-…" value={form.LinkedDTNumber}
                onChange={e => setForm(f => ({ ...f, LinkedDTNumber: e.target.value }))} />
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
              Create RT
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function RTDetailPanel({
  rt,
  onClose,
  onRefresh,
}: {
  rt: RT
  onClose: () => void
  onRefresh: () => void
}) {
  const { hasRole } = useAuth()
  const { success, error: toastErr } = useToast()
  const [showToolPicker, setShowToolPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    RTDate: rt.RTDate?.split('T')[0] ?? '',
    Status: rt.Status,
    Notes: rt.Notes ?? '',
  })

  const { data: lines, refetch: refetchLines } =
    useFetch<RTLine[]>(`/receiving-tickets/${rt.RTID}/lines`)

  const canEdit = hasRole('Admin', 'Operations')

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/receiving-tickets/${rt.RTID}`, form)
      success('Saved')
      onRefresh()
    } catch (err: any) {
      toastErr(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleAddTool = async (item: InventoryItem) => {
    try {
      await api.post(`/receiving-tickets/${rt.RTID}/lines`, {
        SystemID: item.SystemID,
        ToolDescription: item.ShortDesc,
        SizeName: item.SizeName,
        Quantity: 1,
        Condition: 'Good',
        UsedStatus: 'Used',
      })
      refetchLines()
      success('Tool added')
    } catch (err: any) {
      toastErr(err.message || 'Failed to add tool')
    }
  }

  const handleRemoveLine = async (lineId: number) => {
    try {
      await api.delete(`/receiving-tickets/${rt.RTID}/lines/${lineId}`)
      refetchLines()
      success('Line removed')
    } catch (err: any) {
      toastErr(err.message || 'Failed to remove line')
    }
  }

  return (
    <>
      <ToolPickerModal
        open={showToolPicker}
        onClose={() => setShowToolPicker(false)}
        onSelect={handleAddTool}
      />

      <div className="w-[500px] shrink-0 bg-white border-l border-gray-200 flex flex-col h-full overflow-hidden shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
          <div>
            <p className="font-semibold text-gray-900">{rt.RTNumber}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Job: {rt.JobID} · {rt.Client || '—'}
              {rt.LinkedDTNumber && ` · DT: ${rt.LinkedDTNumber}`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 border-b border-gray-100 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">RT Date</label>
              <input type="date" className="input w-full" value={form.RTDate}
                onChange={e => setForm(f => ({ ...f, RTDate: e.target.value }))}
                disabled={!canEdit} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input w-full" value={form.Status}
                onChange={e => setForm(f => ({ ...f, Status: e.target.value }))}
                disabled={!canEdit}>
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
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

        {/* Lines */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">
              Returned Tools ({lines?.length ?? 0})
            </p>
            {canEdit && (
              <button className="btn-primary text-xs py-1.5 px-3"
                onClick={() => setShowToolPicker(true)}>
                <Plus size={12} /> Add Tool
              </button>
            )}
          </div>

          {(!lines || lines.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Package size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No tools listed yet</p>
              {canEdit && (
                <button className="mt-3 text-brand-600 text-sm hover:text-brand-700"
                  onClick={() => setShowToolPicker(true)}>
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
                  <th className="table-th text-xs">Cond.</th>
                  <th className="table-th text-xs">Used</th>
                  {canEdit && <th className="table-th w-8"></th>}
                </tr>
              </thead>
              <tbody>
                {lines.map(line => (
                  <tr key={line.LineID} className="table-tr">
                    <td className="table-td text-xs text-gray-400">{line.LineNumber}</td>
                    <td className="table-td text-xs font-mono">
                      {line.AssetNo || '—'}
                    </td>
                    <td className="table-td text-xs text-gray-600 max-w-[130px] truncate">
                      {line.ToolDescription || '—'}
                    </td>
                    <td className="table-td text-xs">{line.Quantity}</td>
                    <td className="table-td text-xs">
                      <span className={`badge text-xs ${
                        line.Condition === 'Good' ? 'bg-green-100 text-green-700' :
                        line.Condition === 'Damaged' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {line.Condition || '—'}
                      </span>
                    </td>
                    <td className="table-td text-xs text-gray-500">{line.UsedStatus || '—'}</td>
                    {canEdit && (
                      <td className="table-td">
                        <button
                          onClick={() => handleRemoveLine(line.LineID)}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                        >
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

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
          Created {formatDate(rt.CreatedDate)} by {rt.CreatedBy || '—'}
        </div>
      </div>
    </>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function ReceivingTicketsView() {
  const { hasRole } = useAuth()
  const [search,     setSearch]     = useState('')
  const [status,     setStatus]     = useState('All')
  const [selected,   setSelected]   = useState<RT | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: tickets, isLoading, error, refetch } =
    useRealtimeFetch<RT[]>('/receiving-tickets')

  const filtered = useMemo(() => {
    if (!tickets) return []
    return tickets.filter(t => {
      if (status !== 'All' && t.Status !== status) return false
      if (!search) return true
      const q = search.toLowerCase()
      return (
        (t.RTNumber || '').toLowerCase().includes(q) ||
        (t.JobID    || '').toLowerCase().includes(q) ||
        (t.Client   || '').toLowerCase().includes(q)
      )
    })
  }, [tickets, status, search])

  if (isLoading) return <PageLoader />

  return (
    <>
      <CreateRTModal
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
              <input
                className="input pl-9"
                placeholder="Search RT number, Job ID, client…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select className="input w-auto" value={status}
              onChange={e => setStatus(e.target.value)}>
              {['All', ...STATUS_OPTIONS].map(s =>
                <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>
              )}
            </select>
            <button onClick={refetch} className="btn-ghost"><RefreshCw size={15} /></button>
            {hasRole('Admin', 'Operations') && (
              <button className="btn-primary" onClick={() => setShowCreate(true)}>
                <Plus size={15} /> New RT
              </button>
            )}
          </div>

          {error && <div className="card p-3 text-red-600 text-sm">{error}</div>}
          <p className="text-xs text-gray-500">{filtered.length} receiving tickets</p>

          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">RT Number</th>
                  <th className="table-th">Job ID</th>
                  <th className="table-th">Client</th>
                  <th className="table-th">RT Date</th>
                  <th className="table-th">Lines</th>
                  <th className="table-th">Linked DT</th>
                  <th className="table-th">Status</th>
                  <th className="table-th w-6"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="table-td text-center text-gray-400 py-12">
                      No receiving tickets found
                    </td>
                  </tr>
                ) : (
                  filtered.map(t => (
                    <tr
                      key={t.RTID}
                      className={`table-tr cursor-pointer ${
                        selected?.RTID === t.RTID ? 'bg-brand-50 border-l-2 border-l-brand-500' : ''
                      }`}
                      onClick={() => setSelected(t)}
                    >
                      <td className="table-td font-medium text-brand-600">{t.RTNumber}</td>
                      <td className="table-td">{t.JobID}</td>
                      <td className="table-td text-gray-500">{t.Client || '—'}</td>
                      <td className="table-td text-gray-500">{formatDate(t.RTDate)}</td>
                      <td className="table-td text-gray-500">{t.LineCount ?? 0}</td>
                      <td className="table-td text-gray-500 text-xs font-mono">
                        {t.LinkedDTNumber || '—'}
                      </td>
                      <td className="table-td">
                        <span className={`badge ${statusBadgeClass(t.Status)}`}>{t.Status}</span>
                      </td>
                      <td className="table-td">
                        <ChevronRight size={13} className={
                          selected?.RTID === t.RTID ? 'text-brand-400' : 'text-gray-300'
                        } />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: detail panel */}
        {selected && (
          <RTDetailPanel
            key={selected.RTID}
            rt={selected}
            onClose={() => setSelected(null)}
            onRefresh={refetch}
          />
        )}
      </div>
    </>
  )
}
