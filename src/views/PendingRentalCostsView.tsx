import { Fragment, useState } from 'react'
import { RefreshCw, AlertTriangle, Check } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { api } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { PageLoader } from '../components/Spinner'
import { ListOptions } from '../components/ListOptions'

/*
 * Pending Rental Costs.
 *
 * Stores receive a sub-contractor's tool and record what arrived; they do
 * not hold the sub-contract and cannot know the day rate. So every tool
 * taken on hire lands here with no cost against it, and this is the queue
 * Billing works from.
 *
 * It matters because a hire with no rate is not neutral in the figures - it
 * is counted in the days and contributes nothing to the money, so the
 * sub-contractor cost on a job reads lower than it is. The length of this
 * list is the size of that understatement.
 *
 * Pricing is gated to Admin, Billing, Finance and Cost Control. Operations
 * can see the queue but not set a figure: the whole point of the split is
 * that the person receiving the tool is not the person who knows what it
 * costs.
 */

interface Pending {
  id: number; receiptRef: string | null; rentalRef: string | null
  supplierName: string; poNumber: string | null
  assetNo: string | null; shortDesc: string | null; size: string | null
  oemSerial: string | null; jobId: string | null
  dateIn: string; expectedOut: string | null; currency: string | null
  daysOnHire: number
}

export function PendingRentalCostsView() {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canPrice = hasRole('Admin', 'Billing', 'Finance', 'CostController')

  const { data, isLoading, error, refetch } = useFetch<Pending[]>('/rental-inward/pending-pricing')

  const [openId, setOpenId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ dayRate: '', currency: 'USD', expectedOut: '', notes: '' })

  function open(p: Pending) {
    setOpenId(p.id)
    setForm({
      dayRate: '',
      currency: p.currency || 'USD',
      expectedOut: p.expectedOut ? String(p.expectedOut).slice(0, 10) : '',
      notes: '',
    })
  }

  async function save(p: Pending) {
    if (form.dayRate === '' || isNaN(Number(form.dayRate))) {
      showToast('Enter the day rate we pay', 'error'); return
    }
    setBusy(true)
    try {
      await api(`/rental-inward/${p.id}/pricing`, {
        method: 'PUT',
        body: JSON.stringify(form),
      })
      showToast(`${p.assetNo || p.oemSerial || 'Tool'} priced`, 'success')
      setOpenId(null)
      refetch()
    } catch (e: any) {
      showToast(e.message || 'Could not save the rate', 'error')
    } finally { setBusy(false) }
  }

  if (isLoading) return <PageLoader />
  if (error) return <div className="card p-6 text-center text-sm text-red-600">{error}</div>

  const rows = data || []

  return (
    <div className="screen gap-1.5">
      <div className="screen-bar">
        <span className="text-[13px] font-semibold text-navy-900">
          {rows.length} tool(s) waiting for a day rate
        </span>
        <span className="text-[11px] text-gray-500">
          Hired-in tools are counted in the days but cost nothing until they are priced
        </span>
        <button className="btn-mini ml-auto" onClick={refetch} title="Refresh">
          <RefreshCw size={12} />
        </button>
      </div>

      {!canPrice && (
        <div className="card p-2 text-xs text-gray-600 border-l-4 border-l-gray-300 shrink-0">
          You can see what is outstanding, but setting a day rate is limited to
          Admin, Billing, Finance and Cost Control.
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto bg-white border border-gray-300 rounded">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="table-th">Receipt</th>
              <th className="table-th">Supplier</th>
              <th className="table-th">Asset</th>
              <th className="table-th">Category</th>
              <th className="table-th">Size</th>
              <th className="table-th">Their serial</th>
              <th className="table-th">Job</th>
              <th className="table-th">In</th>
              <th className="table-th !text-right">Days so far</th>
              <th className="table-th w-40"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => (
              <Fragment key={p.id}>
                <tr className="table-tr !cursor-default whitespace-nowrap">
                  <td className="table-td table-ref text-gray-500">{p.receiptRef || <span className="table-empty">—</span>}</td>
                  <td className="table-td font-medium">{p.supplierName}</td>
                  <td className="table-td table-ref text-brand-600">{p.assetNo || <span className="table-empty">—</span>}</td>
                  <td className="table-td">{p.shortDesc || <span className="table-empty">—</span>}</td>
                  <td className="table-td text-gray-500">{p.size || <span className="table-empty">—</span>}</td>
                  <td className="table-td table-ref text-gray-500">{p.oemSerial || <span className="table-empty">—</span>}</td>
                  <td className="table-td table-ref text-gray-500">{p.jobId || <span className="table-empty">—</span>}</td>
                  <td className="table-td table-ref text-gray-500">{String(p.dateIn).slice(0, 10)}</td>
                  <td className="table-td table-num">
                    <span className={p.daysOnHire > 30 ? 'text-amber-700 font-medium' : ''}>
                      {p.daysOnHire}
                    </span>
                  </td>
                  <td className="table-td">
                    {canPrice && (
                      <button className="btn-mini"
                              onClick={() => (openId === p.id ? setOpenId(null) : open(p))}>
                        {openId === p.id ? 'Close' : 'Add cost'}
                      </button>
                    )}
                  </td>
                </tr>

                {openId === p.id && canPrice && (
                  <tr className="bg-brand-50/40">
                    <td colSpan={10} className="px-3 py-2">
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="w-32">
                          <label className="label">Day rate we pay</label>
                          <input type="number" step="0.01" autoFocus className="field-input text-right"
                                 value={form.dayRate}
                                 onChange={e => setForm(f => ({ ...f, dayRate: e.target.value }))} />
                        </div>
                        <div className="w-24">
                          <label className="label">Currency</label>
                          <select className="field-input" value={form.currency}
                                  onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                            <ListOptions name="Currency" current={form.currency} />
                          </select>
                        </div>
                        <div className="w-36">
                          <label className="label">Expected back</label>
                          <input type="date" className="field-input" value={form.expectedOut}
                                 onChange={e => setForm(f => ({ ...f, expectedOut: e.target.value }))} />
                        </div>
                        <div className="flex-1 min-w-[180px]">
                          <label className="label">Note</label>
                          <input className="field-input" placeholder="contract ref, agreed rate…"
                                 value={form.notes}
                                 onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                        </div>
                        <button className="btn-primary" disabled={busy} onClick={() => save(p)}>
                          <Check size={13} /> Save
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">
                        {p.daysOnHire} day(s) on hire so far — the rate applies from {String(p.dateIn).slice(0, 10)}.
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}

            {rows.length === 0 && (
              <tr><td colSpan={10} className="table-td text-center py-12 text-gray-400">
                <Check size={26} className="mx-auto text-emerald-300 mb-1" />
                Nothing waiting — every hired-in tool has a day rate.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <div className="shrink-0 flex items-center gap-2 px-2 py-1 bg-amber-50 border border-amber-200
                        rounded text-[11px] text-amber-800">
          <AlertTriangle size={12} />
          Until these are priced, sub-contractor cost on those jobs reads lower than it is.
        </div>
      )}
    </div>
  )
}
