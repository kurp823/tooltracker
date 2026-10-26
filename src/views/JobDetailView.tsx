/**
 * Job File Workspace — multi-tab operational hub for a single job.
 * Rules:
 *  1. AssetNo everywhere — SystemID is internal only, never shown in UI
 *  2. Checklist = local React state (fast, no DB trips while adding tools)
 *  3. Generate DT → creates DB record, MOVES (not copies) items from checklist
 *  4. Lazy tab loading — each tab fetches its own data only when activated
 *  5. Explicit Save button only — no auto-save
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Save, Plus, Trash2, Search,
  CheckSquare, Square, FileText, Package, Users, Wrench,
  ClipboardList, Truck, RotateCcw, BarChart3, X, AlertTriangle
} from 'lucide-react'
import { api } from '../utils/api'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { toDateInput, normalizeJobId } from '../utils/format'
import { PageLoader, Spinner } from '../components/Spinner'
import { ComboBox } from '../components/ComboBox'
import type { Job, JobStatus, InvoicingType, ToolMovement } from '../types'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Exactly what /api/inventory returns. The previous shape invented SizeName,
 * SupplierName, CategoryName and Condition — none of which exist — which is
 * why the tool picker came up empty and showed no size or supplier.
 */
interface InvItem {
  SystemID: string      // internal key — NEVER show in UI
  AssetNo: string       // physical label — always use this
  Serial: string
  ShortDesc: string     // this IS the category name in tbl_Inventory
  Description: string | null  // the long free-text description
  Size: string
  Supplier: string
  Ownership: string
  IsEmdad: boolean
  Status: string        // 'Good' | 'DBR' | 'On Rig'
  Location: string
  Qty: number
}

interface ChecklistItem {
  _id: string           // client-side only temp ID
  SystemID: string       // real tbl_Inventory join key — sent to the API, never shown
  AssetNo: string
  Serial: string
  Description: string
  Size: string
  Supplier: string
  Qty: number
  Condition: string
  checked: boolean
}

interface DTRecord {
  DTID: number
  DTNumber: string
  JobID: string
  DTDate: string
  Status: string
  Notes: string
  CreatedBy: string
  CreatedDate: string
}

interface DTLine {
  LineID: number
  AssetNo?: string
  SerialNumber?: string
  ToolDescription: string
  SizeName?: string
  Quantity: number
  Condition?: string
  Notes: string
}

interface RTRecord {
  RTID: number
  RTNumber: string
  JobID: string
  RTDate: string
  LinkedDT?: string
  ManifestNumber?: string
  Status: string
  Notes: string
  CreatedBy: string
  CreatedDate: string
}

interface RTLine {
  LineID: number
  SerialNumber?: string
  AssetNo?: string
  ToolDescription: string
  Quantity: number
  Condition?: string
  UsedStatus?: string
  RoutedTo?: string
  Notes: string
}

interface UtilCell { code: '1' | 'S'; logId: number }
/**
 * One row per DISPATCH CYCLE, not per tool: a tool that goes out, comes back
 * and goes out again on the same job is two separate charge periods, and the
 * days of one must not be enterable against the other. `dateOut`/`dateIn`
 * bound the window in which a day can be marked at all.
 */
