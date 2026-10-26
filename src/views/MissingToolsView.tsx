import React, { useCallback, useMemo, useState } from 'react'
import { RefreshCw, Download, PackagePlus, AlertTriangle } from 'lucide-react'
import { api } from '../utils/api'
import { useFetch } from '../hooks/useFetch'
import { useToast } from '../components/Toast'
import { Spinner } from '../components/Spinner'
import { formatDate } from '../utils/format'
import { useResizableColumns, ResizerHandle } from '../components/useResizableColumns'

/**
 * Tools on live jobs with no inventory record.
 *
 * This came out of chasing CX0697 — dispatched to rig AD-112 on DT-26-03434
 * for JOB-26-01836, but with no row anywhere in tbl_Inventory. It turned out
 * not to be a one-off: across the jobs that are still live there are assets on
 * delivery tickets that inventory has never heard of, most of which have never
 * come back on a receiving ticket, so they are sitting on a rig while the
 * system believes they do not exist.
 *
 * The screen is the reconciliation: pick the category, size and supplier for
 * each one, tick it, and it is created in inventory with status 'On Rig'.
 * Category and size come from their masters — stock only ever enters inventory
 * through a controlled route, never by typing a free-text category here.
 */

interface MissingTool {
  AssetNo: string
  Description: string | null
  Qty: number
  LastDateOut: string | null
  Dispatches: number
  Rig: string | null
  JobNumber: string | null
  DTNumber: string | null
  StillOnRig: number
  ReturnedOn: string | null
}

interface Category { CategoryID: number; CategoryName: string; ActiveFlag?: boolean }
interface Size     { SizeID: number; SizeLabel: string; ActiveFlag?: boolean }
interface Supplier { SupplierID: number; SupplierName: string; IsActive?: boolean }

/** What the user fills in per row before it can be created. */
interface Draft { cat: string; size: string; supplier: string }

const COLS = [
  { key: 'pick',     label: '' },
  { key: 'AssetNo',  label: 'Asset No' },
  { key: 'Desc',     label: 'Description' },
  { key: 'Cat',      label: 'Category *' },
  { key: 'Size',     label: 'Size' },
  { key: 'Supplier', label: 'Supplier' },
  { key: 'Qty',      label: 'Qty' },
  { key: 'Rig',      label: 'Rig' },
  { key: 'Job',      label: 'Job No' },
  { key: 'DT',       label: 'DT No' },
  { key: 'Out',      label: 'Last Out' },
  { key: 'State',    label: 'State' },
] as const

const WIDTHS: Record<string, number> = {
  pick: 34, AssetNo: 130, Desc: 320, Cat: 170, Size: 110, Supplier: 150,
  Qty: 50, Rig: 90, Job: 125, DT: 115, Out: 90, State: 90,
}

