import React, { useState, useMemo, useEffect } from 'react'
import {
  Plus, Search, RefreshCw, X, ChevronRight, Save, ClipboardCheck, Upload,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { actionBadge } from '../components/InspectionHistory'
import { useRealtimeFetch } from '../hooks/useRealtimeFetch'
import { useFetch }         from '../hooks/useFetch'
import { useAuth }          from '../contexts/AuthContext'
import { useToast }         from '../components/Toast'
import { api }              from '../utils/api'
import { formatDate, statusBadgeClass } from '../utils/format'
import { PageLoader, Spinner } from '../components/Spinner'
import { ListOptions } from '../components/ListOptions'
import { JobPicker } from '../components/JobPicker'

interface Inspection {
  InspectionID: number
  InspectionNumber: string
  WONumber: number | null
  LineNum: number | null
  CertNumber: string | null
  Action: string | null
  Source: string | null
  ServiceTicket: string | null
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
    Inspector: '', Result: 'Pending', Notes: '', CertNumber: '', WONumber: '',
  })
  const [saving, setSaving] = useState(false)


  const f = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await api.post<{ InspectionNumber: string; WONumber: number; LineNum: number }>('/inspections', form)
      success(`Created ${res.InspectionNumber} — WO ${res.WONumber} line ${res.LineNum}`)
      onCreated()
      setForm({ JobID:'', SerialNumber:'', AssetNo:'', ToolDescription:'', SizeName:'',
        InspectionType:'Visual', InspectionDate:new Date().toISOString().split('T')[0],
        Inspector:'', Result:'Pending', Notes:'', CertNumber:'', WONumber:'' })
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
            <JobPicker value={form.JobID} onChange={id => f('JobID', id)} allLabel="— No job linked —"
                       inputClassName="input w-full pr-9" />
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Report No (inspection certificate)</label>
              <input className="input w-full" value={form.CertNumber} placeholder="e.g. GIS-493-018-2026"
                onChange={e => f('CertNumber', e.target.value)} />
            </div>
            <div>
              <label className="label">Add to work order #</label>
              <input className="input w-full" value={form.WONumber} placeholder="blank = new WO"
                onChange={e => f('WONumber', e.target.value.replace(/\D/g, ''))} />
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
    CertNumber: ins.CertNumber ?? '',
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
          <span className="text-gray-400">Work order</span>
          <span className="font-mono text-gray-700">{ins.WONumber ?? '—'}{ins.LineNum ? ` / line ${ins.LineNum}` : ''}{ins.Source ? ` · ${ins.Source}` : ''}</span>
          {ins.ServiceTicket && <><span className="text-gray-400">Service ticket</span><span className="font-mono text-gray-700">{ins.ServiceTicket}</span></>}
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
          <label className="label">Report No (inspection certificate)</label>
          <input className="input w-full font-mono" value={form.CertNumber}
            onChange={e => f('CertNumber', e.target.value)} disabled={!canEdit} />
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

// ─── Import Epicor history ─────────────────────────────────────────────────────

const EPICOR_COLS: Record<string, string> = {
  'work order': 'wo', 'line num': 'line', 'description': 'description', 'part number': 'part',
  'job service ticket': 'jst', 'inspection date': 'date', 'report number': 'report', 'job num': 'job', 'action': 'action',
}

