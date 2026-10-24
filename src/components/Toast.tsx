import React, { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: string
  type: ToastType
  message: string
}

interface ToastContextValue {
  // shorthand methods
  success: (msg: string) => void
  error:   (msg: string) => void
  warning: (msg: string) => void
  info:    (msg: string) => void
  // unified method: showToast(message, type)
  showToast: (msg: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} className="text-emerald-500 shrink-0" />,
  error:   <XCircle    size={18} className="text-red-500 shrink-0" />,
  warning: <AlertCircle size={18} className="text-yellow-500 shrink-0" />,
  info:    <Info        size={18} className="text-blue-500 shrink-0" />,
}

const BG: Record<ToastType, string> = {
  success: 'border-emerald-200 bg-emerald-50',
  error:   'border-red-200 bg-red-50',
  warning: 'border-yellow-200 bg-yellow-50',
  info:    'border-blue-200 bg-blue-50',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const add = useCallback((type: ToastType, message: string) => {
    const id = Date.now().toString()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 4000)
  }, [])

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const ctx: ToastContextValue = {
    success:   (m) => add('success', m),
    error:     (m) => add('error',   m),
    warning:   (m) => add('warning', m),
    info:      (m) => add('info',    m),
    showToast: (m, type = 'info') => add(type, m),
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-start gap-3 p-3 rounded-lg border shadow-md text-sm ${BG[t.type]} animate-in slide-in-from-bottom-2`}
          >
            {ICONS[t.type]}
            <p className="flex-1 text-gray-800">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              className="text-gray-400 hover:text-gray-600 shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be inside ToastProvider')
  return ctx
}
