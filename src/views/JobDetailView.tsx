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
  ClipboardList, Truck, RotateCcw, BarChart3, X, AlertTriangle,
  Lock, Unlock
} from 'lucide-react'
import { api } from '../utils/api'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { toDateInput, normalizeJobId } from '../utils/format'
import { PageLoader, Spinner } from '../components/Spinner'
import { ComboBox } from '../components/ComboBox'
import { Modal } from '../components/Modal'
import { useRowWindow } from '../components/useRowWindow'
import type { Job, JobStatus, InvoicingType, ToolMovement } from '../types'
import { ListOptions } from '../components/ListOptions'
import { RolloverPanel } from '../components/RolloverPanel'
import * as XLSX from 'xlsx'

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
  VehicleVessel?: string
  EmdadRep?: string
  ClientSignDate?: string
  /** Set when the ticket is confirmed; a locked ticket is read-only. */
  LockStage?: string
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

// Real tbl_DeliveryTickets statuses: Closed 2,116, Signed 1,569, blank 15.
// 'Draft/Submitted/Approved/Rejected' appear on none of the 3,700 tickets.
// Receiving tickets no longer carry a free status — it follows the lock.

// ─── Tool Picker Modal ────────────────────────────────────────────────────────

/**
 * Status groups. Everything is shown, not just Good — a supervisor who can see
 * that the tool he needs is sitting in inspection or maintenance can push it
 * through the workshop and still make the mobilisation. Hiding those rows hid
 * exactly the information needed to act on them, and made the tool look as
 * though it did not exist.
 */
/**
 * Status is plain coloured text, as on the old app's grids — filled pills in
 * every row of a dense table read as clutter rather than as information.
 */
