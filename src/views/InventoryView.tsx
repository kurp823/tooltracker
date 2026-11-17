import React, { useState, useMemo } from 'react'
import { Search, RefreshCw, Package } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useRowWindow } from '../components/useRowWindow'
import { useRegister } from '../hooks/useRegister'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { PageLoader } from '../components/Spinner'
import type { InventoryItem } from '../types'

export function InventoryView() {
  const { hasRole } = useAuth()
  const [search, setSearch] = useState('')
  const [owner,  setOwner]  = useState<'all' | 'own' | 'sub'>('all')

  // Search and ownership go to the server; the default view is the first
  // 1,000 of the catalogue (A→Z by tool type). The full 8,775-row list took
  // 7 s of server time on every visit and every poll.
  const { rows: items, isLoading, error, refetch, capped, setShowAll, cap } =
    useRegister<InventoryItem>('/inventory', { search, cap: 1000, extra: { owner: owner === 'all' ? undefined : owner } })
  const { data: counts } = useFetch<{ total: number; own: number; sub: number }>('/inventory/counts')

  const filtered = useMemo(() => items, [items])

  // 5,094 rows laid out before first paint was most of this screen's delay.
  const { scrollRef, onScroll, visible, hasMore, shown, total } = useRowWindow(filtered)

  if (isLoading) return <PageLoader />

  const ownCount = counts?.own ?? 0
  const subCount = counts?.sub ?? 0

  return (
    <div className="screen gap-1.5">
      {/* Toolbar — the summary chips were a 48px row for two numbers that fit
          inline next to the filters. */}
      <div className="screen-bar">
        <div className="relative w-64">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="field-input !pl-7"
            placeholder="Search asset no, serial, description…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select className="field-input w-auto" value={owner} onChange={e => setOwner(e.target.value as any)}>
          <option value="all">All ownership</option>
          <option value="own">Own (EMDAD)</option>
          <option value="sub">Sub-contracted</option>
        </select>

        <button onClick={refetch} className="btn-mini" title="Refresh">
          <RefreshCw size={12} />
        </button>

        <span className="text-[11px] text-gray-500">
          {capped
            ? <>first {cap} of {counts?.total ?? '…'} shown · type to search or <button className="text-brand-600 hover:underline" onClick={() => setShowAll(true)}>show all</button></>
            : hasMore ? `${shown} of ${total} shown` : `${total} items`}
          {' '}· {ownCount} EMDAD · {subCount} sub-contracted
        </span>

        {hasRole('Admin', 'Operations') && (
          <Link to="/missing-tools" className="btn-mini ml-auto"
                title="Tools on live jobs with no inventory record">
            <Package size={12} /> Not in inventory
          </Link>
        )}
      </div>

      {error && <div className="card p-2 text-red-600 text-xs shrink-0">{error}</div>}

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white border border-gray-300 rounded">
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse">
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
                visible.map(item => (
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

      {/*
        There is deliberately no "Add Tool" button. Stock enters inventory only
        through a controlled route — PO -> Goods Inward (GRN) for EMDAD-owned
        kit, Third-Party Rental Inward for sub-contracted kit — so that every
        asset has a receipt behind it. Typing a row straight into the catalogue
        is how you end up unable to say where a tool came from or what it cost.
        The one exception is the reconciliation screen above, which repairs
        assets that are already on a rig but were never recorded.
      */}
    </div>
  )
}
