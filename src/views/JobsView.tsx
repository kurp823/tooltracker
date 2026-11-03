import React, { useState, useMemo } from 'react'
import { usePagedRows, Pager } from '../components/usePagedRows'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search, Filter, RefreshCw } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { formatDate, statusBadgeClass, billingStatusClass } from '../utils/format'
import { PageLoader } from '../components/Spinner'
import { useAuth } from '../contexts/AuthContext'
import type { Job, JobStatus } from '../types'
import { ListOptions } from '../components/ListOptions'



/** The old register's six lifecycle stages, read from the stored Status. */
const STAGES = [
  { key: 'open',    label: 'Open',         dot: 'bg-slate-400',   on: 'bg-slate-800 text-white',   off: 'bg-slate-50 text-slate-700 border-slate-200' },
  { key: 'ongoing', label: 'Ongoing',      dot: 'bg-blue-500',    on: 'bg-blue-600 text-white',    off: 'bg-blue-50/60 text-blue-900 border-blue-200' },
  { key: 'docs',    label: 'Waiting Docs', dot: 'bg-rose-500',    on: 'bg-rose-600 text-white',    off: 'bg-rose-50/60 text-rose-900 border-rose-200' },
  { key: 'billing', label: 'In Billing',   dot: 'bg-amber-500',   on: 'bg-amber-600 text-white',   off: 'bg-amber-50/60 text-amber-900 border-amber-200' },
  { key: 'ses',     label: 'Under SES',    dot: 'bg-purple-500',  on: 'bg-purple-600 text-white',  off: 'bg-purple-50/60 text-purple-900 border-purple-200' },
  { key: 'done',    label: 'Completed',    dot: 'bg-emerald-500', on: 'bg-emerald-700 text-white', off: 'bg-emerald-50/60 text-emerald-900 border-emerald-200' },
] as const
type StageKey = typeof STAGES[number]['key']

