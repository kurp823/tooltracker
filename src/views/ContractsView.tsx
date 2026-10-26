import React, { useMemo, useState } from 'react'
import { RefreshCw, Download, Search, FileText } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { PageLoader } from '../components/Spinner'
import { formatDate } from '../utils/format'

/**
 * Commercial Contracts Master Register.
 *
 * Mirrors the previous app's register: contract ref with the client beside it
 * (not a duplicated "Name" column), validity window, contract value and the
 * performance bank guarantee (PBG) details — all of which are real columns on
 * tbl_Contracts and were simply not being selected before.
 */
interface Contract {
  ContractID: string
  ContractNumber: string | null
  ClientName: string | null
  PONumber: string | null
  Currency: string | null
  StartDate: string | null
  EndDate: string | null
  Status: string | null
  Description: string | null
  ContractValue: number | null
  InvoicedToDate: number | null
  PBGNumber: string | null
  PBGValue: number | null
  PBGIssueDate: string | null
  PBGExpiryDate: string | null
  IsActive: number
}

type Filter = 'All' | 'Active' | 'Closed' | 'Archived'

const money = (v: number | null | undefined, cur?: string | null) =>
  v == null || v === 0
    ? '—'
    : `${cur ? cur + ' ' : ''}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

const millions = (v: number) => (v / 1_000_000).toFixed(2) + 'M'

export function ContractsView() {
  const { data: contracts, isLoading, error, refetch } = useFetch<Contract[]>('/contracts')
  const [filter, setFilter] = useState<Filter>('All')
  const [client, setClient] = useState('All')
  const [search, setSearch] = useState('')

  const rows = contracts ?? []

  const clients = useMemo(
    () => ['All', ...Array.from(new Set(rows.map(c => c.ClientName).filter(Boolean) as string[])).sort()],
    [rows]
  )

  const counts = useMemo(() => ({
    All:      rows.length,
    Active:   rows.filter(c => c.Status === 'Active').length,
    Closed:   rows.filter(c => c.Status === 'Closed').length,
    Archived: rows.filter(c => c.Status === 'Archived').length,
  }), [rows])

  const metrics = useMemo(() => {
    let usd = 0, aed = 0, pbg = 0
    for (const c of rows) {
      if (c.Status !== 'Active') continue
      if (c.Currency === 'AED') aed += Number(c.ContractValue || 0)
      else usd += Number(c.ContractValue || 0)
      pbg += Number(c.PBGValue || 0)
    }
    return { usd, aed, pbg }
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(c => {
      if (filter !== 'All' && c.Status !== filter) return false
      if (client !== 'All' && c.ClientName !== client) return false
      if (!q) return true
      return [c.ContractID, c.ContractNumber, c.ClientName, c.PBGNumber, c.Description, c.PONumber]
        .some(v => (v || '').toString().toLowerCase().includes(q))
    })
  }, [rows, filter, client, search])

  function exportCsv() {
    const cols: (keyof Contract)[] = [
      'ContractNumber','ClientName','PONumber','Currency','StartDate','EndDate','Status',
      'ContractValue','InvoicedToDate','PBGNumber','PBGValue','PBGIssueDate','PBGExpiryDate','Description',
    ]
    const head = cols.join(',')
    const body = filtered.map(c => cols.map(k => {
      const s = c[k] == null ? '' : String(c[k])
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([`${head}\n${body}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'contract-register.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) return <PageLoader />

  return (
    <div className="screen gap-1.5">
      {/* Portfolio metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <div className="card px-4 py-2.5">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total Agreements</div>
          <div className="text-xl font-bold text-navy-900">{counts.All}</div>
          <div className="text-[11px] text-gray-500">{counts.Active} Active / {counts.Closed} Closed</div>
        </div>
        <div className="card px-4 py-2.5">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Active Portfolio (USD)</div>
          <div className="text-xl font-bold text-navy-900">${millions(metrics.usd)}</div>
        </div>
        <div className="card px-4 py-2.5">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Active Portfolio (AED)</div>
          <div className="text-xl font-bold text-navy-900">AED {millions(metrics.aed)}</div>
        </div>
        <div className="card px-4 py-2.5">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Active PBG Security</div>
          <div className="text-xl font-bold text-accent-700">AED {millions(metrics.pbg)}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <div className="flex rounded border border-gray-300 overflow-hidden">
          {(['All','Active','Closed','Archived'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f ? 'bg-navy-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>

        <select className="input w-auto py-1.5 text-xs" value={client} onChange={e => setClient(e.target.value)}>
          {clients.map(c => <option key={c} value={c}>{c === 'All' ? `All Clients (${clients.length - 1})` : c}</option>)}
        </select>

        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-8 py-1.5 text-xs"
            placeholder="Search contract, ref, PBG, client, PO…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <button className="btn-mini" onClick={refetch}><RefreshCw size={13} /> Refresh</button>
        <button className="btn-mini" onClick={exportCsv}><Download size={13} /> Export</button>
      </div>

      {error && <div className="card p-3 text-red-600 text-sm shrink-0">{error}</div>}

      {/* Register */}
      <div className="card flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="table-th">Contract Ref / SAP</th>
                <th className="table-th">Client Entity</th>
                <th className="table-th">PO Number</th>
                <th className="table-th">Short Description</th>
                <th className="table-th text-center">Curr</th>
                <th className="table-th">Validity Period</th>
                <th className="table-th text-center">Status</th>
                <th className="table-th text-right">Contract Value</th>
                <th className="table-th text-right">Invoiced To Date</th>
                <th className="table-th">PBG Number</th>
                <th className="table-th text-right">PBG Value</th>
                <th className="table-th text-center">PBG Expiry</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="table-td text-center text-gray-400 py-12">
                    <FileText size={24} className="mx-auto mb-2 opacity-50" />
                    No contracts match the current filters.
                  </td>
                </tr>
              ) : filtered.map(c => (
                <tr key={c.ContractID} className="border-b border-gray-100 hover:bg-brand-50/50">
                  <td className="table-td font-mono font-medium text-brand-700">{c.ContractNumber || c.ContractID}</td>
                  <td className="table-td font-medium">{c.ClientName || '—'}</td>
                  <td className="table-td font-mono text-[11px]">{c.PONumber || '—'}</td>
                  <td className="table-td max-w-sm truncate" title={c.Description || ''}>{c.Description || '—'}</td>
                  <td className="table-td text-center">{c.Currency || '—'}</td>
                  <td className="table-td whitespace-nowrap text-[11px]">
                    {c.StartDate || c.EndDate
                      ? `${formatDate(c.StartDate) || '—'} → ${formatDate(c.EndDate) || '—'}`
                      : '—'}
                  </td>
                  <td className="table-td text-center">
                    <span className={`badge ${
                      c.Status === 'Active'   ? 'bg-green-100 text-green-700' :
                      c.Status === 'Closed'   ? 'bg-gray-100 text-gray-600'  :
                                                'bg-orange-100 text-orange-700'
                    }`}>{c.Status || '—'}</span>
                  </td>
                  <td className="table-td text-right">{money(c.ContractValue, c.Currency)}</td>
                  <td className="table-td text-right">{money(c.InvoicedToDate, c.Currency)}</td>
                  <td className="table-td font-mono text-[11px]">{c.PBGNumber || '—'}</td>
                  <td className="table-td text-right">{money(c.PBGValue, 'AED')}</td>
                  <td className="table-td text-center text-[11px] whitespace-nowrap">
                    {c.PBGExpiryDate ? formatDate(c.PBGExpiryDate) : (c.PBGValue ? 'OPEN ENDED' : '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="shrink-0 border-t border-gray-200 px-3 py-1.5 flex items-center justify-between text-[11px] text-gray-500">
          <span>Showing {filtered.length} of {rows.length} master contracts</span>
          <span>Standby Default: 50% Ops Rate</span>
        </div>
      </div>
    </div>
  )
}
