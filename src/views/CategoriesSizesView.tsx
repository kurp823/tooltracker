import React, { useState } from 'react'
import { Plus, Search, RefreshCw, Tag, Ruler, Link2, Trash2 } from 'lucide-react'
import { useRealtimeFetch } from '../hooks/useRealtimeFetch'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { api } from '../utils/api'
import { PageLoader } from '../components/Spinner'
import { useFetch } from '../hooks/useFetch'

interface Category {
  CategoryID: number
  CategoryName: string
  ToolFamily: string | null
  InInventory: boolean
  IsRentalTool: boolean
  RequiresInspection: boolean
  ActiveFlag: boolean
  SortOrder: number | null
  Notes: string | null
  /* Null while nothing links a tool to a category - see api/categories. */
  ToolCount: number | null
}

interface Size {
  SizeID: number
  SizeLabel: string
  SizeDecimal: number | null
  InInventory: boolean
  ActiveFlag: boolean
  SortOrder: number | null
  ToolCount: number | null
}

const blankCategory = (): Partial<Category> => ({
  CategoryName: '', ToolFamily: '', InInventory: true, IsRentalTool: false,
  RequiresInspection: false, ActiveFlag: true, SortOrder: null, Notes: '',
})

const blankSize = (): Partial<Size> => ({
  SizeLabel: '', SizeDecimal: null, InInventory: true, ActiveFlag: true, SortOrder: null,
})

export function CategoriesSizesView() {
  const { hasRole } = useAuth()
  const [tab, setTab] = useState<'categories' | 'sizes' | 'map'>('categories')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'categories' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setTab('categories')}
        >
          <Tag size={14} className="inline mr-1.5 -mt-0.5" /> Categories
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'sizes' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setTab('sizes')}
        >
          <Ruler size={14} className="inline mr-1.5 -mt-0.5" /> Sizes
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'map' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setTab('map')}
        >
          <Link2 size={14} className="inline mr-1.5 -mt-0.5" /> Contract mapping
        </button>
      </div>

      {tab === 'categories' ? <CategoriesTab canEdit={hasRole('Admin')} />
        : tab === 'sizes' ? <SizesTab canEdit={hasRole('Admin')} />
        : <MappingTab canEdit={hasRole('Admin')} />}
    </div>
  )
}

