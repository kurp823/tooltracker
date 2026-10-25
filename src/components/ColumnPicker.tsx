import React, { useEffect, useRef, useState } from 'react'
import { Columns3, Check } from 'lucide-react'

export interface ColumnDef {
  key: string
  label: string
  /** Columns the user shouldn't be able to hide. */
  locked?: boolean
}

interface Props {
  columns: ColumnDef[]
  visible: Record<string, boolean>
  onChange: (next: Record<string, boolean>) => void
}

/**
 * Lets the user choose which columns a table shows. The caller persists the
 * selection (localStorage) so it survives a reload.
 */
export function ColumnPicker({ columns, visible, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const shown = columns.filter(c => visible[c.key] !== false).length

  return (
    <div ref={ref} className="relative">
      <button className="btn-ghost whitespace-nowrap" onClick={() => setOpen(o => !o)} title="Choose columns">
        <Columns3 size={15} /> Columns ({shown})
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-60 rounded-lg border border-gray-200 bg-white shadow-lg py-1 max-h-80 overflow-auto">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Columns</span>
            <button
              className="text-xs text-brand-700 hover:underline"
              onClick={() => onChange(Object.fromEntries(columns.map(c => [c.key, true])))}
            >
              Show all
            </button>
          </div>
          {columns.map(c => {
            const on = visible[c.key] !== false
            return (
              <button
                key={c.key}
                type="button"
                disabled={c.locked}
                onClick={() => onChange({ ...visible, [c.key]: !on })}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left ${
                  c.locked ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'
                }`}
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center ${
                  on ? 'bg-brand-700 border-brand-700' : 'border-gray-300'
                }`}>
                  {on && <Check size={11} className="text-white" />}
                </span>
                <span className="flex-1">{c.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Load a saved column selection, falling back to everything visible. */
export function loadColumnPrefs(storageKey: string, columns: ColumnDef[]): Record<string, boolean> {
  const all = Object.fromEntries(columns.map(c => [c.key, true]))
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return all
    return { ...all, ...JSON.parse(raw) }
  } catch {
    return all
  }
}

export function saveColumnPrefs(storageKey: string, prefs: Record<string, boolean>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(prefs))
  } catch {
    /* per-viewer convenience only — never load-bearing */
  }
}
