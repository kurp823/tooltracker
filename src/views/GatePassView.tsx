import React, { useState, useMemo, useCallback } from 'react'
import {
  Plus, Search, RefreshCw, X, ChevronRight,
  Trash2, Package, Save, ArrowUpCircle, ArrowDownCircle,
  Link2,
} from 'lucide-react'
import { useRealtimeFetch } from '../hooks/useRealtimeFetch'
import { useFetch }         from '../hooks/useFetch'
import { useAuth }          from '../contexts/AuthContext'
import { useToast }         from '../components/Toast'
import { api }              from '../utils/api'
import { formatDate }       from '../utils/format'
import { PageLoader, Spinner } from '../components/Spinner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface GatePass {
  GatePassID:        string
  GatePassNumber:    string
  Supplier:          string | null
  Direction:         'Outward' | 'Inward'
  Purpose:           string | null
  PassDate:          string | null
  Status:            string | null
  PreparedBy:        string | null
  AuthorizedBy:      string | null
  Notes:             string | null
  LinkedGatePassID:  string | null
  ItemCount:         number
}

interface GPItem {
  ItemID:            number
  GatePassID:        string
  SerialNumber:      string | null
  AssetNo:           string | null
  ToolDescription:   string | null
  Size:              string | null
  Quantity:          number
  Condition:         string | null
  OriginalSupplier:  string | null
}

interface InventoryItem {
  SystemID:     string
  Serial:       string | null
  AssetNo:      string | null
  ShortDesc:    string | null
  SizeName:     string | null
  CategoryName: string | null
  Supplier:     string | null
}

interface SupplierRow {
  SupplierID:   number
  SupplierName: string
}

interface OutwardGP {
  GatePassID:      string
  GatePassNumber:  string
  Supplier:        string | null
  PassDate:        string | null
  Purpose:         string | null
  TotalTools:      number
  UnreturnedTools: number
}

const PURPOSES = ['Repair', 'Return to Supplier', 'Other']
const STATUSES = ['Draft', 'Released', 'Closed']

// ─── Tool Picker — from inventory ────────────────────────────────────────────