function stageOf(status: string | null | undefined): StageKey {
  const s = (status || '').toLowerCase()
  if (s === 'ongoing' || s === 'active') return 'ongoing'
  if (s.includes('waiting')) return 'docs'
  if (s.includes('billing')) return 'billing'
  if (s.includes('ses') || s.includes('draft invoice')) return 'ses'
  if (s === 'completed' || s === 'jobcompleted' || s === 'closed' || s.includes('final')) return 'done'
  return 'open'
}

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
  const [stage,   setStage]   = useState<StageKey | 'all'>('all')
  const [rigFilter,    setRig]    = useState('All')
  const [clientFilter, setClient] = useState('All')
  const [dense, setDense] = useState(true)

  const { data: jobs, isLoading, error, refetch } = useFetch<Job[]>('/jobs')

  const years = useMemo(() => {
    if (!jobs) return ['All']
    const ys = new Set(jobs.map(j => j.FiscalYear).filter(Boolean) as string[])
    return ['All', ...Array.from(ys).sort().reverse()]
  }, [jobs])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 }
    ;(jobs || []).forEach(j => { c.all++; const k = stageOf(j.Status); c[k] = (c[k] || 0) + 1 })
    return c
  }, [jobs])
  const rigs = useMemo(() => Array.from(new Set((jobs || []).map(j => (j.Rig || '').trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [jobs])
  const clients = useMemo(() => Array.from(new Set((jobs || []).map(j => (j.Client || '').trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b)), [jobs])

  const filtered = useMemo(() => {
    if (!jobs) return []
    return jobs.filter(j => {
      if (stage !== 'all' && stageOf(j.Status) !== stage) return false
      if (rigFilter !== 'All' && (j.Rig || '').trim() !== rigFilter) return false
      if (clientFilter !== 'All' && (j.Client || '').trim() !== clientFilter) return false
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
  }, [jobs, statusFilter, yearFilter, search, stage, rigFilter, clientFilter])

  // One screenful per page, measured from the rendered row height. Putting
  // all 3,700+ rows in the DOM was most of the delay before first paint.
  const { scrollRef, visible, page, pageCount, setPage, from, to, total } =
    usePagedRows(filtered)

  if (isLoading) return <PageLoader />

  return (
    <div className="screen gap-1.5">
      {/* Lifecycle ribbon: click a stage to filter, click again to clear. */}
      <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 flex-wrap shrink-0">
        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mr-1">Lifecycle</span>
        <button onClick={() => setStage('all')}
          className={`px-2.5 py-1 rounded-md font-semibold text-xs flex items-center gap-1.5 ${stage === 'all' ? 'bg-[#1a3055] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
          All Jobs <span className={`text-[10px] px-1.5 rounded-full font-mono ${stage === 'all' ? 'bg-white/20' : 'bg-slate-200'}`}>{(counts.all || 0).toLocaleString()}</span>
        </button>
        {STAGES.map(st => (
          <React.Fragment key={st.key}>
            <span className="text-slate-300 text-xs hidden md:inline">➔</span>
            <button onClick={() => setStage(stage === st.key ? 'all' : st.key)}
              className={`px-2.5 py-1 rounded-md font-semibold text-xs flex items-center gap-1.5 border ${stage === st.key ? st.on + ' border-transparent' : st.off + ' hover:brightness-95'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
              {st.label}
              <span className="text-[10px] px-1.5 rounded-full font-mono bg-black/10">{(counts[st.key] || 0).toLocaleString()}</span>
            </button>
          </React.Fragment>
        ))}
      </div>

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

        <select className="field-input w-auto max-w-[130px]" value={rigFilter} onChange={e => setRig(e.target.value)} title="Rig">
          <option value="All">All rigs ({rigs.length})</option>
          {rigs.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select className="field-input w-auto max-w-[190px]" value={clientFilter} onChange={e => setClient(e.target.value)} title="Client">
          <option value="All">All clients ({clients.length})</option>
          {clients.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {(stage !== 'all' || rigFilter !== 'All' || clientFilter !== 'All' || statusFilter !== 'All' || yearFilter !== 'All' || search) && (
          <button className="btn-mini" onClick={() => { setStage('all'); setRig('All'); setClient('All'); setStatus('All'); setYear('All'); setSearch('') }}>
            Clear filters
          </button>
        )}

        <button onClick={refetch} className="btn-mini" title="Refresh">
          <RefreshCw size={12} />
        </button>

        <span className="text-[11px] text-gray-500">
          {`${total.toLocaleString()} job${total === 1 ? '' : 's'}`}
        </span>

        <div className="ml-auto flex items-center border border-slate-200 rounded p-0.5 bg-slate-100 text-[11px]">
          {([['Compact', true], ['Comfortable', false]] as const).map(([l, v]) => (
            <button key={l} onClick={() => setDense(v)}
              className={`px-2 py-0.5 rounded font-medium ${dense === v ? 'bg-white text-[#1a3055] shadow-sm font-bold' : 'text-slate-600'}`}>{l}</button>
          ))}
        </div>

        {hasRole('Admin', 'Operations') && (
          <button onClick={() => navigate('/jobs/new')} className="btn-accent">
            <Plus size={12} /> New Job
          </button>
        )}
      </div>

      {error && <div className="card p-2 text-red-600 text-xs shrink-0">{error}</div>}

      {/* Table — nowrap everywhere; a wrapped Job ID made every row 3 lines tall */}
      <div ref={scrollRef}
           className="flex-1 min-h-0 overflow-auto bg-white border border-gray-300 rounded-t">
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
              <th className="table-th">Billing</th>
              <th className="table-th">Status</th>
              <th className="table-th pin-r !text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={14} className="table-td text-center text-gray-400 py-10">
                  {search || statusFilter !== 'All' ? 'No jobs match your filters' : 'No jobs found'}
                </td>
              </tr>
            ) : (
              visible.map(job => (
                <tr
                  key={job.JobID}
                  className={`table-tr whitespace-nowrap ${dense ? '' : '[&>td]:!py-2.5'}`}
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
                  <td className="table-td">
                    {job.BillingStatus
                      ? <span className={`badge ${billingStatusClass(job.BillingStatus)}`}>{job.BillingStatus}</span>
                      : <span className="table-empty">—</span>}
                  </td>
                  <td className="table-td">
                    <span className={`badge ${statusBadgeClass(job.Status)}`}>
                      {job.Status}
                    </span>
                  </td>
                  <td className="table-td pin-r text-right">
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/jobs/${job.JobID}`) }}
                      className="h-6 px-2.5 rounded bg-blue-50 hover:bg-[#1a3055] hover:text-white text-blue-900 font-medium text-[11px] border border-blue-200 inline-flex items-center gap-1"
                      title="Open the job file: tickets, tools, utilization and invoicing"
                    >🗂️ Job File</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pager page={page} pageCount={pageCount} setPage={setPage}
             from={from} to={to} total={total} noun="job" />
    </div>
  )
}
