import React, { useCallback, useEffect, useRef, useState } from 'react'

const PREFIX = 'tt_colw_'

/**
 * Excel-style column resizing. Widths are per table and per browser, kept in
 * localStorage so a user's layout survives a reload. Drag the handle on a
 * header's right edge; double-click it to reset that column.
 */
export function useResizableColumns(tableId: string, initialWidths: Record<string, number>) {
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(PREFIX + tableId)
      if (saved) return { ...initialWidths, ...JSON.parse(saved) }
    } catch { /* per-viewer convenience only */ }
    return initialWidths
  })

  const widthsRef = useRef(widths)
  useEffect(() => { widthsRef.current = widths }, [widths])

  const persist = useCallback((next: Record<string, number>) => {
    try { localStorage.setItem(PREFIX + tableId, JSON.stringify(next)) } catch { /* ignore */ }
  }, [tableId])

  const startResize = useCallback((colKey: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startWidth = widthsRef.current[colKey] || initialWidths[colKey] || 120

    const onMove = (ev: MouseEvent) => {
      const next = Math.max(40, startWidth + (ev.clientX - startX))
      setWidths(prev => ({ ...prev, [colKey]: next }))
    }
    const onUp = () => {
      persist(widthsRef.current)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [initialWidths, persist])

  const resetColumn = useCallback((colKey: string) => {
    setWidths(prev => {
      const next = { ...prev, [colKey]: initialWidths[colKey] || 120 }
      persist(next)
      return next
    })
  }, [initialWidths, persist])

  const resetAll = useCallback(() => {
    setWidths(initialWidths)
    persist(initialWidths)
  }, [initialWidths, persist])

  const widthOf = useCallback(
    (colKey: string) => widths[colKey] || initialWidths[colKey] || 120,
    [widths, initialWidths]
  )

  return { widths, widthOf, startResize, resetColumn, resetAll }
}

/** Drag handle, placed inside a `relative` <th>. */
export function ResizerHandle({
  onMouseDown,
  onDoubleClick,
}: {
  onMouseDown: (e: React.MouseEvent) => void
  onDoubleClick?: () => void
}) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      title="Drag to resize · double-click to reset"
      className="absolute top-0 right-0 h-full w-[6px] cursor-col-resize select-none
                 hover:bg-accent-500/70 active:bg-accent-500"
    />
  )
}
