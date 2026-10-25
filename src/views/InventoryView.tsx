import React, { useState, useMemo } from 'react'
import { Plus, Search, RefreshCw, Package } from 'lucide-react'
import { useRealtimeFetch } from '../hooks/useRealtimeFetch'
import { useAuth } from '../contexts/AuthContext'
import { PageLoader } from '../components/Spinner'
import type { InventoryItem } from '../types'

export function InventoryView() {
  const { hasRole } = useAuth()
  const [search, setSearch] = useState('')
  const [owner,  setOwner]  = useState<'all' | 'own' | 'sub'>('all')

  const { data: items, isLoading, error, refetch } = useRealtimeFetch<InventoryItem[]>('/inventory')

  const filtered = useMemo(() => {
    if (!items) return []
    return items.filter(i => {
      if (owner === 'own' && !i.IsEmdad) return false
      if (owner === 'sub' &&  i.IsEmdad) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          (i.SystemID || '').toLowerCase().includes(q) ||
          (i.Serial || '').toLowerCase().includes(q) ||
          (i.AssetNo  || '').toLowerCase().includes(q) ||
          (i.ShortDesc|| '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [items, owner, search])

  if (isLoading) return <PageLoader />

  const ownCount = items?.filter(i =>  i.IsEmdad).length ?? 0
  const subCount = items?.filter(i => !i.IsEmdad).length ?? 0

  return (
    <div className="flex flex-col h-[calc(100vh-104px)] gap-3">
      {/* Summary chips */}
      <div className="flex gap-3 flex-wrap">
        <div className="card px-4 py-2 flex items-center gap-2">
          <Package size={16} className="text-blue-500" />
          <span className="text-sm font-medium text-gray-700">{ownCount} Own tools</span>
        </div>
        <div className="card px-4 py-2 flex items-center gap-2">
          <Package size={16} className="text-orange-500" />
          <span className="text-sm font-medium text-gray-700">{subCount} Sub-Contractor tools</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Search asset no, serial, description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select className="input w-auto" value={owner} onChange={e => setOwner(e.target.value as any)}>
          <option value="all">All Ownership</option>
          <option value="own">Own (EMDAD)</option>
          <option value="sub">Subcontract</option>
        </select>

        <button onClick={refetch} className="btn-ghost" title="Refresh">
          <RefreshCw size={15} />
        </button>

        {hasRole('Admin', 'Operations') && (
          <button className="btn-primary">
            <Plus size={15} /> Add Tool
          </button>
        )}
      </div>

      {error && <div className="card p-3 text-red-600 text-sm">{error}</div>}
      <p className="text-xs text-gray-500 shrink-0">Showing {filtered.length} of {items?.length ?? 0} items</p>

      <div className="card flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="table-th">Asset No</th>
                <th className="table-th">Size</th>
                <th className="table-th">Tool Type</th>
                <th className="table-th">Description</th>
                <th className="table-th">Owner</th>
                <th className="table-th">Location</th>
                <th className="table-th">Status</th>
                <th className="table-th">Qty</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-td text-center text-gray-400 py-12">
                    {search ? 'No items match your search' : 'No inventory items found'}
                  </td>
                </tr>
              ) : (
                filtered.map(item => (
                  <tr key={item.SystemID} className="table-tr">
                    <td className="table-td font-mono text-xs font-medium text-brand-600">{item.AssetNo || item.SystemID || '—'}</td>
                    <td className="table-td text-xs">{item.Size || <span className="text-gray-400">—</span>}</td>
                    <td className="table-td font-medium">{item.ShortDesc || '—'}</td>
                    <td className="table-td text-gray-600 max-w-md truncate" title={item.Description || ''}>
                      {item.Description || '—'}
                    </td>
                    <td className="table-td">
                      {/* The sub-contractor's own name, as in the old app — not a
                          generic "Subcontract" label. Ownership is the reliable
                          field; Supplier is blank on 41 of the 269 sub tools. */}
                      <span className={`badge ${item.IsEmdad ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                        {item.IsEmdad ? 'EMDAD' : (item.Ownership || item.Supplier || 'Sub-Contractor')}
                      </span>
                    </td>
                    <td className="table-td text-gray-500">{item.Location || '—'}</td>
                    <td className="table-td text-gray-500">{item.Status || '—'}</td>
                    <td className="table-td text-center text-gray-500">{item.Qty ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
