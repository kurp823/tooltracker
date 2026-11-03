import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useFetch } from '../hooks/useFetch'
import { PageLoader } from '../components/Spinner'
import { formatCurrency, billingStatusClass } from '../utils/format'

/*
 * Billing Dashboard. Everything is counted from /api/invoices - the same rows
 * the Invoicing screen lists - so a number here can always be traced to a row
 * there. Amounts are kept to one currency at a time: adding USD to AED gives a
 * number that means nothing, so the currency is chosen at the top.
 *
 * Charts are plain SVG/HTML in one ink colour (navy). Each chart shows a
 * single measure, so there is nothing for colour to tell apart; colour is kept
 * for the status words, where it means something.
 */

interface Invoice {
  InvoiceID: string
  InvoiceNumber: string | null
  JobID: string | null
  InvoiceDate: string | null
  Currency: string | null
  TotalAmount: number | null
  Status: string | null
  Client: string | null
  Source: 'monthly' | 'job'
}
interface ListRow { value: string; sortOrder: number }

const INK = '#1a3055'
const GRID = '#e2e8f0'
const MUTED = '#64748b'

const s = (v: unknown) => String(v ?? '').trim()
const isFinal = (st: string) => /final/i.test(st)
/** Legacy rows carry 1900-01-01 as "no date"; those never belong on a timeline. */
const validDate = (d: string | null) => !!d && Number(d.slice(0, 4)) >= 2000
const compact = (n: number) =>
  Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n))

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-4 py-3">
      <div className="text-[12px] text-slate-500">{label}</div>
      <div className={`text-[24px] leading-8 font-semibold tabular-nums ${tone === 'warn' ? 'text-amber-700' : 'text-slate-900'}`}>{value}</div>
      {sub && <div className="text-[12px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function Card({ title, note, children, className = '' }:
  { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-white border border-slate-200 rounded-lg ${className}`}>
      <header className="px-4 pt-3 pb-2 flex items-baseline gap-2">
        <h3 className="text-[13px] font-semibold text-slate-900">{title}</h3>
        {note && <span className="text-[12px] text-slate-500">{note}</span>}
      </header>
      {children}
    </section>
  )
}

/** Horizontal bars: label left, bar, value right. One ink colour, labelled directly. */
function HBars({ rows, format }: { rows: { label: string; value: number; extra?: string; cls?: string }[]; format: (n: number) => string }) {
  const max = Math.max(...rows.map(r => r.value), 1)
  if (!rows.length) return <p className="px-4 pb-4 text-[12px] text-slate-400">Nothing to show yet.</p>
  return (
    <ul className="px-4 pb-3 space-y-1.5">
      {rows.map(r => (
        <li key={r.label} className="grid grid-cols-[190px_1fr_auto] items-center gap-3 text-[12px]"
            title={`${r.label}: ${format(r.value)}${r.extra ? ' · ' + r.extra : ''}`}>
          <span className={`truncate ${r.cls || 'text-slate-700'}`}>{r.label}</span>
          <span className="h-3.5 bg-slate-100 rounded-sm overflow-hidden">
            <span className="block h-full rounded-sm" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: INK }} />
          </span>
          <span className="tabular-nums text-slate-900 font-medium text-right min-w-[88px]">
            {format(r.value)}{r.extra && <span className="text-slate-400 font-normal"> · {r.extra}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Line chart of one measure by month, with a crosshair and readout on hover. */
function Trend({ points, ccy }: { points: { m: string; v: number }[]; ccy: string }) {
  const [hi, setHi] = useState<number | null>(null)
  const W = 640, H = 190, L = 44, R = 12, T = 10, B = 24
  if (points.length < 2) return <p className="px-4 pb-4 text-[12px] text-slate-400">Needs at least two months of dated invoices.</p>
  const max = Math.max(...points.map(p => p.v), 1)
  const x = (i: number) => L + (i * (W - L - R)) / (points.length - 1)
  const y = (v: number) => T + (1 - v / max) * (H - T - B)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
  const ticks = [0, 0.5, 1].map(f => f * max)
  const p = hi != null ? points[hi] : null
  return (
    <div className="px-4 pb-3 relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
           aria-label={`Invoiced per month in ${ccy}`}
           onMouseLeave={() => setHi(null)}
           onMouseMove={e => {
             const r = e.currentTarget.getBoundingClientRect()
             const px = ((e.clientX - r.left) / r.width) * W
             setHi(Math.max(0, Math.min(points.length - 1, Math.round(((px - L) / (W - L - R)) * (points.length - 1)))))
           }}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill={MUTED}>{compact(t)}</text>
          </g>
        ))}
        {points.map((pt, i) => (i % Math.ceil(points.length / 6) === 0) && (
          <text key={pt.m} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill={MUTED}>{pt.m.slice(2).replace('-', '/')}</text>
        ))}
        <path d={path} fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        {hi != null && (
          <g>
            <line x1={x(hi)} x2={x(hi)} y1={T} y2={H - B} stroke={MUTED} strokeDasharray="3 3" />
            <circle cx={x(hi)} cy={y(points[hi].v)} r="4" fill={INK} stroke="#fff" strokeWidth="2" />
          </g>
        )}
      </svg>
      <div className="absolute top-1 right-5 text-[12px] text-slate-600 tabular-nums min-h-[18px]">
        {p ? <><strong className="text-slate-900">{formatCurrency(p.v)}</strong> {ccy} · {p.m}</> : null}
      </div>
    </div>
  )
}

export function BillingDashboardView() {
  const { data, isLoading, error } = useFetch<Invoice[]>('/invoices')
  const { data: stages } = useFetch<ListRow[]>('/lists/BillingStatus')
  const [ccyPick, setCcy] = useState<string | null>(null)

  const rows = data || []

  const currencies = useMemo(() => {
    const m = new Map<string, number>()
    rows.forEach(r => m.set(s(r.Currency) || 'USD', (m.get(s(r.Currency) || 'USD') || 0) + (r.TotalAmount || 0)))
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(e => e[0])
  }, [rows])
  const ccy = ccyPick && currencies.includes(ccyPick) ? ccyPick : currencies[0] || 'USD'

  const m = useMemo(() => {
    const mine = rows.filter(r => (s(r.Currency) || 'USD') === ccy)
    const order = new Map((stages || []).map(x => [x.value, x.sortOrder]))
    const byStatus = new Map<string, { n: number; v: number }>()
    const byClient = new Map<string, { n: number; v: number }>()
    const byMonth = new Map<string, number>()
    let finalN = 0, finalV = 0, openN = 0, openV = 0
    const today = Date.now()
    const waiting: { r: Invoice; days: number }[] = []

    mine.forEach(r => {
      const st = s(r.Status) || 'No status'
      const v = r.TotalAmount || 0
      const a = byStatus.get(st) || { n: 0, v: 0 }; a.n++; a.v += v; byStatus.set(st, a)
      const c = s(r.Client) || 'No client'
      const b = byClient.get(c) || { n: 0, v: 0 }; b.n++; b.v += v; byClient.set(c, b)
      if (validDate(r.InvoiceDate)) {
        const k = String(r.InvoiceDate).slice(0, 7)
        byMonth.set(k, (byMonth.get(k) || 0) + v)
      }
      if (isFinal(st)) { finalN++; finalV += v }
      else if (!/cancel/i.test(st)) {
        openN++; openV += v
        if (validDate(r.InvoiceDate))
          waiting.push({ r, days: Math.floor((today - new Date(String(r.InvoiceDate)).getTime()) / 864e5) })
      }
    })

    // Last 12 months, with empty months kept so the line does not skip time.
    const months = Array.from(byMonth.keys()).sort()
    const series: { m: string; v: number }[] = []
    if (months.length) {
      const end = new Date(months[months.length - 1] + '-01')
      for (let i = 11; i >= 0; i--) {
        const d = new Date(end.getFullYear(), end.getMonth() - i, 1)
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        series.push({ m: k, v: byMonth.get(k) || 0 })
      }
    }

    return {
      count: mine.length,
      total: mine.reduce((a, r) => a + (r.TotalAmount || 0), 0),
      finalN, finalV, openN, openV,
      stages: Array.from(byStatus.entries())
        .sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99) || b[1].v - a[1].v),
      clients: Array.from(byClient.entries()).sort((a, b) => b[1].v - a[1].v).slice(0, 8),
      series,
      waiting: waiting.sort((a, b) => b.days - a.days),
      stale: waiting.filter(w => w.days > 30).length,
    }
  }, [rows, stages, ccy])

  if (isLoading) return <PageLoader />
  if (error) return <div className="card p-6 text-center text-sm text-red-600">{error}</div>

  return (
    <div className="h-full overflow-auto">
      <div className="space-y-3 pb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-bold text-slate-900">Billing overview</h2>
          <span className="text-[12px] text-slate-500">{rows.length.toLocaleString()} invoices on record</span>
          <div className="ml-auto flex items-center gap-1" role="tablist" aria-label="Currency">
            {currencies.map(c => (
              <button key={c} role="tab" aria-selected={c === ccy} onClick={() => setCcy(c)}
                      className={c === ccy ? 'btn-primary !h-[26px]' : 'btn-secondary !h-[26px]'}>{c}</button>
            ))}
          </div>
          <Link to="/invoices" className="btn-accent">Open Invoicing</Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label={`Invoiced (${ccy})`} value={formatCurrency(m.total)} sub={`${m.count.toLocaleString()} invoices`} />
          <Tile label="Final invoiced" value={formatCurrency(m.finalV)} sub={`${m.finalN.toLocaleString()} invoices`} />
          <Tile label="Not yet final" value={formatCurrency(m.openV)} sub={`${m.openN.toLocaleString()} invoices in progress`} />
          <Tile label="Waiting over 30 days" value={m.stale.toLocaleString()} tone={m.stale ? 'warn' : undefined}
                sub="not final, invoice dated more than 30 days ago" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <Card title="Where invoices stand" note={`value by billing status, ${ccy}`}>
            <HBars format={formatCurrency}
                   rows={m.stages.map(([k, v]) => ({ label: k, value: v.v, extra: `${v.n.toLocaleString()}`, cls: billingStatusClass(k) }))} />
          </Card>
          <Card title="Invoiced per month" note={`last 12 months, ${ccy}`}>
            <Trend points={m.series} ccy={ccy} />
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <Card title="Top clients" note={`by invoiced value, ${ccy}`}>
            <HBars format={formatCurrency}
                   rows={m.clients.map(([k, v]) => ({ label: k, value: v.v, extra: `${v.n}` }))} />
          </Card>
          <Card title="Oldest invoices not yet final" note="the billing team's queue">
            <div className="max-h-[300px] overflow-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0"><tr>
                  <th className="table-th">Invoice</th><th className="table-th">Client</th>
                  <th className="table-th">Status</th><th className="table-th !text-right">Days</th>
                  <th className="table-th !text-right">Amount</th>
                </tr></thead>
                <tbody>
                  {m.waiting.slice(0, 12).map(({ r, days }) => (
                    <tr key={`${r.Source}-${r.InvoiceID}`} className="table-tr whitespace-nowrap">
                      <td className="table-td"><Link className="text-brand-600 font-medium" to="/invoices">{r.InvoiceNumber || r.JobID || '—'}</Link></td>
                      <td className="table-td max-w-[180px] truncate" title={r.Client || ''}>{r.Client || '—'}</td>
                      <td className="table-td"><span className={`badge ${billingStatusClass(r.Status)}`}>{r.Status || '—'}</span></td>
                      <td className="table-td !text-right tabular-nums">{days}</td>
                      <td className="table-td !text-right tabular-nums">{formatCurrency(r.TotalAmount || 0)}</td>
                    </tr>
                  ))}
                  {m.waiting.length === 0 && (
                    <tr><td colSpan={5} className="table-td text-center text-slate-400 py-6">Everything dated is final invoiced.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
