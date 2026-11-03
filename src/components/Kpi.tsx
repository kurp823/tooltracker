import type { ReactNode } from 'react'

/** KPI tile used across the Billing screens: label, one number, one line of context. */
export function Tile({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: 'warn' | 'bad' | 'good'
}) {
  const c = tone === 'warn' ? 'text-amber-700' : tone === 'bad' ? 'text-red-700'
          : tone === 'good' ? 'text-emerald-700' : 'text-slate-900'
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-2.5">
      <div className="text-[12px] text-slate-500">{label}</div>
      <div className={`text-[22px] leading-7 font-semibold tabular-nums ${c}`}>{value}</div>
      {sub && <div className="text-[12px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

/** A note that sits above the numbers it qualifies. */
export function Notice({ tone = 'amber', title, children }: {
  tone?: 'amber' | 'blue'; title: string; children: ReactNode
}) {
  const edge = tone === 'blue' ? 'border-l-blue-400' : 'border-l-amber-400'
  return (
    <div className={`bg-white border border-slate-200 border-l-4 ${edge} rounded-lg px-4 py-2`}>
      <p className="text-[13px] font-medium text-slate-900">{title}</p>
      <p className="text-[12px] text-slate-600 mt-0.5">{children}</p>
    </div>
  )
}
