import React, { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Filter, RefreshCw } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { formatDate, statusBadgeClass } from '../utils/format'
import { PageLoader } from '../components/Spinner'
import { useAuth } from '../contexts/AuthContext'
import type { Job, JobStatus } from '../types'

const STATUS_OPTIONS: (JobStatus | 'All')[] = [
  'All', 'Open', 'Ongoing', 'Draft Invoice Submitted', 'Completed', 'JobCompleted'
]

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

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Search Job ID, client, rig, well…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Status filter */}
        <select
          className="input w-auto"
          value={statusFilter}
          onChange={e => setStatus(e.target.value as any)}
        >
          {STATUS_OPTIONS.map(s => (
            <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>
          ))}
        </select>

        {/* Year filter */}
        <select
          className="input w-auto"
          value={yearFilter}
          onChange={e => setYear(e.target.value)}
        >
          {years.map(y => (
            <option key={y} value={y}>{y === 'All' ? 'All Years' : y}</option>
          ))}
        </select>

        <button onClick={refetch} className="btn-ghost" title="Refresh">
          <RefreshCw size={15} />
        </button>

        {hasRole('Admin', 'Operations') && (
          <button
            onClick={() => navigate('/jobs/new')}
            className="btn-primary"
          >
            <Plus size={15} />
            New Job
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="card p-4 text-red-600 text-sm">{error}</div>
      )}

      {/* Summary */}
      <p className="text-xs text-gray-500">
        Showing {filtered.length} of {jobs?.length ?? 0} jobs
      </p>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Job ID</th>
                <th className="table-th">Client</th>
                <th className="table-th">Rig</th>
                <th className="table-th">Well</th>
                <th className="table-th">Contract</th>
                <th className="table-th">Mob Date</th>
                <th className="table-th">Demob Date</th>
                <th className="table-th">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-td text-center text-gray-400 py-12">
                    {search || statusFilter !== 'All' ? 'No jobs match your filters' : 'No jobs found'}
                  </td>
                </tr>
              ) : (
                filtered.map(job => (
                  <tr
                    key={job.JobID}
                    className="table-tr"
                    onClick={() => navigate(`/jobs/${job.JobID}`)}
                  >
                    <td className="table-td">
                      <span className="font-medium text-brand-600">{job.JobID}</span>
                    </td>
                    <td className="table-td font-medium">{job.Client || '—'}</td>
                    <td className="table-td">{job.Rig || '—'}</td>
                    <td className="table-td text-gray-500">{job.Well || '—'}</td>
                    <td className="table-td text-gray-500">{job.Contract || '—'}</td>
                    <td className="table-td text-gray-500">{formatDate(job.MobDate)}</td>
                    <td className="table-td text-gray-500">{formatDate(job.DemobDate)}</td>
                    <td className="table-td">
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
    </div>
  )
}
