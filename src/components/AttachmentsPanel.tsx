import React, { useRef, useState } from 'react'
import { Paperclip, Upload, Trash2, Download, X } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from './Toast'
import { api } from '../utils/api'
import { Spinner } from './Spinner'

interface Att { id: number; fileName: string; contentType: string | null; sizeBytes: number; uploadedBy: string | null; uploadedAt: string; note: string | null }
const kb = (n: number) => n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`
const when = (v: string) => new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * Files kept against a record: the signed ticket, SES, client approval,
 * supplier invoice. Stored in the database through /api/attachments.
 */
export function AttachmentsPanel({ entity, id, title, onClose }: { entity: string; id: string; title?: string; onClose: () => void }) {
  const { hasRole, user } = useAuth()
  const { showToast } = useToast()
  const canAdd = hasRole('Admin', 'Operations', 'Billing', 'Finance', 'QAQC', 'CostController')
  const { data, isLoading, refetch } = useFetch<Att[]>(`/attachments?entity=${encodeURIComponent(entity)}&id=${encodeURIComponent(id)}`)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const upload = async (files: FileList | null) => {
    if (!files || !files.length) return
    setBusy(true)
    try {
      for (const f of Array.from(files)) {
        if (f.size > 10 * 1024 * 1024) { showToast(`${f.name} is over 10 MB`, 'error'); continue }
        const base64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f) })
        await api.post('/attachments', { entity, entityId: id, fileName: f.name, contentType: f.type, base64, note })
      }
      showToast('Attached', 'success'); setNote(''); refetch()
    } catch (e: any) { showToast(e.message || 'Upload failed', 'error') }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }
  const open = async (a: Att) => {
    try {
      const f = await api.get<{ fileName: string; contentType: string; base64: string }>(`/attachments/${a.id}/file`)
      const bin = atob(f.base64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const url = URL.createObjectURL(new Blob([bytes], { type: f.contentType || 'application/octet-stream' }))
      const w = window.open(url, '_blank')
      if (!w) { const l = document.createElement('a'); l.href = url; l.download = f.fileName; l.click() }
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e: any) { showToast(e.message || 'Could not open the file', 'error') }
  }
  const remove = async (a: Att) => {
    if (!window.confirm(`Remove ${a.fileName}?`)) return
    try { await api.delete(`/attachments/${a.id}`); refetch() }
    catch (e: any) { showToast(e.message || 'Could not remove', 'error') }
  }
  const canRemove = (a: Att) => hasRole('Admin') || (a.uploadedBy === user?.Username && Date.now() - new Date(a.uploadedAt).getTime() < 86400000)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh] text-slate-900">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-200">
          <Paperclip size={16} className="text-brand-600" />
          <div className="font-semibold">Attachments — {title || id}</div>
          <button className="ml-auto text-gray-400 hover:text-gray-600" onClick={onClose}><X size={18} /></button>
        </div>
        {canAdd && (
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <input ref={fileRef} type="file" multiple className="hidden" onChange={e => upload(e.target.files)}
                   accept=".pdf,.jpg,.jpeg,.png,.heic,.xlsx,.xls,.docx,.doc,.msg,.eml,.csv" />
            <input className="input flex-1" placeholder="Note (optional) — e.g. signed copy, SES, client approval" value={note} onChange={e => setNote(e.target.value)} />
            <button className="btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? <Spinner size="sm" /> : <Upload size={14} />} Attach file
            </button>
          </div>
        )}
        <div className="flex-1 overflow-auto">
          {isLoading ? <div className="flex justify-center py-8"><Spinner /></div> : (
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 sticky top-0"><tr>
                <th className="text-left px-3 py-1.5 font-medium text-gray-600">File</th>
                <th className="text-left px-3 py-1.5 font-medium text-gray-600">Note</th>
                <th className="text-right px-3 py-1.5 font-medium text-gray-600">Size</th>
                <th className="text-left px-3 py-1.5 font-medium text-gray-600">By</th>
                <th className="w-16"></th>
              </tr></thead>
              <tbody>
                {(data || []).map(a => (
                  <tr key={a.id} className="border-t border-gray-100">
                    <td className="px-3 py-1.5"><button className="text-brand-700 hover:underline text-left" onClick={() => open(a)}>{a.fileName}</button></td>
                    <td className="px-3 py-1.5 text-gray-600">{a.note || ''}</td>
                    <td className="px-3 py-1.5 text-right text-gray-500">{kb(a.sizeBytes)}</td>
                    <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{a.uploadedBy || '—'} · {when(a.uploadedAt)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <button className="text-gray-400 hover:text-brand-600" title="Open" onClick={() => open(a)}><Download size={13} /></button>
                      {canRemove(a) && <button className="text-gray-400 hover:text-red-500 ml-2" title="Remove" onClick={() => remove(a)}><Trash2 size={13} /></button>}
                    </td>
                  </tr>
                ))}
                {(data || []).length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">No attachments yet — PDF, photo or Excel up to 10 MB</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
