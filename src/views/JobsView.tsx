import React, { useState, useMemo } from 'react'
import { useRowWindow }  from '../components/useRowWindow'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Filter, RefreshCw } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { formatDate, statusBadgeClass } from '../utils/format'
import { PageLoader } from '../components/Spinner'
import { useAuth } from '../contexts/AuthContext'
import type { Job, JobStatus } from '../types'
import { ListOptions } from '../components/ListOptions'



/**
 * A cell value, or a faded dash when there isn't one.
 *
 * The job register is mostly gaps - PO number, end date and invoice number
 * are blank on the majority of rows - and rendering those dashes in the same
 * grey as real data meant the eye had to read every cell to find the filled
 * ones.
 */
function V({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const empty = children == null || children === '' || children === false
  return empty
    ? <span className="table-empty">—</span>
    : <span className={className}>{children}</span>
}

export function JobsView() {
  const { hasRole } = useAuth()
  const navigate = useNavigate()
  const [search,    setSearch]    = useState('')
  const [statusFilter, setStatus] = useState<JobStatus | 'All'>('All')
  const [yearFilter,   setYear]   = useState<string>('All')

  const { data: jobs, isLoading, error, refetch } = useFetch<Job[]>('/jobs')

  const years = useMemo(() => {
    if (!jobs) return ['All']
    const ys = new Set(jobs.map(j => j.FiscalYear).filter(Boolean) as string[])
    return ['All', ...Array.from(ys).sort().reverse()]
  }, [jobs])

  const filtered = useMemo(() => {
    if (!jobs) return []
    return jobs.filter(j => {
      if (statusFilter !== 'All' && j.Status !== statusFilter) return false
      if (yearFilter   !== 'All' && j.FiscalYear !== yearFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          j.JobID.toLowerCase().includes(q) ||
          j.Client.toLowerCase().includes(q) ||
          j.Rig.toLowerCase().includes(q) ||
          (j.Well || '').toLowerCase().includes(q) ||
          (j.Contract || '').toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [jobs, statusFilter, yearFilter, search])

  // Render the register in slices; all 3,700+ rows in the DOM at once was
  // most of the delay before first paint on these screens.
  const { scrollRef, onScroll, visible, hasMore, shown, total } = useRowWindow(filtered)

  if (isLoading) return <PageLoader />

  return (
    <div className="screen gap-1.5">
      {/* Toolbar — one row; the New Job button had a 40px row to itself. */}
      <div className="screen-bar">
        <div className="relative w-64">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="field-input !pl-7"
            placeholder="Search job, client, rig, well…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="field-input w-auto"
          value={statusFilter}
          onChange={e => setStatus(e.target.value as any)}
        >
          <ListOptions name="JobStatus" includeAll allLabel="All statuses" />
        </select>

        <select
          className="field-input w-auto"
          value={yearFilter}
          onChange={e => setYear(e.target.value)}
        >
          {years.map(y => (
            <option key={y} value={y}>{y === 'All' ? 'All years' : y}</option>
          ))}
        </select>

        <button onClick={refetch} className="btn-mini" title="Refresh">
          <RefreshCw size={12} />
        </button>

        <span className="text-[11px] text-gray-500">
          {hasMore ? `${shown} of ${total} shown` : `${total} job${total === 1 ? '' : 's'}`}
        </span>

        {hasRole('Admin', 'Operations') && (
          <button onClick={() => navigate('/jobs/new')} className="btn-accent ml-auto">
            <Plus size={12} /> New Job
          </button>
        )}
      </div>

      {error && <div className="card p-2 text-red-600 text-xs shrink-0">{error}</div>}

      {/* Table — nowrap everywhere; a wrapped Job ID made every row 3 lines tall */}
      <div ref={scrollRef} onScroll={onScroll}
           className="flex-1 min-h-0 overflow-auto bg-white border border-gray-300 rounded">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="table-th pin-l">Job No</th>
              <th className="table-th">Client</th>
              <th className="table-th">Sub-Division</th>
              <th className="table-th">Rig</th>
              <th className="table-th">Well</th>
              <th className="table-th">Contract</th>
              <th className="table-th">PO Number</th>
              <th className="table-th">Start</th>
              <th className="table-th">End</th>
              <th className="table-th !text-right">Job Value</th>
              <th className="table-th">Invoice No</th>
              <th className="table-th pin-r">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="table-td text-center text-gray-400 py-10">
                  {search || statusFilter !== 'All' ? 'No jobs match your filters' : 'No jobs found'}
                </td>
              </tr>
            ) : (
              visible.map(job => (
                <tr
                  key={job.JobID}
                  className="table-tr whitespace-nowrap"
                  onClick={() => navigate(`/jobs/${job.JobID}`)}
                >
                  <td className="table-td pin-l font-mono font-medium text-brand-600">{job.JobID}</td>
                  {/* Client names run long - 'Churchill Drilling Tools Oil Well
                      Drilling' was cut to 'Churchill Drilling Tools Oil Well Dr…'
                      and the distinguishing part is at the end. */}
                  <td className="table-td font-medium max-w-[260px] truncate"
                      title={job.Client || ''}><V>{job.Client}</V></td>
                  <td className="table-td text-gray-500"><V>{job.ServiceType}</V></td>
                  <td className="table-td"><V>{job.Rig}</V></td>
                  <td className="table-td text-gray-500"><V>{job.Well}</V></td>
                  <td className="table-td table-ref text-gray-500"><V>{job.Contract}</V></td>
                  <td className="table-td table-ref text-gray-500"><V>{job.PONumber}</V></td>
                  <td className="table-td table-ref text-gray-500"><V>{formatDate(job.MobDate)}</V></td>
                  <td className="table-td table-ref text-gray-500"><V>{formatDate(job.DemobDate)}</V></td>
                  <td className="table-td table-num text-gray-800">
                    <V>{job.InvoiceAmount
                      ? Number(job.InvoiceAmount).toLocaleString(undefined, { maximumFractionDigits: 0 })
                      : null}</V>
                  </td>
                  <td className="table-td text-gray-500 font-mono"><V>{job.LegalInvoiceNumber}</V></td>
                  <td className="table-td pin-r">
                    <span className={`badge ${statusBadgeClass(job.Status)}`}>
                      {job.Status}
                    </span>
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
