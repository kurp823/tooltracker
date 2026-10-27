import { useMemo } from 'react'
import { FileText, Coins, Clock, CheckCircle } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { PageLoader } from '../components/Spinner'
import { formatCurrency } from '../utils/format'
import { Stat, Panel, Bar } from '../components/Stat'

/*
 * Billing Dashboard - counted from /api/invoices, the same rows the
 * Invoicing screen lists. Amounts are summed per currency and never mixed:
 * adding USD to AED would produce a number that means nothing.
 */

interface Invoice {
  InvoiceID: string
  InvoiceNumber: string | null
  JobID: string | null
  InvoiceDate: string | null
  Currency: string | null
  TotalAmount: number | null
  NetAmount: number | null
  Status: string | null
  Client: string | null
  Rig: string | null
  Contract: string | null
}

export function BillingDashboardView() {
  const { data, isLoading, error } = useFetch<Invoice[]>('/invoices')

  const m = useMemo(() => {
    const rows = data || []
    const s = (v: unknown) => String(v ?? '').trim()

    const byStatus: Record<string, number> = {}
    const byCurrency: Record<string, { count: number; total: number }> = {}
    const byClient: Record<string, { count: number; total: number; ccy: string }> = {}
    const byMonth: Record<string, number> = {}
    let noAmount = 0, noNumber = 0, noDate = 0

    rows.forEach(r => {
      const st = s(r.Status) || '(no status)'
      byStatus[st] = (byStatus[st] || 0) + 1

      const ccy = s(r.Currency) || '(none)'
      const amt = typeof r.TotalAmount === 'number' ? r.TotalAmount : 0
      byCurrency[ccy] = byCurrency[ccy] || { count: 0, total: 0 }
      byCurrency[ccy].count++
      byCurrency[ccy].total += amt

      const cl = s(r.Client) || '(no client)'
      byClient[cl] = byClient[cl] || { count: 0, total: 0, ccy }
      byClient[cl].count++
      byClient[cl].total += amt

      if (r.InvoiceDate) {
        const mo = String(r.InvoiceDate).slice(0, 7)
        byMonth[mo] = (byMonth[mo] || 0) + 1
      } else noDate++

      if (r.TotalAmount == null) noAmount++
      if (!s(r.InvoiceNumber)) noNumber++
    })

    return {
      total: rows.length,
      byStatus:   Object.entries(byStatus).sort((a, b) => b[1] - a[1]),
      byCurrency: Object.entries(byCurrency).sort((a, b) => b[1].total - a[1].total),
      byClient:   Object.entries(byClient).sort((a, b) => b[1].total - a[1].total),
      byMonth:    Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).slice(-12),
      noAmount, noNumber, noDate,
      finalised: rows.filter(r => /final/i.test(s(r.Status))).length,
      draft:     rows.filter(r => /draft/i.test(s(r.Status))).length,
    }
  }, [data])

  if (isLoading) return <PageLoader />
  if (error) return <div className="card p-6 text-center text-sm text-red-600">{error}</div>

  const main = m.byCurrency[0]

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Billing Dashboard</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {m.total.toLocaleString()} invoices · counted live from the invoice table
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Invoices" value={m.total.toLocaleString()} to="/invoices"
              icon={<FileText size={22} className="text-gray-600" />} iconBg="bg-gray-100" />
        <Stat label="Finalised" value={m.finalised.toLocaleString()} tone="good"
              icon={<CheckCircle size={22} className="text-emerald-600" />} iconBg="bg-emerald-100" />
        <Stat label="Draft" value={m.draft.toLocaleString()} tone="warn"
              icon={<Clock size={22} className="text-amber-600" />} iconBg="bg-amber-100" />
        <Stat
          label={main ? `Invoiced (${main[0]})` : 'Invoiced'}
          value={main ? formatCurrency(main[1].total) : '—'}
          sub={main ? `${main[1].count.toLocaleString()} invoices` : undefined}
          icon={<Coins size={22} className="text-blue-600" />} iconBg="bg-blue-100" />
      </div>

      {(m.noAmount > 0 || m.noNumber > 0 || m.noDate > 0) && (
        <div className="card p-4 border-l-4 border-l-amber-400">
          <p className="text-sm font-medium text-gray-900">Invoices with gaps</p>
          <p className="text-sm text-gray-600 mt-1">
            {m.noAmount > 0 && <><strong>{m.noAmount.toLocaleString()}</strong> have no amount</>}
            {m.noAmount > 0 && (m.noNumber > 0 || m.noDate > 0) && ' · '}
            {m.noNumber > 0 && <><strong>{m.noNumber.toLocaleString()}</strong> have no invoice number</>}
            {m.noNumber > 0 && m.noDate > 0 && ' · '}
            {m.noDate > 0 && <><strong>{m.noDate.toLocaleString()}</strong> have no date</>}.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="By status" subtitle="Where each invoice stands">
          <div className="py-1">
            {m.byStatus.map(([k, v]) => (
              <Bar key={k} label={k} value={v} total={m.total}
                   tone={/final/i.test(k) ? 'bg-emerald-500'
                       : /draft/i.test(k) ? 'bg-amber-500' : 'bg-gray-400'} />
            ))}
          </div>
        </Panel>

        <Panel title="By currency" subtitle="Totals kept separate, never added together">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Currency</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Invoices</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {m.byCurrency.map(([k, v]) => (
                <tr key={k} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-800">{k}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-600">{v.count.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">{formatCurrency(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Top clients by value">
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Client</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Invoices</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Value</th>
                </tr>
              </thead>
              <tbody>
                {m.byClient.slice(0, 15).map(([k, v]) => (
                  <tr key={k} className="border-t border-gray-100">
                    <td className="px-4 py-2 text-gray-800 truncate max-w-xs">{k}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">{v.count}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">
                      {formatCurrency(v.total)} <span className="text-gray-400 text-xs">{v.ccy}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Invoices raised by month" subtitle="Last 12 months on record">
          <div className="py-1">
            {m.byMonth.map(([k, v]) => (
              <Bar key={k} label={k} value={v}
                   total={Math.max(...m.byMonth.map(x => x[1]), 1)} tone="bg-blue-600" />
            ))}
            {m.byMonth.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No dated invoices</p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}
