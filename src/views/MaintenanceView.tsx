import React, { useState, useMemo } from 'react'
import {
  Plus, Search, RefreshCw, X, ChevronRight, Save, Wrench,
} from 'lucide-react'
import { useRealtimeFetch } from '../hooks/useRealtimeFetch'
import { useAuth }          from '../contexts/AuthContext'
import { useToast }         from '../components/Toast'
import { api }              from '../utils/api'
import { formatDate, statusBadgeClass } from '../utils/format'
import { PageLoader, Spinner } from '../components/Spinner'
import { ListOptions } from '../components/ListOptions'
import { MaintenanceConsumables } from '../components/MaintenanceConsumables'

interface MJob {
  MaintenanceJobID: number
  MaintenanceJobNumber: string
  SerialNumber: string | null
  AssetNo: string | null
  ToolDescription: string | null
  MaintenanceType: string | null
  Priority: string
  Description: string | null
  ScheduledDate: string | null
  CompletedDate: string | null
  Status: string
  TechnicianName: string | null
  Notes: string | null
  CreatedDate: string | null
  CreatedBy: string | null
}


const PRIORITY_COLOR: Record<string, string> = {
  Critical: 'bg-red-100 text-red-700',
  High:     'bg-orange-100 text-orange-700',
  Medium:   'bg-yellow-100 text-yellow-700',
  Low:      'bg-gray-100 text-gray-600',
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateMJobModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void
}) {
  const { success, error: toastErr } = useToast()
  const [form, setForm] = useState({
    SerialNumber: '', AssetNo: '', ToolDescription: '',
    MaintenanceType: 'Corrective', Priority: 'Medium', Description: '',
    ScheduledDate: '', TechnicianName: '', Notes: '',
  })
  const [saving, setSaving] = useState(false)

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await api.post<{ MaintenanceJobNumber: string }>('/maintenance', form)
      success(`Created ${res.MaintenanceJobNumber}`)
      onCreated()
      setForm({ SerialNumber:'', AssetNo:'', ToolDescription:'', MaintenanceType:'Corrective',
        Priority:'Medium', Description:'', ScheduledDate:'', TechnicianName:'', Notes:'' })
    } catch (err: any) {
      toastErr(err.message || 'Failed to create job')
    } finally { setSaving(false) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Wrench size={16} className="text-brand-600" /> New Maintenance Job
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Tool</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Serial Number</label>
                <input className="input w-full" value={form.SerialNumber}
                  onChange={e => f('SerialNumber', e.target.value)} />
              </div>
              <div>
                <label className="label">Asset No</label>
                <input className="input w-full" value={form.AssetNo}
                  onChange={e => f('AssetNo', e.target.value)} />
              </div>
            </div>
            <div className="mt-3">
              <label className="label">Tool Description</label>
              <input className="input w-full" value={form.ToolDescription}
                onChange={e => f('ToolDescription', e.target.value)} />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Job Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Type</label>
                <select className="input w-full" value={form.MaintenanceType}
                  onChange={e => f('MaintenanceType', e.target.value)}>
                  <ListOptions name="MaintenanceType" />
                </select>
              </div>
              <div>
                <label className="label">Priority</label>
                <select className="input w-full" value={form.Priority}
                  onChange={e => f('Priority', e.target.value)}>
                  <ListOptions name="MaintenancePriority" />
                </select>
              </div>
            </div>
            <div className="mt-3">
              <label className="label">Description / Work to be done</label>
              <textarea className="input w-full" rows={2} value={form.Description}
                onChange={e => f('Description', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="label">Scheduled Date</label>
                <input type="date" className="input w-full" value={form.ScheduledDate}
                  onChange={e => f('ScheduledDate', e.target.value)} />
              </div>
              <div>
                <label className="label">Technician</label>
                <input className="input w-full" value={form.TechnicianName}
                  onChange={e => f('TechnicianName', e.target.value)} />
              </div>
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea className="input w-full" rows={2} value={form.Notes}
              onChange={e => f('Notes', e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <Spinner size="sm" /> : <Plus size={14} />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function MJobDetailPanel({ job, onClose, onRefresh }: {
  job: MJob; onClose: () => void; onRefresh: () => void
}) {
  const { hasRole } = useAuth()
  const { success, error: toastErr } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    Priority:       job.Priority,
    Status:         job.Status,
    ScheduledDate:  job.ScheduledDate?.split('T')[0] ?? '',
    CompletedDate:  job.CompletedDate?.split('T')[0] ?? '',
    TechnicianName: job.TechnicianName ?? '',
    Notes:          job.Notes ?? '',
  })

  const canEdit = hasRole('Admin', 'Operations', 'QAQC')
  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/maintenance/${job.MaintenanceJobID}`, form)
      success('Saved')
      onRefresh()
    } catch (err: any) {
      toastErr(err.message || 'Save failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="w-[460px] shrink-0 bg-white border-l border-gray-200 flex flex-col h-full overflow-hidden shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900">{job.MaintenanceJobNumber}</p>
            <span className={`badge text-xs ${PRIORITY_COLOR[job.Priority] || 'bg-gray-100 text-gray-600'}`}>
              {job.Priority}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {job.SerialNumber || job.AssetNo || '—'} · {job.ToolDescription || '—'}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>

      {/* Read-only info */}
      <div className="px-5 py-3 bg-blue-50/40 border-b border-blue-100">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span className="text-gray-400">Type</span>
          <span className="text-gray-700">{job.MaintenanceType || '—'}</span>
          <span className="text-gray-400">Description</span>
          <span className="text-gray-700 col-span-1 truncate">{job.Description || '—'}</span>
        </div>
      </div>

      {/* Editable */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Priority</label>
            <select className="input w-full" value={form.Priority}
              onChange={e => f('Priority', e.target.value)} disabled={!canEdit}>
              <ListOptions name="MaintenancePriority" />
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input w-full" value={form.Status}
              onChange={e => f('Status', e.target.value)} disabled={!canEdit}>
              <ListOptions name="MaintenanceStatus" />
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Scheduled Date</label>
            <input type="date" className="input w-full" value={form.ScheduledDate}
              onChange={e => f('ScheduledDate', e.target.value)} disabled={!canEdit} />
          </div>
          <div>
            <label className="label">Completed Date</label>
            <input type="date" className="input w-full" value={form.CompletedDate}
              onChange={e => f('CompletedDate', e.target.value)} disabled={!canEdit} />
          </div>
        </div>
        <div>
          <label className="label">Technician</label>
          <input className="input w-full" value={form.TechnicianName}
            onChange={e => f('TechnicianName', e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <label className="label">Notes / Work Done</label>
          <textarea className="input w-full" rows={4} value={form.Notes}
            onChange={e => f('Notes', e.target.value)} disabled={!canEdit} />
        </div>
        <MaintenanceConsumables mjNumber={job.MaintenanceJobNumber} />

        {canEdit && (
          <div className="flex justify-end">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <Spinner size="sm" /> : <Save size={14} />}
              Save Changes
            </button>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
        Created {formatDate(job.CreatedDate)} by {job.CreatedBy || '—'}
      </div>
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function MaintenanceView() {
  const { hasRole } = useAuth()
  const [search,     setSearch]     = useState('')
  const [priority,   setPriority]   = useState('All')
  const [status,     setStatus]     = useState('All')
  const [selected,   setSelected]   = useState<MJob | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: jobs, isLoading, error, refetch } =
    useRealtimeFetch<MJob[]>('/maintenance')

  const filtered = useMemo(() => {
    if (!jobs) return []
    return jobs.filter(j => {
      if (priority !== 'All' && j.Priority !== priority) return false
      if (status   !== 'All' && j.Status   !== status)   return false
      if (!search) return true
      const q = search.toLowerCase()
      return (
        (j.MaintenanceJobNumber || '').toLowerCase().includes(q) ||
        (j.SerialNumber         || '').toLowerCase().includes(q) ||
        (j.AssetNo              || '').toLowerCase().includes(q) ||
        (j.TechnicianName       || '').toLowerCase().includes(q)
      )
    })
  }, [jobs, priority, status, search])

  if (isLoading) return <PageLoader />

  return (
    <>
      <CreateMJobModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); refetch() }}
      />

      <div className="flex gap-0 h-full">
        <div className="flex-1 min-w-0 space-y-4 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input pl-9" placeholder="Search MJ number, serial, technician…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="input w-auto" value={priority} onChange={e => setPriority(e.target.value)}>
              <ListOptions name="MaintenancePriority" includeAll allLabel="All Priorities" />
            </select>
            <select className="input w-auto" value={status} onChange={e => setStatus(e.target.value)}>
              <ListOptions name="MaintenanceStatus" includeAll allLabel="All Statuses" />
            </select>
            <button onClick={refetch} className="btn-ghost"><RefreshCw size={15} /></button>
            {hasRole('Admin', 'Operations', 'QAQC') && (
              <button className="btn-primary" onClick={() => setShowCreate(true)}>
                <Plus size={15} /> New MJ
              </button>
            )}
          </div>

          {error && <div className="card p-3 text-red-600 text-sm">{error}</div>}
          <p className="text-xs text-gray-500">{filtered.length} maintenance jobs</p>

          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">MJ Number</th>
                  <th className="table-th">Serial / Asset</th>
                  <th className="table-th">Description</th>
                  <th className="table-th">Type</th>
                  <th className="table-th">Priority</th>
                  <th className="table-th">Scheduled</th>
                  <th className="table-th">Technician</th>
                  <th className="table-th">Status</th>
                  <th className="table-th w-6"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="table-td text-center text-gray-400 py-12">No maintenance jobs found</td></tr>
                ) : filtered.map(j => (
                  <tr key={j.MaintenanceJobID}
                    className={`table-tr cursor-pointer ${
                      selected?.MaintenanceJobID === j.MaintenanceJobID
                        ? 'bg-brand-50 border-l-2 border-l-brand-500' : ''
                    }`}
                    onClick={() => setSelected(j)}>
                    <td className="table-td font-medium text-brand-600">{j.MaintenanceJobNumber}</td>
                    <td className="table-td font-mono text-xs">{j.SerialNumber || j.AssetNo || '—'}</td>
                    <td className="table-td text-gray-600 text-xs max-w-[130px] truncate">{j.ToolDescription || '—'}</td>
                    <td className="table-td text-gray-500 text-xs">{j.MaintenanceType || '—'}</td>
                    <td className="table-td">
                      <span className={`badge text-xs ${PRIORITY_COLOR[j.Priority] || 'bg-gray-100 text-gray-600'}`}>
                        {j.Priority}
                      </span>
                    </td>
                    <td className="table-td text-gray-500 text-xs">{formatDate(j.ScheduledDate)}</td>
                    <td className="table-td text-gray-500 text-xs">{j.TechnicianName || '—'}</td>
                    <td className="table-td">
                      <span className={`badge ${statusBadgeClass(j.Status)}`}>{j.Status}</span>
                    </td>
                    <td className="table-td">
                      <ChevronRight size={13} className={selected?.MaintenanceJobID === j.MaintenanceJobID ? 'text-brand-400' : 'text-gray-300'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <MJobDetailPanel
            key={selected.MaintenanceJobID}
            job={selected}
            onClose={() => setSelected(null)}
            onRefresh={refetch}
          />
        )}
      </div>
    </>
  )
}
