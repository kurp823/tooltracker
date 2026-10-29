import React, { useState, useMemo, useCallback } from 'react'
import {
  Plus, Search, RefreshCw, X, ChevronRight,
  Trash2, Package, Save, FileText,
} from 'lucide-react'
import { useRealtimeFetch } from '../hooks/useRealtimeFetch'
import { useFetch }         from '../hooks/useFetch'
import { useAuth }          from '../contexts/AuthContext'
import { useRowWindow }  from '../components/useRowWindow'
import { useToast }         from '../components/Toast'
import { api }              from '../utils/api'
import { formatDate, statusBadgeClass } from '../utils/format'
import { PageLoader, Spinner } from '../components/Spinner'
import { ListOptions } from '../components/ListOptions'

// ─── Types ───────────────────────────────────────────────────────────────────

interface DT {
  DTID: number
  DTNumber: string
  JobID: string
  DTDate: string | null
  Status: string
  Notes: string | null
  CreatedBy: string | null
  CreatedDate: string | null
  Client: string | null
  LineCount: number
  // Real columns on tbl_DeliveryTickets that the first cut never surfaced.
  Rig: string | null
  Well: string | null
  PONumber: string | null
  ClientRef: string | null
  CalloutRef: string | null
  VehicleVessel: string | null
  DriverName: string | null
  EmdadRep: string | null
  EmdadSignDate: string | null
  ClientSignedBy: string | null
  ClientSignDate: string | null
}

interface DTLine {
  LineID: number
  DTID: number
  LineNumber: number
  ToolID: number | null
  Quantity: number
  UnitRate: number | null
  LineAmount: number | null
  Notes: string | null
  // joined
  SerialNumber: string | null
  AssetNo: string | null
  ToolDescription: string | null
  SizeName: string | null
  CategoryName: string | null
  Supplier: string | null
  RgtNo: string | null
  DateIn: string | null
}

interface InventoryItem {
  SystemID: string
  Serial: string | null    // inventory API field name
  AssetNo: string | null
  ShortDesc: string | null
  SizeName: string | null
  CategoryName: string | null
  IsEmdad: boolean
  Condition: string | null
}

/**
 * The real statuses, counted across all 3,700 tickets in tbl_DeliveryTickets:
 * Closed 2,116, Signed 1,569, blank 15. 'Draft'/'Submitted'/'Approved'/
 * 'Rejected' were invented by the first cut and appear on no ticket at all,
 * so filtering by them matched nothing. A new ticket starts blank — that is
 * genuinely what the data shows for a ticket not yet signed.
 */
const STATUS_LABEL = (s: string) => (s ? s : 'Not set')

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
          {loading && (
            <div className="flex justify-center py-8"><Spinner /></div>
          )}
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

// ─── Create DT Modal ─────────────────────────────────────────────────────────

function CreateDTModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (dt: { DTID: number; DTNumber: string }) => void
}) {
  const { user } = useAuth()
  const { success, error: toastErr } = useToast()
  const [form, setForm] = useState({
    JobID: '',
    DTDate: new Date().toISOString().split('T')[0],
    Notes: '',
  })
  const [saving, setSaving] = useState(false)

  const { data: jobs } = useFetch<{ JobID: string; Rig: string; Well: string }[]>('/jobs?status=Active')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.JobID) { toastErr('Job is required'); return }
    setSaving(true)
    try {
      const res = await api.post<{ DTID: number; DTNumber: string }>('/delivery-tickets', form)
      success(`Created ${res.DTNumber}`)
      onCreated(res)
      setForm({ JobID: '', DTDate: new Date().toISOString().split('T')[0], Notes: '' })
    } catch (err: any) {
      toastErr(err.message || 'Failed to create DT')
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
            <FileText size={16} className="text-brand-600" />
            New Delivery Ticket
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

          <div>
            <label className="label">DT Date</label>
            <input
              type="date"
              className="input w-full"
              value={form.DTDate}
              onChange={e => setForm(f => ({ ...f, DTDate: e.target.value }))}
            />
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea
              className="input w-full"
              rows={2}
              value={form.Notes}
              onChange={e => setForm(f => ({ ...f, Notes: e.target.value }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <Spinner size="sm" /> : <Plus size={14} />}
              Create DT
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function DTDetailPanel({
  dt,
  onClose,
  onRefresh,
}: {
  dt: DT
  onClose: () => void
  onRefresh: () => void
}) {
  const { hasRole } = useAuth()
  const { success, error: toastErr } = useToast()
  const [showToolPicker, setShowToolPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  // The register row carries only a few columns; the ticket itself has 24, so
  // fetch the full record before showing the header fields.
  const { data: full } = useFetch<DT>(`/delivery-tickets/${dt.DTID}`)
  const d = full ?? dt

  const day = (v: string | null | undefined) => (v ? v.split('T')[0] : '')

  const [form, setForm] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)
  React.useEffect(() => {
    if (!full || loaded) return
    setForm({
      DTDate: day(full.DTDate),
      Rig: full.Rig ?? '',
      Well: full.Well ?? '',
      PONumber: full.PONumber ?? '',
      ClientRef: full.ClientRef ?? '',
      CalloutRef: full.CalloutRef ?? '',
      VehicleVessel: full.VehicleVessel ?? '',
      DriverName: full.DriverName ?? '',
      EmdadRep: full.EmdadRep ?? '',
      EmdadSignDate: day(full.EmdadSignDate),
      ClientSignedBy: full.ClientSignedBy ?? '',
      ClientSignDate: day(full.ClientSignDate),
      Status: full.Status ?? '',
      Notes: full.Notes ?? '',
    })
    setLoaded(true)
  }, [full, loaded])

  const { data: lines, refetch: refetchLines } =
    useFetch<DTLine[]>(`/delivery-tickets/${dt.DTID}/lines`)

  const canEdit = hasRole('Admin', 'Operations')

  // Unsaved-work guard: typed changes must not be lost by navigating away.
  const [dirty, setDirty] = useState(false)
  const set = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    setDirty(true)
  }

  React.useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // Save header changes. The cursor stays busy until the write lands, so the
  // user can see their typing has actually been committed.
  const handleSave = async () => {
    setSaving(true)
    document.body.style.cursor = 'wait'
    try {
      await api.put(`/delivery-tickets/${dt.DTID}`, form)
      setDirty(false)
      success('Ticket saved')
      onRefresh()
    } catch (err: any) {
      toastErr(err.message || 'Save failed')
    } finally {
      document.body.style.cursor = ''
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (dirty && !window.confirm('This ticket has unsaved changes. Leave without saving?')) return
    onClose()
  }

  // Add a tool line
  const handleAddTool = async (item: InventoryItem) => {
    try {
      await api.post(`/delivery-tickets/${dt.DTID}/lines`, {
        SystemID: item.SystemID,
        ToolDescription: item.ShortDesc,
        SizeName: item.SizeName,
        Quantity: 1,
      })
      refetchLines()
      success('Tool added')
    } catch (err: any) {
      toastErr(err.message || 'Failed to add tool')
    }
  }

  // Remove a line
  const handleRemoveLine = async (lineId: number) => {
    try {
      await api.delete(`/delivery-tickets/${dt.DTID}/lines/${lineId}`)
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

      {/*
        Full-width ticket, laid out like the old Rental Ticket screen: a dense
        three-row header, then the tool grid taking everything that's left, then
        a one-row footer. The 480px drawer it replaces could show 5 of the grid's
        11 columns and edited 3 of the ticket's 24 fields.
      */}
      <div className="screen">
        {/* Title row */}
        <div className="flex items-center gap-2 px-2 h-[30px] bg-navy-head text-white shrink-0 rounded-t">
          <button onClick={handleClose} className="hover:text-accent-400" title="Back to register">
            <X size={15} />
          </button>
          <span className="text-[13px] font-bold tracking-wide">DELIVERY TICKET</span>
          <span className="ml-auto text-[11px] text-slate-300">Ticket No</span>
          <span className="font-mono font-bold text-accent-400 text-[14px]">{d.DTNumber}</span>
        </div>

        {/* Header fields — 4 pairs per row, 24px rows */}
        <div
          className="field-row bg-white border-x border-b border-gray-300 px-2 py-1.5 shrink-0
                     grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_auto_1fr] xl:grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto_1fr]"
        >
          <span className="field-label">Customer</span>
          <div className="field-value" title={d.Client || ''}>{d.Client || '—'}</div>

          <span className="field-label">Job Number</span>
          <div className="field-value font-mono">{d.JobID}</div>

          <span className="field-label">Taskorder / PO</span>
          <input className="field-input" value={form.PONumber ?? ''} disabled={!canEdit}
                 onChange={e => set('PONumber', e.target.value)} />

          <span className="field-label">Date Shipped</span>
          <input type="date" className="field-input" value={form.DTDate ?? ''} disabled={!canEdit}
                 onChange={e => set('DTDate', e.target.value)} />

          <span className="field-label">Rig</span>
          <input className="field-input" value={form.Rig ?? ''} disabled={!canEdit}
                 onChange={e => set('Rig', e.target.value)} />

          <span className="field-label">Well</span>
          <input className="field-input" value={form.Well ?? ''} disabled={!canEdit}
                 onChange={e => set('Well', e.target.value)} />

          <span className="field-label">Client Ref</span>
          <input className="field-input" value={form.ClientRef ?? ''} disabled={!canEdit}
                 onChange={e => set('ClientRef', e.target.value)} />

          <span className="field-label">Radio Msg No</span>
          <input className="field-input" value={form.CalloutRef ?? ''} disabled={!canEdit}
                 onChange={e => set('CalloutRef', e.target.value)} />

          <span className="field-label">Prepared By</span>
          <input className="field-input" value={form.EmdadRep ?? ''} disabled={!canEdit}
                 onChange={e => set('EmdadRep', e.target.value)} />

          <span className="field-label">Delivered To</span>
          <input className="field-input" value={form.ClientSignedBy ?? ''} disabled={!canEdit}
                 onChange={e => set('ClientSignedBy', e.target.value)} />

          <span className="field-label">Client Sign Date</span>
          <input type="date" className="field-input" value={form.ClientSignDate ?? ''} disabled={!canEdit}
                 onChange={e => set('ClientSignDate', e.target.value)} />

          <span className="field-label">Status</span>
          <select className="field-input" value={form.Status ?? ''} disabled={!canEdit}
                  onChange={e => set('Status', e.target.value)}>
            <ListOptions name="DeliveryTicketStatus" current={form.Status} blank blankLabel="Not set" />
          </select>
        </div>

        {/* Tool grid — gets all remaining height, scrolls inside, both ways */}
        <div className="flex-1 min-h-0 flex flex-col bg-white border-x border-gray-300">
          <div className="flex items-center gap-2 px-2 h-[26px] bg-gray-100 border-b border-gray-300 shrink-0">
            <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
              Tools ({lines?.length ?? 0})
            </span>
            {canEdit && (
              <button className="btn-mini ml-auto !py-px" onClick={() => setShowToolPicker(true)}>
                <Plus size={11} /> Add Tool
              </button>
            )}
          </div>

          {(!lines || lines.length === 0) ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <Package size={28} className="mb-1.5 opacity-30" />
              <p className="text-xs">No tools on this ticket yet</p>
              {canEdit && (
                <button className="mt-2 text-brand-600 text-xs hover:text-brand-700"
                        onClick={() => setShowToolPicker(true)}>
                  + Add the first tool
                </button>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="table-th w-10">#</th>
                    <th className="table-th">Part / Asset No</th>
                    <th className="table-th">Description</th>
                    <th className="table-th">Size</th>
                    <th className="table-th w-12 !text-right">Qty</th>
                    <th className="table-th">Category</th>
                    <th className="table-th">Supplier</th>
                    <th className="table-th">RGT No</th>
                    <th className="table-th">Date In</th>
                    <th className="table-th">Remarks</th>
                    {canEdit && <th className="table-th w-8"></th>}
                  </tr>
                </thead>
                <tbody>
                  {lines.map(line => (
                    <tr key={line.LineID} className="border-b border-gray-100 hover:bg-brand-50/40">
                      <td className="table-td text-gray-400">{line.LineNumber}</td>
                      <td className="table-td font-mono">{line.AssetNo || '—'}</td>
                      <td className="table-td text-gray-600 max-w-[380px] truncate"
                          title={line.ToolDescription || ''}>
                        {line.ToolDescription || '—'}
                      </td>
                      <td className="table-td text-gray-500">{line.SizeName || '—'}</td>
                      <td className="table-td text-right">{line.Quantity}</td>
                      <td className="table-td text-gray-500">{line.CategoryName || '—'}</td>
                      <td className="table-td text-gray-500">{line.Supplier || '—'}</td>
                      <td className="table-td font-mono text-gray-500">{line.RgtNo || '—'}</td>
                      <td className="table-td text-gray-500">{formatDate(line.DateIn) || '—'}</td>
                      <td className="table-td text-gray-500 max-w-[180px] truncate"
                          title={line.Notes || ''}>{line.Notes || '—'}</td>
                      {canEdit && (
                        <td className="table-td">
                          <button onClick={() => handleRemoveLine(line.LineID)}
                                  className="text-gray-300 hover:text-red-500 transition-colors"
                                  title="Remove line">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer — transport, signature and note on one strip */}
        <div
          className="field-row bg-gray-50 border border-gray-300 rounded-b px-2 py-1.5 shrink-0
                     grid-cols-[auto_1fr] lg:grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto_2fr]"
        >
          <span className="field-label">Vehicle / Vessel</span>
          <input className="field-input" value={form.VehicleVessel ?? ''} disabled={!canEdit}
                 onChange={e => set('VehicleVessel', e.target.value)} />

          <span className="field-label">Driver Name</span>
          <input className="field-input" value={form.DriverName ?? ''} disabled={!canEdit}
                 onChange={e => set('DriverName', e.target.value)} />

          <span className="field-label">Emdad Sign Date</span>
          <input type="date" className="field-input" value={form.EmdadSignDate ?? ''} disabled={!canEdit}
                 onChange={e => set('EmdadSignDate', e.target.value)} />

          <span className="field-label">Note</span>
          <div className="flex items-center gap-1.5">
            <input className="field-input" value={form.Notes ?? ''} disabled={!canEdit}
                   onChange={e => set('Notes', e.target.value)} />
            {canEdit && (
              <button className="btn-accent shrink-0" onClick={handleSave} disabled={saving || !dirty}
                      title={dirty ? 'Save this ticket' : 'No unsaved changes'}>
                {saving ? <Spinner size="sm" /> : <Save size={12} />}
                {dirty ? 'Save' : 'Saved'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function DeliveryTicketsView() {
  const { hasRole } = useAuth()
  const [search,     setSearch]     = useState('')
  const [status,     setStatus]     = useState('All')
  const [selected,   setSelected]   = useState<DT | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: tickets, isLoading, error, refetch } =
    useRealtimeFetch<DT[]>('/delivery-tickets')

  const filtered = useMemo(() => {
    if (!tickets) return []
    return tickets.filter(t => {
      if (status !== 'All' && t.Status !== status) return false
      if (!search) return true
      const q = search.toLowerCase()
      return (
        (t.DTNumber || '').toLowerCase().includes(q) ||
        (t.JobID    || '').toLowerCase().includes(q) ||
        (t.Client   || '').toLowerCase().includes(q)
      )
    })
  }, [tickets, status, search])

  // Render the register in slices; all 3,700+ rows in the DOM at once was
  // most of the delay before first paint on these screens.
  const { scrollRef, onScroll, visible, hasMore, shown, total } = useRowWindow(filtered)

  if (isLoading) return <PageLoader />

  return (
    <>
      <CreateDTModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={created => {
          setShowCreate(false)
          refetch()
          // auto-open the new DT — simulate by finding it after refetch
        }}
      />

      {/*
        The ticket takes the whole screen rather than sharing it with the
        register — its grid has 11 columns and the header 13 fields, which a
        side panel cannot show without scrolling in both directions.
      */}
      {selected ? (
        <DTDetailPanel
          key={selected.DTID}
          dt={selected}
          onClose={() => setSelected(null)}
          onRefresh={refetch}
        />
      ) : (
        <div className="screen">
          <div className="screen-bar">
            <div className="relative w-64">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="field-input !pl-7"
                placeholder="Search DT number, job or client…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="field-input w-auto"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              <ListOptions name="DeliveryTicketStatus" includeAll allLabel="All statuses" />
            </select>
            <button onClick={refetch} className="btn-mini" title="Refresh"><RefreshCw size={12} /></button>
            <span className="text-[11px] text-gray-500">
              {hasMore ? `${shown} of ${total} shown` : `${total} ticket${total === 1 ? '' : 's'}`}
            </span>
            {hasRole('Admin', 'Operations') && (
              <button className="btn-accent ml-auto" onClick={() => setShowCreate(true)}>
                <Plus size={12} /> New DT
              </button>
            )}
          </div>

          {error && <div className="card p-2 text-red-600 text-xs mb-1.5 shrink-0">{error}</div>}

          <div ref={scrollRef} onScroll={onScroll}
           className="flex-1 min-h-0 overflow-auto bg-white border border-gray-300 rounded">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="table-th">DT Number</th>
                  <th className="table-th">Job No</th>
                  <th className="table-th">Client</th>
                  <th className="table-th">Rig</th>
                  <th className="table-th">Well</th>
                  <th className="table-th">PO / Taskorder</th>
                  <th className="table-th">Date Out</th>
                  <th className="table-th !text-right">Lines</th>
                  <th className="table-th">Status</th>
                  <th className="table-th w-6"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="table-td text-center text-gray-400 py-10">
                      No delivery tickets found
                    </td>
                  </tr>
                ) : (
                  visible.map(t => (
                    <tr key={t.DTID} className="table-tr whitespace-nowrap" onClick={() => setSelected(t)}>
                      <td className="table-td font-mono font-medium text-brand-600">{t.DTNumber}</td>
                      <td className="table-td font-mono">{t.JobID}</td>
                      <td className="table-td text-gray-500 max-w-[180px] truncate"
                          title={t.Client || ''}>{t.Client || '—'}</td>
                      <td className="table-td text-gray-500">{t.Rig || '—'}</td>
                      <td className="table-td text-gray-500">{t.Well || '—'}</td>
                      <td className="table-td text-gray-500">{t.PONumber || '—'}</td>
                      <td className="table-td text-gray-500">{formatDate(t.DTDate) || '—'}</td>
                      <td className="table-td text-right text-gray-500">{t.LineCount ?? 0}</td>
                      <td className="table-td">
                        {t.Status
                          ? <span className={`badge ${statusBadgeClass(t.Status)}`}>{t.Status}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="table-td"><ChevronRight size={12} className="text-gray-300" /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
