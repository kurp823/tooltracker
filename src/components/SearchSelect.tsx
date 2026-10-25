import React, { useEffect, useRef, useState } from 'react'
import { Search, X, ChevronDown } from 'lucide-react'
import { Spinner } from './Spinner'

export interface SearchOption {
  value: string
  label: string
  sub?: string
}

interface Props {
  placeholder?: string
  value: string | null
  /** Called with the chosen option's value, or null when cleared. */
  onChange: (value: string | null, option?: SearchOption) => void
  /** Fetches matches for what the user typed. Debounced by this component. */
  search: (term: string) => Promise<SearchOption[]>
  /** Shown in the closed state once something is selected. */
  selectedLabel?: string | null
  minChars?: number
  autoFocus?: boolean
}

/**
 * Type-to-search dropdown. Nothing is fetched until the user types, which
 * keeps a 5,000-row master list off the wire.
 */
export function SearchSelect({
  placeholder = 'Type to search…',
  value,
  onChange,
  search,
  selectedLabel,
  minChars = 2,
  autoFocus,
}: Props) {
  const [term,    setTerm]    = useState('')
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [options, setOptions] = useState<SearchOption[]>([])
  const [active,  setActive]  = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const reqRef = useRef(0)

  // Close when clicking outside
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // Debounced lookup
  useEffect(() => {
    if (term.trim().length < minChars) { setOptions([]); return }
    const id = ++reqRef.current
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await search(term.trim())
        if (id === reqRef.current) { setOptions(res); setActive(0) }
      } catch {
        if (id === reqRef.current) setOptions([])
      } finally {
        if (id === reqRef.current) setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [term, minChars, search])

  function pick(o: SearchOption) {
    onChange(o.value, o)
    setTerm('')
    setOptions([])
    setOpen(false)
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open || !options.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(options[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative">
      {value && !open ? (
        <div className="input flex items-center gap-2 cursor-pointer" onClick={() => setOpen(true)}>
          <span className="flex-1 truncate font-medium">{selectedLabel || value}</span>
          <button
            type="button"
            className="text-gray-400 hover:text-gray-700"
            onClick={e => { e.stopPropagation(); onChange(null); setTerm(''); setOpen(false) }}
            title="Clear"
          >
            <X size={14} />
          </button>
          <ChevronDown size={14} className="text-gray-400" />
        </div>
      ) : (
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder={placeholder}
            value={term}
            autoFocus={autoFocus}
            onFocus={() => setOpen(true)}
            onChange={e => { setTerm(e.target.value); setOpen(true) }}
            onKeyDown={onKey}
          />
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2"><Spinner size="sm" /></span>
          )}
        </div>
      )}

      {open && term.trim().length >= minChars && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {loading && !options.length ? (
            <div className="px-3 py-3 text-sm text-gray-400">Searching…</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-400">No matches</div>
          ) : (
            options.map((o, i) => (
              <button
                key={o.value}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
                className={`w-full text-left px-3 py-2 text-sm border-b border-gray-50 last:border-0 ${
                  i === active ? 'bg-brand-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="font-medium font-mono text-xs">{o.label}</div>
                {o.sub && <div className="text-xs text-gray-500 truncate">{o.sub}</div>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
