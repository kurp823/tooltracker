import React, { useState } from 'react'
import { User, Key, Shield, Info, List } from 'lucide-react'
import { ListsAdmin } from '../components/ListsAdmin'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../utils/api'
import { useToast } from '../components/Toast'

export function SettingsView() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [oldPwd, setOldPwd]     = useState('')
  const [newPwd, setNewPwd]     = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [saving, setSaving]     = useState(false)

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPwd !== confirmPwd) {
      showToast('New passwords do not match', 'error'); return
    }
    if (newPwd.length < 8) {
      showToast('New password must be at least 8 characters', 'error'); return
    }
    setSaving(true)
    try {
      await api('/users/change-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
      })
      showToast('Password changed successfully', 'success')
      setOldPwd(''); setNewPwd(''); setConfirmPwd('')
    } catch (err: any) {
      showToast(err.message || 'Failed to change password', 'error')
    } finally {
      setSaving(false)
    }
  }

  const roleDescriptions: Record<string, string> = {
    Admin:          'Full access to all features including user management.',
    Operations:     'Manage jobs, tools, delivery/receiving tickets, gate passes.',
    QAQC:           'Access inspection and maintenance records.',
    ThirdParty:     'Limited read access to inspection documents.',
    Billing:        'Create and manage invoices.',
    Finance:        'View billing reports and approve invoices.',
    CostController: 'View utilization and cost reports.',
    Executive:      'Read-only access to dashboards and reports.',
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Profile info */}
      <div className="card p-6 space-y-4">
        <h2 className="flex items-center gap-2 font-semibold text-gray-800">
          <User size={18} /> My Profile
        </h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="label">Username</p>
            <p className="font-medium text-gray-900">{user?.Username}</p>
          </div>
          <div>
            <p className="label">Full Name</p>
            <p className="font-medium text-gray-900">{user?.FullName || '—'}</p>
          </div>
          <div>
            <p className="label">Role</p>
            <span className="badge bg-brand-100 text-brand-700">{user?.Role}</span>
          </div>
        </div>
      </div>

      {/* Role description */}
      <div className="card p-6 space-y-3">
        <h2 className="flex items-center gap-2 font-semibold text-gray-800">
          <Shield size={18} /> Role Permissions
        </h2>
        <div className="flex items-start gap-3 bg-blue-50 rounded-lg p-4 text-sm">
          <Info size={16} className="text-blue-500 mt-0.5 shrink-0" />
          <p className="text-blue-700">
            {roleDescriptions[user?.Role || ''] || 'Contact your administrator for role details.'}
          </p>
        </div>
      </div>

      {/* Change password */}
      <div className="card p-6 space-y-4">
        <h2 className="flex items-center gap-2 font-semibold text-gray-800">
          <Key size={18} /> Change Password
        </h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="label">Current Password</label>
            <input type="password" className="input mt-1" required
              value={oldPwd} onChange={e => setOldPwd(e.target.value)} />
          </div>
          <div>
            <label className="label">New Password</label>
            <input type="password" className="input mt-1" required minLength={8}
              placeholder="At least 8 characters"
              value={newPwd} onChange={e => setNewPwd(e.target.value)} />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input type="password" className="input mt-1" required
              value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
          </div>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Dropdown values — Admin only. This is what keeps option lists out
          of the code, so a new value needs a row rather than a deploy. */}
      {user?.Role === 'Admin' && (
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <List size={18} /> Dropdown Values
          </h3>
          <ListsAdmin />
        </div>
      )}

      {/* App info */}
      <div className="text-xs text-gray-400 text-center pb-6">
        Tool Tracking System · v1.0.0 · Azure SQL ToolTrackingDB
      </div>
    </div>
  )
}
