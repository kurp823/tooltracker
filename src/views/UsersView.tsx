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
  // Shown once after create/reissue — the code is hashed server-side and can
  // never be retrieved again, only replaced by issuing a new one.
  const [issued,  setIssued]   = useState<{ username: string; code: string } | null>(null)

  const { data: users, isLoading, error, refetch } = useFetch<User[]>('/users')

  async function handleSave() {
    if (!editing) return
    setSaving(true)
    try {
      if (isNew) {
        const res = await api<{ activationCode?: string }>('/users', {
          method: 'POST',
          body: JSON.stringify({
            Username: editing.Username,
            FullName: editing.FullName,
            Role:     editing.Role,
          }),
        })
        showToast('User created', 'success')
        if (res?.activationCode) {
          setIssued({ username: editing.Username || '', code: res.activationCode })
        }
      } else {
        const res = await api<{ activationCode?: string }>(`/users/${editing.UserID}`, {
          method: 'PUT',
          body: JSON.stringify(editing),
        })
        showToast('User updated', 'success')
        if (res?.activationCode) {
          setIssued({ username: editing.Username || editing.FullName || '', code: res.activationCode })
        }
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
              <div className="col-span-2 rounded-lg bg-brand-50 border border-brand-200 p-3">
                <p className="text-sm text-brand-900 font-medium">No password needed</p>
                <p className="text-xs text-brand-800 mt-1">
                  A one-time activation code is generated when you create this user.
                  Give it to them and they set their own password — you never see it.
                </p>
              </div>
            ) : (
              <>
                <div className="col-span-2 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <input type="checkbox" id="ureissue" className="mt-0.5"
                    checked={!!(editing as any).ReissueCode}
                    onChange={e => setEditing(p => ({ ...p!, ReissueCode: e.target.checked } as any))} />
                  <label htmlFor="ureissue" className="text-sm text-amber-900">
                    Issue a new activation code
                    <span className="block text-xs text-amber-800 mt-0.5">
                      Use if the code was lost or the user is locked out. Their current
                      password stops working until they activate again.
                    </span>
                  </label>
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

      {/* One-time activation code reveal */}
      {issued && (
        <Modal
          open={!!issued}
          title="Activation code"
          onClose={() => setIssued(null)}
          footer={
            <div className="flex justify-end">
              <button className="btn-primary" onClick={() => setIssued(null)}>Done</button>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Give this code to <span className="font-medium">{issued.username}</span>. They
              enter it on the <span className="font-medium">Activate your account</span> screen
              and choose their own password.
            </p>
            <div className="rounded-lg border-2 border-dashed border-brand-300 bg-brand-50 p-4 text-center">
              <div className="font-mono text-2xl tracking-widest text-brand-900 select-all">
                {issued.code}
              </div>
            </div>
            <button
              className="btn-secondary w-full justify-center"
              onClick={() => {
                navigator.clipboard?.writeText(issued.code)
                showToast('Code copied', 'success')
              }}
            >
              Copy code
            </button>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              This is shown only once — it is stored hashed and cannot be retrieved again.
              If it's lost, edit the user and issue a new code.
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}
