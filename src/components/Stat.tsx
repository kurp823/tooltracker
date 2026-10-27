import React from 'react'
import { Link } from 'react-router-dom'

/*
 * The KPI tile every dashboard uses, so the six of them look like one app
 * rather than six. Lifted from the pattern already in DashboardView.
 */

interface StatProps {
  label: string
  value: number | string
  icon?: React.ReactNode
  iconBg?: string
  sub?: string
  to?: string
  tone?: 'default' | 'good' | 'warn' | 'bad'
}

const TONE: Record<string, string> = {
  default: 'text-gray-900',
  good:    'text-emerald-700',
  warn:    'text-amber-700',
  bad:     'text-red-700',
}

export function Stat({ label, value, icon, iconBg = 'bg-gray-100', sub, to, tone = 'default' }: StatProps) {
  const inner = (
    <div className="card p-4 flex items-start gap-4 hover:shadow-md transition-shadow h-full">
      {icon && (
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <p className={`text-2xl font-bold ${TONE[tone]}`}>{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
  return to ? <Link to={to}>{inner}</Link> : inner
}

/* A plain section wrapper: heading, optional action, then whatever is inside. */
export function Panel({
  title, subtitle, action, children,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

/*
 * A share-of-total bar. Deliberately a plain div rather than a chart library:
 * it needs no dependency and reads the same in every browser.
 */
export function Bar({ label, value, total, tone = 'bg-blue-600' }: {
  label: string; value: number; total: number; tone?: string
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="px-4 py-2">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-700 truncate pr-2">{label}</span>
        <span className="font-medium text-gray-900 tabular-nums shrink-0">
          {value.toLocaleString()} <span className="text-gray-400">· {pct}%</span>
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${tone} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
