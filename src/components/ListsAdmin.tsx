import { useMemo, useState } from 'react'
import { Lock, Plus, EyeOff, Eye, Save } from 'lucide-react'
import { useLists, type ListOption } from '../contexts/ListsContext'
import { api } from '../utils/api'
import { useToast } from './Toast'

/*
 * Settings → Dropdown values.
 *
 * Every option list in the app, editable here instead of in code. Adding a
 * value takes effect as soon as it is saved — no deploy.
 *
 * A value marked with a padlock is one the app's own logic reads: 'USED'
 * routes a returned tool to the Inspection Bay, 'Completed' locks a job,
 * 'Monthly' switches on rollover. Those can be relabelled, reordered or
 * hidden, but not renamed or deleted, because renaming one would change
 * behaviour somewhere else with nothing on screen to explain why.
 */

const pretty = (n: string) => n.replace(/([a-z])([A-Z])/g, '$1 $2')

export function ListsAdmin() {
  const { lists, isLoading, error, refetch } = useLists()
  const { showToast } = useToast()

  const names = useMemo(() => Object.keys(lists).sort(), [lists])
  const [selected, setSelected] = useState<string>('')
  const [newValue, setNewValue] = useState('')
  const [busy, setBusy]         = useState(false)
  const [draft, setDraft]       = useState<Record<number, Partial<ListOption>>>({})

  // 'all=1' is what the Settings view needs — hidden values have to be
  // visible here or they could never be brought back.
  const [rows, setRows] = useState<ListOption[] | null>(null)
  const current = selected || names[0] || ''

  async function loadOne(name: string) {
    setSelected(name); setRows(null); setDraft({})
    try {
      setRows(await api.get<ListOption[]>(`/lists/${encodeURIComponent(name)}?all=1`))
    } catch (e: any) {
      showToast(e.message || 'Could not load that list', 'error')
    }
  }

  async function add() {
    const v = newValue.trim()
    if (!v) return
    setBusy(true)
    try {
      await api('/lists', { method: 'POST', body: JSON.stringify({ ListName: current, Value: v }) })
      setNewValue('')
      showToast(`Added "${v}"`, 'success')
      await loadOne(current); refetch()
    } catch (e: any) {
      showToast(e.message || 'Could not add that value', 'error')
    } finally { setBusy(false) }
  }

  async function save(row: ListOption) {
    const d = draft[row.listId]
    if (!d) return
    setBusy(true)
    try {
      await api(`/lists/${row.listId}`, { method: 'PUT', body: JSON.stringify(d) })
      showToast('Saved', 'success')
      await loadOne(current); refetch()
    } catch (e: any) {
      showToast(e.message || 'Could not save', 'error')
    } finally { setBusy(false) }
  }

  async function toggleHidden(row: ListOption) {
    setBusy(true)
    try {
      if (row.active) {
        await api(`/lists/${row.listId}`, { method: 'DELETE' })
      } else {
        await api(`/lists/${row.listId}`, { method: 'PUT', body: JSON.stringify({ ActiveFlag: true }) })
      }
      await loadOne(current); refetch()
    } catch (e: any) {
      showToast(e.message || 'Could not change that value', 'error')
    } finally { setBusy(false) }
  }

  const edit = (id: number, patch: Partial<ListOption>) =>
    setDraft(p => ({ ...p, [id]: { ...p[id], ...patch } }))

  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>
  if (error)     return <p className="text-sm text-red-600">{error}</p>

  const shown = rows ?? (lists[current] || [])

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        The values offered in the app's dropdowns. Changes apply immediately —
        no deploy. A <Lock size={12} className="inline -mt-0.5" /> marks a value
        the app's logic depends on: it can be relabelled, reordered or hidden,
        but not renamed or removed.
      </p>

      <div className="flex gap-2 items-center flex-wrap">
        <select className="input w-auto" value={current}
                onChange={e => loadOne(e.target.value)}>
          {names.map(n => <option key={n} value={n}>{pretty(n)}</option>)}
        </select>
        <span className="text-xs text-gray-500">{shown.length} value(s)</span>
      </div>

      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Value</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600">Label shown</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-20">Order</th>
              <th className="text-left px-3 py-2 font-medium text-gray-600 w-28"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(row => {
              const d = draft[row.listId] || {}
              const dirty = Object.keys(d).length > 0
              return (
                <tr key={row.listId}
                    className={`border-t border-gray-100 ${row.active ? '' : 'bg-gray-50 text-gray-400'}`}>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      {row.isSystem && <Lock size={12} className="text-gray-400 shrink-0" />}
                      <input
                        className="input py-1 text-sm w-full disabled:bg-transparent disabled:border-transparent"
                        defaultValue={row.value}
                        disabled={row.isSystem}
                        title={row.isSystem ? 'Used by the app’s logic — cannot be renamed' : undefined}
                        onChange={e => edit(row.listId, { value: e.target.value })} />
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <input className="input py-1 text-sm w-full"
                           defaultValue={row.label === row.value ? '' : row.label}
                           placeholder={row.value}
                           onChange={e => edit(row.listId, { label: e.target.value })} />
                  </td>
                  <td className="px-3 py-1.5">
                    <input type="number" className="input py-1 text-sm w-full"
                           defaultValue={row.sortOrder}
                           onChange={e => edit(row.listId, { sortOrder: Number(e.target.value) })} />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1 justify-end">
                      {dirty && (
                        <button className="btn-ghost p-1" disabled={busy}
                                title="Save" onClick={() => save(row)}>
                          <Save size={14} className="text-blue-600" />
                        </button>
                      )}
                      <button className="btn-ghost p-1" disabled={busy}
                              title={row.active ? 'Hide from the dropdown' : 'Show again'}
                              onClick={() => toggleHidden(row)}>
                        {row.active ? <EyeOff size={14} /> : <Eye size={14} className="text-emerald-600" />}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {shown.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-gray-400">
                No values yet — add the first one below.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2">
        <input className="input flex-1" placeholder={`New value for ${pretty(current)}`}
               value={newValue} onChange={e => setNewValue(e.target.value)}
               onKeyDown={e => { if (e.key === 'Enter') add() }} />
        <button className="btn-primary" onClick={add} disabled={busy || !newValue.trim()}>
          <Plus size={15} /> Add
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Hiding a value removes it from the dropdown but keeps it on records that
        already carry it — a ticket saved as “Workshop” still reads “Workshop”
        after that choice is withdrawn.
      </p>
    </div>
  )
}
