import React, { useState } from 'react'
import { Plus, Search, RefreshCw, Edit2, ChevronRight } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { api } from '../utils/api'
import { formatDate } from '../utils/format'
import { PageLoader } from '../components/Spinner'
import type { Contract } from '../types'

const STATUS_COLORS: Record<string, string> = {
  Active:    'bg-green-100 text-green-700',
  Expired:   'bg-red-100 text-red-700',
  Draft:     'bg-yellow-100 text-yellow-700',
  Cancelled: 'bg-gray-100 text-gray-500',
}

export function ContractsView() {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<Contract | null>(null)
  const [editing,  setEditing]  = useState<Partial<Contract> | null>(null)

  const { data: contracts, isLoading, error, refetch } = useFetch<Contract[]>('/contracts')
  const { data: rates, refetch: refetchRates } = useFetch<any[]>(
    selected ? `/contracts/${selected.ContractID}/rates` : null
  )

  const filtered = (contracts || []).filter(c =>
    !search ||
    (c.ContractNumber || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.ContractName   || '').toLowerCase().includes(search.toLowerCase()) ||
    ((c as any).ClientName || '').toLowerCase().includes(search.toLowerCase())
  )

  if (isLoading) return <PageLoader />

  return (
    <div className="flex gap-4 h-full">
      {/* Left: list */}
      <div className="flex-1 space-y-4 min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Search contracts…" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={refetch} className="btn-ghost"><RefreshCw size={15} /></button>
          {hasRole('Admin', 'Operations', 'Finance') && (
            <button className="btn-primary" onClick={() => setEditing({})}>
              <Plus size={15} /> New Contract
            </button>
          )}
        </div>

        {error && <div className="card p-3 text-red-600 text-sm">{error}</div>}

        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Contract #</th>
                <th className="table-th">Name</th>
                <th className="table-th">Client</th>
                <th className="table-th">Start</th>
                <th className="table-th">End</th>
                <th className="table-th">Status</th>
                <th className="table-th w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="table-td text-center text-gray-400 py-8">No contracts</td></tr>
              ) : (
                filtered.map(c => (
                  <tr
                    key={c.ContractID}
                    className={`table-tr cursor-pointer ${selected?.ContractID === c.ContractID ? 'bg-brand-50' : ''}`}
                    onClick={() => setSelected(c)}
                  >
                    <td className="table-td font-medium text-brand-600">{c.ContractNumber}</td>
                    <td className="table-td">{c.ContractName || '—'}</td>
                    <td className="table-td text-gray-500">{(c as any).ClientName || '—'}</td>
                    <td className="table-td text-gray-500">{formatDate(c.StartDate)}</td>
                    <td className="table-td text-gray-500">{formatDate(c.EndDate)}</td>
                    <td className="table-td">
                      <span className={`badge ${STATUS_COLORS[c.Status] || 'bg-gray-100 text-gray-500'}`}>
                        {c.Status}
                      </span>
                    </td>
                    <td className="table-td"><ChevronRight size={14} className="text-gray-300" /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right: rates panel */}
      {selected && (
        <div className="w-96 shrink-0 space-y-3">
          <div className="card p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <p className="font-semibold text-gray-900">{selected.ContractNumber}</p>
                <p className="text-sm text-gray-500">{selected.ContractName}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>
            <div className="text-xs text-gray-500 space-y-1">
              <p>Currency: <span className="font-medium text-gray-800">{selected.Currency}</span></p>
              <p>Valid: {formatDate(selected.StartDate)} → {formatDate(selected.EndDate)}</p>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-700">Rate Schedule</p>
              {hasRole('Admin', 'Finance', 'Billing') && (
                <button className="text-xs text-brand-600 hover:text-brand-700">+ Add Rate</button>
              )}
            </div>
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-th text-xs">Item Code</th>
                  <th className="table-th text-xs">Description</th>
                  <th className="table-th text-xs">UOM</th>
                  <th className="table-th text-xs">Price</th>
                </tr>
              </thead>
              <tbody>
                {(!rates || rates.length === 0) ? (
                  <tr><td colSpan={4} className="table-td text-center text-gray-400 text-xs py-6">No rates defined</td></tr>
                ) : (
                  rates.map((r: any) => (
                    <tr key={r.RateID} className="table-tr">
                      <td className="table-td text-xs font-mono">{r.ItemCode || '—'}</td>
                      <td className="table-td text-xs">{r.Description}</td>
                      <td className="table-td text-xs text-gray-500">{r.UOM || '—'}</td>
                      <td className="table-td text-xs font-medium">{r.UnitPrice?.toFixed(2)} {r.Currency}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
