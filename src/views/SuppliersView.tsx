import React, { useState } from 'react'
import { Plus, Search, RefreshCw, Package } from 'lucide-react'
import { useRealtimeFetch } from '../hooks/useRealtimeFetch'
import { useAuth } from '../contexts/AuthContext'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { api } from '../utils/api'
import { PageLoader } from '../components/Spinner'

interface Supplier {
  SupplierID: number
  SupplierName: string
  ContactName: string | null
  Email: string | null
  Phone: string | null
  Country: string | null
  IsActive: boolean
  ToolCount: number
}

const blank = (): Partial<Supplier> => ({
  SupplierName: '', ContactName: '', Email: '', Phone: '', Country: '', IsActive: true,
})

export function SuppliersView() {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const [search, setSearch] = useState('')
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState<Partial<Supplier>>(blank())
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)

  const { data: suppliers, isLoading, error, refetch } = useRealtimeFetch<Supplier[]>('/suppliers')

  const filtered = (suppliers || []).filter(s =>
    !search ||
    s.SupplierName.toLowerCase().includes(search.toLowerCase()) ||
    (s.Country || '').toLowerCase().includes(search.toLowerCase())
  )

  function openCreate() {
    setForm(blank()); setEditId(null); setModal(true)
  }
  function openEdit(s: Supplier) {
    setForm({ ...s }); setEditId(s.SupplierID); setModal(true)
  }

  async function handleSave() {
    if (!form.SupplierName?.trim()) {
      showToast('Supplier name is required', 'error'); return
    }
    setSaving(true)
    try {
      if (editId) {
        await api(`/suppliers/${editId}`, { method: 'PUT', body: JSON.stringify(form) })
        showToast('Supplier updated', 'success')
      } else {
        await api('/suppliers', { method: 'POST', body: JSON.stringify(form) })
        showToast('Supplier created', 'success')
      }
      setModal(false)
      refetch()
    } catch (err: any) {
      showToast(err.message || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const set = (k: keyof Supplier) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Search supplier, country…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={refetch} className="btn-ghost"><RefreshCw size={15} /></button>
        {hasRole('Admin') && (
          <button className="btn-primary" onClick={openCreate}><Plus size={15} /> Add Supplier</button>
        )}
      </div>

      {error && <div className="card p-3 text-red-600 text-sm">{error}</div>}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">Supplier Name</th>
              <th className="table-th">Contact</th>
              <th className="table-th">Email</th>
              <th className="table-th">Phone</th>
              <th className="table-th">Country</th>
              <th className="table-th text-center">Tools</th>
              <th className="table-th text-center">Active</th>
              {hasRole('Admin') && <th className="table-th" />}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="table-td text-center py-12">
                  <Package size={32} className="mx-auto text-gray-300 mb-2" />
                  <p className="text-gray-400">No suppliers found</p>
                </td>
              </tr>
            ) : (
              filtered.map((s: Supplier) => (
                <tr key={s.SupplierID} className="table-tr">
                  <td className="table-td font-medium text-gray-900">{s.SupplierName}</td>
                  <td className="table-td text-gray-500">{s.ContactName || '—'}</td>
                  <td className="table-td text-gray-500 text-sm">{s.Email || '—'}</td>
                  <td className="table-td text-gray-500 text-sm">{s.Phone || '—'}</td>
                  <td className="table-td text-gray-500">{s.Country || '—'}</td>
                  <td className="table-td text-center text-gray-600">{s.ToolCount}</td>
                  <td className="table-td text-center">
                    <span className={`badge ${s.IsActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.IsActive ? 'Yes' : 'No'}
                    </span>
                  </td>
                  {hasRole('Admin') && (
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

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Supplier' : 'Add Supplier'} size="md"
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
            <label className="label">Supplier Name *</label>
            <input className="input mt-1" value={form.SupplierName || ''} onChange={set('SupplierName')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Contact Name</label>
              <input className="input mt-1" value={form.ContactName || ''} onChange={set('ContactName')} />
            </div>
            <div>
              <label className="label">Country</label>
              <input className="input mt-1" value={form.Country || ''} onChange={set('Country')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Email</label>
              <input className="input mt-1" type="email" value={form.Email || ''} onChange={set('Email')} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input mt-1" value={form.Phone || ''} onChange={set('Phone')} />
            </div>
          </div>
          {editId && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="active" checked={!!form.IsActive}
                onChange={e => setForm(f => ({ ...f, IsActive: e.target.checked }))} />
              <label htmlFor="active" className="text-sm text-gray-700">Active</label>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
