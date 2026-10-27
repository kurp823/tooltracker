import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Building2, AlertTriangle, ShieldCheck } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { PageLoader } from '../components/Spinner'
import { formatCurrency, formatDate } from '../utils/format'
import { Stat, Panel } from '../components/Stat'

/*
 * Contracts Dashboard - from /api/contracts and /api/clients.
 *
 * The two dates that matter commercially are the contract end date and the
 * performance bond expiry, because both bite without warning. Anything
 * inside 90 days is listed rather than summarised, since a count alone
 * tells nobody which contract to chase.
 */

interface Contract {
  ContractID: string
  ContractNumber: string | null
  ClientName: string | null
  PONumber: string | null
  Currency: string | null
  StartDate: string | null
  EndDate: string | null
  Status: string | null
  ContractValue: number | null
  InvoicedToDate: number | null
  PBGNumber: string | null
  PBGValue: number | null
  PBGExpiryDate: string | null
  IsActive: boolean | number | null
}

interface Client { ClientID: number; ClientName: string; IsActive: boolean | number }

const DAY = 86400000

export function ContractsDashboardView() {
  const { data: contracts, isLoading, error } = useFetch<Contract[]>('/contracts')
  const { data: clients } = useFetch<Client[]>('/clients')

  const m = useMemo(() => {
    const rows = contracts || []
    const now = Date.now()
    const daysTo = (d: string | null) => d ? Math.round((new Date(d).getTime() - now) / DAY) : null

    const withDays = rows.map(c => ({
      ...c,
      endIn: daysTo(c.EndDate),
      pbgIn: daysTo(c.PBGExpiryDate),
    }))

    const expiringSoon = withDays
      .filter(c => c.endIn !== null && c.endIn >= 0 && c.endIn <= 90)
      .sort((a, b) => (a.endIn! - b.endIn!))
    const expired = withDays.filter(c => c.endIn !== null && c.endIn < 0)
    const pbgSoon = withDays
      .filter(c => c.pbgIn !== null && c.pbgIn >= 0 && c.pbgIn <= 90)
      .sort((a, b) => (a.pbgIn! - b.pbgIn!))
    const pbgExpired = withDays.filter(c => c.pbgIn !== null && c.pbgIn < 0)

    const byCurrency: Record<string, { value: number; invoiced: number; n: number }> = {}
    rows.forEach(c => {
      const k = String(c.Currency ?? '').trim() || '(none)'
      byCurrency[k] = byCurrency[k] || { value: 0, invoiced: 0, n: 0 }
      byCurrency[k].value    += c.ContractValue  ?? 0
      byCurrency[k].invoiced += c.InvoicedToDate ?? 0
      byCurrency[k].n++
    })

    return {
      total:    rows.length,
      active:   rows.filter(c => !!c.IsActive).length,
      noEnd:    rows.filter(c => !c.EndDate).length,
      noValue:  rows.filter(c => c.ContractValue == null).length,
      noNumber: rows.filter(c => !String(c.ContractNumber ?? '').trim()).length,
      expiringSoon, expired, pbgSoon, pbgExpired,
      byCurrency: Object.entries(byCurrency).sort((a, b) => b[1].value - a[1].value),
      rows: withDays,
    }
  }, [contracts])

  if (isLoading) return <PageLoader />
  if (error) return <div className="card p-6 text-center text-sm text-red-600">{error}</div>

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Contracts Dashboard</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {m.total} contracts · {clients?.length ?? 0} clients
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Contracts" value={m.total} to="/contracts"
              icon={<BookOpen size={22} className="text-gray-600" />} iconBg="bg-gray-100" />
        <Stat label="Active" value={m.active} tone="good"
              icon={<ShieldCheck size={22} className="text-emerald-600" />} iconBg="bg-emerald-100" />
        <Stat label="Ending within 90 days" value={m.expiringSoon.length}
              tone={m.expiringSoon.length ? 'warn' : 'default'}
              icon={<AlertTriangle size={22} className="text-amber-600" />} iconBg="bg-amber-100" />
        <Stat label="Clients" value={clients?.length ?? '—'} to="/clients"
              icon={<Building2 size={22} className="text-blue-600" />} iconBg="bg-blue-100" />
      </div>

      {(m.noEnd > 0 || m.noValue > 0 || m.noNumber > 0) && (
        <div className="card p-4 border-l-4 border-l-amber-400">
          <p className="text-sm font-medium text-gray-900">Contracts with missing detail</p>
          <p className="text-sm text-gray-600 mt-1">
            {m.noNumber > 0 && <><strong>{m.noNumber}</strong> have no contract number</>}
            {m.noNumber > 0 && (m.noEnd > 0 || m.noValue > 0) && ' · '}
            {m.noEnd > 0 && <><strong>{m.noEnd}</strong> have no end date</>}
            {m.noEnd > 0 && m.noValue > 0 && ' · '}
            {m.noValue > 0 && <><strong>{m.noValue}</strong> have no value</>}
            .{' '}
            <Link to="/contracts" className="text-blue-600 hover:underline">Master Contract Register</Link>
          </p>
        </div>
      )}

      {(m.expiringSoon.length > 0 || m.expired.length > 0) && (
        <Panel title="Contract expiry"
               subtitle={`${m.expiringSoon.length} ending within 90 days${m.expired.length ? `, ${m.expired.length} already past` : ''}`}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left  px-4 py-2 font-medium text-gray-600">Contract</th>
                <th className="text-left  px-4 py-2 font-medium text-gray-600">Client</th>
                <th className="text-left  px-4 py-2 font-medium text-gray-600">Ends</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Days</th>
              </tr>
            </thead>
            <tbody>
              {[...m.expired, ...m.expiringSoon].map(c => (
                <tr key={c.ContractID} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-800">{c.ContractNumber || c.ContractID}</td>
                  <td className="px-4 py-2 text-gray-600 truncate max-w-xs">{c.ClientName || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{formatDate(c.EndDate)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${
                        c.endIn! < 0 ? 'text-red-700' : c.endIn! <= 30 ? 'text-amber-700' : 'text-gray-900'}`}>
                    {c.endIn! < 0 ? `${Math.abs(c.endIn!)} overdue` : c.endIn}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {(m.pbgSoon.length > 0 || m.pbgExpired.length > 0) && (
        <Panel title="Performance bond expiry"
               subtitle={`${m.pbgSoon.length} within 90 days${m.pbgExpired.length ? `, ${m.pbgExpired.length} already past` : ''}`}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left  px-4 py-2 font-medium text-gray-600">Contract</th>
                <th className="text-left  px-4 py-2 font-medium text-gray-600">PBG number</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">PBG value</th>
                <th className="text-left  px-4 py-2 font-medium text-gray-600">Expires</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Days</th>
              </tr>
            </thead>
            <tbody>
              {[...m.pbgExpired, ...m.pbgSoon].map(c => (
                <tr key={`pbg-${c.ContractID}`} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-800">{c.ContractNumber || c.ContractID}</td>
                  <td className="px-4 py-2 text-gray-600">{c.PBGNumber || '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900">
                    {c.PBGValue != null ? formatCurrency(c.PBGValue) : '—'}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{formatDate(c.PBGExpiryDate)}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${
                        c.pbgIn! < 0 ? 'text-red-700' : 'text-amber-700'}`}>
                    {c.pbgIn! < 0 ? `${Math.abs(c.pbgIn!)} overdue` : c.pbgIn}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <Panel title="Contract value by currency"
             subtitle="Values kept separate per currency, never added together">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left  px-4 py-2 font-medium text-gray-600">Currency</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Contracts</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Contract value</th>
              <th className="text-right px-4 py-2 font-medium text-gray-600">Invoiced to date</th>
            </tr>
          </thead>
          <tbody>
            {m.byCurrency.map(([k, v]) => (
              <tr key={k} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium text-gray-800">{k}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-600">{v.n}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">{formatCurrency(v.value)}</td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-600">{formatCurrency(v.invoiced)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
