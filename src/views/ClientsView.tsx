import React, { useState } from 'react'
import { Plus, Search, RefreshCw, Edit2 } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { api } from '../utils/api'
import { PageLoader } from '../components/Spinner'
import { Modal } from '../components/Modal'
import type { Client } from '../types'

export function ClientsView() {
  const { hasRole } = useAuth()
  const { showToast } = useToast()
  const [search,  setSearch]  = useState('')
  const [editing, setEditing] = useState<Partial<Client> | null>(null)
  const [saving,  setSaving]  = useState(false)

  const { data: clients, isLoading, error, refetch } = useFetch<Client[]>('/clients')

  const filtered = (clients || []).filter(c =>
    !search ||
    c.ClientName.toLowerCase().includes(search.toLowerCase()) ||
    (c.ShortName || '').toLowerCase().includes(search.toLowerCase())
  )

  async function handleSave() {
    if (!editing) return
    setSaving(true)
    try {
      if (editing.ClientID) {
        await api(`/clients/${editing.ClientID}`, { method: 'PUT', body: JSON.stringify(editing) })
      } else {
        await api('/clients', { method: 'POST', body: JSON.stringify(editing) })
      }
      showToast(editing.ClientID ? 'Client updated' : 'Client created', 'success')
      setEditing(null)
      refetch()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error')
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
          <input className="input pl-9" placeholder="Search clients…" value={search}
            onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={refetch} className="btn-ghost"><RefreshCw size={15} /></button>
        {hasRole('Admin', 'Operations') && (
          <button className="btn-primary" onClick={() => setEditing({ IsActive: true })}>
            <Plus size={15} /> Add Client
          </button>
        )}
      </div>

      {error && <div className="card p-3 text-red-600 text-sm">{error}</div>}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">Client Name</th>
              <th className="table-th">Short Name</th>
              <th className="table-th">Country</th>
              <th className="table-th">Contact</th>
              <th className="table-th">Status</th>
              {hasRole('Admin', 'Operations') && <th className="table-th w-12"></th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="table-td text-center text-gray-400 py-8">No clients found</td></tr>
            ) : (
              filtered.map(c => (
                <tr key={c.ClientID} className="table-tr">
                  <td className="table-td font-medium">{c.ClientName}</td>
                  <td className="table-td text-gray-500">{c.ShortName || '—'}</td>
                  <td className="table-td text-gray-500">{c.Country || '—'}</td>
                  <td className="table-td text-sm">
                    {c.ContactPerson && <div>{c.ContactPerson}</div>}
                    {c.ContactEmail  && <div className="text-gray-400 text-xs">{c.ContactEmail}</div>}
                  </td>
                  <td className="table-td">
                    <span className={`badge ${c.IsActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {c.IsActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  {hasRole('Admin', 'Operations') && (
                    <td className="table-td">
                      <button onClick={() => setEditing(c)} className="text-gray-400 hover:text-brand-600">
                        <Edit2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit modal */}
      {editing && (
        <Modal
          open={!!editing}
          title={editing.ClientID ? 'Edit Client' : 'New Client'}
          onClose={() => setEditing(null)}
          footer={
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            {([
              ['ClientName',    'Client Name *', true],
              ['ShortName',     'Short Name',    false],
              ['Country',       'Country',       false],
              ['Address',       'Address',       false],
              ['ContactPerson', 'Contact Person',false],
              ['ContactEmail',  'Email',         false],
              ['ContactPhone',  'Phone',         false],
            ] as const).map(([field, label, required]) => (
              <div key={field} className={field === 'Address' ? 'col-span-2' : ''}>
                <label className="label">{label}</label>
                <input
                  className="input"
                  value={(editing as any)[field] || ''}
                  onChange={e => setEditing(prev => ({ ...prev!, [field]: e.target.value }))}
                  required={required}
                />
              </div>
            ))}
            {editing.ClientID && (
              <div className="col-span-2 flex items-center gap-2">
                <input type="checkbox" id="active" checked={!!editing.IsActive}
                  onChange={e => setEditing(prev => ({ ...prev!, IsActive: e.target.checked }))} />
                <label htmlFor="active" className="text-sm text-gray-700">Active</label>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