export function MissingToolsView() {
  const { success, error: toastErr } = useToast()
  const [onRigOnly, setOnRigOnly] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [nonce, setNonce] = useState(0)

  const { data: rows, isLoading, error, refetch } =
    useFetch<MissingTool[]>(`/missing-tools?onRigOnly=${onRigOnly ? 1 : 0}&v=${nonce}`)

  // Masters — categories and sizes flow INTO inventory, never the other way.
  const { data: cats }      = useFetch<Category[]>('/categories')
  const { data: sizes }     = useFetch<Size[]>('/sizes')
  const { data: suppliers } = useFetch<Supplier[]>('/suppliers')

  const { widthOf, startResize, resetColumn } = useResizableColumns('missing-tools', WIDTHS)

  const catNames = useMemo(
    () => (cats || []).filter(c => c.ActiveFlag !== false).map(c => c.CategoryName).filter(Boolean).sort(),
    [cats]
  )
  const sizeNames = useMemo(
    () => (sizes || []).filter(s => s.ActiveFlag !== false).map(s => s.SizeLabel).filter(Boolean),
    [sizes]
  )
  const supplierNames = useMemo(
    () => (suppliers || []).map(s => s.SupplierName).filter(Boolean).sort(),
    [suppliers]
  )

  const draftOf = (asset: string): Draft => drafts[asset] || { cat: '', size: '', supplier: '' }

  const setDraft = (asset: string, patch: Partial<Draft>) =>
    setDrafts(d => ({ ...d, [asset]: { ...draftOf(asset), ...patch } }))

  /** A row can only be created once a category has been chosen. */
  const ready = useCallback(
    (asset: string) => Boolean(draftOf(asset).cat),
    [drafts]
  )

  const selected = useMemo(
    () => (rows || []).filter(r => picked[r.AssetNo] && ready(r.AssetNo)),
    [rows, picked, ready]
  )

  const pickedButIncomplete = useMemo(
    () => (rows || []).filter(r => picked[r.AssetNo] && !ready(r.AssetNo)).length,
    [rows, picked, ready]
  )

  /** Apply one row's category/size/supplier to every other row with the same description. */
  const applyToMatching = (row: MissingTool) => {
    const d = draftOf(row.AssetNo)
    if (!d.cat) { toastErr('Pick a category on this row first'); return }
    const key = (row.Description || '').trim().toLowerCase()
    if (!key) { toastErr('This row has no description to match on'); return }
    let n = 0
    setDrafts(prev => {
      const next = { ...prev }
      for (const r of rows || []) {
        if (r.AssetNo === row.AssetNo) continue
        if ((r.Description || '').trim().toLowerCase() !== key) continue
        next[r.AssetNo] = { ...d }
        n++
      }
      return next
    })
    success(n ? `Copied to ${n} row${n === 1 ? '' : 's'} with the same description` : 'No other rows share this description')
  }

  const addSelected = async () => {
    if (!selected.length) return
    setSaving(true)
    document.body.style.cursor = 'wait'
    try {
      const res = await api.post<{ added: number; skipped: { AssetNo: string; reason: string }[] }>(
        '/missing-tools',
        {
          tools: selected.map(r => {
            const d = draftOf(r.AssetNo)
            return {
              AssetNo: r.AssetNo,
              ShortDesc: d.cat,
              Size: d.size || null,
              Supplier: d.supplier || null,
              Description: r.Description,
              Qty: r.Qty,
              Location: r.Rig,
            }
          }),
        }
      )
      if (res.added) success(`${res.added} tool${res.added === 1 ? '' : 's'} added to inventory as On Rig`)
      if (res.skipped?.length) {
        toastErr(`${res.skipped.length} skipped — ${res.skipped[0].reason}`)
      }
      setPicked({})
      setNonce(n => n + 1)
      refetch()
    } catch (err: any) {
      toastErr(err.message || 'Failed to add tools')
    } finally {
      document.body.style.cursor = ''
      setSaving(false)
    }
  }

  const exportCsv = () => {
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const head = 'Asset No,Description,Category,Size,Supplier,Qty,Rig,Job No,DT No,Last Out,State'
    const body = (rows || []).map(r => {
      const d = draftOf(r.AssetNo)
      return [
        r.AssetNo, r.Description, d.cat, d.size, d.supplier, r.Qty, r.Rig,
        r.JobNumber, r.DTNumber, (r.LastDateOut || '').slice(0, 10),
        r.StillOnRig ? 'On rig' : `Returned on ${r.ReturnedOn || ''}`,
      ].map(esc).join(',')
    }).join('\n')
    const url = URL.createObjectURL(new Blob([`${head}\n${body}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'tools-missing-from-inventory.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const onRigCount = (rows || []).filter(r => r.StillOnRig).length

  return (
    <div className="screen">
      <div className="screen-bar">
        <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
          <input
            type="checkbox"
            checked={onRigOnly}
            onChange={e => { setOnRigOnly(e.target.checked); setPicked({}) }}
          />
          Not yet returned only
        </label>

        <button onClick={refetch} className="btn-mini" title="Refresh">
          <RefreshCw size={12} />
        </button>

        {!!rows?.length && (
          <span className="flex items-center gap-1 text-[11px] text-amber-700 font-semibold">
            <AlertTriangle size={12} />
            {rows.length} not in inventory · {onRigCount} still on a rig
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {!!rows?.length && (
            <button className="btn-mini" onClick={exportCsv}>
              <Download size={12} /> Export CSV
            </button>
          )}
          <button
            className="btn-accent"
            onClick={addSelected}
            disabled={saving || !selected.length}
            title={
              pickedButIncomplete
                ? `${pickedButIncomplete} ticked row(s) still need a category`
                : 'Create the ticked rows in inventory with status On Rig'
            }
          >
            {saving ? <Spinner size="sm" /> : <PackagePlus size={12} />}
            Add {selected.length || ''} to inventory
          </button>
        </div>
      </div>

      {error && <div className="card p-2 text-red-600 text-xs mb-1.5 shrink-0">{error}</div>}
      {pickedButIncomplete > 0 && (
        <div className="shrink-0 mb-1.5 px-2 py-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded">
          {pickedButIncomplete} ticked row{pickedButIncomplete === 1 ? '' : 's'} still need a category
          before {pickedButIncomplete === 1 ? 'it' : 'they'} can be added.
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto bg-white border border-gray-300 rounded">
        {isLoading ? (
          <div className="h-full flex items-center justify-center"><Spinner size="md" /></div>
        ) : !rows?.length ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            Every tool on a live job has an inventory record. Nothing to reconcile.
          </div>
        ) : (
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                {COLS.map(c => (
                  <th
                    key={c.key}
                    style={{ width: widthOf(c.key), minWidth: widthOf(c.key) }}
                    className="table-th relative"
                  >
                    {c.label}
                    <ResizerHandle
                      onMouseDown={e => startResize(c.key, e)}
                      onDoubleClick={() => resetColumn(c.key)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const d = draftOf(r.AssetNo)
                const isPicked = !!picked[r.AssetNo]
                return (
                  <tr
                    key={r.AssetNo}
                    className={`border-b border-gray-100 ${isPicked ? 'bg-accent-50' : 'hover:bg-brand-50/40'}`}
                  >
                    <td className="table-td text-center">
                      <input
                        type="checkbox"
                        checked={isPicked}
                        onChange={e => setPicked(p => ({ ...p, [r.AssetNo]: e.target.checked }))}
                      />
                    </td>
                    <td className="table-td font-mono font-medium">{r.AssetNo}</td>
                    <td
                      className="table-td text-gray-600 truncate"
                      style={{ maxWidth: widthOf('Desc') }}
                      title={r.Description || ''}
                      onDoubleClick={() => applyToMatching(r)}
                    >
                      {r.Description || '—'}
                    </td>
                    <td className="table-td">
                      <select
                        className={`field-input !h-[22px] ${d.cat ? '' : 'border-amber-400 bg-amber-50'}`}
                        value={d.cat}
                        onChange={e => setDraft(r.AssetNo, { cat: e.target.value })}
                      >
                        <option value="">— pick —</option>
                        {catNames.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="table-td">
                      <select
                        className="field-input !h-[22px]"
                        value={d.size}
                        onChange={e => setDraft(r.AssetNo, { size: e.target.value })}
                      >
                        <option value="">—</option>
                        {sizeNames.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="table-td">
                      <select
                        className="field-input !h-[22px]"
                        value={d.supplier}
                        onChange={e => setDraft(r.AssetNo, { supplier: e.target.value })}
                      >
                        <option value="">EMDAD</option>
                        {supplierNames.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="table-td text-right">{r.Qty}</td>
                    <td className="table-td text-gray-500">{r.Rig || '—'}</td>
                    <td className="table-td font-mono text-gray-500">{r.JobNumber || '—'}</td>
                    <td className="table-td font-mono text-gray-500">{r.DTNumber || '—'}</td>
                    <td className="table-td text-gray-500">{formatDate(r.LastDateOut) || '—'}</td>
                    <td className="table-td">
                      {r.StillOnRig
                        ? <span className="badge bg-amber-100 text-amber-800">On rig</span>
                        : <span className="badge bg-gray-100 text-gray-600">Returned</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="shrink-0 pt-1 text-[10px] text-gray-400">
        Category is required; size and supplier are optional. Leaving supplier blank records the
        tool as EMDAD-owned. Double-click a description to copy that row's category, size and
        supplier to every other row with the same description.
      </p>
    </div>
  )
}