function ToolPickerModal({
  open, onClose, onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (item: InventoryItem) => void
}) {
  const [search,  setSearch]  = useState('')
  const [results, setResults] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(false)

  const handleSearch = useCallback(async (q: string) => {
    setSearch(q)
    if (q.length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const data = await api.get<InventoryItem[]>(`/inventory?search=${encodeURIComponent(q)}`)
      setResults(Array.isArray(data) ? data.slice(0, 20) : [])
    } catch { setResults([]) }
    finally  { setLoading(false) }
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="font-semibold text-gray-900 flex items-center gap-2">
            <Package size={16} className="text-brand-600" /> Select Tool from Inventory
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus className="input pl-9 w-full"
              placeholder="Search serial, asset, description…"
              value={search} onChange={e => handleSearch(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex justify-center py-8"><Spinner /></div>}
          {!loading && search.length < 2 && (
            <p className="text-center text-gray-400 text-sm py-8">Type at least 2 characters</p>
          )}
          {!loading && search.length >= 2 && results.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">No tools found</p>
          )}
          {results.map(item => (
            <button key={item.SystemID}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
              onClick={() => { onSelect(item); onClose(); setSearch(''); setResults([]) }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sm text-gray-900">
                    {item.AssetNo || item.Serial || '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.ShortDesc}</p>
                  {item.Supplier && (
                    <p className="text-[10px] text-gray-400 mt-0.5">Supplier: {item.Supplier}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {item.SizeName && (
                    <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{item.SizeName}</span>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">{item.CategoryName}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Unreturned Tool Picker — for Inward GP ──────────────────────────────────

function UnreturnedToolPickerModal({
  open, outwardGPID, onClose, onSelect,
}: {
  open: boolean
  outwardGPID: string
  onClose: () => void
  onSelect: (item: GPItem) => void
}) {
  const { data: tools, isLoading } =
    useFetch<GPItem[]>(open && outwardGPID ? `/gate-passes/${outwardGPID}/unreturned-tools` : null)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <span className="font-semibold text-gray-900 flex items-center gap-2">
            <ArrowDownCircle size={16} className="text-green-600" /> Select Tool to Receive
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && <div className="flex justify-center py-8"><Spinner /></div>}
          {!isLoading && (!tools || tools.length === 0) && (
            <p className="text-center text-gray-400 text-sm py-8">All tools from this gate pass have been returned</p>
          )}
          {(tools || []).map(item => (
            <button key={item.ItemID}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
              onClick={() => { onSelect(item); onClose() }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-sm text-gray-900">
                    {item.AssetNo || item.SerialNumber || '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.ToolDescription}</p>
                </div>
                <div className="text-right shrink-0">
                  {item.Size && (
                    <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{item.Size}</span>
                  )}
                  {item.OriginalSupplier && (
                    <p className="text-[10px] text-gray-400 mt-0.5">{item.OriginalSupplier}</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Create Modal ─────────────────────────────────────────────────────────────

function CreateGPModal({
  open, onClose, onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const { success, error: toastErr } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    Direction: 'Outward' as 'Outward' | 'Inward',
    Supplier:  '',
    Purpose:   'Repair',
    PassDate:  new Date().toISOString().split('T')[0],
    Notes:     '',
    LinkedGatePassID: '',
  })

  const { data: suppliers } = useFetch<SupplierRow[]>('/suppliers')
  const { data: outwardGPs } = useFetch<OutwardGP[]>(
    form.Direction === 'Inward' ? '/gate-passes?filter=outward-open' : null
  )

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  // When user picks an outward GP for inward, auto-fill Supplier
  const handleOutwardSelect = (gpId: string) => {
    const gp = (outwardGPs || []).find(g => g.GatePassID === gpId)
    setForm(f => ({
      ...f,
      LinkedGatePassID: gpId,
      Supplier: gp?.Supplier || f.Supplier,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.Supplier) { toastErr('Supplier is required'); return }
    if (form.Direction === 'Inward' && !form.LinkedGatePassID) {
      toastErr('Select the outward gate pass these tools are returning from'); return
    }
    setSaving(true)
    try {
      const res = await api.post<{ GatePassID: string; GatePassNumber: string }>('/gate-passes', form)
      success(`Created ${res.GatePassNumber}`)
      onCreated()
      setForm({
        Direction: 'Outward', Supplier: '', Purpose: 'Repair',
        PassDate: new Date().toISOString().split('T')[0], Notes: '', LinkedGatePassID: '',
      })
    } catch (err: any) {
      toastErr(err.message || 'Failed to create gate pass')
    } finally { setSaving(false) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Package size={16} className="text-brand-600" />
            New Gate Pass
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Direction */}
          <div>
            <label className="label">Direction *</label>
            <div className="flex gap-2">
              {(['Outward', 'Inward'] as const).map(d => (
                <button key={d} type="button"
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                    form.Direction === d
                      ? d === 'Outward'
                        ? 'bg-amber-50 border-amber-300 text-amber-700'
                        : 'bg-green-50 border-green-300 text-green-700'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                  onClick={() => set('Direction', d)}>
                  {d === 'Outward' ? <ArrowUpCircle size={14} /> : <ArrowDownCircle size={14} />}
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Inward: select outward GP */}
          {form.Direction === 'Inward' && (
            <div>
              <label className="label">Returning from Gate Pass *</label>
              <select className="input w-full" value={form.LinkedGatePassID}
                onChange={e => handleOutwardSelect(e.target.value)} required>
                <option value="">— Select outward GP —</option>
                {(outwardGPs || []).map(g => (
                  <option key={g.GatePassID} value={g.GatePassID}>
                    {g.GatePassNumber} — {g.Supplier} ({g.UnreturnedTools} tools pending)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Supplier */}
          <div>
            <label className="label">Supplier *</label>
            <select className="input w-full" value={form.Supplier}
              onChange={e => set('Supplier', e.target.value)}
              disabled={form.Direction === 'Inward' && !!form.LinkedGatePassID}
              required>
              <option value="">— Select supplier —</option>
              {(suppliers || []).map(s => (
                <option key={s.SupplierID} value={s.SupplierName}>{s.SupplierName}</option>
              ))}
            </select>
            {form.Direction === 'Inward' && form.LinkedGatePassID && (
              <p className="text-[10px] text-gray-400 mt-1">Auto-filled from outward gate pass</p>
            )}
          </div>

          {/* Purpose (outward only) and Date */}
          <div className="grid grid-cols-2 gap-3">
            {form.Direction === 'Outward' ? (
              <div>
                <label className="label">Purpose *</label>
                <select className="input w-full" value={form.Purpose}
                  onChange={e => set('Purpose', e.target.value)}>
                  {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            ) : (
              <div>
                <label className="label">Purpose</label>
                <div className="field-value text-sm mt-1">Return from Repair</div>
              </div>
            )}
            <div>
              <label className="label">Release Date</label>
              <input type="date" className="input w-full" value={form.PassDate}
                onChange={e => set('PassDate', e.target.value)} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes</label>
            <textarea className="input w-full" rows={2} value={form.Notes}
              placeholder="Comments or instructions" onChange={e => set('Notes', e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <Spinner size="sm" /> : <Plus size={14} />}
              Create Gate Pass
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function GPDetailPanel({
  gp, onClose, onRefresh,
}: {
  gp: GatePass
  onClose: () => void
  onRefresh: () => void
}) {
  const { hasRole } = useAuth()
  const { success, error: toastErr } = useToast()
  const canEdit = hasRole('Admin', 'Operations')

  const isOutward = gp.Direction === 'Outward'
  const isInward  = gp.Direction === 'Inward'

  const [showPicker,    setShowPicker]    = useState(false)
  const [showUnretPicker, setShowUnretPicker] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty,  setDirty]  = useState(false)
  const [form, setForm] = useState({
    PassDate:     gp.PassDate?.split('T')[0] ?? '',
    Status:       gp.Status ?? 'Draft',
    Purpose:      gp.Purpose ?? '',
    AuthorizedBy: gp.AuthorizedBy ?? '',
    Notes:        gp.Notes ?? '',
  })

  const set = (k: string, v: string) => { setForm(f => ({ ...f, [k]: v })); setDirty(true) }

  const { data: items, refetch: refetchItems } =
    useFetch<GPItem[]>(`/gate-passes/${gp.GatePassID}/items`)

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put(`/gate-passes/${gp.GatePassID}`, form)
      setDirty(false)
      success('Gate pass saved')
      onRefresh()
    } catch (err: any) {
      toastErr(err.message || 'Save failed')
    } finally { setSaving(false) }
  }

  // Add tool from inventory (Outward GP)
  const handleAddFromInventory = async (item: InventoryItem) => {
    try {
      await api.post(`/gate-passes/${gp.GatePassID}/items`, {
        Serial: item.Serial,
        AssetNo: item.AssetNo,
        ToolDescription: item.ShortDesc,
        Size: item.SizeName,
        Quantity: 1,
      })
      refetchItems()
      success('Tool added')
    } catch (err: any) { toastErr(err.message || 'Failed to add tool') }
  }

  // Add tool from unreturned list (Inward GP)
  const handleAddFromUnreturned = async (item: GPItem) => {
    try {
      await api.post(`/gate-passes/${gp.GatePassID}/items`, {
        Serial: item.SerialNumber,
        AssetNo: item.AssetNo,
        ToolDescription: item.ToolDescription,
        Size: item.Size,
        Quantity: item.Quantity,
        OriginalSupplier: item.OriginalSupplier,
      })
      refetchItems()
      success('Tool received')
    } catch (err: any) { toastErr(err.message || 'Failed to add tool') }
  }

  const handleRemove = async (itemId: number) => {
    try {
      await api.delete(`/gate-passes/${gp.GatePassID}/items/${itemId}`)
      refetchItems()
      success('Removed')
    } catch (err: any) { toastErr(err.message || 'Failed to remove') }
  }

  const dirBadge = isOutward
    ? 'bg-amber-100 text-amber-700'
    : 'bg-green-100 text-green-700'

  return (
    <>
      {isOutward && (
        <ToolPickerModal open={showPicker} onClose={() => setShowPicker(false)} onSelect={handleAddFromInventory} />
      )}
      {isInward && gp.LinkedGatePassID && (
        <UnreturnedToolPickerModal
          open={showUnretPicker}
          outwardGPID={gp.LinkedGatePassID}
          onClose={() => setShowUnretPicker(false)}
          onSelect={handleAddFromUnreturned}
        />
      )}

      <div className="screen">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-2 h-[30px] bg-navy-head text-white shrink-0 rounded-t">
          <button onClick={onClose} className="hover:text-accent-400" title="Back">
            <X size={15} />
          </button>
          <span className="text-[13px] font-bold tracking-wide">GATE PASS</span>
          <span className="ml-auto font-mono font-bold text-accent-400 text-[14px]">
            {gp.GatePassNumber}
          </span>
          <span className={`text-[10px] rounded px-1.5 py-0.5 ml-1 ${dirBadge}`}>
            {isOutward ? '▲ OUTWARD' : '▼ INWARD'}
          </span>
        </div>

        {/* Header fields */}
        <div className="field-row bg-white border-x border-b border-gray-300 px-2 py-1.5 shrink-0
                        grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_auto_1fr] xl:grid-cols-[auto_1fr_auto_1fr_auto_1fr_auto_1fr]">
          <span className="field-label">Supplier</span>
          <div className="field-value">{gp.Supplier || '—'}</div>

          <span className="field-label">Purpose</span>
          {canEdit && isOutward ? (
            <select className="field-input" value={form.Purpose} onChange={e => set('Purpose', e.target.value)}>
              {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : (
            <div className="field-value">{gp.Purpose || (isInward ? 'Return from Repair' : '—')}</div>
          )}

          <span className="field-label">Release Date</span>
          <input type="date" className="field-input" value={form.PassDate}
            disabled={!canEdit} onChange={e => set('PassDate', e.target.value)} />

          <span className="field-label">Status</span>
          {canEdit ? (
            <select className="field-input" value={form.Status} onChange={e => set('Status', e.target.value)}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <div className="field-value">{form.Status}</div>
          )}

          {isInward && gp.LinkedGatePassID && (
            <>
              <span className="field-label">Linked Outward GP</span>
              <div className="field-value font-mono flex items-center gap-1">
                <Link2 size={11} className="text-gray-400" />
                {gp.LinkedGatePassID}
              </div>
            </>
          )}

          <span className="field-label">Authorized By</span>
          <input className="field-input" value={form.AuthorizedBy} placeholder="—"
            disabled={!canEdit} onChange={e => set('AuthorizedBy', e.target.value)} />
        </div>

        {/* Tool lines table */}
        <div className="flex-1 min-h-0 flex flex-col bg-white border-x border-gray-300">
          <div className="flex items-center gap-2 px-2 h-[26px] bg-gray-100 border-b border-gray-300 shrink-0">
            <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
              Tool Manifest ({items?.length ?? 0})
            </span>
            {canEdit && (
              <button className="btn-mini ml-auto !py-px"
                onClick={() => isInward ? setShowUnretPicker(true) : setShowPicker(true)}>
                <Plus size={11} /> {isInward ? 'Receive Tool' : 'Add Tool'}
              </button>
            )}
          </div>

          {(!items || items.length === 0) ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <Package size={28} className="mb-1.5 opacity-30" />
              <p className="text-xs">No tools in manifest</p>
              {canEdit && (
                <button className="mt-2 text-brand-600 text-xs hover:text-brand-700"
                  onClick={() => isInward ? setShowUnretPicker(true) : setShowPicker(true)}>
                  + {isInward ? 'Receive first tool' : 'Add first tool'}
                </button>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[12px] border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="table-th">#</th>
                    <th className="table-th">Asset No</th>
                    <th className="table-th">Serial</th>
                    <th className="table-th">Description</th>
                    <th className="table-th !text-right">Qty</th>
                    <th className="table-th">Registered Supplier</th>
                    {canEdit && <th className="table-th w-8"></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={item.ItemID} className="border-b border-gray-100 hover:bg-brand-50/40">
                      <td className="table-td text-gray-400">{i + 1}</td>
                      <td className="table-td font-mono">{item.AssetNo || '—'}</td>
                      <td className="table-td font-mono text-gray-500">{item.SerialNumber || '—'}</td>
                      <td className="table-td text-gray-600 max-w-[200px] truncate"
                        title={item.ToolDescription || ''}>{item.ToolDescription || '—'}</td>
                      <td className="table-td text-right">{item.Quantity}</td>
                      <td className="table-td text-gray-500">{item.OriginalSupplier || '—'}</td>
                      {canEdit && (
                        <td className="table-td">
                          <button onClick={() => handleRemove(item.ItemID)}
                            className="text-gray-300 hover:text-red-500 transition-colors" title="Remove">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer — Prepared By + Notes + Save */}
        <div className="field-row bg-gray-50 border border-gray-300 rounded-b px-2 py-1.5 shrink-0
                        grid-cols-[auto_1fr] lg:grid-cols-[auto_1fr_auto_2fr]">
          <span className="field-label">Prepared By</span>
          <div className="field-value text-gray-700">{gp.PreparedBy || '—'}</div>

          <span className="field-label">Notes</span>
          <div className="flex items-center gap-1.5">
            <input className="field-input flex-1" value={form.Notes}
              disabled={!canEdit} onChange={e => set('Notes', e.target.value)}
              placeholder="Comments or instructions" />
            {canEdit && (
              <button className="btn-accent shrink-0" onClick={handleSave}
                disabled={saving || !dirty}
                title={dirty ? 'Save gate pass' : 'No unsaved changes'}>
                {saving ? <Spinner size="sm" /> : <Save size={12} />}
                {dirty ? 'Save' : 'Saved'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Main View — Register ────────────────────────────────────────────────────

export function GatePassView() {
  const { hasRole } = useAuth()
  const [search,     setSearch]     = useState('')
  const [direction,  setDirection]  = useState('All')
  const [status,     setStatus]     = useState('All')
  const [selected,   setSelected]   = useState<GatePass | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: passes, isLoading, error, refetch } =
    useRealtimeFetch<GatePass[]>('/gate-passes')

  const filtered = useMemo(() => {
    if (!passes) return []
    return passes.filter(p => {
      if (direction !== 'All' && p.Direction !== direction) return false
      if (status    !== 'All' && (p.Status || '') !== status) return false
      if (!search) return true
      const q = search.toLowerCase()
      return (
        (p.GatePassNumber || '').toLowerCase().includes(q) ||
        (p.Supplier       || '').toLowerCase().includes(q)
      )
    })
  }, [passes, direction, status, search])

  if (isLoading) return <PageLoader />

  if (selected) {
    return (
      <GPDetailPanel
        key={selected.GatePassID}
        gp={selected}
        onClose={() => setSelected(null)}
        onRefresh={refetch}
      />
    )
  }

  return (
    <>
      <CreateGPModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); refetch() }}
      />

      <div className="space-y-4">
        {/* Summary tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total',   value: filtered.length },
            { label: 'Outward', value: filtered.filter(p => p.Direction === 'Outward').length },
            { label: 'Inward',  value: filtered.filter(p => p.Direction === 'Inward').length },
            { label: 'Draft',   value: filtered.filter(p => (p.Status || '') === 'Draft').length },
          ].map(card => (
            <div key={card.label} className="card p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{card.label}</p>
              <p className="text-xl font-semibold text-gray-900 mt-1">{card.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Search GP number, supplier…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="input w-auto" value={direction}
            onChange={e => setDirection(e.target.value)}>
            <option value="All">All Directions</option>
            <option value="Outward">Outward</option>
            <option value="Inward">Inward</option>
          </select>
          <select className="input w-auto" value={status}
            onChange={e => setStatus(e.target.value)}>
            <option value="All">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={refetch} className="btn-ghost"><RefreshCw size={15} /></button>
          {hasRole('Admin', 'Operations') && (
            <button className="btn-primary ml-auto" onClick={() => setShowCreate(true)}>
              <Plus size={15} /> New Gate Pass
            </button>
          )}
        </div>

        {error && <div className="card p-3 text-red-600 text-sm">{error}</div>}

        {/* Register table */}
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">GP Number</th>
                <th className="table-th">Direction</th>
                <th className="table-th">Purpose</th>
                <th className="table-th">Supplier</th>
                <th className="table-th">Date</th>
                <th className="table-th">Items</th>
                <th className="table-th">Status</th>
                <th className="table-th w-6"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="table-td text-center py-12">
                    <Package size={32} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-400">No gate passes found</p>
                  </td>
                </tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.GatePassID}
                    className="table-tr whitespace-nowrap cursor-pointer"
                    onClick={() => setSelected(p)}>
                    <td className="table-td font-medium text-brand-600">
                      {p.GatePassNumber}
                      {p.LinkedGatePassID && (
                        <Link2 size={10} className="inline ml-1 text-gray-400" />
                      )}
                    </td>
                    <td className="table-td">
                      <span className={`badge text-xs flex items-center gap-1 w-fit ${
                        p.Direction === 'Outward'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {p.Direction === 'Outward'
                          ? <><ArrowUpCircle size={10} /> Out</>
                          : <><ArrowDownCircle size={10} /> In</>}
                      </span>
                    </td>
                    <td className="table-td text-gray-500">{p.Purpose || '—'}</td>
                    <td className="table-td text-gray-600">{p.Supplier || '—'}</td>
                    <td className="table-td text-gray-500">{formatDate(p.PassDate)}</td>
                    <td className="table-td text-gray-500">{p.ItemCount ?? 0}</td>
                    <td className="table-td">
                      {p.Status
                        ? <span className={`badge text-xs ${
                            p.Status === 'Draft'    ? 'bg-gray-100 text-gray-600' :
                            p.Status === 'Released' ? 'bg-blue-100 text-blue-700' :
                            p.Status === 'Closed'   ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{p.Status}</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="table-td"><ChevronRight size={12} className="text-gray-300" /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
