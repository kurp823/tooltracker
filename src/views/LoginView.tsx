import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Package, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/Toast'
import { Spinner } from '../components/Spinner'

export function LoginView() {
  const { login } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [username, setUsername]   = useState('')
  const [password, setPassword]   = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [loading, setLoading]     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) return
    setLoading(true)
    try {
      const { mustChange } = await login(username.trim(), password)
      if (mustChange) {
        navigate('/change-password')
      } else {
        navigate('/')
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Login failed', 'error')
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
          <h2 className="text-lg font-semibold text-gray-900 mb-5">Sign in to your account</h2>

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
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="Enter password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
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
            </div>

            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="btn-primary w-full justify-center py-2.5 text-base"
            >
              {loading ? <Spinner size="sm" /> : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-brand-400 text-xs mt-6">
          Contact your administrator to reset your password
        </p>
      </div>
    </div>
  )
}
