import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Render a register in slices instead of all at once.
 *
 * The delivery-ticket register put all 3,700 rows in the DOM (37,000 cells),
 * and inventory 5,094. Nobody scrolls that far — they search — but the browser
 * still lays every row out before the screen paints, which is most of the delay
 * on these screens.
 *
 * This keeps a window of rows and extends it when the scroll container gets
 * near its bottom, so the first paint is one screenful and scrolling still
 * reaches everything. The window resets whenever the filtered set changes,
 * otherwise a search would show a stale slice of the previous result.
 */
export function useRowWindow<T>(rows: T[], step = 120) {
  const [limit, setLimit] = useState(step)
  const ref = useRef<HTMLDivElement | null>(null)

  // Reset on a new result set — length alone is a good enough signal here and
  // avoids deep-comparing a few thousand rows on every render.
  useEffect(() => { setLimit(step) }, [rows.length, step])

  const onScroll = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
      setLimit(l => (l >= rows.length ? l : l + step))
    }
  }, [rows.length, step])

  // If the container is taller than the first slice, nothing triggers a scroll
  // event and the user sees a short list with no way to extend it.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.scrollHeight <= el.clientHeight && limit < rows.length) {
      setLimit(l => l + step)
    }
  }, [limit, rows.length, step])

  const visible = useMemo(() => rows.slice(0, limit), [rows, limit])

  return {
    /** Put this on the scrolling container. */
    scrollRef: ref,
    onScroll,
    visible,
    hasMore: limit < rows.length,
    shown: visible.length,
    total: rows.length,
  }
}
