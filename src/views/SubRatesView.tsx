import { useMemo, useRef, useState } from 'react'
import { Plus, Search, Trash2, Upload, Download, RefreshCw } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useFetch } from '../hooks/useFetch'
import { api } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { PageLoader } from '../components/Spinner'
import { ListOptions } from '../components/ListOptions'
import { ComboBox } from '../components/ComboBox'
import { usePagedRows, Pager } from '../components/usePagedRows'

/*
 * Sub-Contractor Rate Sheets.
 *
 * What each supplier charges us, by category and size, per day / per month /
 * as a lump sum - the counterpart of the client contract rate card. A hired-in
 * tool on a job takes its rate from here automatically; the job's Sub-contract
 * tab only needs typing into for an exception, or for a rate the sheet lacks.
 *
 * A row with a blank size applies to every size of that category; a row with a
 * blank contract applies to every client contract. A row for one contract or
 * one size wins over the general row.
 */

interface Rate {
  id: number; supplierName: string; category: string; size: string; contractCode: string
  basis: string; rate: number; currency: string | null; notes: string | null; updatedBy: string | null
}

const blank = { supplierName: '', category: '', size: '', contractCode: '', basis: 'Day rate', rate: '', currency: 'USD', notes: '' }

/** Spreadsheet wording to the list values. */
const basisOf = (v: unknown) => {
  const t = String(v ?? '').toLowerCase()
  return /lump/.test(t) ? 'Lump sum' : /month/.test(t) ? 'Monthly rate' : 'Day rate'
}

