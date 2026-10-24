import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { AuthUser, UserRole } from '../types'

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  login: (username: string, password: string) => Promise<{ mustChange: boolean }>
  logout: () => void
  hasRole: (...roles: UserRole[]) => boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('tt_user')
      const token  = localStorage.getItem('tt_token')
      if (stored && token) {
        setUser({ ...JSON.parse(stored), token })
      }
    } catch {
      localStorage.removeItem('tt_user')
      localStorage.removeItem('tt_token')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'Login failed')
    }

    const body = await res.json()
    const { user: u, token } = body

    localStorage.setItem('tt_token', token)
    localStorage.setItem('tt_user', JSON.stringify(u))
    setUser({ ...u, token })

    return { mustChange: !!u.MustChangePassword }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('tt_token')
    localStorage.removeItem('tt_user')
    setUser(null)
  }, [])

  const hasRole = useCallback((...roles: UserRole[]) => {
    if (!user) return false
    if (user.Role === 'Admin') return true
    return roles.includes(user.Role as UserRole)
  }, [user])

  const isAdmin = user?.Role === 'Admin'

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, hasRole, isAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
