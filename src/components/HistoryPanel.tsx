import React from 'react'
import { History, X } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { Spinner } from './Spinner'

export interface AuditRow { id: number; at: string; who: string | null; role: string | null; entity: string; entityId: string; action: string; detail: string | null }

const when = (v: string) => new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Readable one-line rendering of a detail JSON: key: old → new, or key: value. */
export function describe(detail: string | null): string {
  if (!detail) return ''
  try {
    const d = JSON.parse(detail)
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      return Object.entries(d).filter(([, v]) => v !== undefined && v !== null).map(([k, v]: [string, any]) => {
        if (v && typeof v === 'object' && ('old' in v || 'new' in v)) return `${k}: ${fmt(v.old)} → ${fmt(v.new)}`
        return `${k}: ${fmt(v)}`
      }).join(' · ')
    }
    return String(detail)
  } catch { return String(detail) }
}
const fmt = (v: any): string => v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : (/^\d{4}-\d{2}-\d{2}T/.test(String(v)) ? String(v).slice(0, 10) : String(v))

/** Change history of one record, as a modal. */
export function HistoryPanel({ entity, id, title, onClose }: { entity: string; id: string; title?: string; onClose: () => void }) {
  const { data, isLoading } = useFetch<AuditRow[]>(`/audit?entity=${encodeURIComponent(entity)}&id=${encodeURIComponent(id)}`)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 flex flex-col max-h-[85vh] text-slate-900">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200">
          <History size={16} className="text-brand-600" />
          <div className="font-semibold">History — {title || id}</div>
          <button className="ml-auto text-gray-400 hover:text-gray-600" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-auto">
          {isLoading ? <div className="flex justify-center py-8"><Spinner /></div> : (
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 sticky top-0"><tr>
                <th className="text-left px-3 py-1.5 font-medium text-gray-600 whitespace-nowrap">When</th>
                <th className="text-left px-3 py-1.5 font-medium text-gray-600">Who</th>
                <th className="text-left px-3 py-1.5 font-medium text-gray-600">Action</th>
                <th className="text-left px-3 py-1.5 font-medium text-gray-600">Detail</th>
              </tr></thead>
              <tbody>
                {(data || []).map(r => (
                  <tr key={r.id} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-1.5 whitespace-nowrap text-gray-500">{when(r.at)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{r.who || '—'}<div className="text-[10px] text-gray-400">{r.role}</div></td>
                    <td className="px-3 py-1.5 whitespace-nowrap font-medium">{r.action}</td>
                    <td className="px-3 py-1.5 text-gray-600 break-words">{describe(r.detail)}</td>
                  </tr>
                ))}
                {(data || []).length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">No changes recorded yet (history starts from 17 Nov 2026)</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