function CategoriesTab({ canEdit }: { canEdit: boolean }) {
  const { showToast } = useToast()
  const [search, setSearch] = useState('')
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState<Partial<Category>>(blankCategory())
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)

  const { data: categories, isLoading, error, refetch } = useRealtimeFetch<Category[]>('/categories')

  const filtered = (categories || []).filter(c =>
    !search ||
    c.CategoryName.toLowerCase().includes(search.toLowerCase()) ||
    (c.ToolFamily || '').toLowerCase().includes(search.toLowerCase())
  )

  function openCreate() { setForm(blankCategory()); setEditId(null); setModal(true) }
  function openEdit(c: Category) { setForm({ ...c }); setEditId(c.CategoryID); setModal(true) }

  async function handleSave() {
    if (!form.CategoryName?.trim()) { showToast('Category name is required', 'error'); return }
    setSaving(true)
    try {
      if (editId) {
        await api(`/categories/${editId}`, { method: 'PUT', body: JSON.stringify(form) })
        showToast('Category updated', 'success')
      } else {
        await api('/categories', { method: 'POST', body: JSON.stringify(form) })
        showToast('Category created', 'success')
      }
      setModal(false)
      refetch()
    } catch (err: any) {
      showToast(err.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const setText = (k: keyof Category) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))
  const setCheck = (k: keyof Category) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.checked }))

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Search category, tool family…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={refetch} className="btn-ghost"><RefreshCw size={15} /></button>
        {canEdit && (
          <button className="btn-primary" onClick={openCreate}><Plus size={15} /> Add Category</button>
        )}
      </div>

      {error && <div className="card p-3 text-red-600 text-sm">{error}</div>}
      <p className="text-xs text-gray-500">Showing {filtered.length} of {categories?.length ?? 0} categories</p>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Category</th>
                <th className="table-th">Tool Family</th>
                <th className="table-th text-center">Rental</th>
                <th className="table-th text-center">Inspection Req.</th>
                <th className="table-th text-center">Tools</th>
                <th className="table-th text-center">Active</th>
                {canEdit && <th className="table-th" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="table-td text-center text-gray-400 py-12">No categories found</td></tr>
              ) : (
                filtered.map(c => (
                  <tr key={c.CategoryID} className="table-tr">
                    <td className="table-td font-medium text-gray-900">{c.CategoryName}</td>
                    <td className="table-td text-gray-500">{c.ToolFamily || '—'}</td>
                    <td className="table-td text-center">{c.IsRentalTool ? 'Yes' : 'No'}</td>
                    <td className="table-td text-center">{c.RequiresInspection ? 'Yes' : 'No'}</td>
                    <td className="table-td text-center text-gray-600">{c.ToolCount ?? '—'}</td>
                    <td className="table-td text-center">
                      <span className={`badge ${c.ActiveFlag ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {c.ActiveFlag ? 'Yes' : 'No'}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="table-td">
                        <button className="text-xs text-brand-600 hover:underline" onClick={() => openEdit(c)}>Edit</button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Category' : 'Add Category'} size="md"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editId ? 'Update' : 'Create'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div>
            <label className="label">Category Name *</label>
            <input className="input mt-1" value={form.CategoryName || ''} onChange={setText('CategoryName')} />
          </div>
          <div>
            <label className="label">Tool Family</label>
            <input className="input mt-1" value={form.ToolFamily || ''} onChange={setText('ToolFamily')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={!!form.IsRentalTool} onChange={setCheck('IsRentalTool')} /> Rental Tool
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={!!form.RequiresInspection} onChange={setCheck('RequiresInspection')} /> Requires Inspection
            </label>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input mt-1" rows={2} value={form.Notes || ''}
              onChange={e => setForm(f => ({ ...f, Notes: e.target.value }))} />
          </div>
          {editId && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={!!form.ActiveFlag} onChange={setCheck('ActiveFlag')} /> Active
            </label>
          )}
        </div>
      </Modal>
    </div>
  )
}

function SizesTab({ canEdit }: { canEdit: boolean }) {
  const { showToast } = useToast()
  const [search, setSearch] = useState('')
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState<Partial<Size>>(blankSize())
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)

  const { data: sizes, isLoading, error, refetch } = useRealtimeFetch<Size[]>('/sizes')

  const filtered = (sizes || []).filter(s =>
    !search || s.SizeLabel.toLowerCase().includes(search.toLowerCase())
  )

  function openCreate() { setForm(blankSize()); setEditId(null); setModal(true) }
  function openEdit(s: Size) { setForm({ ...s }); setEditId(s.SizeID); setModal(true) }

  async function handleSave() {
    if (!form.SizeLabel?.trim()) { showToast('Size label is required', 'error'); return }
    setSaving(true)
    try {
      if (editId) {
        await api(`/sizes/${editId}`, { method: 'PUT', body: JSON.stringify(form) })
        showToast('Size updated', 'success')
      } else {
        await api('/sizes', { method: 'POST', body: JSON.stringify(form) })
        showToast('Size created', 'success')
      }
      setModal(false)
      refetch()
    } catch (err: any) {
      showToast(err.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Search size…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={refetch} className="btn-ghost"><RefreshCw size={15} /></button>
        {canEdit && (
          <button className="btn-primary" onClick={openCreate}><Plus size={15} /> Add Size</button>
        )}
      </div>

      {error && <div className="card p-3 text-red-600 text-sm">{error}</div>}
      <p className="text-xs text-gray-500">Showing {filtered.length} of {sizes?.length ?? 0} sizes</p>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="table-th">Size</th>
                <th className="table-th">Decimal</th>
                <th className="table-th text-center">Tools</th>
                <th className="table-th text-center">Active</th>
                {canEdit && <th className="table-th" />}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="table-td text-center text-gray-400 py-12">No sizes found</td></tr>
              ) : (
                filtered.map(s => (
                  <tr key={s.SizeID} className="table-tr">
                    <td className="table-td font-medium text-gray-900">{s.SizeLabel}</td>
                    <td className="table-td text-gray-500">{s.SizeDecimal ?? '—'}</td>
                    <td className="table-td text-center text-gray-600">{s.ToolCount ?? '—'}</td>
                    <td className="table-td text-center">
                      <span className={`badge ${s.ActiveFlag ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {s.ActiveFlag ? 'Yes' : 'No'}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="table-td">
                        <button className="text-xs text-brand-600 hover:underline" onClick={() => openEdit(s)}>Edit</button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Size' : 'Add Size'} size="sm"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editId ? 'Update' : 'Create'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div>
            <label className="label">Size Label *</label>
            <input className="input mt-1" value={form.SizeLabel || ''}
              onChange={e => setForm(f => ({ ...f, SizeLabel: e.target.value }))} />
          </div>
          <div>
            <label className="label">Decimal Value</label>
            <input className="input mt-1" type="number" step="0.001" value={form.SizeDecimal ?? ''}
              onChange={e => setForm(f => ({ ...f, SizeDecimal: e.target.value === '' ? null : Number(e.target.value) }))} />
          </div>
          {editId && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={!!form.ActiveFlag}
                onChange={e => setForm(f => ({ ...f, ActiveFlag: e.target.checked }))} /> Active
            </label>
          )}
        </div>
      </Modal>
    </div>
  )
}

// ─── Contract mapping ─────────────────────────────────────────────────────────
// Inventory names that differ from the contract's (HYD DRILLING JAR -> DRILLING
// JAR). The rate resolver uses these pairs when a tool's own category has no
// rate on the contract. Nothing is renamed; the pairs live in tbl_CategoryMap.

interface MapRow {
  InventoryCategory: string; ContractCategory: string; Notes: string | null
  UpdatedBy: string | null; UpdatedAt: string | null; Tools: number; ContractHasRates: number
}
interface MapData {
  mappings: MapRow[]
  unmatched: { InventoryCategory: string; Tools: number }[]
  contractCategories: { Category: string; Contracts: number }[]
}

function MappingTab({ canEdit }: { canEdit: boolean }) {
  const { showToast } = useToast()
  const { data, isLoading, refetch } = useFetch<MapData>('/categories/map')
  const [inv, setInv] = useState('')
  const [to, setTo]   = useState('')
  const [q, setQ]     = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (invName: string, toName: string) => {
    if (!invName.trim() || !toName.trim()) { showToast('Pick both names', 'error'); return }
    setSaving(true)
    try {
      await api.post('/categories/map', { InventoryCategory: invName.trim(), ContractCategory: toName.trim() })
      showToast(`${invName.trim()} → ${toName.trim()} saved`, 'success')
      setInv(''); setTo(''); refetch()
    } catch (e: any) { showToast(e.message || 'Could not save the mapping', 'error') }
    finally { setSaving(false) }
  }
  const remove = async (invName: string) => {
    if (!window.confirm(`Remove the mapping for ${invName}? Tools in it will price under their own name again.`)) return
    try {
      await api.delete(`/categories/map?inventoryCategory=${encodeURIComponent(invName)}`)
      refetch()
    } catch (e: any) { showToast(e.message || 'Could not remove the mapping', 'error') }
  }

  if (isLoading) return <PageLoader />
  const d = data || { mappings: [], unmatched: [], contractCategories: [] }
  const term = q.trim().toLowerCase()
  const unmatched = d.unmatched.filter(u => !term || u.InventoryCategory.toLowerCase().includes(term))

  return (
    <div className="space-y-4">
      <datalist id="contract-cats">
        {d.contractCategories.map(c => <option key={c.Category} value={c.Category}>{`${c.Contracts} contract${c.Contracts === 1 ? '' : 's'}`}</option>)}
      </datalist>

      <div className="card p-4 space-y-2">
        <h3 className="font-medium text-gray-900 text-sm">Current mappings ({d.mappings.length})</h3>
        <p className="text-xs text-gray-500">
          A tool prices under its own category when the contract has it; otherwise under the mapped one.
          A mapping never overrides a direct match.
        </p>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Inventory category</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Priced as</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Tools</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Rates found</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">By</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {d.mappings.map(m => (
              <tr key={m.InventoryCategory} className="border-t border-gray-100">
                <td className="px-3 py-1.5 font-medium text-gray-800">{m.InventoryCategory}</td>
                <td className="px-3 py-1.5 text-gray-700">{m.ContractCategory}</td>
                <td className="px-3 py-1.5 text-right text-gray-600">{m.Tools}</td>
                <td className="px-3 py-1.5 text-xs">
                  {m.ContractHasRates ? <span className="text-emerald-700">yes</span>
                                      : <span className="text-amber-700">no contract has rates under this name</span>}
                </td>
                <td className="px-3 py-1.5 text-xs text-gray-500">{m.UpdatedBy || '—'}</td>
                <td className="px-3 py-1.5">
                  {canEdit && (
                    <button className="btn-ghost p-1" title="Remove mapping" onClick={() => remove(m.InventoryCategory)}>
                      <Trash2 size={13} className="text-red-500" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {d.mappings.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-400">No mappings yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="card p-4 space-y-3">
          <h3 className="font-medium text-gray-900 text-sm">Add a mapping</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="label">Inventory category</label>
              <input className="input mt-1" value={inv} onChange={e => setInv(e.target.value)}
                     placeholder="as spelt in inventory" list="unmatched-cats" />
              <datalist id="unmatched-cats">
                {d.unmatched.map(u => <option key={u.InventoryCategory} value={u.InventoryCategory}>{`${u.Tools} tools`}</option>)}
              </datalist>
            </div>
            <div>
              <label className="label">Priced as (contract category)</label>
              <input className="input mt-1" value={to} onChange={e => setTo(e.target.value)}
                     placeholder="as spelt on the contract" list="contract-cats" />
            </div>
            <div className="flex items-end">
              <button className="btn-primary" disabled={saving} onClick={() => save(inv, to)}>
                <Plus size={14} /> Save mapping
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card p-4 space-y-2">
        <div className="flex items-center gap-3">
          <h3 className="font-medium text-gray-900 text-sm">Inventory categories no contract prices ({d.unmatched.length})</h3>
          <div className="relative ml-auto w-64">
            <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="field-input !pl-7" placeholder="Filter…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <button onClick={refetch} className="btn-mini" title="Refresh"><RefreshCw size={12} /></button>
        </div>
        <p className="text-xs text-gray-500">
          Many are components (grapples, mill controls, stop rings) that are never priced on their own.
          Map the ones that are a contract item under another name.
        </p>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Inventory category</th>
              <th className="text-right px-3 py-2 font-medium text-gray-600">Tools</th>
              {canEdit && <th className="text-left px-3 py-2 font-medium text-gray-600 w-80">Price as</th>}
            </tr>
          </thead>
          <tbody>
            {unmatched.slice(0, 300).map(u => (
              <UnmatchedRow key={u.InventoryCategory} row={u} canEdit={canEdit} saving={saving} onSave={save} />
            ))}
            {unmatched.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-sm text-gray-400">Nothing unmatched</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function UnmatchedRow({ row, canEdit, saving, onSave }: {
  row: { InventoryCategory: string; Tools: number }; canEdit: boolean; saving: boolean
  onSave: (inv: string, to: string) => Promise<void>
}) {
  const [to, setTo] = useState('')
  return (
    <tr className="border-t border-gray-100">
      <td className="px-3 py-1.5 text-gray-800">{row.InventoryCategory}</td>
      <td className="px-3 py-1.5 text-right text-gray-600">{row.Tools}</td>
      {canEdit && (
        <td className="px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <input className="field-input flex-1" value={to} onChange={e => setTo(e.target.value)}
                   placeholder="contract category" list="contract-cats" />
            <button className="btn-mini" disabled={saving || !to.trim()} onClick={() => onSave(row.InventoryCategory, to)}>
              <Link2 size={11} /> Map
            </button>
          </div>
        </td>
      )}
    </tr>
  )
}
