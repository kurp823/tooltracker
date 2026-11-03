import React from 'react'
import { Link } from 'react-router-dom'
import {
  Briefcase, Package, FileText, ClipboardCheck,
  Wrench, ArrowRight, TrendingUp, Clock, CheckCircle
} from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { formatDate, statusBadgeClass, formatCurrency } from '../utils/format'
import { PageLoader } from '../components/Spinner'
import type { DashboardStats } from '../types'

/** KPI card as the old dashboard drew it: white, a 3px coloured top edge,
 *  small caps label, big mono figure and one line of context. */
function Kpi({ label, value, sub, edge, text, to, flag }: {
  label: string; value: number | string; sub?: string; edge: string; text: string; to?: string; flag?: string
}) {
  const inner = (
    <div className={`bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-sm hover:shadow-md transition-all border-t-[3px] ${edge} flex flex-col justify-between h-full`}>
      <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider flex items-center justify-between gap-2">
        <span>{label}</span>
        {flag && <span className="px-1.5 rounded text-[9px] bg-amber-100 text-amber-900 font-extrabold">{flag}</span>}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className={`text-2xl font-black font-mono ${text}`}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
        {sub && <span className="text-[11px] font-semibold text-slate-500 text-right">{sub}</span>}
      </div>
    </div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

const BAR_COLORS = ['#78350f', '#c2611a', '#d97706', '#b45309', '#4d7c0f', '#0f766e', '#0284c7', '#4338ca',
                    '#6d28d9', '#831843', '#9f1239', '#881337', '#047857', '#b91c1c', '#155e75']

/** Mahogany-banner section: ranking table on the left, bars on the right. */
function Benchmark({ title, col, rows }: { title: string; col: string; rows: { name: string; jobs: number }[] }) {
  const total = rows.reduce((a, r) => a + r.jobs, 0)
  const max = Math.max(1, ...rows.map(r => r.jobs))
  return (
    <div className="bg-white border border-slate-300 rounded-lg shadow-sm overflow-hidden">
      <div className="bg-[#78350f] text-white px-4 py-2 font-black text-sm tracking-wider uppercase border-b border-[#5c270a] flex items-center justify-between">
        <span>{title}</span>
        <span className="text-[11px] font-mono font-medium text-amber-200/90 tracking-normal normal-case">
          Total: {total.toLocaleString()} jobs
        </span>
      </div>
      <div className="flex flex-col xl:flex-row">
        <div className="w-full xl:w-[38%] border-b xl:border-b-0 xl:border-r border-slate-200 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-300">
                <th className="py-2 px-3 border-r border-slate-200">{col}</th>
                <th className="py-2 px-3 text-right w-24">Jobs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((r, i) => (
                <tr key={r.name} className={`hover:bg-amber-50/50 ${i % 2 ? 'bg-slate-50/50' : 'bg-white'}`}>
                  <td className="py-1.5 px-3 font-semibold text-slate-800 border-r border-slate-200 whitespace-nowrap">{r.name}</td>
                  <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900">{r.jobs.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="w-full xl:w-[62%] p-4 flex flex-col justify-center gap-[7px]">
          {rows.map((r, i) => (
            <div key={r.name} className="flex items-center gap-3 text-[11px]">
              <span className="w-40 shrink-0 text-right font-semibold text-slate-700 truncate" title={r.name}>{r.name}</span>
              <div className="flex-1 h-3 bg-slate-100 rounded-sm overflow-hidden">
                <div className="h-full rounded-sm" style={{ width: `${Math.max(1.5, (r.jobs / max) * 100)}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />
              </div>
              <span className="w-12 font-mono font-bold text-slate-700">{r.jobs.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function DashboardView() {
  const { user } = useAuth()
  const { data: stats, isLoading, error } = useFetch<DashboardStats>('/dashboard/stats')

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  if (isLoading) return <PageLoader />

  if (error) return (
    <div className="card p-6 text-center">
      <p className="text-red-600 text-sm">{error}</p>
    </div>
  )

  const s = stats!

  return (
    <div className="h-full overflow-y-auto pr-1 space-y-3">
      {/* Greeting */}
      <div className="flex items-baseline gap-3">
        <h2 className="text-[15px] font-bold text-navy-head">
          {greeting()}, {user?.FullName?.split(' ')[0] || user?.Username}
        </h2>
        <span className="text-[12px] text-slate-500">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* Primary KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi label="Active Rigs Deployed" value={s.activeRigs ?? 0} sub="on open jobs" edge="border-t-emerald-600" text="text-emerald-700" to="/jobs" />
        <Kpi label="Downhole Tools in Field" value={s.inFieldTools} sub={`${s.totalInventory.toLocaleString()} total fleet`} edge="border-t-blue-600" text="text-blue-700" to="/job-tools-list" />
        <Kpi label="Active Jobs" value={s.activeJobs} sub={`${s.totalActiveJobs} not yet closed`} edge="border-t-sky-600" text="text-sky-700" to="/jobs" />
        <Kpi label="Open Jobs" value={s.openJobs} sub="not yet started" edge="border-t-amber-500" text="text-amber-700" to="/jobs" flag={s.openJobs > 0 ? 'ACTION' : undefined} />
        <Kpi label="Pending Invoices" value={s.pendingInvoices} sub="draft / submitted" edge="border-t-[#1a3055]" text="text-[#1a3055]" to="/invoices" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Total Jobs" value={s.totalJobs} edge="border-t-slate-400" text="text-slate-700" to="/jobs" />
        <Kpi label="Total Inventory" value={s.totalInventory} edge="border-t-slate-400" text="text-slate-700" to="/inventory" />
        <Kpi label="Pending Inspections" value={s.pendingInspections} edge="border-t-yellow-500" text="text-yellow-700" to="/inspection" />
        <Kpi label="Pending Maintenance" value={s.pendingMaintenance} edge="border-t-rose-500" text="text-rose-700" to="/maintenance" />
      </div>

      {(s.jobsByClient?.length ?? 0) > 0 && <Benchmark title="Jobs by Client / Operator (Top 12)" col="Client / Operator" rows={s.jobsByClient!} />}
      {(s.jobsByService?.length ?? 0) > 0 && <Benchmark title="Jobs by Service Category (Top 15)" col="Service Category" rows={s.jobsByService!} />}

      {/* Recent Jobs */}
      <div className="card">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Recent Jobs</h3>
          <Link to="/jobs" className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1">
            View all <ArrowRight size={13} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Job ID</th>
                <th className="table-th">Client</th>
                <th className="table-th">Rig / Well</th>
                <th className="table-th">Mob Date</th>
                <th className="table-th">Status</th>
              </tr>
            </thead>
            <tbody>
              {(s.recentJobs || []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-td text-center text-gray-400 py-8">
                    No recent jobs
                  </td>
                </tr>
              ) : (
                s.recentJobs.map(job => (
                  <tr key={job.JobID} className="table-tr">
                    <td className="table-td">
                      <Link to={`/jobs/${job.JobID}`} className="font-medium text-brand-600 hover:underline">
                        {job.JobID}
                      </Link>
                    </td>
                    <td className="table-td">{job.Client || '—'}</td>
                    <td className="table-td">
                      <span className="text-gray-900">{job.Rig}</span>
                      {job.Well && <span className="text-gray-400"> / {job.Well}</span>}
                    </td>
                    <td className="table-td text-gray-500">{formatDate(job.MobDate)}</td>
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
