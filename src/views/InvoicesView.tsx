import React, { useState, useMemo } from 'react'
import { Plus, Search, RefreshCw, FileText } from 'lucide-react'
import { useRealtimeFetch } from '../hooks/useRealtimeFetch'
import { useAuth } from '../contexts/AuthContext'
import { formatDate, formatCurrency, statusBadgeClass } from '../utils/format'
import { PageLoader } from '../components/Spinner'

/**
 * The year an invoice belongs to.
 *
 * FiscalYear is null on every one of the 3,666 invoices in the database, so
 * reading it alone yielded the string "null" for all of them. This screen
 * used to default its year filter to the current year and compare against
 * that, which matched nothing and left the register permanently empty.
 * InvoiceDate is populated, so it is the fallback.
 */
function invoiceYear(inv: any): string {
  const fy = String(inv?.FiscalYear ?? '').trim()
  if (/^\d{4}/.test(fy)) return fy.slice(0, 4)
  const d = String(inv?.InvoiceDate ?? '')
  return /^\d{4}/.test(d) ? d.slice(0, 4) : ''
}

export function InvoicesView() {
  const { hasRole } = useAuth()
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('All')
  const [year,   setYear]     = useState('All')

  const { data: invoices, isLoading, error, refetch } = useRealtimeFetch<any[]>('/invoices')

  const filtered = useMemo(() => {
    if (!invoices) return []
    return invoices.filter(inv => {
      if (status !== 'All' && inv.Status !== status) return false
      if (year   !== 'All' && invoiceYear(inv) !== year) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          (inv.InvoiceNumber || '').toLowerCase().includes(q) ||
          (inv.JobID         || '').toLowerCase().includes(q) ||
          (inv.Client        || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [invoices, status, year, search])

  const totalAmount = filtered.reduce((sum, inv) => sum + (inv.TotalAmount || 0), 0)

  // Both dropdowns are built from the invoices themselves rather than from a
  // fixed list. The old status list offered Draft / Submitted / Under Review /
  // Approved / Paid / Rejected / Cancelled, and the database holds none of
  // those words - the real values are Final Invoiced, Draft Invoiced,
  // JobCompleted, Completed and Ongoing - so every choice filtered to nothing.
  const yearOptions = useMemo(() => {
    const ys = new Set((invoices || []).map(invoiceYear).filter(Boolean))
    return ['All', ...Array.from(ys).sort().reverse()]
  }, [invoices])

  const statusOptions = useMemo(() => {
    const ss = new Set((invoices || []).map(i => String(i.Status || '').trim()).filter(Boolean))
    return ['All', ...Array.from(ss).sort()]
  }, [invoices])

  // The two tiles after the totals used to count 'Pending' and 'Paid', which
  // never occur, so both always read zero. These follow whatever statuses the
  // filtered set actually contains.
  const topStatuses = useMemo(() => {
    const counts = new Map<string, number>()
    filtered.forEach(i => {
      const s = String(i.Status || '').trim()
      if (s) counts.set(s, (counts.get(s) || 0) + 1)
    })
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 2)
  }, [filtered])

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total Shown',  value: filtered.length, isNum: false },
          { label: 'Total Amount', value: formatCurrency(totalAmount), isNum: false },
          ...topStatuses.map(([label, n]) => ({ label, value: n, isNum: false })),
        ].map(card => (
          <div key={card.label} className="card p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{card.label}</p>
            <p className="text-xl font-semibold text-gray-900 mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Search invoice #, job, client…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={status} onChange={e => setStatus(e.target.value)}>
          {statusOptions.map(s =>
            <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>
          )}
        </select>
        <select className="input w-auto" value={year} onChange={e => setYear(e.target.value)}>
          {yearOptions.map(y => <option key={y} value={y}>{y === 'All' ? 'All Years' : y}</option>)}
        </select>
        <button onClick={refetch} className="btn-ghost"><RefreshCw size={15} /></button>
        {hasRole('Admin', 'Billing', 'Finance') && (
          <button className="btn-primary"><Plus size={15} /> New Invoice</button>
        )}
      </div>

      {error && <div className="card p-3 text-red-600 text-sm">{error}</div>}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">Invoice #</th>
              <th className="table-th">Job ID</th>
              <th className="table-th">Client</th>
              <th className="table-th">Invoice Date</th>
              <th className="table-th">Due Date</th>
              <th className="table-th">Currency</th>
              <th className="table-th text-right">Amount</th>
              <th className="table-th">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="table-td text-center py-12">
                  <FileText size={32} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-400">No invoices found</p>
                </td>
              </tr>
            ) : (
              filtered.map((inv: any) => (
                <tr key={inv.InvoiceID} className="table-tr">
                  <td className="table-td font-medium text-brand-600">{inv.InvoiceNumber}</td>
                  <td className="table-td">{inv.JobID || '—'}</td>
                  <td className="table-td text-gray-500">{inv.Client || '—'}</td>
                  <td className="table-td text-gray-500">{formatDate(inv.InvoiceDate)}</td>
                  <td className="table-td text-gray-500">{formatDate(inv.DueDate)}</td>
                  <td className="table-td text-gray-400 text-xs">{inv.Currency || 'USD'}</td>
                  <td className="table-td text-right font-medium">{formatCurrency(inv.TotalAmount)}</td>
                  <td className="table-td">
                    <span className={`badge ${statusBadgeClass(inv.Status)}`}>{inv.Status}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
