import React, { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Package, Eye, EyeOff, KeyRound } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { Spinner } from '../components/Spinner'

/**
 * First-time account activation.
 *
 * The admin creates the account with a username only and hands over a
 * one-time activation code. Here the user redeems that code and chooses
 * their own password in a single step — nobody else ever knows it.
 */
export function ActivateView() {
  const { adoptSession } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [code,     setCode]     = useState('')
  const [pw,       setPw]       = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)

  const tooShort = pw.length > 0 && pw.length < 8
  const mismatch = confirm.length > 0 && pw !== confirm
  const canSubmit =
    !!username.trim() && !!code.trim() && pw.length >= 8 && pw === confirm && !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          code: code.trim(),
          newPassword: pw,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Activation failed')

      adoptSession(body.user, body.token)
      showToast('Account activated — welcome', 'success')
      navigate('/')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Activation failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4 backdrop-blur">
            <Package size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Tool Tracker</h1>
          <p className="text-brand-300 text-sm mt-1">Emdad Operations System</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-7">
          <div className="flex items-center gap-2 mb-1">
            <KeyRound size={18} className="text-brand-700" />
            <h2 className="text-lg font-semibold text-gray-900">Activate your account</h2>
          </div>
          <p className="text-sm text-gray-500 mb-5">
            Enter the activation code from your administrator and choose your own password.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Username</label>
              <input
                type="text"
                className="input"
                placeholder="Enter username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                disabled={loading}
              />
            </div>

            <div>
              <label className="label">Activation code</label>
              <input
                type="text"
                className="input font-mono tracking-widest uppercase"
                placeholder="XXXX-XXXX"
                value={code}
                onChange={e => setCode(e.target.value)}
                disabled={loading}
              />
            </div>

            <div>
              <label className="label">New password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="At least 8 characters"
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  autoComplete="new-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {tooShort && (
                <p className="text-xs text-red-600 mt-1">Must be at least 8 characters.</p>
              )}
            </div>

            <div>
              <label className="label">Confirm password</label>
              <input
                type={showPw ? 'text' : 'password'}
                className="input"
                placeholder="Re-enter password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                autoComplete="new-password"
                disabled={loading}
              />
              {mismatch && (
                <p className="text-xs text-red-600 mt-1">Passwords don't match.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-primary w-full justify-center py-2.5 text-base"
            >
              {loading ? <Spinner size="sm" /> : 'Activate & Sign In'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-5">
            Already activated?{' '}
            <Link to="/login" className="text-brand-700 font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-brand-400 text-xs mt-6">
          Lost your code? Ask your administrator to issue a new one.
        </p>
      </div>
    </div>
  )
}