const PICK_STATUS_STYLE: Record<string, string> = {
  good: 'text-green-700',
  'on rig': 'text-blue-700',
  inspection: 'text-amber-700',
  maintenance: 'text-amber-700',
  redress: 'text-amber-700',
  repair: 'text-amber-700',
  dbr: 'text-red-600',
  scrap: 'text-red-600',
}
const pickStatusClass = (s: string | null | undefined) =>
  PICK_STATUS_STYLE[String(s || '').trim().toLowerCase()] || 'text-gray-500'

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
                    return (
                      <tr
                        key={item.AssetNo}
                        onClick={() => toggleRow(item.AssetNo)}
                        className={`border-b border-gray-100 cursor-pointer ${
                          // No tinted rows either — the status column already
                          // says what the row is, and a block of colour per row
                          // made the table hard to read.
                          isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'
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
                          <span className={`font-semibold uppercase text-[11px] ${pickStatusClass(item.Status)}`}>
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

/** Dense form row: label on the left, field on the right (module scope so inputs keep focus). */
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 min-w-0">
      <span className="field-label w-[88px] shrink-0 text-right">{label}</span>
      <span className="flex-1 min-w-0">{children}</span>
    </label>
  )
}
function RO({ v }: { v: string }) { return <div className="field-value" title={v}>{v || '—'}</div> }

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
  // A finished job is read-only. The API enforces this too - the disabled
  // fields here are the courtesy, the 423 from the server is the control.
  const canEdit = hasRole('Admin', 'Operations') && !job?.IsLocked

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
      // The list endpoint carries no Notes, and the logistics fields are kept
      // inside Notes, so the single-ticket record is read. Every field is reset
      // from THIS ticket - the form used to keep the previous ticket's values
      // and show today's date, which a Save would then have written over the
      // ticket's real date.
      const [ln, full] = await Promise.all([
        api.get<DTLine[]>(`/delivery-tickets/${dt.DTID}/lines`),
        api.get<DTRecord>(`/delivery-tickets/${dt.DTID}`).catch(() => dt),
      ])
      setLines(ln)
      const day = (v?: string | null) => (v ? String(v).slice(0, 10) : '')
      const base = {
        DTDate: day(full.DTDate), Status: full.Status || '',
        DispatchedBy: '', Designation: '', DispatchDate: '',
        DeliveredTo: '', Vessel: '', Transport: '', VehicleNo: '', DriverName: '', ContactNo: '',
        RMRef: '', RMDate: '', Notes: '',
      }
      try {
        const parsed = JSON.parse(full.Notes || '{}')
        if (parsed && parsed._logistics) setForm({ ...base, ...parsed._logistics, Notes: parsed.notes || '' })
        else setForm({ ...base, Notes: full.Notes || '' })
      } catch {
        setForm({ ...base, Notes: full.Notes || '' })
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

  const txt = (k: keyof typeof form, ph = '') => (
    <input className="field-input" value={(form as any)[k] || ''} placeholder={ph} disabled={!canEdit}
           onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} />
  )
  const dat = (k: keyof typeof form) => (
    <input type="date" className="field-input" value={(form as any)[k] || ''} disabled={!canEdit}
           onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} />
  )

  return (
    <div className="flex flex-col gap-1.5 h-full min-h-0">
      {/* DT selector + actions: one row */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        <span className="text-[11px] font-semibold text-gray-600">Delivery Ticket</span>
        {dts.length === 0 ? (
          <span className="text-[12px] text-gray-400 italic">None generated (draft checklist manifest)</span>
        ) : (
          <select className="field-input !w-auto min-w-[170px]" value={activeDT?.DTID || ''}
            onChange={e => { const dt = dts.find(d => d.DTID === Number(e.target.value)); if (dt) selectDT(dt) }}>
            {dts.map(d => <option key={d.DTID} value={d.DTID}>{d.DTNumber} — {d.Status}</option>)}
          </select>
        )}
        {activeDT && (
          <span className={`text-[11px] font-mono font-semibold px-1.5 py-px rounded ${
            activeDT.Status === 'Approved' ? 'bg-green-100 text-green-700'
            : activeDT.Status === 'Draft' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>{activeDT.DTNumber}</span>
        )}
        {activeDT && canEdit && (
          <button onClick={handleSave} disabled={saving} className="btn-primary ml-auto">
            {saving ? <><Spinner size="sm" /> Saving…</> : <><Save size={12} /> Save DT</>}
          </button>
        )}
      </div>

      {dts.length === 0 && (
        <div className="border border-amber-200 bg-amber-50 rounded px-3 py-2 flex items-start gap-2 shrink-0">
          <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-700">
            <strong>No Delivery Ticket yet:</strong> go to the <strong>Checklist Header</strong> tab, select the tools and
            click "Generate DT from Checklist" to dispatch to rig <strong>{job.Rig}</strong>.
          </p>
        </div>
      )}

      {activeDT && (
        <>
          {/* Manifest header: four columns, label left */}
          <div className="card px-3 py-2 shrink-0">
            <div className="grid gap-x-4 gap-y-1 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
              <F label="Customer"><RO v={job.Client || ''} /></F>
              <F label="Project No"><RO v={job.Contract || ''} /></F>
              <F label="Sub-Division"><RO v="RENTALS" /></F>
              <F label="Purpose"><RO v="Downhole Rentals" /></F>
              <F label="Rig"><RO v={job.Rig || ''} /></F>
              <F label="Job Number"><RO v={jobId} /></F>
              <F label="Date Shipped">{dat('DTDate')}</F>
              <F label="Status">
                <select className="field-input" value={form.Status} disabled={!canEdit}
                        onChange={e => setForm(p => ({ ...p, Status: e.target.value }))}>
                  <ListOptions name="DeliveryTicketStatus" current={form.Status} blank blankLabel="Not set" />
                </select>
              </F>
              <F label="RM Ref">{txt('RMRef', 'MR-XXXX')}</F>
              <F label="RM Date">{dat('RMDate')}</F>
            </div>
          </div>

          {/* Tool lines: takes all remaining height and scrolls inside, header pinned */}
          <div className="card flex-1 min-h-[140px] flex flex-col overflow-hidden">
            <div className="px-3 py-1 border-b border-gray-200 bg-gray-50 text-[11.5px] font-semibold text-gray-700 shrink-0">
              Dispatched Tools <span className="font-normal text-gray-500">— {lines.length} item{lines.length === 1 ? '' : 's'}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="table-th w-10">#</th>
                    <th className="table-th w-[150px]">Serial / Asset</th>
                    <th className="table-th">Description</th>
                    <th className="table-th text-center w-12">Qty</th>
                    <th className="table-th w-[200px]">Notes</th>
                    {canEdit && <th className="table-th w-8"></th>}
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr><td colSpan={canEdit ? 6 : 5} className="table-td text-center py-6 text-gray-400">
                      No tools on this delivery ticket yet.
                    </td></tr>
                  ) : lines.map((line, idx) => (
                    <tr key={line.LineID} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-[5px] text-[12px] text-gray-400 tabular-nums">{idx + 1}</td>
                      <td className="px-3 py-[5px] text-[12px] font-mono font-medium text-slate-900 whitespace-nowrap">{line.AssetNo || '—'}</td>
                      <td className="px-3 py-[5px] text-[12px] text-slate-800">{line.ToolDescription}</td>
                      <td className="px-3 py-[5px] text-[12px] text-center font-mono tabular-nums text-slate-800">{line.Quantity}</td>
                      <td className="px-3 py-[5px] text-[12px] text-gray-500">{line.Notes || '—'}</td>
                      {canEdit && (
                        <td className="table-td">
                          <button onClick={() => removeLine(line.LineID)} className="text-gray-300 hover:text-red-500 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer: dispatch, destination, haulage and notes stay at the bottom */}
          <div className="card px-3 py-2 shrink-0 grid gap-x-6 gap-y-1 grid-cols-1 lg:grid-cols-3">
            <div className="space-y-1">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">1. Warehouse &amp; Operations Dispatch</div>
              <F label="Dispatched By">{txt('DispatchedBy', 'Full name')}</F>
              <F label="Designation">{txt('Designation', 'e.g. Workshop Coordinator')}</F>
              <F label="Dispatch Date">{dat('DispatchDate')}</F>
            </div>
            <div className="space-y-1">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">2. Destination &amp; Marine Logistics</div>
              <F label="Delivered To">{txt('DeliveredTo', 'e.g. Esnad Jetty / Yard 08')}</F>
              <F label="Vessel / Boat">{txt('Vessel', 'e.g. Zakher Star')}</F>
              <F label="Transport">{txt('Transport', 'e.g. Emdad Logistics')}</F>
            </div>
            <div className="space-y-1">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">3. Haulage &amp; Driver Details</div>
              <F label="Vehicle No">{txt('VehicleNo', 'e.g. 54912 / 70136 AD')}</F>
              <F label="Driver Name">{txt('DriverName', 'Driver full name')}</F>
              <F label="Contact No">{txt('ContactNo', '+971 …')}</F>
            </div>
            <div className="lg:col-span-3">
              <label className="flex items-start gap-2">
                <span className="field-label w-[88px] shrink-0 text-right pt-1">Notes</span>
                <textarea rows={4} className="input flex-1 resize-y min-h-[88px]" disabled={!canEdit}
                  value={form.Notes || ''} placeholder="Slings, protectors, non-invoiced spares, baskets — prints on Delivery Ticket DSF-001 under Notes"
                  onChange={e => setForm(p => ({ ...p, Notes: e.target.value }))} />
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Return Ticket Tab ─────────────────────────────────────────────────────────

/** What a returned tool can be marked as, and what each implies downstream. */
const USED_STATES = ['USED', 'NOT USED', 'LIH'] as const
const ROUTE_LABEL: Record<string, string> = {
  USED: 'Inspection Bay',
  'NOT USED': 'Available Inventory',
  LIH: 'Lost in Hole',
}
/** Normalise whatever the imported history stored into one of the three states. */
function normUsed(v: string | null | undefined): string {
  const u = String(v || '').trim().toUpperCase()
  if (u === 'LIH' || u.includes('LOST')) return 'LIH'
  if (u === 'USED') return 'USED'
  if (u === 'NOT USED' || u === 'NOTUSED') return 'NOT USED'
  return ''
}

/** A dispatched tool on this job that no receiving ticket has taken back yet. */
interface PendingReturn {
  TicketNo: string
  DateOut: string | null
  ItemNo: number
  Serial: string
  AssetNo: string
  Description: string | null
  Size: string | null
  Qty: number
}

/**
 * Return Ticket — the backload desk, rebuilt to the old app's flow.
 *
 * Bottom: every tool dispatched on this job that is still out, filtered by
 * delivery ticket. Tick them and move them up.
 * Top: the manifest being built. Each line is marked USED / NOT USED / LIH,
 * and that single choice decides everything downstream — used goes to the
 * inspection bay, unused goes back to available inventory, lost-in-hole leaves
 * the catalogue. Then the header is filled and the ticket is confirmed, which
 * locks it.
 *
 * It previously showed only an RT's existing lines, read-only, with no way to
 * pull a dispatched tool back or to record what state it came back in — so the
 * cycle could never be closed from this screen.
 */
function ReturnTicketTab({
  jobId,
  job,
}: {
  jobId: string
  job: Partial<Job>
}) {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  // A finished job is read-only. The API enforces this too - the disabled
  // fields here are the courtesy, the 423 from the server is the control.
  const canEdit = hasRole('Admin', 'Operations') && !job?.IsLocked

  const [rts,      setRts]      = useState<RTRecord[]>([])
  const [activeRT, setActiveRT] = useState<RTRecord | null>(null)
  const [lines,    setLines]    = useState<RTLine[]>([])
  const [pending,  setPending]  = useState<PendingReturn[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [busy,     setBusy]     = useState(false)

  const [form, setForm] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)

  // Backload selection
  const [dtFilter, setDtFilter] = useState('')
  const [checked,  setChecked]  = useState<Set<string>>(new Set())
  const [dateIn,   setDateIn]   = useState(() => new Date().toISOString().split('T')[0])

  const day = (v: string | null | undefined) => (v ? String(v).split('T')[0] : '')
  // LockStage is on RTRecord, so read it directly — no cast needed.
  const locked = Boolean(activeRT && String(activeRT.LockStage || '').trim())

  const loadRTs = useCallback(async () => {
    setLoading(true)
    try {
      const jobRTs = await api.get<RTRecord[]>(`/receiving-tickets?job=${encodeURIComponent(jobId)}`)
      setRts(jobRTs || [])
      if (jobRTs?.length) selectRT(jobRTs[0])
      else { setActiveRT(null); setLines([]) }
    } catch {
      showToast('Failed to load return tickets', 'error')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => { loadRTs() }, [loadRTs])

  async function selectRT(rt: RTRecord) {
    setActiveRT(rt)
    setChecked(new Set())
    setDirty(false)
    const full = await api.get<RTRecord>(`/receiving-tickets/${rt.RTID}`).catch(() => rt)
    const f = (full || rt) as unknown as Record<string, string | null>
    setForm({
      RTDate:         day(f.RTDate),
      LinkedDT:       (f.LinkedDT as string) || '',
      ManifestNumber: (f.ManifestNumber as string) || '',
      VehicleVessel:  (f.VehicleVessel as string) || '',
      EmdadRep:       (f.EmdadRep as string) || '',
      ClientSignDate: day(f.ClientSignDate),
      Notes:          (f.Notes as string) || '',
    })
    setActiveRT(prev => ({ ...(prev as RTRecord), ...(full as RTRecord) }))

    const [ln, pd] = await Promise.all([
      api.get<RTLine[]>(`/receiving-tickets/${rt.RTID}/lines`).catch(() => [] as RTLine[]),
      api.get<PendingReturn[]>(`/receiving-tickets/${rt.RTID}/pending`).catch(() => [] as PendingReturn[]),
    ])
    setLines(ln || [])
    setPending(pd || [])
  }

  const set = (k: string, v: string) => { setForm(p => ({ ...p, [k]: v })); setDirty(true) }

  // Delivery tickets that still have something outstanding.
  const dtOptions = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of pending) m.set(p.TicketNo, (m.get(p.TicketNo) || 0) + 1)
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [pending])

  const pendingShown = useMemo(
    () => (dtFilter ? pending.filter(p => p.TicketNo === dtFilter) : pending),
    [pending, dtFilter]
  )

  const unmarked = lines.filter(l => !normUsed(l.UsedStatus)).length

  // A full manifest is 274 lines, each with its own usage dropdown; all of
  // them in the DOM at once is what made this tab slow to open.
  const { scrollRef, onScroll, visible: visibleLines, hasMore: moreLines } = useRowWindow(lines)

  async function createRT() {
    setBusy(true)
    document.body.style.cursor = 'wait'
    try {
      const r = await api.post<{ RTID: number; RTNumber: string }>('/receiving-tickets', {
        JobID: jobId, RTDate: dateIn,
      })
      showToast(`${r.RTNumber} created`, 'success')
      await loadRTs()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create RT', 'error')
    } finally { document.body.style.cursor = ''; setBusy(false) }
  }

  /** Move the ticked dispatched tools onto this ticket. */
  async function moveToRT() {
    if (!activeRT || checked.size === 0) return
    setBusy(true)
    document.body.style.cursor = 'wait'
    try {
      const res = await api.post<{ received: number }>(`/receiving-tickets/${activeRT.RTID}/receive`, {
        serials: [...checked],
        dateIn,
        dtNumber: dtFilter || pendingShown[0]?.TicketNo,
      })
      showToast(`${res.received} tool(s) moved onto ${activeRT.RTNumber}`, 'success')
      setChecked(new Set())
      await selectRT(activeRT)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to move tools', 'error')
    } finally { document.body.style.cursor = ''; setBusy(false) }
  }

  /** USED / NOT USED / LIH — routing and inventory status follow from it. */
  async function setUsage(line: RTLine, used: string) {
    if (!activeRT) return
    setBusy(true)
    document.body.style.cursor = 'wait'
    try {
      await api.put(`/receiving-tickets/${activeRT.RTID}/lines/${line.LineID}`, { UsedStatus: used })
      setLines(prev => prev.map(l => l.LineID === line.LineID
        ? { ...l, UsedStatus: used, RoutedTo: ROUTE_LABEL[used], Condition: used === 'USED' ? 'Inspection' : used === 'LIH' ? 'Lost in Hole' : 'Available' }
        : l))
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update', 'error')
    } finally { document.body.style.cursor = ''; setBusy(false) }
  }

  async function removeLine(lineId: number) {
    if (!activeRT) return
    try {
      await api.delete(`/receiving-tickets/${activeRT.RTID}/lines/${lineId}`)
      await selectRT(activeRT)
    } catch {
      showToast('Failed to remove line', 'error')
    }
  }

  async function saveHeader() {
    if (!activeRT) return
    setSaving(true)
    document.body.style.cursor = 'wait'
    try {
      await api.put(`/receiving-tickets/${activeRT.RTID}`, form)
      setDirty(false)
      showToast('Return ticket saved', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally { document.body.style.cursor = ''; setSaving(false) }
  }

  async function confirmAndLock() {
    if (!activeRT) return
    if (!window.confirm(
      `Confirm ${activeRT.RTNumber} with ${lines.length} tool(s)?\n\n` +
      `Used tools route to the QC inspection bay, unused tools return to available inventory, ` +
      `and lost-in-hole tools leave the catalogue.\n\nThe ticket is locked after this.`
    )) return
    setBusy(true)
    document.body.style.cursor = 'wait'
    try {
      if (dirty) await api.put(`/receiving-tickets/${activeRT.RTID}`, form)
      await api.post(`/receiving-tickets/${activeRT.RTID}/lock`, {})
      showToast(`${activeRT.RTNumber} confirmed and locked`, 'success')
      setDirty(false)
      await loadRTs()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to confirm', 'error')
    } finally { document.body.style.cursor = ''; setBusy(false) }
  }

  if (loading) return (
    <div className="bg-white border border-gray-300 rounded py-12 flex items-center justify-center">
      <Spinner size="md" />
    </div>
  )

  const editable = canEdit && !locked

  return (
    <div className="flex flex-col gap-1.5">
      {/* Toolbar */}
      <div className="screen-bar">
        <span className="field-label">Return Ticket</span>
        <select
          className="field-input w-44"
          value={activeRT?.RTID ?? ''}
          onChange={e => {
            const rt = rts.find(r => String(r.RTID) === e.target.value)
            if (rt) selectRT(rt)
          }}
        >
          {rts.length === 0 && <option value="">No return tickets yet</option>}
          {rts.map(r => <option key={r.RTID} value={r.RTID}>{r.RTNumber}</option>)}
        </select>

        {canEdit && (
          <button className="btn-mini" onClick={createRT} disabled={busy}>
            <Plus size={12} /> New RT
          </button>
        )}

        {locked
          ? <span className="text-[11px] font-semibold text-green-700">Confirmed &amp; locked</span>
          : activeRT && <span className="text-[11px] text-amber-700 font-semibold">Draft — not confirmed</span>}

        {activeRT && (
          <span className="text-[11px] text-gray-500">
            {lines.length} received · {pending.length} still out
            {unmarked > 0 && <span className="text-amber-700 font-semibold"> · {unmarked} unmarked</span>}
          </span>
        )}

        {activeRT && editable && (
          <div className="ml-auto flex gap-1.5">
            <button className="btn-mini" onClick={saveHeader} disabled={saving || !dirty}>
              {saving ? <Spinner size="sm" /> : <Save size={12} />} {dirty ? 'Save' : 'Saved'}
            </button>
            <button className="btn-accent" onClick={confirmAndLock}
                    disabled={busy || lines.length === 0 || unmarked > 0}
                    title={unmarked > 0 ? `${unmarked} line(s) still need usage marked` : 'Confirm and lock this ticket'}>
              Confirm &amp; Lock
            </button>
          </div>
        )}
      </div>

      {!activeRT ? (
        <div className="bg-white border border-gray-300 rounded py-10 text-center text-gray-400 text-xs">
          No return ticket on this job yet. Create one to start receiving tools back.
        </div>
      ) : (
        <>
          {/* Header — carried values read-only, the rest from the printed ticket */}
          <div className="bg-white border border-gray-300 rounded">
            <div className="px-2 h-[22px] flex items-center justify-between bg-gray-100 border-b border-gray-300">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
                Receiving manifest
              </span>
              <span className="font-mono text-[11px] font-bold text-brand-700">{activeRT.RTNumber}</span>
            </div>
            <div className="field-row px-2 py-1.5 grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_auto_1fr] xl:grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto_1fr]">
              <span className="field-label">Customer</span>
              <div className="field-value" title={job.Client || ''}>{job.Client || '—'}</div>

              <span className="field-label">Contract</span>
              <div className="field-value">{job.Contract || '—'}</div>

              <span className="field-label">Rig / Well</span>
              <div className="field-value">{[job.Rig, job.Well].filter(Boolean).join(' / ') || '—'}</div>

              <span className="field-label">Date</span>
              <input type="date" className="field-input" value={form.RTDate ?? ''} disabled={!editable}
                     onChange={e => set('RTDate', e.target.value)} />

              <span className="field-label">Shipped Via</span>
              <input className="field-input" value={form.VehicleVessel ?? ''} disabled={!editable}
                     onChange={e => set('VehicleVessel', e.target.value)} />

              <span className="field-label">L/Note No</span>
              <input className="field-input" value={form.ManifestNumber ?? ''} disabled={!editable}
                     onChange={e => set('ManifestNumber', e.target.value)} />

              <span className="field-label">L/Note Date</span>
              <input type="date" className="field-input" value={form.ClientSignDate ?? ''} disabled={!editable}
                     onChange={e => set('ClientSignDate', e.target.value)} />

              <span className="field-label">Received By</span>
              <input className="field-input" value={form.EmdadRep ?? ''} disabled={!editable}
                     onChange={e => set('EmdadRep', e.target.value)} />

              <span className="field-label">Linked DT</span>
              <div className="field-value font-mono">{form.LinkedDT || '—'}</div>

              <span className="field-label">Note</span>
              <input className="field-input" value={form.Notes ?? ''} disabled={!editable}
                     onChange={e => set('Notes', e.target.value)} />
            </div>
          </div>

          {/* UPPER — the manifest being built */}
          <div className="bg-white border border-gray-300 rounded flex flex-col max-h-[40vh]">
            <div className="px-2 h-[22px] flex items-center justify-between bg-gray-100 border-b border-gray-300 shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-600">
                Received tools on this ticket
              </span>
              <span className="text-[10px] font-semibold text-green-700">
                {moreLines ? `${visibleLines.length} of ${lines.length} shown` : `${lines.length} received`}
              </span>
            </div>
            <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="table-th w-10">#</th>
                    <th className="table-th">Asset No</th>
                    <th className="table-th">Description</th>
                    <th className="table-th w-12 !text-right">Qty</th>
                    <th className="table-th">Date In</th>
                    <th className="table-th w-32">Usage</th>
                    <th className="table-th">Routes To</th>
                    {editable && <th className="table-th w-8"></th>}
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={editable ? 8 : 7} className="table-td text-center py-8 text-gray-400">
                        Nothing received yet. Tick tools below and move them up.
                      </td>
                    </tr>
                  ) : (
                    visibleLines.map((l, idx) => {
                      const used = normUsed(l.UsedStatus)
                      return (
                        <tr key={l.LineID} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="table-td text-gray-400">{idx + 1}</td>
                          <td className="table-td font-mono font-medium">{l.AssetNo || l.SerialNumber || '—'}</td>
                          <td className="table-td text-gray-600 max-w-[380px] truncate"
                              title={l.ToolDescription || ''}>{l.ToolDescription || '—'}</td>
                          <td className="table-td text-right">{l.Quantity}</td>
                          <td className="table-td text-gray-500">{day(form.RTDate) || '—'}</td>
                          <td className="table-td">
                            <select
                              className={`field-input !h-[22px] ${used ? '' : 'border-amber-400 bg-amber-50'}`}
                              value={used}
                              disabled={!editable || busy}
                              onChange={e => setUsage(l, e.target.value)}
                            >
                              <option value="">— mark —</option>
                              {USED_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="table-td text-gray-600">
                            {used ? ROUTE_LABEL[used] : <span className="text-amber-700">set usage</span>}
                          </td>
                          {editable && (
                            <td className="table-td">
                              <button onClick={() => removeLine(l.LineID)}
                                      className="text-gray-300 hover:text-red-500" title="Remove from ticket">
                                <Trash2 size={12} />
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* LOWER — still out on the rig */}
          <div className="bg-white border border-gray-300 rounded flex flex-col max-h-[40vh]">
            <div className="px-2 py-1 flex items-center gap-2 flex-wrap bg-amber-50 border-b border-gray-300 shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
                Pending return — still on the rig
              </span>
              <span className="field-label">DT No</span>
              <select className="field-input w-40 !h-[22px]" value={dtFilter}
                      onChange={e => { setDtFilter(e.target.value); setChecked(new Set()) }}>
                <option value="">All delivery tickets ({pending.length})</option>
                {dtOptions.map(([dt, n]) => <option key={dt} value={dt}>{dt} ({n})</option>)}
              </select>

              <span className="field-label">Date In</span>
              <input type="date" className="field-input w-32 !h-[22px]" value={dateIn}
                     onChange={e => setDateIn(e.target.value)} disabled={!editable} />

              {editable && (
                <button className="btn-accent ml-auto" onClick={moveToRT} disabled={busy || checked.size === 0}>
                  {busy ? <Spinner size="sm" /> : <>&#8595;</>} Move to RT ({checked.size})
                </button>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              {pendingShown.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-xs italic">
                  No equipment pending return for this job.
                </div>
              ) : (
                <table className="w-full text-[12px] border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="table-th w-10 !px-1 text-center">
                        <input
                          type="checkbox"
                          disabled={!editable}
                          checked={pendingShown.length > 0 && pendingShown.every(p => checked.has(p.Serial))}
                          onChange={e => setChecked(prev => {
                            const next = new Set(prev)
                            pendingShown.forEach(p => e.target.checked ? next.add(p.Serial) : next.delete(p.Serial))
                            return next
                          })}
                        />
                      </th>
                      <th className="table-th">DT No</th>
                      <th className="table-th w-12 !text-right">Item</th>
                      <th className="table-th">Asset No</th>
                      <th className="table-th">Description</th>
                      <th className="table-th">Size</th>
                      <th className="table-th w-14 !text-right">DT Qty</th>
                      <th className="table-th">Date Out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingShown.map((p, i) => {
                      const on = checked.has(p.Serial)
                      return (
                        <tr key={`${p.TicketNo}-${p.Serial}-${i}`}
                            onClick={() => editable && setChecked(prev => {
                              const next = new Set(prev)
                              if (next.has(p.Serial)) next.delete(p.Serial); else next.add(p.Serial)
                              return next
                            })}
                            className={`border-b border-gray-100 ${editable ? 'cursor-pointer' : ''} ${on ? 'bg-brand-50' : 'hover:bg-gray-50'}`}>
                          <td className="table-td !px-1 text-center">
                            <input type="checkbox" checked={on} readOnly disabled={!editable} />
                          </td>
                          <td className="table-td font-mono text-gray-500">{p.TicketNo}</td>
                          <td className="table-td text-right text-gray-400">{p.ItemNo}</td>
                          <td className="table-td font-mono font-medium">{p.AssetNo}</td>
                          <td className="table-td text-gray-600 max-w-[340px] truncate"
                              title={p.Description || ''}>{p.Description || '—'}</td>
                          <td className="table-td text-gray-500">{p.Size || '—'}</td>
                          <td className="table-td text-right">{p.Qty}</td>
                          <td className="table-td text-gray-500">{day(p.DateOut) || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
type UtilGate = { dirty: boolean; save: () => Promise<boolean> }
interface UtilCellR extends UtilCell { rate?: number | null; cost?: number | null }

const fmtMoney = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 })
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}
const shortDate = (s: string | null) => {
  const v = (s || '').slice(0, 10)
  if (!v || v.startsWith('1900')) return ''
  return new Date(v + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-')
}

/**
 * Utilization for the whole job, one month on screen at a time: pick the month,
 * switch between marking days and revenue & cost, find a tool, and scroll the
 * table inside its own box. Edits are staged locally and written only on Save.
 */
function UtilizationTab({ jobId, job, gate }: {
  jobId: string; job: Partial<Job>; gate: React.MutableRefObject<UtilGate | null>
}) {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const canEdit = hasRole('Admin', 'Operations') && !job?.IsLocked

  const [cycles,  setCycles]  = useState<UtilRow[]>([])
  const [months,  setMonths]  = useState<string[]>([])
  const [marks,   setMarks]   = useState<Record<string, Record<string, Record<number, UtilCellR>>>>({})
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [ym,      setYm]      = useState<string>('')            // month on screen
  const [view,    setView]    = useState<'days' | 'sub' | 'money'>('days')
  const [q,       setQ]       = useState('')
  const [onlyActive, setOnlyActive] = useState(false)          // hide tools with no days this month
  const [pending, setPending] = useState<Record<string, '1' | 'S' | null>>({})
  // Rotating hours are typed by hand: saved values and staged edits, keyed `ym|dt|tool`.
  const [rot,      setRot]      = useState<Record<string, number>>({})
  const [rotPend,  setRotPend]  = useState<Record<string, string>>({})
  const [subs,     setSubs]     = useState<Record<string, boolean>>({})   // `ym|dt|tool` hired-in tools
  // Day rate we pay the owner of a hired-in tool, by serial, and the rate being typed.
  const [rates,    setRates]    = useState<Record<string, { rate: number; cur: string | null }>>({})
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({})
  const [rateCur,  setRateCur]  = useState<Record<string, string>>({})
  const pendingCount = Object.keys(pending).length + Object.keys(rotPend).length

  const cKey = (r: UtilRow) => `${r.dtNumber ?? ''}|${String(r.toolId ?? '')}`
  const daysIn = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate() }
  const dateOf = (ym: string, d: number) => `${ym}-${String(d).padStart(2, '0')}`
  const todayStr = new Date().toISOString().slice(0, 10)

  /** A day is enterable only between the DT date and the RT date (open-ended up to today). */
  const inWindow = (r: UtilRow, ym: string, d: number) => {
    const day = dateOf(ym, d)
    const out = (r.dateOut || '').slice(0, 10)
    const back = (r.dateIn || '').slice(0, 10)
    if (!out || day < out) return false
    return back && !back.startsWith('1900') ? day <= back : day <= todayStr
  }

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const normJobId = normalizeJobId(jobId)
      const mv = await api.get<ToolMovement[]>(`/tool-history?job=${encodeURIComponent(jobId)}&limit=2000`)
        .catch(() => [] as ToolMovement[])
      const built: (UtilRow & { rtNo?: string | null })[] = (mv || []).map(c => {
        const serial = c.Serial ?? c.PartNo ?? null
        return {
          label: c.Description || String(serial ?? ''),
          toolId: serial, dtNumber: c.TicketNo ?? null,
          dateOut: c.DateOut ?? null, dateIn: c.DateIn ?? null,
          assetNo: c.PartNo ?? serial, size: c.Size ?? null, days: {},
          rtNo: c.RgtNo ?? null,
          // Owner of a hired-in tool; the movement report says EMDAD for our own.
          supplier: c.Supplier && c.Supplier.trim() && c.Supplier.trim().toUpperCase() !== 'EMDAD' ? c.Supplier.trim() : null,
        }
      })
      built.sort((a, b) => String(a.dateOut || '').localeCompare(String(b.dateOut || '')))

      // Months from the first dispatch to the later of today / last return.
      const first = built.map(b => (b.dateOut || '').slice(0, 7)).filter(x => x && !x.startsWith('1900')).sort()[0]
      const nowYm = todayStr.slice(0, 7)
      const lastIn = built.map(b => (b.dateIn || '').slice(0, 7)).filter(x => x && !x.startsWith('1900')).sort().pop() || nowYm
      const end = lastIn > nowYm ? lastIn : nowYm
      const list: string[] = []
      if (first) {
        let [y, m] = first.split('-').map(Number)
        while (`${y}-${String(m).padStart(2, '0')}` <= end && list.length < 36) {
          list.push(`${y}-${String(m).padStart(2, '0')}`)
          if (++m > 12) { m = 1; y++ }
        }
      } else list.push(nowYm)

      const all: Record<string, Record<string, Record<number, UtilCellR>>> = {}
      const subMap: Record<string, boolean> = {}
      const rateMap: Record<string, { rate: number; cur: string | null }> = {}
      const rotRes = await api.get<{ rows: { DTNumber: string; ToolSerial: string; YearMonth: string; RotHours: number | null }[] }>(
        `/utilization/rothours?jobId=${encodeURIComponent(jobId)}`).catch(() => ({ rows: [] }))
      const rotMap: Record<string, number> = {}
      for (const r of rotRes.rows || []) if (r.RotHours != null) rotMap[`${r.YearMonth}|${r.DTNumber ?? ''}|${r.ToolSerial}`] = Number(r.RotHours)
      await Promise.all(list.map(async ym => {
        const [y, m] = ym.split('-').map(Number)
        const res = await api.get<{ rows: (UtilRow & { jobId: string; isSub?: boolean; hireRate?: number | null; hireCurrency?: string | null })[] }>(
          `/utilization?year=${y}&month=${m}&jobId=${encodeURIComponent(jobId)}`).catch(() => ({ rows: [] }))
        const mm: Record<string, Record<number, UtilCellR>> = {}
        for (const r of (res.rows || [])) {
          if (normalizeJobId(r.jobId) !== normJobId) continue
          mm[`${r.dtNumber ?? ''}|${String(r.toolId ?? '')}`] = r.days as any
          if (r.isSub) subMap[`${ym}|${r.dtNumber ?? ''}|${String(r.toolId ?? '')}`] = true
          if (r.isSub && r.hireRate != null) rateMap[String(r.toolId ?? '')] = { rate: Number(r.hireRate), cur: r.hireCurrency ?? null }
        }
        all[ym] = mm
      }))
      setCycles(built); setMonths(list); setMarks(all); setRot(rotMap); setSubs(subMap); setRates(rateMap)
      if (!quiet) { setPending({}); setRotPend({}) }
      setYm(cur => cur && list.includes(cur) ? cur : (list.includes(todayStr.slice(0, 7)) ? todayStr.slice(0, 7) : list[list.length - 1]))
    } catch {
      showToast('Failed to load utilization', 'error')
    } finally { setLoading(false) }
  }, [jobId])
  useEffect(() => { load() }, [load])

  /** Tool cycles that overlap a month (a tool out all October still shows in November until it returns). */
  const rowsFor = (ym: string) => cycles.filter(c => {
    const out = (c.dateOut || '').slice(0, 7)
    const back = (c.dateIn || '').slice(0, 7)
    if (!out || out > ym) return false
    return !back || back.startsWith('1900') || back >= ym
  })

  const valueOf = (ym: string, r: UtilRow, d: number): '1' | 'S' | null => {
    const k = `${ym}|${cKey(r)}|${d}`
    if (k in pending) return pending[k]
    return marks[ym]?.[cKey(r)]?.[d]?.code ?? null
  }

  function stage(ym: string, r: UtilRow, d: number, code: '1' | 'S' | null) {
    if (!canEdit || !inWindow(r, ym, d)) return
    const k = `${ym}|${cKey(r)}|${d}`
    const stored = marks[ym]?.[cKey(r)]?.[d]?.code ?? null
    setPending(p => { const n = { ...p }; if (code === stored) delete n[k]; else n[k] = code; return n })
  }

  const save = useCallback(async (onlyYm?: string): Promise<boolean> => {
    const entries = Object.entries(pending).filter(([k]) => !onlyYm || k.startsWith(onlyYm + '|'))
    const rotEntries = Object.entries(rotPend).filter(([k]) => !onlyYm || k.startsWith(onlyYm + '|'))
    if (!entries.length && !rotEntries.length) return true
    setSaving(true); document.body.style.cursor = 'wait'
    let failed = 0
    try {
      const jobs = entries.map(([k, code]) => async () => {
        const [ym, ck, dd] = k.split('|').length === 4 ? [k.split('|')[0], k.split('|').slice(1, 3).join('|'), Number(k.split('|')[3])] : ['', '', 0]
        const r = cycles.find(c => cKey(c) === ck)!
        const cur = marks[ym]?.[ck]?.[dd]
        try {
          if (!code && cur) await api.delete(`/utilization/${cur.logId}`)
          else if (code && !cur) await api.post('/utilization', {
            JobID: jobId, DTNumber: r.dtNumber, ToolID: r.toolId, LogDate: dateOf(ym, dd), UtilizationCode: code })
          else if (code && cur) await api.put(`/utilization/${cur.logId}`, { UtilizationCode: code })
        } catch { failed++ }
      })
      for (const [k, v] of rotEntries) {
        const [ym, dt, ...tl] = k.split('|')
        jobs.push(async () => {
          try { await api.put('/utilization/rothours', { JobID: jobId, DTNumber: dt, ToolSerial: tl.join('|'), YearMonth: ym, RotHours: v === '' ? null : Number(v) }) }
          catch { failed++ }
        })
      }
      let i = 0
      await Promise.all(Array.from({ length: 4 }, async () => { while (i < jobs.length) await jobs[i++]() }))
    } finally { document.body.style.cursor = ''; setSaving(false) }
    await load()
    if (failed) { showToast(`${failed} day(s) could not be saved — shown again`, 'error'); return false }
    const total = entries.length + rotEntries.length
    showToast(`Utilization saved (${total} change${total === 1 ? '' : 's'})`, 'success')
    return true
  }, [pending, rotPend, cycles, marks, jobId, load])

  const canPrice = hasRole('Admin', 'Billing', 'Finance', 'CostController')
  /** Set what we pay the owner per day for a hired-in tool; every day already marked is costed at once. */
  async function saveRate(r: UtilRow) {
    const tool = String(r.toolId ?? '')
    const raw = rateDraft[tool]
    if (raw === undefined) return
    const clear = () => setRateDraft(d => { const n = { ...d }; delete n[tool]; return n })
    if (raw.trim() === '' || isNaN(Number(raw))) { clear(); return }
    if (rates[tool] && Number(raw) === rates[tool].rate && !(tool in rateCur)) { clear(); return }
    try {
      await api.post('/rental-inward/price-tool', {
        toolSerial: tool, dayRate: Number(raw),
        currency: rateCur[tool] || rates[tool]?.cur || (job as any)?.Currency || 'USD' })
      clear(); setRateCur(c => { const n = { ...c }; delete n[tool]; return n })
      showToast(`Day rate saved for ${r.assetNo || tool}`, 'success')
      await load(true)
    } catch (e: any) { showToast(e?.message || 'Could not save the day rate', 'error') }
  }

  useEffect(() => { gate.current = { dirty: pendingCount > 0, save: () => save() } })
  useEffect(() => () => { gate.current = null }, [])
  useEffect(() => {
    if (!pendingCount) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [pendingCount])

  function onKey(e: React.KeyboardEvent, ym: string, r: UtilRow, ri: number, d: number) {
    const go = (rr: number, dd: number) =>
      document.querySelector<HTMLElement>(`[data-util="${ym}-${rr}-${dd}"]`)?.focus()
    const k = e.key
    if (k === '1' || k === 's' || k === 'S') { e.preventDefault(); stage(ym, r, d, k === '1' ? '1' : 'S'); go(ri, d + 1) }
    else if (k === 'Delete' || k === 'Backspace' || k === ' ' || k === '0') { e.preventDefault(); stage(ym, r, d, null); if (k !== 'Backspace') go(ri, d + 1) }
    else if (k === 'ArrowRight' || k === 'Enter') { e.preventDefault(); go(ri, d + 1) }
    else if (k === 'ArrowLeft') { e.preventDefault(); go(ri, d - 1) }
    else if (k === 'ArrowDown') { e.preventDefault(); go(ri + 1, d) }
    else if (k === 'ArrowUp')   { e.preventDefault(); go(ri - 1, d) }
  }

  /** Revenue of one cycle in one month, from the rate stored on each saved day. */
  const revenue = (ym: string, r: UtilRow) => {
    const dm = marks[ym]?.[cKey(r)] || {}
    let sb = 0, ops = 0, sbV = 0, opsV = 0, sbRate = 0, opsRate = 0, cost = 0, costDays = 0
    for (const c of Object.values(dm)) {
      if (c.code === 'S') { sb++; sbV += c.rate || 0; if (c.rate) sbRate = c.rate }
      else { ops++; opsV += c.rate || 0; if (c.rate) opsRate = c.rate }
      if (c.cost != null) { cost += c.cost; costDays++ }
    }
    const isSub = !!subs[`${ym}|${cKey(r)}`] || !!(r as any).supplier
    return { sb, ops, sbV, opsV, sbRate, opsRate, total: sbV + opsV, cost, costDays, isSub,
             costMissing: isSub && (sb + ops) > costDays }
  }

  /**
   * Workbook for Billing: a Revenue sheet (one line per tool per month, with
   * formulas for revenue, margin and totals so they can adjust figures) and a
   * sheet per month with the day marks.
   */
  function exportXlsx(onlyYm?: string) {
    const list = onlyYm ? [onlyYm] : months
    const wb = XLSX.utils.book_new()
    const head = ['Month', 'Asset', 'Description', 'DT', 'RM Dispatch', 'RT', 'RM Backload', 'Rot Hrs',
                  'SB Days', 'Ops Days', 'SB Rate', 'Ops Rate', 'SB Value', 'Ops Value', 'Revenue', 'Sub-contract Cost', 'Margin']
    const aoa: any[][] = [head]
    for (const ym of list) for (const r of rowsFor(ym)) {
      const v = revenue(ym, r); const n = aoa.length + 1
      const hrs = rotPend[`${ym}|${cKey(r)}`] ?? rot[`${ym}|${cKey(r)}`]
      aoa.push([monthLabel(ym), r.assetNo, r.label, r.dtNumber, shortDate(r.dateOut), (r as any).rtNo || '', shortDate(r.dateIn),
        hrs === undefined || hrs === '' ? '' : Number(hrs), v.sb, v.ops, v.sbRate || '', v.opsRate || '', v.sbV, v.opsV,
        { t: 'n', f: `M${n}+N${n}` }, v.isSub ? v.cost : '', { t: 'n', f: `O${n}-IF(P${n}="",0,P${n})` }])
    }
    const last = aoa.length
    aoa.push(['Total', '', '', '', '', '', '', '', { t: 'n', f: `SUM(I2:I${last})` }, { t: 'n', f: `SUM(J2:J${last})` }, '', '',
      { t: 'n', f: `SUM(M2:M${last})` }, { t: 'n', f: `SUM(N2:N${last})` }, { t: 'n', f: `SUM(O2:O${last})` },
      { t: 'n', f: `SUM(P2:P${last})` }, { t: 'n', f: `SUM(Q2:Q${last})` }])
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    ws['!cols'] = head.map((h, i) => ({ wch: i === 2 ? 40 : Math.max(10, h.length + 2) }))
    XLSX.utils.book_append_sheet(wb, ws, 'Revenue')
    for (const ym of list) {
      const n = daysIn(ym)
      const g: any[][] = [['Asset', 'Description', 'DT', 'RM Dispatch', 'RT', 'RM Backload', 'Rot Hrs',
        ...Array.from({ length: n }, (_, i) => i + 1), 'SB Days', 'Ops Days']]
      rowsFor(ym).forEach(r => {
        let sb = 0, ops = 0
        const marksRow = Array.from({ length: n }, (_, i) => {
          const v = valueOf(ym, r, i + 1); if (v === 'S') sb++; else if (v === '1') ops++; return v ?? ''
        })
        const hrs = rotPend[`${ym}|${cKey(r)}`] ?? rot[`${ym}|${cKey(r)}`]
        g.push([r.assetNo, r.label, r.dtNumber, shortDate(r.dateOut), (r as any).rtNo || '', shortDate(r.dateIn),
          hrs === undefined || hrs === '' ? '' : Number(hrs), ...marksRow, sb, ops])
      })
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(g), monthLabel(ym).slice(0, 31))
    }
    XLSX.writeFile(wb, `utilization-${jobId}${onlyYm ? '-' + onlyYm : ''}.xlsx`)
  }

  if (loading) return (
    <div className="bg-white border border-gray-300 rounded py-12 flex items-center justify-center"><Spinner size="md" /></div>
  )

  const grand = months.reduce((s, ym) => s + rowsFor(ym).reduce((a, r) => a + revenue(ym, r).total, 0), 0)
  const grandCost = months.reduce((s, ym) => s + rowsFor(ym).reduce((a, r) => { const v = revenue(ym, r); return a + (v.isSub ? v.cost : 0) }, 0), 0)
  const th = 'px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 text-left whitespace-nowrap'
  const cell = 'w-[26px] h-[28px] flex items-center justify-center font-mono text-[11.5px] font-semibold select-none outline-none'
  const canSeeMoney = hasRole('Admin', 'Operations', 'Finance', 'Billing', 'CostController', 'Executive')

  // ── One month at a time ───────────────────────────────────────────────────
  // With 100-200 tools a job could not be read as one long page, so the screen
  // shows a month, switches between marking days and money, filters by search,
  // and scrolls the table inside its own box with the header and totals pinned.
  const mi = months.indexOf(ym)
  const n = daysIn(ym || todayStr.slice(0, 7))
  const days = Array.from({ length: n }, (_, i) => i + 1)
  const all = ym ? rowsFor(ym) : []
  const needle = q.trim().toLowerCase()
  const dayCount = (r: UtilRow) => { let c = 0; for (let d = 1; d <= n; d++) if (valueOf(ym, r, d)) c++; return c }
  const shown = all.filter(r =>
    (!needle || [r.assetNo, r.toolId, r.label, r.dtNumber, (r as any).rtNo].some(x => String(x ?? '').toLowerCase().includes(needle))) &&
    (!onlyActive || dayCount(r) > 0))
  const tot = all.reduce((a, r) => {
    for (let d = 1; d <= n; d++) { const v = valueOf(ym, r, d); if (v === '1') a.ops++; else if (v === 'S') a.sb++ }
    return a
  }, { ops: 0, sb: 0 })
  const monthDirty = Object.keys(pending).filter(k => k.startsWith(ym + '|')).length + Object.keys(rotPend).filter(k => k.startsWith(ym + '|')).length
  const mRev = all.reduce((a, r) => a + revenue(ym, r).total, 0)
  const mCost = all.reduce((a, r) => { const v = revenue(ym, r); return a + (v.isSub ? v.cost : 0) }, 0)
  const revByMonth = (m: string) => rowsFor(m).reduce((a, r) => a + revenue(m, r).total, 0)
  const stick = 'sticky left-0 z-[5] bg-white'
  const isSubRow = (r: UtilRow) => !!(r as any).supplier || !!subs[`${ym}|${cKey(r)}`]
  const subAll = all.filter(isSubRow)
  const rowsV = view === 'sub' ? shown.filter(isSubRow) : shown
  const jobCur = (job as any)?.Currency || 'USD'
  const subDays = (r: UtilRow) => { let c = 0; for (let d = 1; d <= n; d++) if (valueOf(ym, r, d)) c++; return c }
  const subTot = subAll.reduce((a, r) => {
    const rt = rates[String(r.toolId ?? '')]
    a.days += subDays(r); a.cost += rt ? subDays(r) * rt.rate : 0; a.unrated += rt ? 0 : (subDays(r) > 0 ? 1 : 0)
    return a
  }, { days: 0, cost: 0, unrated: 0 })

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {/* Controls: month, view, find */}
      <div className="shrink-0 bg-white border border-gray-200 rounded-lg px-3 py-1.5 flex items-center gap-2 flex-wrap">
        <button className="btn-mini" disabled={mi <= 0} onClick={() => setYm(months[mi - 1])} title="Previous month">‹</button>
        <select className="field-input w-auto font-semibold" value={ym} onChange={e => setYm(e.target.value)}>
          {months.map(m => (
            <option key={m} value={m}>
              {monthLabel(m)} · {rowsFor(m).length} tools{canSeeMoney ? ` · ${fmtMoney(revByMonth(m))}` : ''}
            </option>
          ))}
        </select>
        <button className="btn-mini" disabled={mi < 0 || mi >= months.length - 1} onClick={() => setYm(months[mi + 1])} title="Next month">›</button>

        <div className="inline-flex rounded border border-gray-300 overflow-hidden ml-1" role="tablist" aria-label="View">
          {([['days', 'Mark days'], ...(canSeeMoney ? [['sub', `Sub-contract · ${subAll.length}`], ['money', 'Revenue & cost']] : [])] as [string, string][]).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k as any)}
                    className={`px-3 h-[28px] text-[12px] font-semibold ${view === k ? 'bg-navy-head text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
          ))}
        </div>

        <div className="relative w-56">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="field-input !pl-7" placeholder="Find serial, description, DT…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)} /> Only tools with days
        </label>

        <div className="ml-auto flex items-center gap-1.5 text-[11px]">
          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">SB {tot.sb}</span>
          <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">Ops {tot.ops}</span>
          <span className="px-2 py-0.5 rounded bg-white text-gray-600 border border-gray-200">
            {shown.length === all.length ? `${all.length} tools` : `${shown.length} of ${all.length} tools`}</span>
          {monthDirty > 0 && <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-300">{monthDirty} unsaved</span>}
          {!canEdit && <span className="text-gray-400 italic">View only</span>}
        </div>
      </div>

      {(view === 'days' || view === 'sub') && (
        <div className="flex-1 min-h-0 flex flex-col bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="shrink-0 flex items-center gap-4 px-3 py-1 border-b border-gray-200 text-[11.5px] text-gray-600 flex-wrap">
            <span className="flex items-center gap-1.5"><span className="inline-flex w-5 h-5 items-center justify-center rounded font-mono font-semibold bg-[#f0f6ff] text-[#1e3a5f] border border-[#bfdbfe]">S</span> Standby</span>
            <span className="flex items-center gap-1.5"><span className="inline-flex w-5 h-5 items-center justify-center rounded font-mono font-semibold bg-[#f0faf4] text-[#14532d] border border-[#bbf7d0]">1</span> Operating</span>
            {view === 'sub' && <span className="font-semibold text-orange-700">Hired-in tools only — mark their days here and set what we pay per day</span>}
            <span className="ml-auto text-[10.5px] text-gray-400">Type S / 1, it moves to the next day · click cycles · right-click fills to month end · Del clears · nothing is saved until you click Save</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="border-collapse text-[11.5px]" style={{ minWidth: `${860 + n * 26}px` }}>
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-gray-200">
                  <th className={`${th} ${stick} !z-20 w-[34px]`}>#</th>
                  <th className={`${th} sticky left-[34px] z-20 bg-white`}>Asset/S/N</th>
                  <th className={th}>Description</th>
                  <th className={th}>DT #</th><th className={th}>RM Dispatch</th><th className={th}>RT #</th><th className={th}>RM Backload</th>
                  {days.map(d => <th key={d} className="p-0 w-[26px] text-center font-mono text-[10px] font-medium text-gray-500 border-l border-gray-100">{d}</th>)}
                  <th className={`${th} text-center border-l border-gray-200`}>Rot Hrs</th>
                  <th className={`${th} text-center text-blue-700`}>SB</th>
                  <th className={`${th} text-center text-green-700`}>Ops</th>
                  {view === 'sub' && <>
                    <th className={`${th} border-l border-gray-200`}>Supplier</th>
                    <th className={th}>Day rate we pay</th>
                    <th className={`${th} text-right`}>Cost</th>
                  </>}
                </tr>
              </thead>
              <tbody>
                {rowsV.length === 0 && <tr><td colSpan={n + 13} className="text-center text-gray-400 py-8">
                  {all.length === 0 ? 'No tools on hire this month.'
                    : view === 'sub' && subAll.length === 0 ? 'No hired-in tools on this job this month.'
                    : 'No tools match the search.'}</td></tr>}
                {rowsV.map((r, ri) => {
                  let ops = 0, sb = 0
                  for (let d = 1; d <= n; d++) { const v = valueOf(ym, r, d); if (v === '1') ops++; else if (v === 'S') sb++ }
                  return (
                    <tr key={cKey(r) + ri} className="group border-b border-gray-100 hover:bg-gray-50/60">
                      <td className={`px-2 text-gray-400 ${stick} group-hover:bg-gray-50`}>{ri + 1}</td>
                      <td className="px-2 font-mono font-semibold text-gray-900 whitespace-nowrap sticky left-[34px] z-[5] bg-white group-hover:bg-gray-50">{r.assetNo || r.toolId}</td>
                      <td className="px-2 text-gray-700 max-w-[260px] truncate" title={r.label}>{r.label}</td>
                      <td className="px-2 font-mono text-gray-500 whitespace-nowrap">{r.dtNumber || '—'}</td>
                      <td className="px-2 text-gray-500 whitespace-nowrap">{shortDate(r.dateOut) || '—'}</td>
                      <td className="px-2 font-mono text-gray-500 whitespace-nowrap">{(r as any).rtNo || '—'}</td>
                      <td className="px-2 text-gray-500 whitespace-nowrap">{shortDate(r.dateIn) || <span className="text-amber-600">on rig</span>}</td>
                      {days.map(d => {
                        const v = valueOf(ym, r, d)
                        const ok = inWindow(r, ym, d)
                        const changed = `${ym}|${cKey(r)}|${d}` in pending
                        const tone = !ok ? 'bg-gray-100 cursor-not-allowed'
                          : v === '1' ? 'bg-[#f0faf4] text-[#14532d]' : v === 'S' ? 'bg-[#f0f6ff] text-[#1e3a5f]'
                          : 'bg-white hover:bg-blue-50'
                        return (
                          <td key={d} className="p-0 border-l border-gray-100">
                            <div data-util={`${ym}-${ri}-${d}`} tabIndex={ok && canEdit ? 0 : -1}
                              className={`${cell} ${tone} ${ok && canEdit ? 'cursor-pointer focus:shadow-[inset_0_0_0_2px_#2563eb]' : ''} ${changed ? 'shadow-[inset_0_0_0_2px_#fbbf24]' : ''}`}
                              title={ok ? undefined : 'Outside this tool’s DT–RT dates'}
                              onClick={() => ok && stage(ym, r, d, v === null ? '1' : v === '1' ? 'S' : null)}
                              onContextMenu={e => { e.preventDefault(); if (ok) for (let x = d + 1; x <= n; x++) stage(ym, r, x, v) }}
                              onKeyDown={e => ok && onKey(e, ym, r, ri, d)}>{v ?? ''}</div>
                          </td>
                        )
                      })}
                      <td className="px-1 border-l border-gray-200">
                        <input className="w-[56px] h-[22px] text-center text-[11px] font-mono border border-gray-200 rounded bg-white focus:outline-none focus:border-brand-500 disabled:bg-gray-50"
                          inputMode="decimal" placeholder="hrs" disabled={!canEdit}
                          value={rotPend[`${ym}|${cKey(r)}`] ?? (rot[`${ym}|${cKey(r)}`] ?? '')}
                          onChange={e => {
                            const v = e.target.value.replace(/[^0-9.]/g, '')
                            const k = `${ym}|${cKey(r)}`
                            setRotPend(p => { const nn = { ...p }; if (v === String(rot[k] ?? '')) delete nn[k]; else nn[k] = v; return nn })
                          }} />
                      </td>
                      <td className="px-2 text-center font-mono font-semibold text-blue-700">{sb}</td>
                      <td className="px-2 text-center font-mono font-semibold text-green-700">{ops}</td>
                      {view === 'sub' && (() => {
                        const tool = String(r.toolId ?? '')
                        const rt = rates[tool]
                        const curNow = rateCur[tool] ?? rt?.cur ?? jobCur
                        const cost = rt ? (sb + ops) * rt.rate : 0
                        return (<>
                          <td className="px-2 text-gray-700 whitespace-nowrap border-l border-gray-200">{(r as any).supplier || '—'}</td>
                          <td className="px-1 whitespace-nowrap">
                            {canPrice ? (
                              <div className="flex items-center gap-1">
                                <input inputMode="decimal" placeholder="rate"
                                  className={`w-[70px] h-[22px] text-right text-[11px] font-mono border rounded bg-white focus:outline-none focus:border-brand-500 ${rt || rateDraft[tool] ? 'border-gray-200' : 'border-amber-400 bg-amber-50'}`}
                                  value={rateDraft[tool] ?? (rt ? String(rt.rate) : '')}
                                  onChange={e => setRateDraft(d => ({ ...d, [tool]: e.target.value.replace(/[^0-9.]/g, '') }))}
                                  onBlur={() => saveRate(r)}
                                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                                <select className="h-[22px] w-[58px] text-[11px] border border-gray-200 rounded bg-white" value={curNow}
                                  onChange={e => { setRateCur(c => ({ ...c, [tool]: e.target.value })); setRateDraft(d => ({ ...d, [tool]: d[tool] ?? (rt ? String(rt.rate) : '') })) }}
                                  onBlur={() => saveRate(r)}>
                                  <ListOptions name="Currency" current={curNow} />
                                </select>
                              </div>
                            ) : (rt ? <span className="font-mono">{fmtMoney(rt.rate)} {rt.cur || ''}</span> : <span className="text-amber-600">no rate</span>)}
                          </td>
                          <td className={`px-2 text-right font-mono ${rt ? 'text-gray-800' : 'text-amber-600'}`}
                              title={rt ? undefined : 'No day rate yet — type it in the box to cost this tool'}>{rt ? fmtMoney(cost) : '—'}</td>
                        </>)
                      })()}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="sticky bottom-0 z-10">
                <tr className="bg-gray-50 border-t border-gray-300">
                  <td colSpan={7 + n + 1} className="px-3 py-1.5 text-right text-[10.5px] font-semibold text-gray-500">{monthLabel(ym)} {view === 'sub' ? 'hired-in totals' : 'totals'}</td>
                  <td className="text-center font-mono font-bold text-blue-700">{view === 'sub' ? '' : tot.sb}</td>
                  <td className="text-center font-mono font-bold text-green-700">{view === 'sub' ? subTot.days : tot.ops}</td>
                  {view === 'sub' && <>
                    <td colSpan={2} className="px-2 text-right text-[10.5px] text-amber-700">{subTot.unrated > 0 ? `${subTot.unrated} tool(s) with days and no rate` : ''}</td>
                    <td className="px-2 text-right font-mono font-bold">{fmtMoney(subTot.cost)}</td>
                  </>}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {view === 'money' && canSeeMoney && (
        <div className="flex-1 min-h-0 flex flex-col bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="shrink-0 flex items-center gap-4 px-3 py-1.5 border-b border-gray-200 text-[12px] text-gray-500 flex-wrap">
            <span className="font-semibold text-gray-900">{monthLabel(ym)}</span>
            <span>Revenue <b className="font-mono text-gray-900">{fmtMoney(mRev)}</b></span>
            <span>Sub-contract cost <b className="font-mono text-gray-900">{fmtMoney(mCost)}</b></span>
            <span>Margin <b className="font-mono text-gray-900">{fmtMoney(mRev - mCost)}</b></span>
            <span className="ml-auto text-[11px] text-gray-400">Whole job: revenue <b className="font-mono text-gray-700">{fmtMoney(grand)}</b> · cost <b className="font-mono text-gray-700">{fmtMoney(grandCost)}</b> · margin <b className="font-mono text-gray-700">{fmtMoney(grand - grandCost)}</b></span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[11.5px] border-collapse">
              <thead className="sticky top-0 z-10 bg-white"><tr className="border-b border-gray-200">
                <th className={th}>#</th><th className={th}>Serial / Asset</th><th className={th}>Description</th>
                <th className={th}>DT#</th><th className={th}>RT#</th>
                <th className={`${th} text-right`}>SB Days</th><th className={`${th} text-right`}>Ops Days</th>
                <th className={`${th} text-right`}>SB Rate</th><th className={`${th} text-right`}>Ops Rate</th>
                <th className={`${th} text-right`}>SB Value</th><th className={`${th} text-right`}>Ops Value</th>
                <th className={`${th} text-right`}>Revenue</th>
                <th className={`${th} text-right`}>Sub-contract Cost</th>
                <th className={`${th} text-right`}>Margin</th>
              </tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={14} className="text-center text-gray-400 py-8">
                  {all.length === 0 ? 'No tools on hire this month.' : 'No tools match the search.'}</td></tr>}
                {shown.map((r, i) => {
                  const v = revenue(ym, r)
                  const unpriced = (v.sb + v.ops) > 0 && v.total === 0
                  return (
                    <tr key={cKey(r) + i} className="border-b border-gray-100 hover:bg-gray-50/60 whitespace-nowrap">
                      <td className="px-2 text-gray-400">{i + 1}</td>
                      <td className="px-2 font-mono text-blue-700">{r.assetNo || r.toolId}</td>
                      <td className="px-2 text-gray-700 max-w-[280px] truncate" title={r.label}>{r.label}</td>
                      <td className="px-2 font-mono text-gray-500">{r.dtNumber || '—'}</td>
                      <td className="px-2 font-mono text-gray-500">{(r as any).rtNo || '—'}</td>
                      <td className="px-2 text-right font-mono text-blue-700">{v.sb}</td>
                      <td className="px-2 text-right font-mono text-green-700">{v.ops}</td>
                      <td className="px-2 text-right font-mono text-gray-500">{v.sbRate ? fmtMoney(v.sbRate) : '—'}</td>
                      <td className="px-2 text-right font-mono text-gray-500">{v.opsRate ? fmtMoney(v.opsRate) : '—'}</td>
                      <td className="px-2 text-right font-mono">{fmtMoney(v.sbV)}</td>
                      <td className="px-2 text-right font-mono">{fmtMoney(v.opsV)}</td>
                      <td className={`px-2 text-right font-mono font-bold ${unpriced ? 'text-amber-600' : ''}`}
                          title={unpriced ? 'Days saved with no contract rate' : undefined}>{fmtMoney(v.total)}</td>
                      <td className={`px-2 text-right font-mono ${v.costMissing ? 'text-amber-600' : 'text-gray-700'}`}
                          title={v.costMissing ? 'Hired-in tool: some days have no day rate yet — set it in the Sub-contract tab' : undefined}>
                        {v.isSub ? fmtMoney(v.cost) : '—'}</td>
                      <td className="px-2 text-right font-mono font-bold">{fmtMoney(v.total - (v.isSub ? v.cost : 0))}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="sticky bottom-0 z-10">
                <tr className="bg-gray-50 border-t border-gray-300 font-bold">
                  <td colSpan={5} className="px-2 py-1.5 text-right text-gray-600">{monthLabel(ym)} total{shown.length !== all.length ? ' (all tools)' : ''}</td>
                  <td className="px-2 text-right font-mono text-blue-700">{tot.sb}</td>
                  <td className="px-2 text-right font-mono text-green-700">{tot.ops}</td>
                  <td colSpan={4}></td>
                  <td className="px-2 text-right font-mono">{fmtMoney(mRev)}</td>
                  <td className="px-2 text-right font-mono">{fmtMoney(mCost)}</td>
                  <td className="px-2 text-right font-mono">{fmtMoney(mRev - mCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="shrink-0 bg-white border border-gray-200 rounded-lg px-3 py-1.5 flex items-center gap-2 justify-end">
        {pendingCount > 0 && <span className="text-[11.5px] font-semibold text-amber-700 mr-auto">{pendingCount} unsaved change{pendingCount === 1 ? '' : 's'}{monthDirty !== pendingCount ? ` (${monthDirty} in ${monthLabel(ym)})` : ''}</span>}
        {pendingCount > 0 && <button className="btn-mini" disabled={saving} onClick={() => { setPending({}); setRotPend({}) }}>Discard</button>}
        <button className="btn-mini" onClick={() => exportXlsx(ym)}>Export month</button>
        <button className="btn-mini" onClick={() => exportXlsx()}>Export all months</button>
        {canEdit && <button className="btn-primary text-xs py-1.5" disabled={saving || !pendingCount} onClick={() => save()}>
          {saving ? <><Spinner size="sm" /> Saving…</> : <><Save size={13} /> Save All</>}</button>}
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
          <ListOptions name="JobStatus" current={form.Status} />
        </select>

        <span className="field-label">Invoicing</span>
        <select className="field-input" value={form.InvoicingType || 'PerJob'} onChange={f('InvoicingType')} disabled={!canEdit}>
          <ListOptions name="InvoicingType" current={form.InvoicingType} />
        </select>

        <span className="field-label">Currency</span>
        <select className="field-input" value={form.Currency || 'USD'} onChange={f('Currency')} disabled={!canEdit}>
          <ListOptions name="Currency" current={form.Currency} />
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
  // Set by the system from the tickets and invoices: shown, never typed.
  const auto = (field: keyof Job, label: string, kind: 'date' | 'text') => (
    <React.Fragment key={String(field)}>
      <span className="field-label">{label}</span>
      <input type={kind === 'date' ? 'date' : 'text'} className="field-input bg-gray-50 text-gray-600"
             value={kind === 'date' ? toDateInput(form[field] as string) : String(form[field] ?? '')}
             readOnly disabled title="Filled in automatically from the job's tickets and invoices" />
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
          {auto('FirstDtDate', 'First DT', 'date')}
          {auto('LastRtDate', 'Last RT', 'date')}
          {auto('DocsSignedDate', 'Docs Signed', 'date')}
          {auto('SubmittedToBillingDate', 'To Billing', 'date')}
          {auto('DraftInvoicedDate', 'Draft Invoiced', 'date')}
          {auto('DraftInvoiceNumber', 'Draft Inv No', 'text')}
          {auto('SesSubmittedDate', 'SES Submitted', 'date')}
          {auto('SesNumber', 'SES No', 'text')}
          {auto('FinalInvoicedDate', 'Final Invoiced', 'date')}
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


/**
 * Manpower / Crew — was a placeholder. tbl_JobPersonnel and its GET/POST/
 * DELETE endpoints already existed; only the screen was missing, so crew
 * could never be recorded against a job.
 */
interface Person {
  PersonnelID: number; BadgeNo: string | null; Name: string; Designation: string | null
  PersonType: string; Company: string | null; RigPassNo: string | null; H2SExpiry: string | null
}

/**
 * Crew on a job. People are picked from the personnel register (our own staff
 * and sub-contractor staff) and never typed onto the job, so one person cannot
 * appear twice under different spellings. A person missing from the register
 * is added there once, from the picker.
 */
function ManpowerTab({ jobId, canEdit }: { jobId: string; canEdit: boolean }) {
  const { showToast } = useToast()
  const { data: crew, isLoading, refetch } =
    useFetch<Array<Record<string, unknown>>>(`/jobs/${jobId}/personnel`)

  const [pickOpen, setPickOpen] = useState(false)
  const [register, setRegister] = useState<Person[]>([])
  const [regLoading, setRegLoading] = useState(false)
  const [role, setRole] = useState('')
  const [type, setType] = useState('')
  const [q, setQ] = useState('')
  const [checked, setChecked] = useState<Set<number>>(new Set())
  const [mob, setMob] = useState(new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const blank = { Name: '', BadgeNo: '', Designation: '', PersonType: 'EMDAD', Company: '', RigPassNo: '', H2SExpiry: '', Phone: '' }
  const [np, setNp] = useState(blank)

  const loadRegister = async () => {
    setRegLoading(true)
    try { setRegister(await api.get<Person[]>('/personnel')) }
    catch { showToast('Failed to load the personnel register', 'error') }
    finally { setRegLoading(false) }
  }
  const openPicker = () => { setChecked(new Set()); setPickOpen(true); loadRegister() }

  const onJob = new Set((crew || []).filter(c => !c.DemobDate).map(c => Number(c.PersonnelID)))
  const roles = Array.from(new Set(register.map(p => p.Designation).filter(Boolean) as string[])).sort()
  const shown = register.filter(p =>
    (!role || p.Designation === role) && (!type || p.PersonType === type) &&
    (!q || `${p.Name} ${p.BadgeNo || ''} ${p.Company || ''}`.toLowerCase().includes(q.toLowerCase())))

  const insert = async () => {
    if (!checked.size) return
    setBusy(true)
    try {
      const res = await api.post<{ added: number; alreadyOnJob: string[] }>(`/jobs/${jobId}/personnel`,
        Array.from(checked).map(PersonnelID => ({ PersonnelID, MobDate: mob })))
      showToast(`${res.added} added to the job${res.alreadyOnJob?.length ? ` (already on it: ${res.alreadyOnJob.join(', ')})` : ''}`, 'success')
      setPickOpen(false); refetch()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add crew', 'error')
    } finally { setBusy(false) }
  }

  const addPerson = async () => {
    setBusy(true)
    try {
      await api.post('/personnel', np)
      showToast('Added to the register', 'success')
      setNp(blank); setAdding(false); loadRegister()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add', 'error')
    } finally { setBusy(false) }
  }

  const remove = async (pid: unknown, name: unknown) => {
    if (!window.confirm(`Remove ${name || 'this crew member'} from the job?`)) return
    try {
      await api.delete(`/jobs/${jobId}/personnel/${pid}`)
      showToast('Removed', 'success'); refetch()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to remove', 'error')
    }
  }

  const str = (v: unknown) => (v == null || v === '' ? '—' : String(v))
  const th = 'table-th'
  const activeCount = (crew || []).filter(c => !c.DemobDate).length

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 bg-white border border-gray-300 rounded px-3 py-2">
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-navy-head">Field Engineers &amp; Rig Crew</div>
          <div className="text-[11.5px] text-gray-500">Pick from the personnel register — our own staff and sub-contractor staff.</div>
        </div>
        {canEdit && (
          <button className="btn-primary ml-auto" onClick={openPicker}><Plus size={12} /> Select Personnel / Crew</button>
        )}
      </div>

      <div className="bg-white border border-gray-300 rounded overflow-hidden">
        {isLoading ? (
          <div className="py-8 flex justify-center"><Spinner size="md" /></div>
        ) : !crew?.length ? (
          <div className="py-8 text-center text-gray-400 text-xs">No personnel assigned to this job yet.</div>
        ) : (
          <table className="w-full border-collapse">
            <thead><tr>
              <th className={`${th} w-10`}>Seq</th><th className={th}>Badge #</th><th className={th}>Name</th>
              <th className={th}>Designation</th><th className={th}>Type / Company</th>
              <th className={th}>Mob</th><th className={th}>Demob</th><th className={th}>Rig Pass</th><th className={th}>H2S Expiry</th>
              {canEdit && <th className={`${th} w-8`}></th>}
            </tr></thead>
            <tbody>
              {crew.map((p, i) => (
                <tr key={String(p.id ?? i)} className="border-b border-gray-100 hover:bg-blue-50/50">
                  <td className="table-td text-gray-400">{i + 1}</td>
                  <td className="table-td font-mono">{str(p.BadgeNo)}</td>
                  <td className="table-td font-semibold text-navy-head">{str(p.Name)}</td>
                  <td className="table-td text-gray-700">{str(p.Role)}</td>
                  <td className="table-td text-gray-600">{p.PersonType === 'Sub-contractor' ? `Sub-contractor · ${str(p.Company)}` : (p.PersonType ? 'EMDAD' : '—')}</td>
                  <td className="table-td text-gray-500">{toDateInput(p.MobDate as string) || '—'}</td>
                  <td className="table-td text-gray-500">{toDateInput(p.DemobDate as string) || <span className="text-green-700">Active</span>}</td>
                  <td className="table-td font-mono text-blue-700">{str(p.RigPassNo)}</td>
                  <td className="table-td text-gray-500">{toDateInput(p.H2SExpiry as string) || '—'}</td>
                  {canEdit && (
                    <td className="table-td">
                      <button onClick={() => remove(p.id, p.Name)} className="text-gray-300 hover:text-red-500" title="Remove">
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
      <div className="bg-navy-head text-white rounded px-3 py-1.5 text-[12px] flex gap-6">
        <span>Total assigned: <b className="text-accent-300">{crew?.length ?? 0}</b></span>
        <span>Active on rig: <b className="text-green-400">{activeCount}</b></span>
      </div>

      <Modal open={pickOpen} onClose={() => setPickOpen(false)} title="Field Crew Assignment Picker" size="2xl"
        footer={
          <div className="flex items-center gap-3 w-full">
            <span className="text-[12px] text-gray-500">Selected: <b>{checked.size}</b></span>
            <label className="flex items-center gap-1.5 text-[12px] text-gray-600 ml-4">Mob date
              <input type="date" className="field-input !w-[140px]" value={mob} onChange={e => setMob(e.target.value)} />
            </label>
            <button className="btn-secondary ml-auto" onClick={() => setPickOpen(false)}>Cancel</button>
            <button className="btn-primary" disabled={!checked.size || busy} onClick={insert}>
              {busy ? <Spinner size="sm" /> : null} Insert Selected ({checked.size})
            </button>
          </div>
        }>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <select className="field-input !w-auto" value={role} onChange={e => setRole(e.target.value)}>
            <option value="">All designations</option>
            {roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className="field-input !w-auto" value={type} onChange={e => setType(e.target.value)}>
            <option value="">EMDAD + Sub-contractors</option>
            <option value="EMDAD">EMDAD staff</option>
            <option value="Sub-contractor">Sub-contractor staff</option>
          </select>
          <input className="field-input !w-[220px]" placeholder="Search name, badge, company" value={q} onChange={e => setQ(e.target.value)} />
          <span className="text-[11.5px] text-gray-500">{shown.length} available</span>
          <button className="btn-mini ml-auto" onClick={() => setAdding(a => !a)}><Plus size={12} /> Add Personnel</button>
        </div>

        {adding && (
          <div className="border border-gray-300 rounded p-2 mb-2 bg-gray-50 grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1.5">
            {([['Name *', 'Name'], ['Badge #', 'BadgeNo'], ['Designation', 'Designation'], ['Rig Pass #', 'RigPassNo'], ['Phone', 'Phone']] as [string, keyof typeof blank][]).map(([l, k]) => (
              <label key={k} className="text-[11px] font-semibold text-gray-600">{l}
                {k === 'Designation' ? (
                  <select className="field-input mt-0.5" value={np[k]}
                          onChange={e => setNp(p => ({ ...p, [k]: e.target.value }))}>
                    <ListOptions name="CrewDesignation" current={np[k]} blank blankLabel="— select —" />
                  </select>
                ) : (
                  <input className="field-input mt-0.5"
                         value={np[k]} onChange={e => setNp(p => ({ ...p, [k]: e.target.value }))} />
                )}
              </label>
            ))}
            <label className="text-[11px] font-semibold text-gray-600">H2S expiry
              <input type="date" className="field-input mt-0.5" value={np.H2SExpiry} onChange={e => setNp(p => ({ ...p, H2SExpiry: e.target.value }))} />
            </label>
            <label className="text-[11px] font-semibold text-gray-600">Belongs to
              <select className="field-input mt-0.5" value={np.PersonType} onChange={e => setNp(p => ({ ...p, PersonType: e.target.value }))}>
                <option value="EMDAD">EMDAD</option><option value="Sub-contractor">Sub-contractor</option>
              </select>
            </label>
            {np.PersonType === 'Sub-contractor' && (
              <label className="text-[11px] font-semibold text-gray-600">Company *
                <input className="field-input mt-0.5" value={np.Company} onChange={e => setNp(p => ({ ...p, Company: e.target.value }))} />
              </label>
            )}
            <div className="flex items-end">
              <button className="btn-primary" disabled={busy || !np.Name.trim()} onClick={addPerson}>Save to register</button>
            </div>
          </div>
        )}

        <div className="max-h-[50vh] overflow-auto border border-gray-200 rounded">
          {regLoading ? <div className="py-8 flex justify-center"><Spinner size="md" /></div> : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0"><tr>
                <th className={`${th} w-8`}></th><th className={th}>Badge #</th><th className={th}>Name</th><th className={th}>Designation</th>
                <th className={th}>Type / Company</th><th className={th}>Rig Pass</th><th className={th}>H2S Expiry</th>
              </tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan={7} className="table-td text-center text-gray-400 py-6">
                  Nobody in the register matches. Use “Add Personnel” to add them once.</td></tr>}
                {shown.map(p => {
                  const already = onJob.has(p.PersonnelID)
                  const on = checked.has(p.PersonnelID)
                  return (
                    <tr key={p.PersonnelID} className={`border-b border-gray-100 ${already ? 'opacity-50' : 'cursor-pointer hover:bg-blue-50/50'} ${on ? 'bg-blue-50' : ''}`}
                        onClick={() => !already && setChecked(prev => { const n = new Set(prev); n.has(p.PersonnelID) ? n.delete(p.PersonnelID) : n.add(p.PersonnelID); return n })}>
                      <td className="table-td"><input type="checkbox" checked={on} disabled={already} readOnly /></td>
                      <td className="table-td font-mono">{str(p.BadgeNo)}</td>
                      <td className="table-td font-semibold text-navy-head">{p.Name}{already && <span className="ml-2 text-[10px] text-gray-500">on this job</span>}</td>
                      <td className="table-td">{str(p.Designation)}</td>
                      <td className="table-td text-gray-600">{p.PersonType === 'Sub-contractor' ? `Sub-contractor · ${str(p.Company)}` : 'EMDAD'}</td>
                      <td className="table-td font-mono text-blue-700">{str(p.RigPassNo)}</td>
                      <td className="table-td text-gray-500">{toDateInput(p.H2SExpiry) || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </Modal>
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
  const utilGate = React.useRef<UtilGate | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [form,    setForm]    = useState<Partial<Job>>({
    Status: 'Open', Currency: 'USD', InvoicingType: 'PerJob',
  })
  // Checklist lives here so it persists across tab switches
  const [checklist,    setChecklist]    = useState<ChecklistItem[]>([])
  // When DT is generated, store its ID so DT tab auto-focuses it
  const [generatedDTID, setGeneratedDTID] = useState<number | null>(null)

  const { data: job, isLoading, refetch } = useFetch<Job>(isNew ? null : `/jobs/${id}`)

  async function unlockJob() {
    // A reason is required by the API and stored against the job, so a
    // change to a finished job can always be explained later.
    const reason = window.prompt('Why does this completed job need correcting?')
    if (!reason || !reason.trim()) return
    try {
      await api(`/jobs/${id}/unlock`, { method: 'POST', body: JSON.stringify({ Reason: reason.trim() }) })
      showToast('Job unlocked', 'success')
      refetch()
    } catch (e: any) {
      showToast(e.message || 'Could not unlock the job', 'error')
    }
  }

  async function relockJob() {
    try {
      await api(`/jobs/${id}/lock`, { method: 'POST', body: '{}' })
      showToast('Job locked', 'success')
      refetch()
    } catch (e: any) {
      showToast(e.message || 'Could not lock the job', 'error')
    }
  }

  useEffect(() => {
    if (job) setForm(job)
  }, [job])

  // A finished job is read-only. The API enforces this too - the disabled
  // fields here are the courtesy, the 423 from the server is the control.
  const canEdit = hasRole('Admin', 'Operations') && !job?.IsLocked

  function set(field: keyof Job, value: unknown) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    if (!canEdit) return
    if (utilGate.current?.dirty) await utilGate.current.save()
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
      <div className="bg-gray-900 text-white px-3 py-1.5 flex items-center gap-3 rounded-t shrink-0">
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
          <button onClick={handleSave} disabled={saving} className="btn-primary text-xs py-1">
            {saving ? <><Spinner size="sm" /> Saving…</> : <><Save size={13} /> Save Job File</>}
          </button>
        )}
      </div>

      {/* Context bar */}
      {!isNew && (
        <div className="bg-gray-800 text-gray-300 px-3 py-1 flex items-center gap-4 text-[11.5px] flex-wrap shrink-0">
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

      {/* A finished job is read-only. Shown rather than silently disabling
          every field, so nobody wonders why nothing can be typed. */}
      {job?.IsLocked && (
        <div className="flex items-center gap-3 px-4 py-2 bg-amber-50 border-y border-amber-200 text-sm">
          <Lock size={15} className="text-amber-700 shrink-0" />
          <span className="text-amber-900">
            This job is <strong>Completed</strong> and locked. Nothing on it can be changed.
          </span>
          {hasRole('Admin') && (
            <button className="btn-ghost text-xs ml-auto text-amber-900 underline"
                    onClick={unlockJob}>Unlock to correct it</button>
          )}
        </div>
      )}
      {job && !job.IsLocked && job.UnlockedBy && (
        <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border-y border-blue-200 text-sm">
          <Unlock size={15} className="text-blue-700 shrink-0" />
          <span className="text-blue-900">
            Unlocked by <strong>{job.UnlockedBy}</strong>
            {job.UnlockReason ? <> — {job.UnlockReason}</> : null}
          </span>
          {hasRole('Admin') && (
            <button className="btn-ghost text-xs ml-auto text-blue-900 underline"
                    onClick={relockJob}>Lock again</button>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-gray-200 bg-white shrink-0">
        {WORKSPACE_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => {
              if (tab === 'util' && t.id !== 'util' && utilGate.current?.dirty &&
                  !window.confirm('You have unsaved utilization changes. Leave without saving?')) return
              setTab(t.id)
            }}
            disabled={isNew && t.id !== 'header'}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium border-b-2 whitespace-nowrap transition-colors -mb-px shrink-0 ${
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
      <div className={`flex-1 min-h-0 pt-2 ${tab === 'dt' || tab === 'util' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
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
          <div className="space-y-4">
            {/* Only renders when the job is Monthly — rollover is what that
                setting means, and on a per-job job it would quietly carry
                tools into work billed as one complete job. */}
            <RolloverPanel
              jobId={id!}
              invoicingType={form.InvoicingType}
              rolledFrom={job?.RolledFromJobID}
              onDone={refetch}
            />
          </div>
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
          <UtilizationTab jobId={id!} job={job || {}} gate={utilGate} />
        )}
      </div>

    </div>
  )
}