interface UtilRow {
  label: string
  toolId: string | number | null
  days: Record<number, UtilCell>
  dtNumber: string | null
  dateOut: string | null
  dateIn: string | null
  assetNo?: string | null
  size?: string | null
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WORKSPACE_TABS = [
  { id: 'header',    label: 'Job Header',            icon: <FileText    size={14} /> },
  { id: 'technical', label: 'Technical Details',     icon: <Wrench      size={14} /> },
  { id: 'manpower',  label: 'Manpower / Crew',       icon: <Users       size={14} /> },
  { id: 'checklist', label: 'Checklist Header',      icon: <ClipboardList size={14} /> },
  { id: 'dt',        label: 'Delivery Ticket Header',icon: <Truck       size={14} /> },
  { id: 'rt',        label: 'Return Ticket',         icon: <RotateCcw   size={14} /> },
  { id: 'util',      label: 'Utilization',           icon: <BarChart3   size={14} /> },
] as const

type Tab = typeof WORKSPACE_TABS[number]['id']

const STATUS_OPTIONS: JobStatus[]     = ['Open','Ongoing','Draft Invoice Submitted','Completed','JobCompleted']
const INVOICING_OPTS: InvoicingType[] = ['PerJob','PerDay','Lump Sum']
const CURRENCY_OPTS                   = ['USD','AED','SAR','OMR']
const DT_STATUS_OPTS                  = ['Draft','Submitted','Approved','Rejected']
const RT_STATUS_OPTS                  = ['Draft','Submitted','Approved','Rejected']

// ─── Tool Picker Modal ────────────────────────────────────────────────────────

/**
 * Status groups. Everything is shown, not just Good — a supervisor who can see
 * that the tool he needs is sitting in inspection or maintenance can push it
 * through the workshop and still make the mobilisation. Hiding those rows hid
 * exactly the information needed to act on them, and made the tool look as
 * though it did not exist.
 */
const PICK_STATUS_STYLE: Record<string, string> = {
  good: 'bg-green-100 text-green-700',
  'on rig': 'bg-blue-100 text-blue-700',
  inspection: 'bg-amber-100 text-amber-800',
  maintenance: 'bg-amber-100 text-amber-800',
  redress: 'bg-amber-100 text-amber-800',
  repair: 'bg-amber-100 text-amber-800',
  dbr: 'bg-red-100 text-red-700',
  scrap: 'bg-red-100 text-red-700',
}
const pickStatusClass = (s: string | null | undefined) =>
  PICK_STATUS_STYLE[String(s || '').trim().toLowerCase()] || 'bg-gray-100 text-gray-600'

/** Ready to mobilise as-is. Anything else needs a workshop step first. */
const isMobilisable = (s: string | null | undefined) =>
  String(s || '').trim().toLowerCase() === 'good'

function ToolPickerModal({
  jobId,
  existingAssetNos,
  onInsert,
  onClose,
}: {
  jobId: string
  existingAssetNos: Set<string>
  onInsert: (items: InvItem[]) => void
  onClose: () => void
}) {
  const [category, setCategory] = useState('')
  const [size,     setSize]     = useState('')
  const [assetQ,   setAssetQ]   = useState('')
  const [onlyReady, setOnlyReady] = useState(false)
  const [items,    setItems]    = useState<InvItem[]>([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())  // keyed by AssetNo

  /*
   * Every tool, whatever its status — only those already on this checklist are
   * excluded. The availability rule used to be a hard filter here; it is now a
   * visible column, because the status is the useful part.
   */
  useEffect(() => {
    setLoading(true)
    api.get<InvItem[]>('/inventory')
      .then((all: InvItem[]) => {
        setItems((all || []).filter((i: InvItem) => !existingAssetNos.has(i.AssetNo)))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [existingAssetNos])

  /*
   * Category and size are both taken from inventory itself, and size is scoped
   * to the chosen category — a 26" junk mill and a 2-7/8" magnet have no sizes
   * in common, so offering all 204 sizes against any category is just noise.
   * (tbl_Inventory.ShortDesc *is* the category name; it matches
   * tbl_ToolCategories on 128 of 129 values.)
   *
   * Deriving these from inventory rather than the masters is deliberate here:
   * this picker chooses tools that exist, so a category with nothing in stock
   * would be a dead end. The masters drive the *entry* screens, where stock is
   * created.
   */
  const categories = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of items) {
      const c = (i.ShortDesc || '').trim()
      if (c) m.set(c, (m.get(c) || 0) + 1)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [items])

  const sizesForCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of items) {
      if (category && (i.ShortDesc || '').trim() !== category) continue
      const s = (i.Size || '').trim()
      if (s) m.set(s, (m.get(s) || 0) + 1)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
  }, [items, category])

  // Changing category can strand the chosen size on a value that category
  // doesn't have, which would show an empty list with no obvious cause.
  useEffect(() => {
    if (size && !sizesForCategory.some(([s]) => s === size)) setSize('')
  }, [sizesForCategory, size])

  const filtered = useMemo(() => {
    const q = assetQ.trim().toLowerCase()
    const out = items.filter((i: InvItem) => {
      if (category && (i.ShortDesc || '').trim() !== category) return false
      if (size && (i.Size || '').trim() !== size) return false
      if (onlyReady && !isMobilisable(i.Status)) return false
      if (q && !(i.AssetNo || '').toLowerCase().includes(q)
            && !(i.Serial || '').toLowerCase().includes(q)) return false
      return true
    })
    // Ready-to-go first, so the tools that need no workshop step are on top.
    return out.sort((a, b) => {
      const ra = isMobilisable(a.Status) ? 0 : 1
      const rb = isMobilisable(b.Status) ? 0 : 1
      if (ra !== rb) return ra - rb
      return (a.AssetNo || '').localeCompare(b.AssetNo || '', undefined, { numeric: true })
    })
  }, [items, category, size, assetQ, onlyReady])

  // Render a slice: the full catalogue is 5,094 rows and putting all of them in
  // the modal's DOM made opening it slow enough to look broken.
  const RENDER_CAP = 200
  const shownItems = filtered.slice(0, RENDER_CAP)
  const capped = filtered.length > RENDER_CAP

  function toggleRow(assetNo: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(assetNo)) next.delete(assetNo)
      else next.add(assetNo)
      return next
    })
  }

  function toggleAll() {
    if (shownItems.every(i => selected.has(i.AssetNo))) {
      setSelected(prev => {
        const next = new Set(prev)
        shownItems.forEach(i => next.delete(i.AssetNo))
        return next
      })
    } else {
      setSelected(prev => new Set([...prev, ...shownItems.map(i => i.AssetNo)]))
    }
  }

  const selectedItems = items.filter(i => selected.has(i.AssetNo))
  const notReady = selectedItems.filter(i => !isMobilisable(i.Status))

  function handleInsert() {
    if (notReady.length) {
      const names = notReady.slice(0, 5).map(i => `${i.AssetNo} (${i.Status})`).join(', ')
      const more = notReady.length > 5 ? ` and ${notReady.length - 5} more` : ''
      if (!window.confirm(
        `${notReady.length} of the selected tools are not in Good status yet:\n\n${names}${more}\n\n` +
        `They can be staged on the checklist, but they must clear the workshop before the ` +
        `delivery ticket is raised. Add them anyway?`
      )) return
    }
    onInsert(selectedItems)
  }

  /* Fixed column widths — the header and body were laid out independently, so
   * the columns did not line up once a long description appeared. */
  const COLW = ['36px', '150px', 'auto', '90px', '56px', '130px', '110px']

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-10 px-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-[86vh] flex flex-col overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center gap-2 px-3 h-[34px] bg-navy-head text-white shrink-0">
          <span className="text-[13px] font-bold tracking-wide">TOOL ASSIGNMENT PICKER</span>
          <span className="text-[11px] text-slate-300">Job {jobId}</span>
          <button onClick={onClose} className="ml-auto hover:text-accent-400">
            <X size={15} />
          </button>
        </div>

        {/* Filters — category drives size */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 border-b border-gray-300 bg-gray-50 shrink-0">
          {/* Type-to-search rather than a native dropdown: 130 categories and
              204 sizes are too many to find by scrolling a popup. */}
          <span className="field-label">Category</span>
          <ComboBox
            className="w-56"
            value={category}
            onChange={setCategory}
            options={categories.map(([c, n]) => ({ value: c, label: c, count: n }))}
            allLabel={`All categories (${items.length})`}
            placeholder="Type a category…"
          />

          <span className="field-label">Size</span>
          <ComboBox
            className="w-40"
            value={size}
            onChange={setSize}
            options={sizesForCategory.map(([s, n]) => ({ value: s, label: s, count: n }))}
            allLabel={category
              ? `All sizes in this category (${sizesForCategory.length})`
              : `All sizes (${sizesForCategory.length})`}
            placeholder="Type a size…"
            disabled={sizesForCategory.length === 0}
          />

          <span className="field-label">Asset No</span>
          <div className="relative w-44">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="field-input !pl-6" placeholder="Exact or partial"
                   value={assetQ} onChange={e => setAssetQ(e.target.value)} />
          </div>

          <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
            <input type="checkbox" checked={onlyReady} onChange={e => setOnlyReady(e.target.checked)} />
            Ready to mobilise only
          </label>

          <span className="ml-auto text-[11px] text-gray-600">
            <strong>{filtered.length}</strong> matching
            {capped && <span className="text-amber-700 font-semibold ml-1.5">· showing first {RENDER_CAP}</span>}
          </span>
        </div>

        {/* Table */}
        <div className="flex-1 min-h-0 overflow-auto">
          {loading ? (
            <div className="h-full flex items-center justify-center"><Spinner size="md" /></div>
          ) : (
            <table className="w-full text-[12px] border-collapse table-fixed">
              <colgroup>{COLW.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="table-th !px-1 text-center">
                    <button onClick={toggleAll} title="Select all listed">
                      {shownItems.length > 0 && shownItems.every(i => selected.has(i.AssetNo))
                        ? <CheckSquare size={14} className="text-accent-400" />
                        : <Square size={14} className="text-slate-300" />}
                    </button>
                  </th>
                  <th className="table-th">Asset No</th>
                  <th className="table-th">Description / Category</th>
                  <th className="table-th">Size</th>
                  <th className="table-th !text-right">Qty</th>
                  <th className="table-th">Owner</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="table-td text-center py-10 text-gray-400">
                      No tools match these filters.
                    </td>
                  </tr>
                ) : (
                  shownItems.map(item => {
                    const isSelected = selected.has(item.AssetNo)
                    const ready = isMobilisable(item.Status)
                    return (
                      <tr
                        key={item.AssetNo}
                        onClick={() => toggleRow(item.AssetNo)}
                        className={`border-b border-gray-100 cursor-pointer ${
                          isSelected ? 'bg-accent-50' : ready ? 'hover:bg-brand-50/40' : 'bg-amber-50/40 hover:bg-amber-50'
                        }`}
                      >
                        <td className="table-td !px-1 text-center">
                          {isSelected
                            ? <CheckSquare size={14} className="text-brand-600 mx-auto" />
                            : <Square size={14} className="text-gray-300 mx-auto" />}
                        </td>
                        <td className="table-td font-mono font-medium truncate">{item.AssetNo}</td>
                        <td className="table-td text-gray-600 truncate"
                            title={item.Description || item.ShortDesc || ''}>
                          {item.ShortDesc || item.Description || '—'}
                        </td>
                        <td className="table-td text-gray-500 truncate">{item.Size || '—'}</td>
                        <td className="table-td text-right text-gray-600">{item.Qty ?? 1}</td>
                        <td className="table-td text-gray-500 truncate">
                          {item.IsEmdad ? 'EMDAD' : (item.Ownership || item.Supplier || '—')}
                        </td>
                        <td className="table-td">
                          <span className={`badge ${pickStatusClass(item.Status)}`}>
                            {item.Status || 'Unknown'}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-3 py-2 border-t border-gray-300 bg-gray-50 shrink-0">
          <p className="text-[11px] text-gray-600">
            Selected: <strong className="text-brand-600">{selected.size}</strong>
            {notReady.length > 0 && (
              <span className="text-amber-800 font-semibold ml-2">
                · {notReady.length} need a workshop step first
              </span>
            )}
          </p>
          <div className="ml-auto flex gap-1.5">
            <button onClick={onClose} className="btn-mini">Cancel</button>
            <button onClick={handleInsert} disabled={selected.size === 0} className="btn-accent">
              Insert {selected.size || ''} tool{selected.size === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
function ChecklistTab({
  jobId,
  job,
  items,
  setItems,
  onGenerateDT,
}: {
  jobId: string
  job: Partial<Job>
  items: ChecklistItem[]
  setItems: React.Dispatch<React.SetStateAction<ChecklistItem[]>>
  onGenerateDT: (dtid: number, dtNumber: string) => void
}) {
  const { showToast } = useToast()
  const [pickerOpen,  setPickerOpen]  = useState(false)
  const [generating,  setGenerating]  = useState(false)

  const checkedItems = items.filter(i => i.checked)
  const existingAssetNos = new Set(items.map(i => i.AssetNo))

  function toggleItem(id: string) {
    setItems(prev => prev.map(i => i._id === id ? { ...i, checked: !i.checked } : i))
  }

  function toggleAll() {
    const allChecked = items.every(i => i.checked)
    setItems(prev => prev.map(i => ({ ...i, checked: !allChecked })))
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i._id !== id))
  }

  function updateQty(id: string, qty: number) {
    setItems(prev => prev.map(i => i._id === id ? { ...i, Qty: Math.max(1, qty) } : i))
  }

  function handleInsert(invItems: InvItem[]) {
    const newItems: ChecklistItem[] = invItems.map(inv => ({
      _id:         `${inv.AssetNo}-${Date.now()}-${Math.random()}`,
      SystemID:    inv.SystemID,    // real Inventory join key
      AssetNo:     inv.AssetNo,     // ← always AssetNo, never SystemID
      Serial:      inv.Serial || '',
      Description: inv.ShortDesc,
      Size:        inv.Size,
      Supplier:    inv.IsEmdad ? 'EMDAD' : (inv.Ownership || inv.Supplier || ''),
      Qty:         1,
      Condition:   inv.Status,
      checked:     false,
    }))
    setItems(prev => [...prev, ...newItems])
    setPickerOpen(false)
    showToast(`${newItems.length} tool(s) added to checklist`, 'success')
  }

  async function handleGenerateDT() {
    if (checkedItems.length === 0) return
    if (!jobId) return
    setGenerating(true)
    document.body.style.cursor = 'wait'
    try {
      // 1 — Create DT header
      const dtRes = await api.post<{ DTID: number; DTNumber: string }>('/delivery-tickets', {
        JobID:  jobId,
        DTDate: new Date().toISOString().split('T')[0],
        Status: 'Draft',
        Notes:  '',
      })

      // 2 — Save each checked item as a DT line (AssetNo stored in line)
      await Promise.all(checkedItems.map(item =>
        api.post(`/delivery-tickets/${dtRes.DTID}/lines`, {
          SystemID:        item.SystemID,        // real Inventory join key
          ToolDescription: item.Description,
          SizeName:        item.Size,
          Quantity:        item.Qty,
          Condition:       item.Condition,
          Notes:           '',
        })
      ))

      // 3 — REMOVE checked items from checklist (move, not copy)
      const checkedIds = new Set(checkedItems.map(i => i._id))
      setItems(prev => prev.filter(i => !checkedIds.has(i._id)))

      showToast(`DT ${dtRes.DTNumber} created — ${checkedItems.length} tool(s) dispatched`, 'success')

      // 4 — Switch parent to DT tab and pass the new DTID
      onGenerateDT(dtRes.DTID, dtRes.DTNumber)

    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to generate DT', 'error')
    } finally {
      setGenerating(false)
      document.body.style.cursor = ''
    }
  }

  return (
    <div className="space-y-4">
      {/* Checklist header form */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-sm text-gray-800">Tools Check List</h3>
            <span className="badge bg-blue-100 text-blue-700">Checklist - Opened</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPickerOpen(true)}
              className="btn-primary text-xs py-1.5"
            >
              <Plus size={13} /> Select Tools
            </button>
            <button
              onClick={handleGenerateDT}
              disabled={checkedItems.length === 0 || generating}
              className="btn-secondary text-xs py-1.5 disabled:opacity-40"
              title={checkedItems.length === 0 ? 'Check items below to generate DT' : ''}
            >
              {generating
                ? <><Spinner size="sm" /> Generating…</>
                : <><Truck size={13} /> Generate DT from Checklist ({checkedItems.length} Pending)</>
              }
            </button>
          </div>
        </div>

        {/* Meta fields */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="label">Req Date</label>
            <input type="date" className="input py-1.5 text-xs"
              defaultValue={new Date().toISOString().split('T')[0]} />
          </div>
          <div>
            <label className="label">Project No</label>
            <input className="input py-1.5 text-xs"
              defaultValue={job.Contract || ''} readOnly />
          </div>
          <div>
            <label className="label">PO Number</label>
            <input className="input py-1.5 text-xs"
              defaultValue={job.PONumber || ''} />
          </div>
          <div>
            <label className="label">Status</label>
            <input className="input py-1.5 text-xs bg-gray-50"
              value="Checklist - Opened" readOnly />
          </div>
        </div>
      </div>

      {/* Checklist table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-th w-10">
                <button onClick={toggleAll} title="Select all">
                  {items.length > 0 && items.every(i => i.checked)
                    ? <CheckSquare size={14} className="text-brand-600" />
                    : <Square size={14} className="text-gray-400" />
                  }
                </button>
              </th>
              <th className="table-th">#</th>
              <th className="table-th">Asset No</th>
              <th className="table-th">Description</th>
              <th className="table-th">Size</th>
              <th className="table-th text-center">Qty</th>
              <th className="table-th">Supplier</th>
              <th className="table-th">Condition</th>
              <th className="table-th"></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="table-td text-center py-10 text-gray-400">
                  <Package size={28} className="mx-auto mb-2 text-gray-300" />
                  No tools in checklist. Click <strong>"Select Tools"</strong> above to pick from inventory.
                </td>
              </tr>
            ) : (
              items.map((item, idx) => (
                <tr
                  key={item._id}
                  onClick={() => toggleItem(item._id)}
                  className={`border-b border-gray-100 cursor-pointer transition-colors ${
                    item.checked ? 'bg-brand-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="table-td text-center" onClick={e => e.stopPropagation()}>
                    <button onClick={() => toggleItem(item._id)}>
                      {item.checked
                        ? <CheckSquare size={14} className="text-brand-600" />
                        : <Square size={14} className="text-gray-300" />
                      }
                    </button>
                  </td>
                  <td className="table-td text-gray-500">{idx + 1}</td>
                  <td className="table-td font-medium text-gray-900">{item.AssetNo}</td>
                  <td className="table-td text-gray-700 max-w-xs truncate" title={item.Description}>
                    {item.Description}
                  </td>
                  <td className="table-td text-gray-500">{item.Size}</td>
                  <td className="table-td text-center" onClick={e => e.stopPropagation()}>
                    <input
                      type="number"
                      min={1}
                      value={item.Qty}
                      onChange={e => updateQty(item._id, parseInt(e.target.value) || 1)}
                      className="w-14 text-center border border-gray-300 rounded px-1 py-0.5 text-xs"
                    />
                  </td>
                  <td className="table-td text-gray-500">{item.Supplier || '—'}</td>
                  <td className="table-td">
                    <span className="text-green-600 text-xs font-medium">{item.Condition}</span>
                  </td>
                  <td className="table-td" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => removeItem(item._id)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {items.length > 0 && (
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 flex items-center justify-between">
            <span>{items.length} tool(s) in checklist</span>
            {checkedItems.length > 0 && (
              <span className="text-brand-600 font-medium">{checkedItems.length} selected for DT generation</span>
            )}
          </div>
        )}
      </div>

      {pickerOpen && (
        <ToolPickerModal
          jobId={jobId}
          existingAssetNos={existingAssetNos}
          onInsert={handleInsert}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

// ─── DT Header Tab ────────────────────────────────────────────────────────────

function DTHeaderTab({
  jobId,
  job,
  focusDTID,
}: {
  jobId: string
  job: Partial<Job>
  focusDTID: number | null
}) {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canEdit = hasRole('Admin', 'Operations')

  const [dts,        setDts]      = useState<DTRecord[]>([])
  const [activeDT,   setActiveDT] = useState<DTRecord | null>(null)
  const [lines,      setLines]    = useState<DTLine[]>([])
  const [loading,    setLoading]  = useState(true)
  const [saving,     setSaving]   = useState(false)
  const [form, setForm] = useState({
    DTDate:       new Date().toISOString().split('T')[0],
    Status:       'Draft',
    DispatchedBy: '',
    Designation:  '',
    DispatchDate: new Date().toISOString().split('T')[0],
    DeliveredTo:  '',
    Vessel:       '',
    Transport:    '',
    VehicleNo:    '',
    DriverName:   '',
    ContactNo:    '',
    RMRef:        '',
    RMDate:       '',
    Notes:        '',
  })

  const loadDTs = useCallback(async () => {
    setLoading(true)
    try {
      // Filtered server-side. This used to pull all 3,700 delivery tickets
      // to find the handful on this job; ?job= matches on the trailing job
      // sequence, which is format-proof.
      const jobDTs = await api.get<DTRecord[]>(`/delivery-tickets?job=${encodeURIComponent(jobId)}`)
      setDts(jobDTs)
      if (jobDTs.length > 0) {
        const target = focusDTID
          ? jobDTs.find(d => d.DTID === focusDTID) || jobDTs[0]
          : jobDTs[0]
        selectDT(target)
      }
    } catch {
      showToast('Failed to load delivery tickets', 'error')
    } finally {
      setLoading(false)
    }
  }, [jobId, focusDTID])

  useEffect(() => { loadDTs() }, [loadDTs])

  async function selectDT(dt: DTRecord) {
    setActiveDT(dt)
    try {
      const ln = await api.get<DTLine[]>(`/delivery-tickets/${dt.DTID}/lines`)
      setLines(ln)
      // Parse logistics from Notes if stored as JSON
      try {
        const parsed = JSON.parse(dt.Notes || '{}')
        if (parsed._logistics) {
          setForm(prev => ({ ...prev, ...parsed._logistics, Notes: parsed.notes || '' }))
        }
      } catch {
        setForm(prev => ({ ...prev, Notes: dt.Notes || '' }))
      }
    } catch {
      setLines([])
    }
  }

  async function handleSave() {
    if (!activeDT) return
    setSaving(true)
    document.body.style.cursor = 'wait'
    try {
      // Store logistics as JSON inside Notes field
      const payload = {
        DTDate: form.DTDate,
        Status: form.Status,
        Notes: JSON.stringify({
          _logistics: {
            DispatchedBy: form.DispatchedBy,
            Designation:  form.Designation,
            DispatchDate: form.DispatchDate,
            DeliveredTo:  form.DeliveredTo,
            Vessel:       form.Vessel,
            Transport:    form.Transport,
            VehicleNo:    form.VehicleNo,
            DriverName:   form.DriverName,
            ContactNo:    form.ContactNo,
            RMRef:        form.RMRef,
            RMDate:       form.RMDate,
          },
          notes: form.Notes,
        }),
      }
      await api.put(`/delivery-tickets/${activeDT.DTID}`, payload)
      showToast('Delivery ticket saved', 'success')
      loadDTs()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
      document.body.style.cursor = ''
    }
  }

  async function handleNewDT() {
    try {
      const res = await api.post<{ DTID: number; DTNumber: string }>('/delivery-tickets', {
        JobID:  jobId,
        DTDate: new Date().toISOString().split('T')[0],
        Status: 'Draft',
        Notes:  '',
      })
      showToast(`${res.DTNumber} created`, 'success')
      loadDTs()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create DT', 'error')
    }
  }

  async function removeLine(lineId: number) {
    if (!activeDT) return
    try {
      await api.delete(`/delivery-tickets/${activeDT.DTID}/lines/${lineId}`)
      setLines(prev => prev.filter(l => l.LineID !== lineId))
      showToast('Line removed', 'success')
    } catch {
      showToast('Failed to remove line', 'error')
    }
  }

  if (loading) return (
    <div className="card p-12 flex items-center justify-center">
      <Spinner size="md" />
    </div>
  )

  return (
    <div className="space-y-4">
      {/* DT Selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Select Delivery Ticket:</span>
          {dts.length === 0 ? (
            <span className="text-sm text-gray-400 italic">No DT Generated (Draft Checklist Manifest)</span>
          ) : (
            <select
              className="input py-1.5 text-sm w-auto"
              value={activeDT?.DTID || ''}
              onChange={e => {
                const dt = dts.find(d => d.DTID === Number(e.target.value))
                if (dt) selectDT(dt)
              }}
            >
              {dts.map(d => (
                <option key={d.DTID} value={d.DTID}>
                  {d.DTNumber} — {d.Status}
                </option>
              ))}
            </select>
          )}
        </div>
        {canEdit && (
          <button onClick={handleNewDT} className="btn-secondary text-xs py-1.5">
            <Plus size={13} /> New DT
          </button>
        )}
        {activeDT && canEdit && (
          <button onClick={handleSave} disabled={saving} className="btn-primary text-xs py-1.5 ml-auto">
            {saving ? <><Spinner size="sm" /> Saving…</> : <><Save size={13} /> Save DT</>}
          </button>
        )}
      </div>

      {/* No DT warning */}
      {dts.length === 0 && (
        <div className="card p-4 border-amber-200 bg-amber-50 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            <strong>No Delivery Ticket Generated Yet:</strong> Equipment is currently in yard (Emdad Base).
            Go to the <strong>Checklist Header</strong> tab, select your tools and click
            "Generate DT from Checklist" to dispatch to Rig <strong>{job.Rig}</strong>.
          </p>
        </div>
      )}

      {activeDT && (
        <>
          {/* DT Manifest Header */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-gray-800">Rental Ticket / Delivery Manifest</h3>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Ticket No:</span>
                <span className={`badge text-xs ${
                  activeDT.Status === 'Approved' ? 'bg-green-100 text-green-700'
                  : activeDT.Status === 'Draft' ? 'bg-orange-100 text-orange-700'
                  : 'bg-blue-100 text-blue-700'
                }`}>{activeDT.DTNumber}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="label">Customer</label>
                <input className="input py-1.5 text-xs bg-gray-50" value={job.Client || ''} readOnly />
              </div>
              <div>
                <label className="label">Project No</label>
                <input className="input py-1.5 text-xs bg-gray-50" value={job.Contract || ''} readOnly />
              </div>
              <div>
                <label className="label">Sub-Division</label>
                <input className="input py-1.5 text-xs bg-gray-50" value="RENTALS" readOnly />
              </div>
              <div>
                <label className="label">Purpose</label>
                <input className="input py-1.5 text-xs bg-gray-50" value="Downhole Rentals" readOnly />
              </div>
              <div>
                <label className="label">Rig</label>
                <input className="input py-1.5 text-xs bg-gray-50" value={job.Rig || ''} readOnly />
              </div>
              <div>
                <label className="label">Job Number</label>
                <input className="input py-1.5 text-xs bg-gray-50" value={jobId} readOnly />
              </div>
              <div>
                <label className="label">Date Shipped</label>
                <input type="date" className="input py-1.5 text-xs"
                  value={form.DTDate}
                  onChange={e => setForm(p => ({ ...p, DTDate: e.target.value }))}
                  disabled={!canEdit} />
              </div>
              <div>
                <label className="label">RM Ref / Manifest</label>
                <input className="input py-1.5 text-xs"
                  value={form.RMRef}
                  onChange={e => setForm(p => ({ ...p, RMRef: e.target.value }))}
                  placeholder="MR-XXXX"
                  disabled={!canEdit} />
              </div>
              <div>
                <label className="label">RM Date</label>
                <input type="date" className="input py-1.5 text-xs"
                  value={form.RMDate}
                  onChange={e => setForm(p => ({ ...p, RMDate: e.target.value }))}
                  disabled={!canEdit} />
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input py-1.5 text-xs"
                  value={form.Status}
                  onChange={e => setForm(p => ({ ...p, Status: e.target.value }))}
                  disabled={!canEdit}>
                  {DT_STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Tool Lines Table */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 text-sm font-medium text-gray-700">
              Dispatched Tools — {lines.length} item(s)
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th">#</th>
                  <th className="table-th">Serial / Asset</th>
                  <th className="table-th">Description</th>
                  <th className="table-th text-center">Qty</th>
                  <th className="table-th">Notes</th>
                  {canEdit && <th className="table-th"></th>}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 6 : 5} className="table-td text-center py-8 text-gray-400">
                      No tools on this delivery ticket yet.
                    </td>
                  </tr>
                ) : (
                  lines.map((line, idx) => (
                    <tr key={line.LineID} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="table-td text-gray-500">{idx + 1}</td>
                      <td className="table-td font-medium text-gray-900">{line.AssetNo || '—'}</td>
                      <td className="table-td text-gray-700">{line.ToolDescription}</td>
                      <td className="table-td text-center">{line.Quantity}</td>
                      <td className="table-td text-gray-400 text-xs">{line.Notes || '—'}</td>
                      {canEdit && (
                        <td className="table-td">
                          <button
                            onClick={() => removeLine(line.LineID)}
                            className="text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 3 Logistics Sections */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Warehouse & Operations Dispatch */}
            <div className="card p-4">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">
                1. Warehouse & Operations Dispatch
              </h4>
              <div className="space-y-2">
                <div>
                  <label className="label">Dispatched By</label>
                  <input className="input text-xs py-1.5"
                    value={form.DispatchedBy}
                    onChange={e => setForm(p => ({ ...p, DispatchedBy: e.target.value }))}
                    placeholder="Full name"
                    disabled={!canEdit} />
                </div>
                <div>
                  <label className="label">Designation</label>
                  <input className="input text-xs py-1.5"
                    value={form.Designation}
                    onChange={e => setForm(p => ({ ...p, Designation: e.target.value }))}
                    placeholder="e.g. Workshop Coordinator"
                    disabled={!canEdit} />
                </div>
                <div>
                  <label className="label">Dispatch Date</label>
                  <input type="date" className="input text-xs py-1.5"
                    value={form.DispatchDate}
                    onChange={e => setForm(p => ({ ...p, DispatchDate: e.target.value }))}
                    disabled={!canEdit} />
                </div>
              </div>
            </div>

            {/* 2. Destination & Marine Logistics */}
            <div className="card p-4">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">
                2. Destination & Marine Logistics
              </h4>
              <div className="space-y-2">
                <div>
                  <label className="label">Delivered To</label>
                  <input className="input text-xs py-1.5"
                    value={form.DeliveredTo}
                    onChange={e => setForm(p => ({ ...p, DeliveredTo: e.target.value }))}
                    placeholder="e.g. Esnad Jetty / Yard 08"
                    disabled={!canEdit} />
                </div>
                <div>
                  <label className="label">Vessel / Boat</label>
                  <input className="input text-xs py-1.5"
                    value={form.Vessel}
                    onChange={e => setForm(p => ({ ...p, Vessel: e.target.value }))}
                    placeholder="e.g. Zakher Star / Marsol"
                    disabled={!canEdit} />
                </div>
                <div>
                  <label className="label">Transport</label>
                  <input className="input text-xs py-1.5"
                    value={form.Transport}
                    onChange={e => setForm(p => ({ ...p, Transport: e.target.value }))}
                    placeholder="e.g. Emdad Logistics"
                    disabled={!canEdit} />
                </div>
              </div>
            </div>

            {/* 3. Haulage & Driver Details */}
            <div className="card p-4">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3">
                3. Haulage & Driver Details
              </h4>
              <div className="space-y-2">
                <div>
                  <label className="label">Vehicle No</label>
                  <input className="input text-xs py-1.5"
                    value={form.VehicleNo}
                    onChange={e => setForm(p => ({ ...p, VehicleNo: e.target.value }))}
                    placeholder="e.g. 54912 / 70136 AD"
                    disabled={!canEdit} />
                </div>
                <div>
                  <label className="label">Driver Name</label>
                  <input className="input text-xs py-1.5"
                    value={form.DriverName}
                    onChange={e => setForm(p => ({ ...p, DriverName: e.target.value }))}
                    placeholder="Driver full name"
                    disabled={!canEdit} />
                </div>
                <div>
                  <label className="label">Contact No</label>
                  <input className="input text-xs py-1.5"
                    value={form.ContactNo}
                    onChange={e => setForm(p => ({ ...p, ContactNo: e.target.value }))}
                    placeholder="e.g. +971 50 123 4567"
                    disabled={!canEdit} />
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                📋 Delivery Ticket Notes & Manifest Remarks
                <span className="normal-case font-normal ml-1 text-gray-400">(Slings, Protectors, Non-Invoiced Spares, Baskets)</span>
              </h4>
              <span className="text-xs text-gray-400 italic">Prints directly on Delivery Ticket Form DSF-001 under "Notes"</span>
            </div>
            <textarea
              className="input text-xs py-2 min-h-20 resize-y"
              value={form.Notes}
              onChange={e => setForm(p => ({ ...p, Notes: e.target.value }))}
              placeholder="Enter items with no invoicing value to print on the DT (e.g. 2 nos 3-meter lifting slings, 4 shackles, thread protectors, basket #EMD-04, spare O-rings)…"
              disabled={!canEdit}
            />
            <p className="text-xs text-gray-400 text-right mt-1 italic">
              Saves when you click Save DT above
            </p>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Return Ticket Tab ─────────────────────────────────────────────────────────

function ReturnTicketTab({
  jobId,
  job,
}: {
  jobId: string
  job: Partial<Job>
}) {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canEdit = hasRole('Admin', 'Operations')

  const [rts,       setRts]      = useState<RTRecord[]>([])
  const [activeRT,  setActiveRT] = useState<RTRecord | null>(null)
  const [lines,     setLines]    = useState<RTLine[]>([])
  const [loading,   setLoading]  = useState(true)
  const [saving,    setSaving]   = useState(false)
  const [form, setForm] = useState({
    RTDate: new Date().toISOString().split('T')[0],
    Status: 'Draft',
    Notes:  '',
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [adding,      setAdding]    = useState(false)

  const loadRTs = useCallback(async () => {
    setLoading(true)
    try {
      // Filtered server-side, as with the DT tab — this pulled all 3,451
      // receiving tickets to find the handful on this job.
      const jobRTs = await api.get<RTRecord[]>(`/receiving-tickets?job=${encodeURIComponent(jobId)}`)
      setRts(jobRTs)
      if (jobRTs.length > 0) selectRT(jobRTs[0])
    } catch {
      showToast('Failed to load return tickets', 'error')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => { loadRTs() }, [loadRTs])

  async function selectRT(rt: RTRecord) {
    setActiveRT(rt)
    setForm({ RTDate: rt.RTDate?.split('T')[0] || '', Status: rt.Status || 'Draft', Notes: rt.Notes || '' })
    try {
      const ln = await api.get<RTLine[]>(`/receiving-tickets/${rt.RTID}/lines`)
      setLines(ln)
    } catch {
      setLines([])
    }
  }

  async function handleSave() {
    if (!activeRT) return
    setSaving(true)
    try {
      await api.put(`/receiving-tickets/${activeRT.RTID}`, form)
      showToast('Return ticket saved', 'success')
      loadRTs()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleNewRT() {
    try {
      const res = await api.post<{ RTID: number; RTNumber: string }>('/receiving-tickets', {
        JobID:  jobId,
        RTDate: new Date().toISOString().split('T')[0],
      })
      showToast(`${res.RTNumber} created`, 'success')
      loadRTs()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create RT', 'error')
    }
  }

  async function removeLine(lineId: number) {
    if (!activeRT) return
    try {
      await api.delete(`/receiving-tickets/${activeRT.RTID}/lines/${lineId}`)
      setLines(prev => prev.filter(l => l.LineID !== lineId))
      showToast('Line removed', 'success')
    } catch {
      showToast('Failed to remove line', 'error')
    }
  }

  async function handleInsertTools(invItems: InvItem[]) {
    if (!activeRT) return
    setAdding(true)
    try {
      await Promise.all(invItems.map(inv =>
        api.post(`/receiving-tickets/${activeRT.RTID}/lines`, {
          SystemID:        inv.SystemID,        // real Inventory join key — resolved to AssetNo on GET
          ToolDescription: inv.ShortDesc,
          SizeName:        inv.Size,
          Quantity:        1,
          Condition:       inv.Status || 'Good',
          UsedStatus:      'Used',
        })
      ))
      const ln = await api.get<RTLine[]>(`/receiving-tickets/${activeRT.RTID}/lines`)
      setLines(ln)
      setPickerOpen(false)
      showToast(`${invItems.length} tool(s) added to ${activeRT.RTNumber}`, 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add tool(s)', 'error')
    } finally {
      setAdding(false)
    }
  }

  if (loading) return (
    <div className="card p-12 flex items-center justify-center">
      <Spinner size="md" />
    </div>
  )

  return (
    <div className="space-y-4">
      {/* RT Selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Select Return Ticket:</span>
          {rts.length === 0 ? (
            <span className="text-sm text-gray-400 italic">No RT Generated</span>
          ) : (
            <select
              className="input py-1.5 text-sm w-auto"
              value={activeRT?.RTID || ''}
              onChange={e => {
                const rt = rts.find(r => r.RTID === Number(e.target.value))
                if (rt) selectRT(rt)
              }}
            >
              {rts.map(r => (
                <option key={r.RTID} value={r.RTID}>
                  {r.RTNumber} — {r.Status}
                </option>
              ))}
            </select>
          )}
        </div>
        {canEdit && (
          <button onClick={handleNewRT} className="btn-secondary text-xs py-1.5">
            <Plus size={13} /> New RT
          </button>
        )}
        {activeRT && canEdit && (
          <button onClick={handleSave} disabled={saving} className="btn-primary text-xs py-1.5 ml-auto">
            {saving ? <><Spinner size="sm" /> Saving…</> : <><Save size={13} /> Save RT</>}
          </button>
        )}
      </div>

      {rts.length === 0 && (
        <div className="card p-4 border-amber-200 bg-amber-50 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            <strong>No Return Ticket Yet:</strong> Once equipment returns from Rig <strong>{job.Rig}</strong>,
            click <strong>"+ New RT"</strong> above to log the receipt and route each tool
            (back to yard, to inspection, or to maintenance).
          </p>
        </div>
      )}

      {activeRT && (
        <>
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-gray-800">Return / Receiving Manifest</h3>
              <span className="badge text-xs bg-blue-100 text-blue-700">{activeRT.RTNumber}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="label">Job Number</label>
                <input className="input py-1.5 text-xs bg-gray-50" value={jobId} readOnly />
              </div>
              <div>
                <label className="label">Linked DT</label>
                <input className="input py-1.5 text-xs bg-gray-50" value={activeRT.LinkedDT || '—'} readOnly />
              </div>
              <div>
                <label className="label">Receiving Date</label>
                <input type="date" className="input py-1.5 text-xs"
                  value={form.RTDate}
                  onChange={e => setForm(p => ({ ...p, RTDate: e.target.value }))}
                  disabled={!canEdit} />
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input py-1.5 text-xs"
                  value={form.Status}
                  onChange={e => setForm(p => ({ ...p, Status: e.target.value }))}
                  disabled={!canEdit}>
                  {RT_STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3">
              <label className="label">Notes</label>
              <textarea
                className="input text-xs py-2 min-h-16 resize-y"
                value={form.Notes}
                onChange={e => setForm(p => ({ ...p, Notes: e.target.value }))}
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 text-sm font-medium text-gray-700 flex items-center justify-between">
              <span>Returned Tools — {lines.length} item(s)</span>
              {canEdit && (
                <button
                  onClick={() => setPickerOpen(true)}
                  disabled={adding}
                  className="btn-primary text-xs py-1.5 disabled:opacity-40"
                >
                  <Plus size={13} /> Add Tool
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th">#</th>
                  <th className="table-th">Serial / Asset</th>
                  <th className="table-th">Description</th>
                  <th className="table-th text-center">Qty</th>
                  <th className="table-th">Condition</th>
                  <th className="table-th">Routed To</th>
                  <th className="table-th">Notes</th>
                  {canEdit && <th className="table-th"></th>}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 8 : 7} className="table-td text-center py-8 text-gray-400">
                      No tools returned on this ticket yet.
                    </td>
                  </tr>
                ) : (
                  lines.map((line, idx) => (
                    <tr key={line.LineID} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="table-td text-gray-500">{idx + 1}</td>
                      <td className="table-td font-medium text-gray-900">{line.AssetNo || '—'}</td>
                      <td className="table-td text-gray-700">{line.ToolDescription}</td>
                      <td className="table-td text-center">{line.Quantity}</td>
                      <td className="table-td"><span className="text-green-600 text-xs">{line.Condition || '—'}</span></td>
                      <td className="table-td text-gray-500 text-xs">{line.RoutedTo || '—'}</td>
                      <td className="table-td text-gray-400 text-xs">{line.Notes || '—'}</td>
                      {canEdit && (
                        <td className="table-td">
                          <button
                            onClick={() => removeLine(line.LineID)}
                            className="text-gray-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pickerOpen && activeRT && (
        <ToolPickerModal
          jobId={jobId}
          existingAssetNos={new Set(lines.map(l => l.AssetNo).filter((a): a is string => Boolean(a)))}
          onInsert={handleInsertTools}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Utilization Tab ────────────────────────────────────────────────────────────

function UtilizationTab({ jobId }: { jobId: string }) {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canEdit = hasRole('Admin', 'Operations')

  const today = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [rows,    setRows]    = useState<UtilRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(0)

  const daysInMonth = new Date(year, month, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const monthName = new Date(year, month - 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })

  const dayOf = (d: number) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  /**
   * A day can only be marked between the tool going out on its delivery ticket
   * and coming back on the matching receiving ticket. A tool that hasn't
   * returned is open-ended up to today — nothing can be marked in the future.
   */
  const inWindow = useCallback((row: UtilRow, d: number) => {
    const day = dayOf(d)
    const out = (row.dateOut || '').slice(0, 10)
    const back = (row.dateIn || '').slice(0, 10)
    const cap = new Date().toISOString().slice(0, 10)
    if (!out) return false
    if (day < out) return false
    if (back) return day <= back
    return day <= cap
  }, [year, month])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const normJobId = normalizeJobId(jobId)

      /*
       * The dispatch cycles come straight from /api/tool-history, which already
       * returns one row per DT line paired with its matching RT — exactly the
       * DT->RT cycle this sheet charges against, with the two dates on it.
       *
       * This replaces fetching all 3,700 delivery tickets and then every one
       * of their line sets on each month change, which is what made this tab
       * appear not to work at all.
       */
      const [cycles, logs] = await Promise.all([
        api.get<ToolMovement[]>(`/tool-history?job=${encodeURIComponent(jobId)}&limit=2000`)
          .catch(() => [] as ToolMovement[]),
        api.get<{ rows: (UtilRow & { jobId: string })[] }>(`/utilization?year=${year}&month=${month}`)
          .catch(() => ({ rows: [] })),
      ])

      const marks = new Map<string, Record<number, UtilCell>>()
      for (const r of (logs.rows || [])) {
        if (normalizeJobId(r.jobId) !== normJobId) continue
        marks.set(`${r.dtNumber ?? ''}|${String(r.toolId ?? '')}`, r.days)
      }

      const built: UtilRow[] = (cycles || []).map(c => {
        const serial = c.Serial ?? c.PartNo ?? null
        const key = `${c.TicketNo ?? ''}|${String(serial ?? '')}`
        return {
          label: [c.PartNo || serial, c.Description].filter(Boolean).join(' – ') || String(serial ?? ''),
          toolId: serial,
          dtNumber: c.TicketNo ?? null,
          dateOut: c.DateOut ?? null,
          dateIn: c.DateIn ?? null,
          assetNo: c.PartNo ?? null,
          size: c.Size ?? null,
          days: marks.get(key) || {},
        }
      })

      // Newest dispatch first, so the run being worked on is at the top.
      built.sort((a, b) => String(b.dateOut || '').localeCompare(String(a.dateOut || '')))
      setRows(built)
    } catch {
      showToast('Failed to load utilization', 'error')
    } finally {
      setLoading(false)
    }
  }, [jobId, year, month])

  useEffect(() => { load() }, [load])

  /**
   * Typed entry, not click-cycling: '1' for operating, 'S' for standby,
   * anything else clears the day. The cursor stays busy until the write lands,
   * so a typed day is never silently lost.
   */
  async function setCell(rowIdx: number, day: number, raw: string) {
    if (!canEdit) return
    const row = rows[rowIdx]
    if (!inWindow(row, day)) return

    const v = (raw || '').trim().toUpperCase()
    const code: '1' | 'S' | null = v === '1' ? '1' : v === 'S' ? 'S' : null
    const current = row.days[day]
    if (current && current.code === code) return

    const apply = (next: UtilCell | null) =>
      setRows(prev => prev.map((r, i) => {
        if (i !== rowIdx) return r
        const d = { ...r.days }
        if (next) d[day] = next
        else delete d[day]
        return { ...r, days: d }
      }))

    setSaving(n => n + 1)
    document.body.style.cursor = 'wait'
    try {
      if (!code && current) {
        await api.delete(`/utilization/${current.logId}`)
        apply(null)
      } else if (code && !current) {
        const res = await api.post<{ LogID: number }>('/utilization', {
          JobID: jobId,
          DTNumber: row.dtNumber,   // keys the revenue rollup — must be stored
          ToolID: row.toolId,
          LogDate: dayOf(day),
          UtilizationCode: code,
        })
        apply({ code, logId: res.LogID })
      } else if (code && current) {
        await api.put(`/utilization/${current.logId}`, { UtilizationCode: code })
        apply({ code, logId: current.logId })
      }
    } catch {
      showToast('Failed to save — try again', 'error')
    } finally {
      document.body.style.cursor = ''
      setSaving(n => n - 1)
    }
  }

  /** Arrow keys and Enter move through the sheet like a spreadsheet. */
  function onKey(e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, day: number) {
    const go = (r: number, d: number) => {
      const el = document.querySelector<HTMLInputElement>(`[data-util="${r}-${d}"]`)
      if (el) { el.focus(); el.select() }
    }
    if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(rowIdx, day + 1) }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); go(rowIdx, day - 1) }
    else if (e.key === 'ArrowDown')  { e.preventDefault(); go(rowIdx + 1, day) }
    else if (e.key === 'ArrowUp')    { e.preventDefault(); go(rowIdx - 1, day) }
  }

  function prevMonth() { if (month === 1) { setYear(y => y - 1); setMonth(12) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 12) { setYear(y => y + 1); setMonth(1) } else setMonth(m => m + 1) }

  const totals = rows.reduce((a, r) => {
    for (const d of Object.values(r.days)) {
      if (d.code === '1') a.ops++
      else if (d.code === 'S') a.sb++
    }
    return a
  }, { ops: 0, sb: 0 })

  if (loading) return (
    <div className="bg-white border border-gray-300 rounded py-12 flex items-center justify-center">
      <Spinner size="md" />
    </div>
  )

  return (
    <div className="flex flex-col gap-1.5">
      <div className="screen-bar">
        <div className="flex items-center gap-0.5 border border-gray-300 rounded bg-white">
          <button onClick={prevMonth} className="px-1.5 h-[24px] hover:bg-gray-100">‹</button>
          <span className="text-[12px] font-semibold px-2 min-w-[130px] text-center">{monthName}</span>
          <button onClick={nextMonth} className="px-1.5 h-[24px] hover:bg-gray-100">›</button>
        </div>
        <span className="text-[11px] text-gray-500">
          {rows.length} dispatch cycle{rows.length === 1 ? '' : 's'} · {totals.ops} operating · {totals.sb} standby
        </span>
        {saving > 0 && <span className="text-[11px] text-amber-700 font-semibold">Saving…</span>}
        {!canEdit && <span className="text-[11px] text-gray-400 italic">View only</span>}
        <span className="ml-auto text-[10px] text-gray-400">
          Type <strong>1</strong> operating or <strong>S</strong> standby. Only days between the DT and RT dates accept entry.
        </span>
      </div>

      <div className="bg-white border border-gray-300 rounded overflow-auto">
        <table className="text-[11px] border-collapse" style={{ minWidth: `${340 + daysInMonth * 24}px` }}>
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="table-th sticky left-0 z-30 bg-navy-head w-[150px]">Tool</th>
              <th className="table-th">DT No</th>
              <th className="table-th">Out</th>
              <th className="table-th">In</th>
              {days.map(d => (
                <th key={d} className="table-th !px-0 w-6 text-center">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={daysInMonth + 4} className="table-td text-center text-gray-400 py-10">
                  No tools have been dispatched on this job yet, so there is nothing to charge.
                </td>
              </tr>
            ) : (
              rows.map((row, rowIdx) => (
                <tr key={`${row.dtNumber}-${row.toolId}-${rowIdx}`} className="border-b border-gray-100">
                  <td className="table-td sticky left-0 z-10 bg-white font-medium truncate max-w-[150px]"
                      title={row.label}>
                    {row.label}
                  </td>
                  <td className="table-td font-mono text-gray-500">{row.dtNumber || '—'}</td>
                  <td className="table-td text-gray-500">{(row.dateOut || '').slice(0, 10) || '—'}</td>
                  <td className="table-td text-gray-500">
                    {(row.dateIn || '').slice(0, 10) || <span className="text-amber-600">on rig</span>}
                  </td>
                  {days.map(d => {
                    const cell = row.days[d]
                    const open = inWindow(row, d)
                    return (
                      <td key={d}
                          className={`p-0 border-l border-gray-100 ${open ? '' : 'bg-gray-100'}`}>
                        <input
                          data-util={`${rowIdx}-${d}`}
                          className={`w-6 h-[22px] text-center text-[11px] font-bold border-0 bg-transparent
                                      focus:outline-none focus:ring-1 focus:ring-brand-500
                                      ${cell?.code === '1' ? 'text-blue-700' : ''}
                                      ${cell?.code === 'S' ? 'text-amber-700' : ''}
                                      ${open ? '' : 'cursor-not-allowed'}`}
                          value={cell?.code ?? ''}
                          maxLength={1}
                          disabled={!canEdit || !open}
                          title={open ? undefined : 'Outside this tool’s DT–RT window'}
                          onChange={e => setCell(rowIdx, d, e.target.value)}
                          onFocus={e => e.target.select()}
                          onKeyDown={e => onKey(e, rowIdx, d)}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
function jobPicker({
  field, list, required, value, onChange, disabled,
}: {
  field: keyof Job
  list?: string[]
  required?: boolean
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  disabled: boolean
}) {
  const id = `dl-${String(field)}`
  return (
    <React.Fragment key={String(field)}>
      <span className="field-label">
        {String(field).replace(/([A-Z])/g, ' $1').trim()}{required ? ' *' : ''}
      </span>
      <input
        className="field-input"
        list={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        autoComplete="off"
      />
      <datalist id={id}>
        {(list || []).map(v => <option key={v} value={v} />)}
      </datalist>
    </React.Fragment>
  )
}

function JobHeaderTab({
  form,
  set,
  canEdit,
  isNew,
}: {
  form: Partial<Job>
  set: (f: keyof Job, v: unknown) => void
  canEdit: boolean
  isNew: boolean
}) {
  const f = (field: keyof Job) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      set(field, e.target.value)

  // The values actually in use across the 3,824 jobs. Client, rig, well,
  // contract and service type were free-text boxes, which is how one rig ends
  // up spelled three ways and the executive dashboard can't group by anything.
  const { data: facets } = useFetch<{
    Client: string[]; Rig: string[]; Well: string[]
    Contract: string[]; ServiceType: string[]
  }>('/jobs?facets=1')

  const picker = (field: keyof Job, list?: string[], required?: boolean) =>
    jobPicker({ field, list, required, value: (form[field] as string) || '', onChange: f(field), disabled: !canEdit })

  return (
    <div className="space-y-1.5">
      {/*
        One dense block in place of three p-5 cards. Sixteen fields took about
        450px of a screen that also has to show seven tabs of content; the old
        job screen fits its header into roughly 80px.
      */}
      <div
        className="field-row bg-white border border-gray-300 rounded px-2 py-1.5
                   grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_auto_1fr] xl:grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto_1fr]"
      >
        {!isNew && (
          <>
            <span className="field-label">Job No</span>
            <div className="field-value font-mono">{form.JobID || ''}</div>
          </>
        )}

        {picker('Client',      facets?.Client,      true)}
        {picker('Rig',         facets?.Rig,         true)}
        {picker('Well',        facets?.Well)}
        {picker('Contract',    facets?.Contract)}
        {picker('ServiceType', facets?.ServiceType)}

        <span className="field-label">PO Number</span>
        <input className="field-input" value={form.PONumber || ''} onChange={f('PONumber')} disabled={!canEdit} />

        <span className="field-label">Client Ref</span>
        <input className="field-input" value={form.ClientRef || ''} onChange={f('ClientRef')} disabled={!canEdit} />

        <span className="field-label">ERP Ref</span>
        <input className="field-input" value={form.ERPRef || ''} onChange={f('ERPRef')} disabled={!canEdit} />

        <span className="field-label">Status</span>
        <select className="field-input" value={form.Status || 'Open'} onChange={f('Status')} disabled={!canEdit}>
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>

        <span className="field-label">Invoicing</span>
        <select className="field-input" value={form.InvoicingType || 'PerJob'} onChange={f('InvoicingType')} disabled={!canEdit}>
          {INVOICING_OPTS.map(o => <option key={o}>{o}</option>)}
        </select>

        <span className="field-label">Currency</span>
        <select className="field-input" value={form.Currency || 'USD'} onChange={f('Currency')} disabled={!canEdit}>
          {CURRENCY_OPTS.map(c => <option key={c}>{c}</option>)}
        </select>

        <span className="field-label">Job Value</span>
        <input type="number" className="field-input text-right" value={form.InvoiceAmount || ''}
               onChange={f('InvoiceAmount')} disabled={!canEdit} placeholder="0.00" />

        <span className="field-label">Mob Date</span>
        <input type="date" className="field-input" value={toDateInput(form.MobDate)}
               onChange={f('MobDate')} disabled={!canEdit} />

        <span className="field-label">Demob Date</span>
        <input type="date" className="field-input" value={toDateInput(form.DemobDate)}
               onChange={f('DemobDate')} disabled={!canEdit} />

        <span className="field-label">Fiscal Year</span>
        <input className="field-input" value={form.FiscalYear || ''} onChange={f('FiscalYear')}
               disabled={!canEdit} placeholder="2026" />
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Remarks</h3>
        <textarea
          className="input min-h-20 resize-y"
          value={form.Notes || ''}
          onChange={f('Notes')}
          disabled={!canEdit}
          placeholder="Job remarks, special instructions…"
        />
      </div>
    </div>
  )
}

// ─── Placeholder Tab ──────────────────────────────────────────────────────────

/**
 * Technical Details — was a "Coming in next build phase" placeholder.
 *
 * Every field here is a real tbl_Jobs column that the job PUT already writes
 * and that nothing in the app could previously reach: the hole section, and
 * the whole job lifecycle from first dispatch through to the legal invoice.
 * HoleSection is blank on 3,819 of 3,824 jobs, which is exactly why it needs
 * somewhere to be entered.
 */
function TechnicalTab({
  form, set, canEdit,
}: {
  form: Partial<Job>
  set: (f: keyof Job, v: unknown) => void
  canEdit: boolean
}) {
  const f = (field: keyof Job) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      set(field, e.target.value)

  const txt = (field: keyof Job, label: string) => (
    <React.Fragment key={String(field)}>
      <span className="field-label">{label}</span>
      <input className="field-input" value={(form[field] as string) || ''}
             onChange={f(field)} disabled={!canEdit} />
    </React.Fragment>
  )
  const date = (field: keyof Job, label: string) => (
    <React.Fragment key={String(field)}>
      <span className="field-label">{label}</span>
      <input type="date" className="field-input" value={toDateInput(form[field] as string)}
             onChange={f(field)} disabled={!canEdit} />
    </React.Fragment>
  )
  const money = (field: keyof Job, label: string) => (
    <React.Fragment key={String(field)}>
      <span className="field-label">{label}</span>
      <input type="number" className="field-input text-right" value={(form[field] as number) ?? ''}
             onChange={f(field)} disabled={!canEdit} placeholder="0.00" />
    </React.Fragment>
  )

  const grid = 'field-row px-2 py-1.5 grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_auto_1fr] xl:grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto_1fr]'

  return (
    <div className="space-y-1.5">
      <div className="bg-white border border-gray-300 rounded">
        <div className="px-2 h-[22px] flex items-center bg-gray-100 border-b border-gray-300
                        text-[10px] font-bold uppercase tracking-wider text-gray-600">
          Well &amp; Hole
        </div>
        <div className={grid}>
          {txt('HoleSection', 'Hole Section')}
          {txt('ServiceType', 'Service Type')}
          {txt('Rig', 'Rig')}
          {txt('Well', 'Well')}
        </div>
      </div>

      <div className="bg-white border border-gray-300 rounded">
        <div className="px-2 h-[22px] flex items-center bg-gray-100 border-b border-gray-300
                        text-[10px] font-bold uppercase tracking-wider text-gray-600">
          Job Lifecycle
        </div>
        <div className={grid}>
          {date('FirstDtDate', 'First DT')}
          {date('LastRtDate', 'Last RT')}
          {date('DocsSignedDate', 'Docs Signed')}
          {date('SubmittedToBillingDate', 'To Billing')}
          {date('DraftInvoicedDate', 'Draft Invoiced')}
          {txt('DraftInvoiceNumber', 'Draft Inv No')}
          {date('SesSubmittedDate', 'SES Submitted')}
          {txt('SesNumber', 'SES No')}
          {date('FinalInvoicedDate', 'Final Invoiced')}
          {txt('LegalInvoiceNumber', 'Legal Inv No')}
          {date('InvoiceDate', 'Invoice Date')}
        </div>
      </div>

      <div className="bg-white border border-gray-300 rounded">
        <div className="px-2 h-[22px] flex items-center bg-gray-100 border-b border-gray-300
                        text-[10px] font-bold uppercase tracking-wider text-gray-600">
          Values
        </div>
        <div className={grid}>
          {money('InvoiceAmount', 'Job Value')}
          {money('NetInvoiceAmount', 'Net Invoice')}
          {money('NetSubcontract', 'Net Subcontract')}
        </div>
      </div>
    </div>
  )
}

/** Roles offered for crew. Free text stays possible via the datalist. */
const CREW_ROLES = [
  'Supervisor', 'Tool Pusher', 'Fishing Supervisor', 'Operator',
  'Technician', 'Rigger', 'Workshop Coordinator', 'Engineer',
] as const

/**
 * Manpower / Crew — was a placeholder. tbl_JobPersonnel and its GET/POST/
 * DELETE endpoints already existed; only the screen was missing, so crew
 * could never be recorded against a job.
 */
function ManpowerTab({ jobId, canEdit }: { jobId: string; canEdit: boolean }) {
  const { showToast } = useToast()
  const { data: crew, isLoading, refetch } =
    useFetch<Array<Record<string, unknown>>>(`/jobs/${jobId}/personnel`)

  const blank = { Name: '', Role: '', MobDate: '', DemobDate: '', Notes: '' }
  const [draft, setDraft] = useState(blank)
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!draft.Name.trim()) { showToast('Name is required', 'error'); return }
    setBusy(true)
    document.body.style.cursor = 'wait'
    try {
      await api.post(`/jobs/${jobId}/personnel`, draft)
      setDraft(blank)
      showToast('Crew member added', 'success')
      refetch()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add crew member', 'error')
    } finally {
      document.body.style.cursor = ''
      setBusy(false)
    }
  }

  const remove = async (pid: unknown, name: unknown) => {
    if (!window.confirm(`Remove ${name || 'this crew member'} from the job?`)) return
    try {
      await api.delete(`/jobs/${jobId}/personnel/${pid}`)
      showToast('Removed', 'success')
      refetch()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to remove', 'error')
    }
  }

  const str = (v: unknown) => (v == null || v === '' ? '—' : String(v))

  return (
    <div className="space-y-1.5">
      {canEdit && (
        <div className="bg-white border border-gray-300 rounded">
          <div className="px-2 h-[22px] flex items-center bg-gray-100 border-b border-gray-300
                          text-[10px] font-bold uppercase tracking-wider text-gray-600">
            Add crew member
          </div>
          <div className="field-row px-2 py-1.5 grid-cols-[auto_1fr] lg:grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto_1fr_auto]">
            <span className="field-label">Name *</span>
            <input className="field-input" value={draft.Name}
                   onChange={e => setDraft(d => ({ ...d, Name: e.target.value }))} />

            <span className="field-label">Role</span>
            <input className="field-input" list="dl-crew-role" value={draft.Role}
                   onChange={e => setDraft(d => ({ ...d, Role: e.target.value }))} />
            <datalist id="dl-crew-role">
              {CREW_ROLES.map(r => <option key={r} value={r} />)}
            </datalist>

            <span className="field-label">Mob</span>
            <input type="date" className="field-input" value={draft.MobDate}
                   onChange={e => setDraft(d => ({ ...d, MobDate: e.target.value }))} />

            <span className="field-label">Demob</span>
            <input type="date" className="field-input" value={draft.DemobDate}
                   onChange={e => setDraft(d => ({ ...d, DemobDate: e.target.value }))} />

            <button className="btn-accent" onClick={add} disabled={busy || !draft.Name.trim()}>
              {busy ? <Spinner size="sm" /> : <Plus size={12} />} Add
            </button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-300 rounded overflow-hidden">
        <div className="px-2 h-[22px] flex items-center bg-gray-100 border-b border-gray-300
                        text-[10px] font-bold uppercase tracking-wider text-gray-600">
          Crew on this job ({crew?.length ?? 0})
        </div>
        {isLoading ? (
          <div className="py-8 flex justify-center"><Spinner size="md" /></div>
        ) : !crew?.length ? (
          <div className="py-8 text-center text-gray-400 text-xs">
            No crew recorded against this job yet.
          </div>
        ) : (
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr>
                <th className="table-th">Name</th>
                <th className="table-th">Role</th>
                <th className="table-th">Mob Date</th>
                <th className="table-th">Demob Date</th>
                <th className="table-th">Notes</th>
                {canEdit && <th className="table-th w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {crew.map((p, i) => (
                <tr key={String(p.id ?? i)} className="border-b border-gray-100 hover:bg-brand-50/40">
                  <td className="table-td font-medium">{str(p.Name)}</td>
                  <td className="table-td text-gray-600">{str(p.Role)}</td>
                  <td className="table-td text-gray-500">{toDateInput(p.MobDate as string) || '—'}</td>
                  <td className="table-td text-gray-500">{toDateInput(p.DemobDate as string) || '—'}</td>
                  <td className="table-td text-gray-500">{str(p.Notes)}</td>
                  {canEdit && (
                    <td className="table-td">
                      <button onClick={() => remove(p.id, p.Name)}
                              className="text-gray-300 hover:text-red-500" title="Remove">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="card p-12 text-center">
      <Wrench size={32} className="mx-auto text-gray-300 mb-3" />
      <p className="text-gray-400 text-sm font-medium">{label}</p>
      <p className="text-gray-300 text-xs mt-1">Coming in next build phase</p>
    </div>
  )
}

// ─── Main: Job File Workspace ─────────────────────────────────────────────────

export function JobDetailView() {
  const { id }      = useParams<{ id: string }>()
  const navigate    = useNavigate()
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const isNew       = id === 'new'

  const [tab,     setTab]     = useState<Tab>('header')
  const [saving,  setSaving]  = useState(false)
  const [form,    setForm]    = useState<Partial<Job>>({
    Status: 'Open', Currency: 'USD', InvoicingType: 'PerJob',
  })
  // Checklist lives here so it persists across tab switches
  const [checklist,    setChecklist]    = useState<ChecklistItem[]>([])
  // When DT is generated, store its ID so DT tab auto-focuses it
  const [generatedDTID, setGeneratedDTID] = useState<number | null>(null)

  const { data: job, isLoading } = useFetch<Job>(isNew ? null : `/jobs/${id}`)

  useEffect(() => {
    if (job) setForm(job)
  }, [job])

  const canEdit = hasRole('Admin', 'Operations')

  function set(field: keyof Job, value: unknown) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!canEdit) return
    setSaving(true)
    document.body.style.cursor = 'wait'
    try {
      if (isNew) {
        const created = await api.post<{ JobID: string }>('/jobs', form)
        showToast('Job created successfully!', 'success')
        navigate(`/jobs/${created.JobID}`)
      } else {
        await api.put(`/jobs/${id}`, form)
        showToast('Job saved', 'success')
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
      document.body.style.cursor = ''
    }
  }

  function handleGenerateDT(dtid: number, dtNumber: string) {
    setGeneratedDTID(dtid)
    setTab('dt')  // auto-switch to DT tab
  }

  if (!isNew && isLoading) return <PageLoader />

  return (
    <div className="flex flex-col h-full">
      {/* Workspace top bar (dark, like reference app) */}
      <div className="bg-gray-900 text-white px-4 py-3 flex items-center gap-3 rounded-t-xl -mx-0">
        <button
          onClick={() => navigate('/jobs')}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-xs"
        >
          <ArrowLeft size={14} /> Back to Register
        </button>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-gray-400">Job File Workspace • Job No: </span>
          <span className="text-sm font-bold text-yellow-400">{isNew ? 'NEW' : form.JobID}</span>
        </div>
        {canEdit && (
          <button onClick={handleSave} disabled={saving} className="btn-primary text-xs py-1.5">
            {saving ? <><Spinner size="sm" /> Saving…</> : <><Save size={13} /> Save Job File</>}
          </button>
        )}
      </div>

      {/* Context bar */}
      {!isNew && (
        <div className="bg-gray-800 text-gray-300 px-4 py-1.5 flex items-center gap-4 text-xs flex-wrap -mx-0">
          <span>Rig: <strong className="text-blue-400">{form.Rig || '—'}</strong></span>
          <span>|</span>
          <span>Client: <strong className="text-white">{form.Client || '—'}</strong></span>
          <span>|</span>
          <span>Contract: <strong className="text-white">{form.Contract || '—'}</strong></span>
          <span>|</span>
          <span>Invoice Amount: <strong className="text-green-400">
            {form.InvoiceAmount ? `${Number(form.InvoiceAmount).toLocaleString()} ${form.Currency || 'USD'}` : '—'}
          </strong></span>
          <span className="ml-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block"></span>
            Synced with Azure SQL
          </span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-gray-200 bg-white -mx-0">
        {WORKSPACE_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            disabled={isNew && t.id !== 'header'}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors -mb-px shrink-0 ${
              tab === t.id
                ? 'border-brand-600 text-brand-600 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            {t.icon}
            {t.label}
            {t.id === 'checklist' && checklist.length > 0 && (
              <span className="ml-1 bg-brand-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                {checklist.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto pt-4 space-y-0">
        {isNew && tab !== 'header' && (
          <div className="card p-8 text-center text-gray-400 text-sm">
            Save the job first to access this tab
          </div>
        )}

        {tab === 'header' && (
          <JobHeaderTab form={form} set={set} canEdit={canEdit} isNew={isNew} />
        )}
        {tab === 'technical' && !isNew && (
          <TechnicalTab form={form} set={set} canEdit={canEdit} />
        )}
        {tab === 'manpower' && !isNew && (
          <ManpowerTab jobId={id!} canEdit={canEdit} />
        )}
        {tab === 'checklist' && !isNew && (
          <ChecklistTab
            jobId={id!}
            job={form}
            items={checklist}
            setItems={setChecklist}
            onGenerateDT={handleGenerateDT}
          />
        )}
        {tab === 'dt' && !isNew && (
          <DTHeaderTab
            jobId={id!}
            job={form}
            focusDTID={generatedDTID}
          />
        )}
        {tab === 'rt' && !isNew && (
          <ReturnTicketTab jobId={id!} job={form} />
        )}
        {tab === 'util' && !isNew && (
          <UtilizationTab jobId={id!} />
        )}
      </div>

      {/* Bottom status bar */}
      {!isNew && (
        <div className="bg-gray-900 text-gray-400 px-4 py-1.5 text-xs flex items-center gap-3 -mx-0 rounded-b-xl mt-4">
          <span>Active Job: <strong className="text-yellow-400">{form.JobID}</strong></span>
          <span>•</span>
          <span>Client: <strong className="text-white">{form.Client}</strong></span>
          <span>•</span>
          <span>Rig: <strong className="text-blue-400">{form.Rig}</strong></span>
          <span className="ml-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
            Synced with Azure SQL
          </span>
        </div>
      )}
    </div>
  )
}
