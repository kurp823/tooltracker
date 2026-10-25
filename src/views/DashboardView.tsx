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

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ReactNode
  iconBg: string
  to?: string
  sub?: string
}

function StatCard({ label, value, icon, iconBg, to, sub }: StatCardProps) {
  const inner = (
    <div className="card p-4 flex items-start gap-4 hover:shadow-md transition-shadow">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )

  return to ? <Link to={to}>{inner}</Link> : inner
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
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          {greeting()}, {user?.FullName?.split(' ')[0] || user?.Username}
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Active Jobs"
          value={s.activeJobs}
          icon={<TrendingUp size={22} className="text-blue-600" />}
          iconBg="bg-blue-100"
          to="/jobs"
        />
        <StatCard
          label="Open Jobs"
          value={s.openJobs}
          icon={<Briefcase size={22} className="text-orange-600" />}
          iconBg="bg-orange-100"
          to="/jobs"
        />
        <StatCard
          label="In-Field Tools"
          value={s.inFieldTools}
          icon={<Package size={22} className="text-emerald-600" />}
          iconBg="bg-emerald-100"
          to="/inventory"
        />
        <StatCard
          label="Pending Invoices"
          value={s.pendingInvoices}
          icon={<FileText size={22} className="text-purple-600" />}
          iconBg="bg-purple-100"
          to="/invoices"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Jobs"
          value={s.totalJobs}
          icon={<Briefcase size={22} className="text-gray-600" />}
          iconBg="bg-gray-100"
          to="/jobs"
        />
        <StatCard
          label="Total Inventory"
          value={s.totalInventory}
          icon={<Package size={22} className="text-gray-600" />}
          iconBg="bg-gray-100"
          to="/inventory"
        />
        <StatCard
          label="Pending Inspections"
          value={s.pendingInspections}
          icon={<ClipboardCheck size={22} className="text-yellow-600" />}
          iconBg="bg-yellow-100"
          to="/inspection"
        />
        <StatCard
          label="Pending Maintenance"
          value={s.pendingMaintenance}
          icon={<Wrench size={22} className="text-red-600" />}
          iconBg="bg-red-100"
          to="/maintenance"
        />
      </div>

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
