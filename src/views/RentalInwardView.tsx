import { useMemo, useState } from 'react'
import { Plus, Search, RefreshCw, Undo2, Trash2, PackagePlus, AlertTriangle, ArrowLeft } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { api } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { PageLoader } from '../components/Spinner'
import { Stat } from '../components/Stat'
import { ListOptions } from '../components/ListOptions'
import { ComboBox } from '../components/ComboBox'
import { usePagedRows, Pager } from '../components/usePagedRows'

/*
 * Third-party rental inward.
 *
 * A sub-contractor delivers against one delivery note and the tools are
 * listed beneath it, which is how the operator's own Access receipt form
 * works. So this is a header typed once and a grid of tool lines, not one
 * form per tool: ten tools used to mean ten repetitions of supplier, date
 * and reference.
 *
 * Stores enter no pricing at all. The storeman receiving a tool does not
 * hold the sub-contract and does not know the day rate, so asking for it
 * here either stops the receipt or invites a guess. The rate is added
 * afterwards from Pending Rental Costs by Billing or Finance, and the
 * "No day rate set" tile is the count of what is waiting.
 *
 * Category and size are the pair tbl_ContractRates is keyed on, so a line
 * whose category and size match no contract rate is flagged as it is typed:
 * that tool can go to a rig and come back unbillable, and the moment to
 * notice is now, not at invoicing.
 */

type Tab = 'hires' | 'report'

interface Hire {
  id: number; rentalRef: string | null; receiptRef: string | null
  supplierName: string; poNumber: string | null; assetNo: string | null
  shortDesc: string | null; description: string | null
  size: string | null; oemSerial: string | null; jobId: string | null
  qty: number | null; requiresInspection: boolean | null; destination: string | null
  dateIn: string; expectedOut: string | null; dateOut: string | null
  dayRate: number | null; currency: string | null; status: string
  systemId: string | null; notes: string | null
  daysOnHire: number; costToDate: number
}
interface Summary {
  bySupplier: { supplierName: string; tools: number; onHire: number; days: number; cost: number }[]
  byJob: { jobId: string; tools: number; days: number; cost: number }[]
  totals: { tools: number; onHire: number; lostInHole: number; noRate: number; cost: number }
}
interface RateOption { category: string; size: string | null; contractCode: string; contracts: number }

interface Line {
  key: number
  category: string
  size: string
  assetNo: string
  oemSerial: string
  description: string
  qty: string
  requiresInspection: boolean
  destination: string
}

const money = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

let lineSeq = 1
const blankLine = (): Line => ({
  key: lineSeq++, category: '', size: '', assetNo: '', oemSerial: '',
  description: '', qty: '1', requiresInspection: false, destination: 'Inventory',
})

