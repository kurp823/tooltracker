import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { api } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { Spinner } from '../components/Spinner'

export function ChangePasswordView() {
  const { user, logout } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [current,   setCurrent]   = useState('')
  const [newPw,     setNewPw]     = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [loading,   setLoading]   = useState(false)

  const mismatch = newPw && confirm && newPw !== confirm
  const weak     = newPw && newPw.length < 8

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (mismatch || weak) return
    setLoading(true)
    try {
      await api('/users/change-password', {
        method: 'POST',
        body: JSON.stringify({ userId: user?.UserID, currentPassword: current, newPassword: newPw }),
      })
      showToast('Password changed successfully!', 'success')
      navigate('/')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to change password', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="card p-7">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-brand-100 rounded-lg flex items-center justify-center">
              <ShieldCheck size={20} className="text-brand-600" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">Change Password</h1>
              <p className="text-xs text-gray-500">You must change your password to continue</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Current Password</label>
              <input type="password" className="input" value={current}
                onChange={e => setCurrent(e.target.value)} required disabled={loading} />
            </div>
            <div>
              <label className="label">New Password</label>
              <input type="password" className="input" value={newPw}
                onChange={e => setNewPw(e.target.value)} required disabled={loading} />
              {weak && <p className="text-xs text-red-500 mt-1">At least 8 characters required</p>}
            </div>
            <div>
              <label className="label">Confirm New Password</label>
              <input type="password" className="input" value={confirm}
                onChange={e => setConfirm(e.target.value)} required disabled={loading} />
              {mismatch && <p className="text-xs text-red-500 mt-1">Passwords do not match</p>}
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit"
                disabled={loading || !current || !newPw || !confirm || !!mismatch || !!weak}
                className="btn-primary flex-1 justify-center">
                {loading ? <Spinner size="sm" /> : 'Change Password'}
              </button>
              <button type="button" onClick={logout} className="btn-secondary">
                Logout
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
