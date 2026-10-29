import React, { useState, useMemo } from 'react'
import {
  Plus, Search, RefreshCw, X, ChevronRight, Save, ClipboardCheck,
} from 'lucide-react'
import { useRealtimeFetch } from '../hooks/useRealtimeFetch'
import { useFetch }         from '../hooks/useFetch'
import { useAuth }          from '../contexts/AuthContext'
import { useToast }         from '../components/Toast'
import { api }              from '../utils/api'
import { formatDate, statusBadgeClass } from '../utils/format'
import { PageLoader, Spinner } from '../components/Spinner'
import { ListOptions } from '../components/ListOptions'

interface Inspection {
  InspectionID: number
  InspectionNumber: string
  JobID: string | null
  SerialNumber: string | null
  AssetNo: string | null
  ToolDescription: string | null
  SizeName: string | null
  InspectionType: string | null
  InspectionDate: string | null
  Inspector: string | null
  Result: string | null
  Status: string
  Notes: string | null
  CreatedDate: string | null
  CreatedBy: string | null
}


// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateInspectionModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: () => void
}) {
  const { success, error: toastErr } = useToast()
  const [form, setForm] = useState({
    JobID: '', SerialNumber: '', AssetNo: '', ToolDescription: '', SizeName: '',
    InspectionType: 'Visual', InspectionDate: new Date().toISOString().split('T')[0],
    Inspector: '', Result: 'Pending', Notes: '',
  })
  const [saving, setSaving] = useState(false)

  const { data: jobs } = useFetch<{ JobID: string; Rig: string; Well: string }[]>('/jobs?status=Active')

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await api.post<{ InspectionNumber: string }>('/inspections', form)
      success(`Created ${res.InspectionNumber}`)
      onCreated()
      setForm({ JobID:'', SerialNumber:'', AssetNo:'', ToolDescription:'', SizeName:'',
        InspectionType:'Visual', InspectionDate:new Date().toISOString().split('T')[0],
        Inspector:'', Result:'Pending', Notes:'' })
    } catch (err: any) {
      toastErr(err.message || 'Failed to create inspection')
    } finally { setSaving(false) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardCheck size={16} className="text-brand-600" /> New Inspection
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="label">Job</label>
            <select className="input w-full" value={form.JobID} onChange={e => f('JobID', e.target.value)}>
              <option value="">— No job linked —</option>
              {(jobs || []).map(j => (
                <option key={j.JobID} value={j.JobID}>{j.JobID} — {j.Rig} / {j.Well}</option>
              ))}
            </select>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Tool Being Inspected</p>
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
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="label">Description</label>
                <input className="input w-full" value={form.ToolDescription}
                  onChange={e => f('ToolDescription', e.target.value)} />
              </div>
              <div>
                <label className="label">Size</label>
                <input className="input w-full" value={form.SizeName}
                  onChange={e => f('SizeName', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wide">Inspection Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Type</label>
                <select className="input w-full" value={form.InspectionType}
                  onChange={e => f('InspectionType', e.target.value)}>
                  <ListOptions name="InspectionType" />
                </select>
              </div>
              <div>
                <label className="label">Date</label>
                <input type="date" className="input w-full" value={form.InspectionDate}
                  onChange={e => f('InspectionDate', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="label">Inspector</label>
                <input className="input w-full" value={form.Inspector}
                  onChange={e => f('Inspector', e.target.value)} />
              </div>
              <div>
                <label className="label">Result</label>
                <select className="input w-full" value={form.Result}
                  onChange={e => f('Result', e.target.value)}>
                  <ListOptions name="InspectionResult" />
                </select>
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

function InspectionDetailPanel({ ins, onClose, onRefresh }: {
  ins: Inspection; onClose: () => void; onRefresh: () => void
}) {
  const { hasRole } = useAuth()
  const { success, error: toastErr } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    InspectionDate: ins.InspectionDate?.split('T')[0] ?? '',
    Inspector: ins.Inspector ?? '',
    Result: ins.Result ?? 'Pending',
    Status: ins.Status,
    Notes: ins.Notes ?? '',
  })

  const canEdit = hasRole('Admin', 'Operations', 'QAQC')

  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/inspections/${ins.InspectionID}`, form)
      success('Saved')
      onRefresh()
    } catch (err: any) {
      toastErr(err.message || 'Save failed')
    } finally { setSaving(false) }
  }

  const resultColor =
    ins.Result === 'Pass'        ? 'bg-green-100 text-green-700' :
    ins.Result === 'Fail'        ? 'bg-red-100 text-red-700'     :
    ins.Result === 'Conditional' ? 'bg-yellow-100 text-yellow-700' :
    'bg-gray-100 text-gray-600'

  return (
    <div className="w-[460px] shrink-0 bg-white border-l border-gray-200 flex flex-col h-full overflow-hidden shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
        <div>
          <p className="font-semibold text-gray-900">{ins.InspectionNumber}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {ins.SerialNumber || ins.AssetNo || '—'} · {ins.ToolDescription || '—'}
            {ins.JobID && ` · Job: ${ins.JobID}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ins.Result && (
            <span className={`badge text-xs ${resultColor}`}>{ins.Result}</span>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
      </div>

      {/* Tool info (read-only) */}
      <div className="px-5 py-3 bg-blue-50/40 border-b border-blue-100">
        <p className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wide">Tool</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span className="text-gray-400">Serial</span>
          <span className="font-mono text-gray-700">{ins.SerialNumber || '—'}</span>
          <span className="text-gray-400">Asset No</span>
          <span className="font-mono text-gray-700">{ins.AssetNo || '—'}</span>
          <span className="text-gray-400">Description</span>
          <span className="text-gray-700">{ins.ToolDescription || '—'}</span>
          <span className="text-gray-400">Size</span>
          <span className="text-gray-700">{ins.SizeName || '—'}</span>
          <span className="text-gray-400">Type</span>
          <span className="text-gray-700">{ins.InspectionType || '—'}</span>
        </div>
      </div>

      {/* Editable fields */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Inspection Date</label>
            <input type="date" className="input w-full" value={form.InspectionDate}
              onChange={e => f('InspectionDate', e.target.value)} disabled={!canEdit} />
          </div>
          <div>
            <label className="label">Inspector</label>
            <input className="input w-full" value={form.Inspector}
              onChange={e => f('Inspector', e.target.value)} disabled={!canEdit} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Result</label>
            <select className="input w-full" value={form.Result}
              onChange={e => f('Result', e.target.value)} disabled={!canEdit}>
              <ListOptions name="InspectionResult" />
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input w-full" value={form.Status}
              onChange={e => f('Status', e.target.value)} disabled={!canEdit}>
              <ListOptions name="InspectionStatus" />
            </select>
          </div>
        </div>
        <div>
          <label className="label">Notes / Findings</label>
          <textarea className="input w-full" rows={4} value={form.Notes}
            onChange={e => f('Notes', e.target.value)} disabled={!canEdit} />
        </div>
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
        Created {formatDate(ins.CreatedDate)} by {ins.CreatedBy || '—'}
      </div>
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function InspectionView() {
  const { hasRole } = useAuth()
  const [search,     setSearch]     = useState('')
  const [result,     setResult]     = useState('All')
  const [status,     setStatus]     = useState('All')
  const [selected,   setSelected]   = useState<Inspection | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: inspections, isLoading, error, refetch } =
    useRealtimeFetch<Inspection[]>('/inspections')

  const filtered = useMemo(() => {
    if (!inspections) return []
    return inspections.filter(i => {
      if (result !== 'All' && i.Result  !== result) return false
      if (status !== 'All' && i.Status  !== status) return false
      if (!search) return true
      const q = search.toLowerCase()
      return (
        (i.InspectionNumber || '').toLowerCase().includes(q) ||
        (i.SerialNumber     || '').toLowerCase().includes(q) ||
        (i.AssetNo          || '').toLowerCase().includes(q) ||
        (i.JobID            || '').toLowerCase().includes(q)
      )
    })
  }, [inspections, result, status, search])

  if (isLoading) return <PageLoader />

  return (
    <>
      <CreateInspectionModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); refetch() }}
      />

      <div className="flex gap-0 h-full">
        <div className="flex-1 min-w-0 space-y-4 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input pl-9" placeholder="Search INS number, serial, job…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="input w-auto" value={result} onChange={e => setResult(e.target.value)}>
              <ListOptions name="InspectionResult" includeAll allLabel="All Results" />
            </select>
            <select className="input w-auto" value={status} onChange={e => setStatus(e.target.value)}>
              <ListOptions name="InspectionStatus" includeAll allLabel="All Statuses" />
            </select>
            <button onClick={refetch} className="btn-ghost"><RefreshCw size={15} /></button>
            {hasRole('Admin', 'Operations', 'QAQC', 'ThirdParty') && (
              <button className="btn-primary" onClick={() => setShowCreate(true)}>
                <Plus size={15} /> New Inspection
              </button>
            )}
          </div>

          {error && <div className="card p-3 text-red-600 text-sm">{error}</div>}
          <p className="text-xs text-gray-500">{filtered.length} inspections</p>

          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">INS Number</th>
                  <th className="table-th">Serial / Asset</th>
                  <th className="table-th">Description</th>
                  <th className="table-th">Job</th>
                  <th className="table-th">Type</th>
                  <th className="table-th">Date</th>
                  <th className="table-th">Result</th>
                  <th className="table-th">Status</th>
                  <th className="table-th w-6"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="table-td text-center text-gray-400 py-12">No inspections found</td></tr>
                ) : filtered.map(i => (
                  <tr key={i.InspectionID}
                    className={`table-tr cursor-pointer ${
                      selected?.InspectionID === i.InspectionID ? 'bg-brand-50 border-l-2 border-l-brand-500' : ''
                    }`}
                    onClick={() => setSelected(i)}>
                    <td className="table-td font-medium text-brand-600">{i.InspectionNumber}</td>
                    <td className="table-td font-mono text-xs">{i.SerialNumber || i.AssetNo || '—'}</td>
                    <td className="table-td text-gray-600 text-xs max-w-[140px] truncate">{i.ToolDescription || '—'}</td>
                    <td className="table-td text-gray-500 text-xs">{i.JobID || '—'}</td>
                    <td className="table-td text-gray-500 text-xs">{i.InspectionType || '—'}</td>
                    <td className="table-td text-gray-500 text-xs">{formatDate(i.InspectionDate)}</td>
                    <td className="table-td">
                      {i.Result && (
                        <span className={`badge text-xs ${
                          i.Result === 'Pass'        ? 'bg-green-100 text-green-700' :
                          i.Result === 'Fail'        ? 'bg-red-100 text-red-700'    :
                          i.Result === 'Conditional' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{i.Result}</span>
                      )}
                    </td>
                    <td className="table-td">
                      <span className={`badge ${statusBadgeClass(i.Status)}`}>{i.Status}</span>
                    </td>
                    <td className="table-td">
                      <ChevronRight size={13} className={selected?.InspectionID === i.InspectionID ? 'text-brand-400' : 'text-gray-300'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <InspectionDetailPanel
            key={selected.InspectionID}
            ins={selected}
            onClose={() => setSelected(null)}
            onRefresh={refetch}
          />
        )}
      </div>
    </>
  )
}