export function SubRatesView() {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canEdit = hasRole('Admin', 'Billing', 'Finance', 'CostController')

  const { data, isLoading, error, refetch } = useFetch<Rate[]>('/sub-rates')
  const { data: suppliers }  = useFetch<{ SupplierName: string }[]>('/suppliers')
  const { data: categories } = useFetch<{ CategoryName: string }[]>('/categories')
  const { data: sizes }      = useFetch<{ SizeLabel: string }[]>('/sizes')
  const { data: contracts }  = useFetch<{ ContractID: string; ContractNumber: string; ClientName: string }[]>('/contracts')

  const [supplier, setSupplier] = useState('All')
  const [search, setSearch] = useState('')
  const [f, setF] = useState({ ...blank })
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const supplierOpts = useMemo(() => (suppliers || []).map(s => ({ value: s.SupplierName, label: s.SupplierName })), [suppliers])
  const categoryOpts = useMemo(() => (categories || []).map(c => ({ value: c.CategoryName, label: c.CategoryName })), [categories])
  const sizeOpts     = useMemo(() => (sizes || []).map(s => ({ value: s.SizeLabel, label: s.SizeLabel })), [sizes])
  const contractOpts = useMemo(() => (contracts || []).map(c => ({ value: c.ContractID, label: `${c.ContractNumber || c.ContractID} · ${c.ClientName || ''}` })), [contracts])

  const rows = data || []
  const used = useMemo(() => Array.from(new Set(rows.map(r => r.supplierName))).sort(), [rows])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => (supplier === 'All' || r.supplierName === supplier) &&
      (!q || [r.supplierName, r.category, r.size, r.contractCode].some(x => String(x ?? '').toLowerCase().includes(q))))
  }, [rows, supplier, search])
  const { scrollRef, visible, page, pageCount, setPage, from, to, total } = usePagedRows(filtered)

  async function add() {
    if (!f.supplierName.trim() || !f.category.trim() || f.rate === '') { showToast('Supplier, category and rate are needed', 'error'); return }
    setBusy(true)
    try {
      await api.put('/sub-rates', { ...f, rate: Number(f.rate) })
      showToast('Rate saved', 'success')
      setF(x => ({ ...blank, supplierName: x.supplierName, currency: x.currency, basis: x.basis }))
      refetch()
    } catch (e: any) { showToast(e?.message || 'Could not save', 'error') }
    finally { setBusy(false) }
  }
  async function change(r: Rate, patch: Partial<Rate>) {
    try { await api.put('/sub-rates', { ...r, ...patch }); refetch() }
    catch (e: any) { showToast(e?.message || 'Could not save', 'error') }
  }
  async function remove(r: Rate) {
    if (!window.confirm(`Remove ${r.supplierName} · ${r.category}${r.size ? ' ' + r.size : ''} from the sheet?`)) return
    try { await api.delete(`/sub-rates/${r.id}`); refetch() }
    catch (e: any) { showToast(e?.message || 'Could not remove', 'error') }
  }

  async function onFile(file: File) {
    try {
      const wb = XLSX.read(await file.arrayBuffer())
      const aoa = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      const pick = (o: Record<string, any>, ...names: string[]) => {
        const k = Object.keys(o).find(x => names.includes(x.toLowerCase().replace(/[^a-z]/g, '')))
        return k ? o[k] : ''
      }
      const out = aoa.map(o => ({
        supplierName: pick(o, 'supplier', 'suppliername', 'vendor'),
        category: pick(o, 'category', 'tool', 'tooltype', 'item'),
        size: pick(o, 'size'),
        contractCode: pick(o, 'contract', 'contractcode', 'contractno'),
        basis: basisOf(pick(o, 'basis', 'chargedby', 'unit', 'uom', 'type')),
        rate: pick(o, 'rate', 'price', 'amount'),
        currency: pick(o, 'currency', 'ccy') || 'USD',
        notes: pick(o, 'notes', 'remarks'),
      })).filter(r => r.supplierName || r.category || r.rate !== '')
      if (!out.length) { showToast('No rows found. Use the columns Supplier, Category, Size, Contract, Basis, Rate, Currency.', 'error'); return }
      if (!window.confirm(`Import ${out.length} rate${out.length === 1 ? '' : 's'} from ${file.name}? Rows already on a sheet are updated.`)) return
      setBusy(true)
      const r = await api.post<any>('/sub-rates', { rows: out })
      showToast(`${r.imported} imported${r.rejectedCount ? `, ${r.rejectedCount} rejected (first: row ${r.rejected[0].row} — ${r.rejected[0].error})` : ''}`, r.rejectedCount ? 'error' : 'success')
      refetch()
    } catch (e: any) { showToast(e?.message || 'Could not read that file', 'error') }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }
  function template() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Supplier', 'Category', 'Size', 'Contract', 'Basis', 'Rate', 'Currency', 'Notes'],
      ['SALTIRE', 'HYD DRILLING JAR', '6-3/4"', '', 'Day rate', 100, 'USD', 'blank size = every size, blank contract = every contract'],
    ])
    ws['!cols'] = [16, 28, 12, 16, 14, 10, 10, 40].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Rates')
    XLSX.writeFile(wb, 'sub-contractor-rate-sheet-template.xlsx')
  }
  function exportAll() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Supplier', 'Category', 'Size', 'Contract', 'Basis', 'Rate', 'Currency', 'Notes'],
      ...filtered.map(r => [r.supplierName, r.category, r.size, r.contractCode, r.basis, Number(r.rate), r.currency || '', r.notes || ''])])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Rates')
    XLSX.writeFile(wb, 'sub-contractor-rate-sheets.xlsx')
  }

  if (isLoading) return <PageLoader />
  const lab = 'block text-[10.5px] font-medium text-slate-500 mb-0.5'

  return (
    <div className="screen gap-2">
      {canEdit && (
        <div className="shrink-0 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="w-40"><label className={lab}>Supplier *</label>
              <ComboBox value={f.supplierName} options={supplierOpts} showAll={false} inputClassName="field-input pr-7" placeholder="supplier"
                        onChange={v => setF(x => ({ ...x, supplierName: v }))} /></div>
            <div className="w-52"><label className={lab}>Category *</label>
              <ComboBox value={f.category} options={categoryOpts} showAll={false} inputClassName="field-input pr-7" placeholder="category"
                        onChange={v => setF(x => ({ ...x, category: v }))} /></div>
            <div className="w-28"><label className={lab}>Size (blank = all)</label>
              <ComboBox value={f.size} options={sizeOpts} showAll={false} inputClassName="field-input pr-7" placeholder="any"
                        onChange={v => setF(x => ({ ...x, size: v }))} /></div>
            <div className="w-44"><label className={lab}>Contract (blank = all)</label>
              <ComboBox value={f.contractCode} options={contractOpts} showAll={false} inputClassName="field-input pr-7" placeholder="all contracts"
                        onChange={v => setF(x => ({ ...x, contractCode: v }))} /></div>
            <div><label className={lab}>How charged</label>
              <select className="field-input w-auto" value={f.basis} onChange={e => setF(x => ({ ...x, basis: e.target.value }))}>
                <ListOptions name="SubContractBasis" current={f.basis} /></select></div>
            <div className="w-24"><label className={lab}>Rate *</label>
              <input inputMode="decimal" className="field-input text-right font-mono" value={f.rate}
                     onChange={e => setF(x => ({ ...x, rate: e.target.value.replace(/[^0-9.]/g, '') }))}
                     onKeyDown={e => { if (e.key === 'Enter') add() }} /></div>
            <div><label className={lab}>Currency</label>
              <select className="field-input w-auto" value={f.currency} onChange={e => setF(x => ({ ...x, currency: e.target.value }))}>
                <ListOptions name="Currency" current={f.currency} /></select></div>
            <button className="btn-accent" disabled={busy} onClick={add}><Plus size={12} /> Add rate</button>
          </div>
        </div>
      )}

      <div className="screen-bar">
        <div className="relative w-64">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="field-input !pl-7" placeholder="Search supplier, category, size…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="field-input w-auto" value={supplier} onChange={e => setSupplier(e.target.value)}>
          <option value="All">All suppliers</option>
          {used.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn-mini" onClick={refetch} title="Refresh"><RefreshCw size={12} /></button>
        <span className="text-[12px] text-slate-600 ml-1"><strong className="text-slate-900">{filtered.length.toLocaleString()}</strong> rates · {used.length} supplier{used.length === 1 ? '' : 's'}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button className="btn-mini" onClick={template}><Download size={12} /> Template</button>
          <button className="btn-mini" onClick={exportAll}><Download size={12} /> Export</button>
          {canEdit && <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const x = e.target.files?.[0]; if (x) onFile(x) }} />
            <button className="btn-mini" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={12} /> Import from Excel</button>
          </>}
        </div>
      </div>

      {error && <div className="card p-2 text-red-600 text-xs shrink-0">{error}</div>}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto bg-white border border-gray-300 rounded-t">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="table-th pin-l">Supplier</th>
              <th className="table-th">Category</th>
              <th className="table-th">Size</th>
              <th className="table-th">Contract</th>
              <th className="table-th">How charged</th>
              <th className="table-th !text-right">Rate</th>
              <th className="table-th">Ccy</th>
              <th className="table-th">Notes</th>
              <th className="table-th pin-r w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="table-td text-center py-10 text-gray-400">
                {rows.length === 0 ? 'No supplier rates yet. Add one above, or import your agreements from Excel.' : 'Nothing matches these filters.'}</td></tr>
            ) : visible.map(r => (
              <tr key={r.id} className="table-tr whitespace-nowrap">
                <td className="table-td pin-l font-medium text-brand-600">{r.supplierName}</td>
                <td className="table-td">{r.category}</td>
                <td className="table-td text-slate-600">{r.size || <span className="text-slate-400">every size</span>}</td>
                <td className="table-td text-slate-600">{r.contractCode || <span className="text-slate-400">every contract</span>}</td>
                <td className="table-td">
                  {canEdit
                    ? <select className="h-[24px] text-[12px] border border-gray-200 rounded bg-white" value={r.basis} onChange={e => change(r, { basis: e.target.value })}>
                        <ListOptions name="SubContractBasis" current={r.basis} /></select>
                    : r.basis}
                </td>
                <td className="table-td !text-right">
                  {canEdit
                    ? <input key={`${r.id}-${r.rate}`} inputMode="decimal" defaultValue={String(r.rate)} className="w-[90px] h-[24px] text-right text-[12px] font-mono border border-gray-200 rounded"
                             onBlur={e => { const v = Number(e.target.value); if (!isNaN(v) && v !== Number(r.rate)) change(r, { rate: v }) }}
                             onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                    : <span className="tabular-nums">{Number(r.rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>}
                </td>
                <td className="table-td text-slate-400">{r.currency || '—'}</td>
                <td className="table-td text-slate-500 max-w-[260px] truncate" title={r.notes || ''}>{r.notes || ''}</td>
                <td className="table-td pin-r">{canEdit && <button className="text-gray-400 hover:text-red-600" title="Remove" onClick={() => remove(r)}><Trash2 size={13} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageCount={pageCount} setPage={setPage} from={from} to={to} total={total} noun="rate" />
    </div>
  )
}
