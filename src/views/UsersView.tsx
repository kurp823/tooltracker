import React, { useState } from 'react'
import { Plus, RefreshCw, Edit2, KeyRound } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { useToast } from '../components/Toast'
import { api } from '../utils/api'
import { formatDate } from '../utils/format'
import { PageLoader, Spinner } from '../components/Spinner'
import { Modal } from '../components/Modal'
import type { User, UserRole } from '../types'

const ROLES: UserRole[] = ['Admin','Operations','QAQC','ThirdParty','Billing','Finance','CostController','Executive']

const ROLE_COLORS: Record<string, string> = {
  Admin:          'bg-red-100 text-red-700',
  Operations:     'bg-blue-100 text-blue-700',
  QAQC:           'bg-green-100 text-green-700',
  ThirdParty:     'bg-yellow-100 text-yellow-700',
  Billing:        'bg-purple-100 text-purple-700',
  Finance:        'bg-indigo-100 text-indigo-700',
  CostController: 'bg-orange-100 text-orange-700',
  Executive:      'bg-gray-100 text-gray-700',
}

export function UsersView() {
  const { showToast } = useToast()
  const [editing, setEditing]  = useState<Partial<User & { NewPassword?: string }> | null>(null)
  const [isNew,   setIsNew]    = useState(false)
  const [saving,  setSaving]   = useState(false)

  const { data: users, isLoading, error, refetch } = useFetch<User[]>('/users')

  async function handleSave() {
    if (!editing) return
    setSaving(true)
    try {
      if (isNew) {
        await api('/users', {
          method: 'POST',
          body: JSON.stringify({
            Username: editing.Username,
            FullName: editing.FullName,
            Role:     editing.Role,
            Password: (editing as any).Password,
          }),
        })
        showToast('User created — they must change password on first login', 'success')
      } else {
        await api(`/users/${editing.UserID}`, { method: 'PUT', body: JSON.stringify(editing) })
        showToast('User updated', 'success')
      }
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
      <div className="flex items-center gap-3">
        <button onClick={refetch} className="btn-ghost"><RefreshCw size={15} /></button>
        <button
          className="btn-primary"
          onClick={() => { setIsNew(true); setEditing({ Role: 'Operations', Active: true }) }}
        >
          <Plus size={15} /> New User
        </button>
      </div>

      {error && <div className="card p-3 text-red-600 text-sm">{error}</div>}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">Username</th>
              <th className="table-th">Full Name</th>
              <th className="table-th">Role</th>
              <th className="table-th">Status</th>
              <th className="table-th">Last Login</th>
              <th className="table-th w-16"></th>
            </tr>
          </thead>
          <tbody>
            {(users || []).map(u => (
              <tr key={u.UserID} className="table-tr">
                <td className="table-td font-mono text-sm">{u.Username}</td>
                <td className="table-td font-medium">{u.FullName}</td>
                <td className="table-td">
                  <span className={`badge ${ROLE_COLORS[u.Role ?? ''] || 'bg-gray-100 text-gray-700'}`}>
                    {u.Role}
                  </span>
                </td>
                <td className="table-td">
                  <span className={`badge ${u.Active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                    {u.Active ? 'Active' : 'Inactive'}
                  </span>
                  {u.MustChangePassword && (
                    <span className="badge bg-yellow-100 text-yellow-700 ml-1">Must change pw</span>
                  )}
                </td>
                <td className="table-td text-gray-400 text-xs">{formatDate(u.LastLogin) || 'Never'}</td>
                <td className="table-td">
                  <button
                    onClick={() => { setIsNew(false); setEditing(u) }}
                    className="text-gray-400 hover:text-brand-600"
                  >
                    <Edit2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit/Create modal */}
      {editing && (
        <Modal
          open={!!editing}
          title={isNew ? 'New User' : `Edit: ${editing.FullName}`}
          onClose={() => setEditing(null)}
          footer={
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <Spinner size="sm" /> : (isNew ? 'Create User' : 'Save')}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-4">
            {isNew && (
              <div>
                <label className="label">Username *</label>
                <input className="input" value={editing.Username || ''}
                  onChange={e => setEditing(p => ({ ...p!, Username: e.target.value }))} />
              </div>
            )}
            <div className={isNew ? '' : 'col-span-2'}>
              <label className="label">Full Name *</label>
              <input className="input" value={editing.FullName || ''}
                onChange={e => setEditing(p => ({ ...p!, FullName: e.target.value }))} />
            </div>
            <div>
              <label className="label">Role *</label>
              <select className="input" value={editing.Role || 'Operations'}
                onChange={e => setEditing(p => ({ ...p!, Role: e.target.value as UserRole }))}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {isNew ? (
              <div>
                <label className="label">Initial Password *</label>
                <input type="password" className="input"
                  onChange={e => setEditing(p => ({ ...p!, Password: e.target.value }))} />
                <p className="text-xs text-gray-400 mt-1">User must change on first login</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="label">Reset Password (optional)</label>
                  <input type="password" className="input" placeholder="Leave blank to keep current"
                    onChange={e => setEditing(p => ({ ...p!, NewPassword: e.target.value }))} />
                </div>
                <div className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" id="uactive" checked={!!editing.Active}
                    onChange={e => setEditing(p => ({ ...p!, Active: e.target.checked }))} />
                  <label htmlFor="uactive" className="text-sm text-gray-700">Account active</label>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
