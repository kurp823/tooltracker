import React, { useState } from 'react'
import { RefreshCw, Search, History } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { PageLoader } from '../components/Spinner'
import { describe, type AuditRow } from '../components/HistoryPanel'

const when = (v: string) => new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const ENTITIES = ['', 'invoice', 'job', 'contract', 'utilization', 'expense', 'month']

/** The change log across the app: who changed what, when, old and new values. */
export function AuditLogView() {
  const [entity, setEntity] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const qs = new URLSearchParams()
  if (entity) qs.set('entity', entity)
  if (search.trim()) qs.set('search', search.trim())
  if (from) qs.set('from', from)
  if (to) qs.set('to', to)
  const { data, isLoading, error, refetch } = useFetch<AuditRow[]>(`/audit?${qs.toString()}`)
  if (isLoading && !data) return <PageLoader />
  return (
    <div className="screen gap-1.5">
      <div className="screen-bar">
        <select className="field-input w-auto" value={entity} onChange={e => setEntity(e.target.value)}>
          {ENTITIES.map(e => <option key={e} value={e}>{e ? e[0].toUpperCase() + e.slice(1) : 'All records'}</option>)}
        </select>
        <input type="date" className="field-input w-36" value={from} onChange={e => setFrom(e.target.value)} />
        <input type="date" className="field-input w-36" value={to} onChange={e => setTo(e.target.value)} />
        <div className="relative w-72">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="field-input !pl-7" placeholder="Record id, action or value…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn-mini" onClick={refetch}><RefreshCw size={12} /></button>
        <span className="text-[11px] text-gray-500">{(data || []).length} entries (latest 500)</span>
      </div>
      {error && <div className="card p-2 text-red-600 text-xs shrink-0">{error}</div>}
      <div className="flex-1 min-h-0 overflow-auto bg-white border border-gray-300 rounded">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10"><tr>
            <th className="table-th">When</th><th className="table-th">Who</th><th className="table-th">Record</th>
            <th className="table-th">Action</th><th className="table-th">Detail</th>
          </tr></thead>
          <tbody>
            {(data || []).length === 0 ? (
              <tr><td colSpan={5} className="table-td text-center text-gray-400 py-10"><History size={22} className="mx-auto mb-1 opacity-40" />Nothing recorded yet.</td></tr>
            ) : (data || []).map(r => (
              <tr key={r.id} className="table-tr align-top">
                <td className="table-td whitespace-nowrap text-gray-500">{when(r.at)}</td>
                <td className="table-td whitespace-nowrap">{r.who || '—'} <span className="text-[10px] text-gray-400">{r.role}</span></td>
                <td className="table-td whitespace-nowrap"><span className="text-[10px] uppercase text-gray-400 mr-1">{r.entity}</span><span className="font-mono">{r.entityId}</span></td>
                <td className="table-td whitespace-nowrap font-medium">{r.action}</td>
                <td className="table-td text-gray-600 max-w-[600px] break-words whitespace-normal">{describe(r.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