export function RentalInwardView() {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canEdit = hasRole('Admin', 'Operations')

  const [tab, setTab] = useState<Tab>('hires')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const { data: hires, isLoading, error, refetch } = useFetch<Hire[]>(
    `/rental-inward?${search ? `search=${encodeURIComponent(search)}&` : ''}${status ? `status=${encodeURIComponent(status)}` : ''}`)
  const { data: summary, refetch: refetchSummary } = useFetch<Summary>('/rental-inward/summary')

  // Dropdown sources. All four come from the database - suppliers, the tool
  // category list, the size list and the Category/Size pairs the contracts
  // actually price. Nothing here is a literal list in the code.
  const { data: suppliers }   = useFetch<{ SupplierName: string }[]>('/suppliers')
  const { data: categories }  = useFetch<{ CategoryName: string }[]>('/categories')
  const { data: sizes }       = useFetch<{ SizeLabel: string }[]>('/sizes')
  const { data: rateOptions } = useFetch<RateOption[]>('/rental-inward/rate-options')

  const supplierOpts = useMemo(
    () => (suppliers || []).map(s => ({ value: s.SupplierName, label: s.SupplierName })), [suppliers])
  const categoryOpts = useMemo(
    () => (categories || []).map(c => ({ value: c.CategoryName, label: c.CategoryName })), [categories])
  const sizeOpts = useMemo(
    () => (sizes || []).map(s => ({ value: s.SizeLabel, label: s.SizeLabel })), [sizes])

  // Category|Size pairs that some contract prices, for the billable check.
  const priced = useMemo(() => {
    const s = new Set<string>()
    ;(rateOptions || []).forEach(r =>
      s.add(`${(r.category || '').trim().toUpperCase()}|${(r.size || '').trim().toUpperCase()}`))
    return s
  }, [rateOptions])

  const pricedCategories = useMemo(() => {
    const s = new Set<string>()
    ;(rateOptions || []).forEach(r => s.add((r.category || '').trim().toUpperCase()))
    return s
  }, [rateOptions])

  function billable(l: Line): 'ok' | 'no-size' | 'no-category' | 'blank' {
    const c = l.category.trim().toUpperCase()
    if (!c) return 'blank'
    if (!pricedCategories.has(c)) return 'no-category'
    if (priced.has(`${c}|${l.size.trim().toUpperCase()}`)) return 'ok'
    return 'no-size'
  }

  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [head, setHead] = useState({
    supplierName: '', rentalRef: '', poNumber: '', jobId: '',
    dateIn: new Date().toISOString().slice(0, 10), expectedOut: '', notes: '',
  })
  const [lines, setLines] = useState<Line[]>([blankLine()])

  const setLine = (key: number, patch: Partial<Line>) =>
    setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)))

  function startReceipt() {
    setHead({
      supplierName: '', rentalRef: '', poNumber: '', jobId: '',
      dateIn: new Date().toISOString().slice(0, 10), expectedOut: '', notes: '',
    })
    setLines([blankLine()])
    setAdding(true)
  }

  async function saveReceipt() {
    if (!head.supplierName.trim()) { showToast('Supplier is required', 'error'); return }
    const filled = lines.filter(l => l.category.trim() || l.assetNo.trim() || l.oemSerial.trim())
    if (!filled.length) { showToast('Add at least one tool line', 'error'); return }
    const missing = filled.find(l => !l.category.trim())
    if (missing) { showToast('Every line needs a category', 'error'); return }

    setBusy(true)
    try {
      const r = await api('/rental-inward/batch', {
        method: 'POST',
        body: JSON.stringify({
          ...head,
          lines: filled.map(l => ({
            category: l.category.trim(), size: l.size.trim(),
            assetNo: l.assetNo.trim(), oemSerial: l.oemSerial.trim(),
            description: l.description.trim(),
            qty: l.qty === '' ? 1 : Number(l.qty),
            requiresInspection: l.requiresInspection,
            destination: l.destination,
          })),
        }),
      }) as any
      showToast(
        `${r.created} tool(s) received on ${r.receiptRef} — now waiting for a day rate`,
        'success')
      setAdding(false)
      refetch(); refetchSummary()
    } catch (e: any) {
      showToast(e.message || 'Could not save the receipt', 'error')
    } finally { setBusy(false) }
  }

  async function sendBack(h: Hire, st: string) {
    setBusy(true)
    try {
      await api(`/rental-inward/${h.id}/return`, {
        method: 'POST',
        body: JSON.stringify({ dateOut: new Date().toISOString().slice(0, 10), status: st }),
      })
      showToast(st === 'Lost in Hole' ? 'Marked lost in hole' : 'Returned to supplier', 'success')
      refetch(); refetchSummary()
    } catch (e: any) { showToast(e.message || 'Could not close the hire', 'error') }
    finally { setBusy(false) }
  }

  const rows = hires || []
  const { scrollRef, visible, page, pageCount, setPage, from, to, total } = usePagedRows(rows)

  if (isLoading) return <PageLoader />
  if (error) return <div className="card p-6 text-center text-sm text-red-600">{error}</div>

  const t = summary?.totals
  const maxCost = Math.max(1, ...(summary?.bySupplier || []).map(s => Number(s.cost)))

  // ── Receipt entry ─────────────────────────────────────────────────────────
  if (adding && canEdit) {
    return (
      <div className="screen gap-1.5">
        <div className="screen-bar">
          {/* Back, not just Cancel. Cancel reads as "throw this away"; the
              way out of a screen you opened by mistake should say so. */}
          <button className="btn-mini" onClick={() => setAdding(false)}>
            <ArrowLeft size={12} /> Back to register
          </button>
          <span className="text-[11px] text-gray-500">
            Stores record what arrived — Billing adds the day rate afterwards
          </span>
          <button className="btn-primary ml-auto" disabled={busy} onClick={saveReceipt}>
            Save receipt
          </button>
        </div>

        {/* Header — typed once for the whole delivery note */}
        {/* Header: label beside its field in three columns, as the operator's
            own receipt form reads. Reference data being read, not a form
            filled top to bottom. */}
        <div className="card px-3 py-2 shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-1.5">
            <div className="flex items-center">
              <span className="sheet-label">Supplier</span>
              <ComboBox value={head.supplierName} options={supplierOpts} showAll={false}
                        className="flex-1" inputClassName="sheet-field pr-7"
                        placeholder="who it came from"
                        onChange={v => setHead(h => ({ ...h, supplierName: v }))} />
            </div>
            <div className="flex items-center">
              <span className="sheet-label">Their DN</span>
              <input className="sheet-field font-mono" value={head.rentalRef}
                     onChange={e => setHead(h => ({ ...h, rentalRef: e.target.value }))} />
            </div>
            <div className="flex items-center">
              <span className="sheet-label">PO number</span>
              <input className="sheet-field font-mono" value={head.poNumber}
                     onChange={e => setHead(h => ({ ...h, poNumber: e.target.value }))} />
            </div>
            <div className="flex items-center">
              <span className="sheet-label">Date in</span>
              <input type="date" className="sheet-field font-mono" value={head.dateIn}
                     onChange={e => setHead(h => ({ ...h, dateIn: e.target.value }))} />
            </div>
            <div className="flex items-center">
              <span className="sheet-label">Expected back</span>
              <input type="date" className="sheet-field font-mono" value={head.expectedOut}
                     onChange={e => setHead(h => ({ ...h, expectedOut: e.target.value }))} />
            </div>
          </div>
        </div>

        {/* Lines */}
        <div className="flex-1 min-h-0 overflow-auto bg-white border border-gray-300 rounded-t">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sheet-th w-9 !text-center">#</th>
                <th className="sheet-th min-w-[180px]">Category</th>
                <th className="sheet-th min-w-[110px]">Size</th>
                <th className="sheet-th min-w-[130px]">Our asset no</th>
                <th className="sheet-th min-w-[130px]">Their serial</th>
                <th className="sheet-th min-w-[220px]">Description</th>
                <th className="sheet-th w-16 !text-right">Qty</th>
                <th className="sheet-th w-14 !text-center">Insp</th>
                <th className="sheet-th min-w-[120px]">Goes to</th>
                <th className="sheet-th w-9"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const b = billable(l)
                return (
                  <tr key={l.key} className="sheet-row">
                    <td className="sheet-num">{i + 1}</td>
                    <td className="sheet-td">
                      <ComboBox value={l.category} options={categoryOpts} showAll={false}
                                inputClassName="sheet-input pr-6"
                                placeholder="category"
                                onChange={v => setLine(l.key, { category: v })} />
                      {(b === 'no-category' || b === 'no-size') && (
                        <span className="block px-3 pb-1 text-[10px] text-amber-700">
                          {b === 'no-category'
                            ? 'no contract prices this category'
                            : 'no rate for this size'}
                        </span>
                      )}
                    </td>
                    <td className="sheet-td">
                      <ComboBox value={l.size} options={sizeOpts} showAll={false}
                                inputClassName="sheet-input pr-6"
                                placeholder="size"
                                onChange={v => setLine(l.key, { size: v })} />
                    </td>
                    <td className="sheet-td">
                      <input className="sheet-input font-mono" value={l.assetNo}
                             placeholder="what we call it"
                             onChange={e => setLine(l.key, { assetNo: e.target.value })} />
                    </td>
                    <td className="sheet-td">
                      <input className="sheet-input font-mono" value={l.oemSerial}
                             onChange={e => setLine(l.key, { oemSerial: e.target.value })} />
                    </td>
                    <td className="sheet-td">
                      <input className="sheet-input" value={l.description}
                             onChange={e => setLine(l.key, { description: e.target.value })} />
                    </td>
                    <td className="sheet-td">
                      <input type="number" min={1} className="sheet-input font-mono text-right"
                             value={l.qty}
                             onChange={e => setLine(l.key, { qty: e.target.value })} />
                    </td>
                    <td className="sheet-td text-center">
                      <input type="checkbox" checked={l.requiresInspection}
                             onChange={e => setLine(l.key, { requiresInspection: e.target.checked })} />
                    </td>
                    <td className="sheet-td">
                      <select className="sheet-input" value={l.destination}
                              onChange={e => setLine(l.key, { destination: e.target.value })}>
                        <ListOptions name="GRNDestination" current={l.destination} />
                      </select>
                    </td>
                    <td className="sheet-td text-center">
                      {lines.length > 1 && (
                        <button className="text-slate-300 hover:text-red-600"
                                title="Remove this line"
                                onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="shrink-0 flex items-center gap-2 px-2 py-1 bg-gray-50 border border-t-0
                        border-gray-300 rounded-b text-[11px] text-gray-500">
          <button className="btn-mini" onClick={() => setLines(ls => [...ls, blankLine()])}>
            <Plus size={12} /> Add line
          </button>
          <span>{lines.length} line(s)</span>
          <span className="ml-auto">
            No day rate is entered here — these go to Pending Rental Costs for Billing.
          </span>
        </div>
      </div>
    )
  }

  // ── Register ──────────────────────────────────────────────────────────────
  return (
    <div className="screen gap-1.5">
      <div className="screen-bar">
        <div className="relative w-56">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="field-input !pl-7" placeholder="supplier, asset or serial…"
                 value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="field-input w-auto" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <ListOptions name="RentalInStatus" />
        </select>
        <button className="btn-mini" onClick={() => { refetch(); refetchSummary() }} title="Refresh">
          <RefreshCw size={12} />
        </button>
        {canEdit && (
          <button className="btn-accent ml-auto" onClick={startReceipt}>
            <Plus size={12} /> New receipt
          </button>
        )}
      </div>

      {t && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 shrink-0">
          <Stat label="On hire now" value={Number(t.onHire || 0).toLocaleString()}
                icon={<PackagePlus size={18} className="text-blue-600" />} iconBg="bg-blue-100" />
          <Stat label="Cost to date" value={money(t.cost)} sub="day rate × days held" />
          <Stat label="Lost in hole" value={Number(t.lostInHole || 0).toLocaleString()}
                tone={Number(t.lostInHole) ? 'warn' : 'default'} />
          <Stat label="Awaiting a day rate" value={Number(t.noRate || 0).toLocaleString()}
                tone={Number(t.noRate) ? 'warn' : 'default'}
                sub={Number(t.noRate) ? 'Billing sets these' : undefined}
                icon={<AlertTriangle size={18} className="text-amber-600" />} iconBg="bg-amber-100" />
        </div>
      )}

      <div className="flex border-b border-gray-200 shrink-0">
        {(['hires', 'report'] as Tab[]).map(x => (
          <button key={x} onClick={() => setTab(x)}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px ${
              tab === x ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {x === 'hires' ? 'Hires' : 'Sub-contractor rentals report'}
          </button>
        ))}
      </div>

      {tab === 'hires' && (
        <>
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto bg-white border border-gray-300 rounded-t">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="table-th">Supplier</th>
                  <th className="table-th">Asset</th>
                  <th className="table-th">Category</th>
                  <th className="table-th">Size</th>
                  <th className="table-th">Their serial</th>
                  <th className="table-th">Job</th>
                  <th className="table-th">In</th>
                  <th className="table-th !text-right">Days</th>
                  <th className="table-th !text-right">Cost</th>
                  <th className="table-th">Status</th>
                  <th className="table-th w-28"></th>
                </tr>
              </thead>
              <tbody>
                {visible.map(h => (
                  <tr key={h.id} className="table-tr !cursor-default whitespace-nowrap">
                    <td className="table-td font-medium">{h.supplierName}</td>
                    <td className="table-td table-ref text-brand-600">{h.assetNo || <span className="table-empty">—</span>}</td>
                    <td className="table-td">{h.shortDesc || <span className="table-empty">—</span>}</td>
                    <td className="table-td text-gray-500">{h.size || <span className="table-empty">—</span>}</td>
                    <td className="table-td table-ref text-gray-500">{h.oemSerial || <span className="table-empty">—</span>}</td>
                    <td className="table-td table-ref text-gray-500">{h.jobId || <span className="table-empty">—</span>}</td>
                    <td className="table-td table-ref text-gray-500">{String(h.dateIn).slice(0, 10)}</td>
                    <td className="table-td table-num">{h.daysOnHire}</td>
                    <td className="table-td table-num">
                      {h.dayRate == null
                        ? <span className="text-amber-600 text-[11px]">no rate</span>
                        : money(h.costToDate)}
                    </td>
                    <td className="table-td">
                      <span className={`badge ${
                        h.status === 'On Hire' ? 'status-active'
                        : h.status === 'Lost in Hole' ? 'status-cancelled'
                        : 'status-closed'}`}>{h.status}</span>
                    </td>
                    <td className="table-td">
                      {canEdit && !h.dateOut && (
                        <div className="flex gap-1">
                          <button className="btn-mini" disabled={busy}
                                  onClick={() => sendBack(h, 'Returned')}>
                            <Undo2 size={11} /> Return
                          </button>
                          <button className="btn-mini text-red-600" disabled={busy}
                                  onClick={() => sendBack(h, 'Lost in Hole')}>LIH</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={11} className="table-td text-center py-10 text-gray-400">
                    No third-party hires recorded.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pager page={page} pageCount={pageCount} setPage={setPage}
                 from={from} to={to} total={total} noun="hire" />
        </>
      )}

      {tab === 'report' && summary && (
        <div className="flex-1 min-h-0 overflow-auto card p-3 space-y-4">
          {Number(t?.noRate) > 0 && (
            <div className="card p-2 border-l-4 border-l-amber-400 text-xs text-gray-700">
              <strong>{t!.noRate}</strong> hire(s) have no day rate, so they contribute nothing
              to the costs below. The figures are a floor, not the full cost.
            </div>
          )}

          <Panel title="By supplier" subtitle="Cost is day rate × days held">
            <div className="py-1">
              {summary.bySupplier.map(s => (
                <Bar key={s.supplierName}
                     label={`${s.supplierName} — ${money(s.cost)} · ${s.tools} tool(s), ${s.onHire} still out`}
                     value={Number(s.cost)} total={maxCost} tone="bg-blue-500" />
              ))}
              {summary.bySupplier.length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">Nothing yet.</p>
              )}
            </div>
          </Panel>

          <Panel title="By job" subtitle="What sub-contractor tools cost each job">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="table-th">Job</th>
                  <th className="table-th !text-right">Tools</th>
                  <th className="table-th !text-right">Days</th>
                  <th className="table-th !text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {summary.byJob.map(j => (
                  <tr key={j.jobId} className="table-tr !cursor-default">
                    <td className="table-td table-ref">{j.jobId}</td>
                    <td className="table-td table-num">{j.tools}</td>
                    <td className="table-td table-num">{j.days}</td>
                    <td className="table-td table-num font-medium">{money(j.cost)}</td>
                  </tr>
                ))}
                {summary.byJob.length === 0 && (
                  <tr><td colSpan={4} className="table-td text-center py-6 text-gray-400">
                    Nothing yet.
                  </td></tr>
                )}
              </tbody>
            </table>
          </Panel>
        </div>
      )}
    </div>
  )
}

function Panel({ title, subtitle, children }:
  { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-200">
        <p className="text-xs font-semibold text-navy-900">{title}</p>
        {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Bar({ label, value, total, tone }:
  { label: string; value: number; total: number; tone: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="px-3 py-1.5">
      <div className="flex justify-between text-[11px] text-gray-700 mb-0.5">
        <span>{label}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded">
        <div className={`h-1.5 rounded ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
