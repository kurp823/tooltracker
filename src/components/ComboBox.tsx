import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'

export interface ComboOption {
  value: string
  label: string
  /** Optional trailing count, e.g. how many tools are in this category. */
  count?: number
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: ComboOption[]
  /** Shown when nothing is selected, and as the "no filter" row at the top. */
  allLabel?: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

/**
 * Type-to-search dropdown over a list already in memory.
 *
 * A native <select> cannot be typed into — with 130 categories or 204 sizes
 * that means scrolling a long popup to find a known value. This filters as you
 * type but still shows the whole list on focus, so it works for browsing and
 * for jumping straight to a value you already know.
 *
 * Distinct from SearchSelect, which fetches from the server after two
 * characters and shows nothing before that; it suits a 5,000-row master, not a
 * filter you also want to look through.
 */
export function ComboBox({
  value,
  onChange,
  options,
  allLabel = 'All',
  placeholder = 'Type to search…',
  disabled,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.value === value)

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase()
    if (!q) return options
    // Values starting with the term first — typing "8" should offer 8" before
    // 18-1/8".
    const starts: ComboOption[] = []
    const contains: ComboOption[] = []
    for (const o of options) {
      const l = o.label.toLowerCase()
      if (l.startsWith(q)) starts.push(o)
      else if (l.includes(q)) contains.push(o)
    }
    return [...starts, ...contains]
  }, [options, term])

  // Rows include the "all" row at index 0, so the active index is offset by one.
  const rowCount = filtered.length + 1

  useEffect(() => { setActive(0) }, [term, open])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
        setTerm('')
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // Keep the highlighted row in view when navigating by keyboard.
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-row="${active}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  function choose(v: string) {
    onChange(v)
    setTerm('')
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setActive(a => Math.min(a + 1, rowCount - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      if (active === 0) choose('')
      else {
        const o = filtered[active - 1]
        if (o) choose(o.value)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      setTerm('')
    }
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        className="field-input pr-9"
        // While open the box is a search field; closed it shows the selection.
        value={open ? term : (selected?.label ?? '')}
        placeholder={selected ? selected.label : placeholder}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={e => { setTerm(e.target.value); if (!open) setOpen(true) }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
      />

      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
        {value && !disabled && (
          <button
            type="button"
            className="text-gray-400 hover:text-red-500"
            title="Clear"
            onMouseDown={e => { e.preventDefault(); choose('') }}
          >
            <X size={12} />
          </button>
        )}
        <ChevronDown size={12} className="text-gray-400 pointer-events-none" />
      </div>

      {open && !disabled && (
        <div
          ref={listRef}
          className="absolute z-50 left-0 right-0 mt-0.5 max-h-72 overflow-auto bg-white
                     border border-gray-300 rounded shadow-lg text-[12px]"
        >
          <div
            data-row={0}
            onMouseDown={e => { e.preventDefault(); choose('') }}
            onMouseEnter={() => setActive(0)}
            className={`px-2 py-1 cursor-pointer border-b border-gray-100 text-gray-500
                        ${active === 0 ? 'bg-brand-50' : ''}`}
          >
            {allLabel}
          </div>

          {filtered.length === 0 ? (
            <div className="px-2 py-2 text-gray-400">No match</div>
          ) : (
            filtered.map((o, i) => (
              <div
                key={o.value}
                data-row={i + 1}
                onMouseDown={e => { e.preventDefault(); choose(o.value) }}
                onMouseEnter={() => setActive(i + 1)}
                className={`px-2 py-1 cursor-pointer flex items-center gap-2
                            ${active === i + 1 ? 'bg-brand-50' : ''}
                            ${o.value === value ? 'font-semibold text-brand-700' : ''}`}
              >
                <span className="truncate">{o.label}</span>
                {o.count != null && (
                  <span className="ml-auto text-[10px] text-gray-400 shrink-0">{o.count}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