function ImportHistoryModal({ onClose }: { onClose: () => void }) {
  const { error: toastErr } = useToast()
  const [rows, setRows] = useState<Record<string, any>[]>([])
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const [totals, setTotals] = useState<{ inserted: number; skipped: number } | null>(null)

  const onFile = async (file: File) => {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' })
    const mapped = raw.map(r => {
      const o: Record<string, any> = {}
      for (const [k, v] of Object.entries(r)) {
        const key = EPICOR_COLS[String(k).trim().toLowerCase()]
        if (key) o[key] = v instanceof Date ? v.toISOString().slice(0, 10) : v
      }
      return o
    }).filter(o => o.wo !== undefined && o.part)
    if (!mapped.length) { toastErr('No rows recognised — expected the Epicor JST Inspection export (Work Order, Line Num, Part Number, …)'); return }
    setRows(mapped); setFileName(file.name); setTotals(null); setDone(0)
  }

  const run = async () => {
    setBusy(true)
    let inserted = 0, skipped = 0
    try {
      for (let i = 0; i < rows.length; i += 1000) {
        const r = await api.post<{ inserted: number; skipped: number }>('/inspections/import', { rows: rows.slice(i, i + 1000) })
        inserted += r.inserted; skipped += r.skipped
        setDone(Math.min(i + 1000, rows.length)); setTotals({ inserted, skipped })
      }
    } catch (err: any) {
      toastErr(err.message || 'Import failed — run it again; rows already loaded are skipped')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Upload size={16} className="text-brand-600" /> Import inspection history</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" disabled={busy}><X size={18} /></button>
        </div>
        <p className="text-xs text-gray-500">Upload the Epicor <b>JST Inspection</b> export (.xlsx). Lines are stored as they are — work order, report number, date and action (Stock / DMR). Rows already loaded are skipped, so the file can be uploaded again safely. Tool status is not changed by history.</p>
        <input type="file" accept=".xlsx,.xls,.csv" className="text-sm" disabled={busy}
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
        {rows.length > 0 && (
          <div className="text-sm text-gray-700">
            <b>{rows.length.toLocaleString()}</b> lines in {fileName}
            {done > 0 && <span className="text-gray-500"> · sent {done.toLocaleString()}</span>}
            {totals && <span className="text-gray-500"> · inserted {totals.inserted.toLocaleString()}, already present {totals.skipped.toLocaleString()}</span>}
            <div className="h-2 bg-gray-100 rounded mt-2 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${rows.length ? (done / rows.length) * 100 : 0}%` }} /></div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>{totals && done >= rows.length ? 'Close' : 'Cancel'}</button>
          <button className="btn-primary" onClick={run} disabled={busy || !rows.length || (!!totals && done >= rows.length)}>
            {busy ? <Spinner size="sm" /> : <Upload size={14} />} Import
          </button>
        </div>
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
  const [showImport, setShowImport] = useState(false)
  const [q, setQ] = useState('')
  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 400); return () => clearTimeout(t) }, [search])

  // Newest 1000 by default; a search of 2+ characters is run on the server
  // (report no, asset, serial, job, description, WO) across the full history.
  const { data: inspections, isLoading, error, refetch } =
    useRealtimeFetch<Inspection[]>(q.length >= 2 ? `/inspections?search=${encodeURIComponent(q)}&limit=2000` : '/inspections?limit=1000', 15000)

  const filtered = useMemo(() => {
    if (!inspections) return []
    return inspections.filter(i => {
      if (result !== 'All' && i.Result  !== result) return false
      if (status !== 'All' && i.Status  !== status) return false
      return true
    })
  }, [inspections, result, status])

  if (isLoading && !inspections) return <PageLoader />

  return (
    <>
      <CreateInspectionModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); refetch() }}
      />

      {showImport && <ImportHistoryModal onClose={() => { setShowImport(false); refetch() }} />}

      <div className="flex gap-0 h-full">
        <div className="flex-1 min-w-0 space-y-4 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input pl-9" placeholder="Search report no, asset, serial, job, WO…"
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
            {hasRole('Admin') && (
              <button className="btn-ghost" onClick={() => setShowImport(true)} title="Import Epicor inspection history (xlsx)">
                <Upload size={15} /> Import history
              </button>
            )}
          </div>

          {error && <div className="card p-3 text-red-600 text-sm">{error}</div>}
          <p className="text-xs text-gray-500">{filtered.length} inspection lines{q.length < 2 ? ' (newest 1000 — type to search the full history)' : ''}</p>

          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th">WO / Line</th>
                  <th className="table-th">Asset / Serial</th>
                  <th className="table-th">Description</th>
                  <th className="table-th">Job</th>
                  <th className="table-th">Type</th>
                  <th className="table-th">Date</th>
                  <th className="table-th">Report No</th>
                  <th className="table-th">Action</th>
                  <th className="table-th">Status</th>
                  <th className="table-th w-6"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="table-td text-center text-gray-400 py-12">No inspections found</td></tr>
                ) : filtered.map(i => (
                  <tr key={i.InspectionID}
                    className={`table-tr cursor-pointer ${
                      selected?.InspectionID === i.InspectionID ? 'bg-brand-50 border-l-2 border-l-brand-500' : ''
                    }`}
                    onClick={() => setSelected(i)}>
                    <td className="table-td font-medium text-brand-600 font-mono text-xs" title={i.InspectionNumber}>{i.WONumber ?? i.InspectionNumber}{i.LineNum ? `/${i.LineNum}` : ''}</td>
                    <td className="table-td font-mono text-xs">{i.AssetNo || i.SerialNumber || '—'}</td>
                    <td className="table-td text-gray-600 text-xs max-w-[140px] truncate">{i.ToolDescription || '—'}</td>
                    <td className="table-td text-gray-500 text-xs">{i.JobID || '—'}</td>
                    <td className="table-td text-gray-500 text-xs">{i.InspectionType || '—'}</td>
                    <td className="table-td text-gray-500 text-xs">{formatDate(i.InspectionDate)}</td>
                    <td className="table-td font-mono text-xs">{i.CertNumber || '—'}</td>
                    <td className="table-td">{actionBadge(i.Action, i.Result)}</td>
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
