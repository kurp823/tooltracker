import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Page a register instead of scrolling it.
 *
 * The registers used to render a growing window of rows and extend it as you
 * scrolled, which meant the only way to reach Job-023-00079 in 3,800 rows was
 * to keep scrolling, with no sense of how far in you were. Paging gives a
 * position - "Page 3 of 21" - and a fixed amount of work per paint.
 *
 * The page size is measured rather than chosen: one screenful, worked out
 * from the real height of a rendered row and the real height of the
 * container, so a laptop and a large monitor each fill their own screen. It
 * is remeasured when the container resizes. If a page spills slightly the
 * container still scrolls, so an odd row height or a wrapped cell costs a
 * little scrolling rather than hiding a row.
 */
export function usePagedRows<T>(rows: T[], estimate = 28) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [perPage, setPerPage] = useState(0)   // 0 = not measured yet
  const [page, setPage] = useState(1)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    // Measure a real row. Before any row exists there is nothing to measure
    // from, so the estimate carries the first paint.
    const row  = el.querySelector('tbody tr')
    const head = el.querySelector('thead')
    const rowH = row ? row.getBoundingClientRect().height : estimate
    if (!rowH) return
    const headH = head ? head.getBoundingClientRect().height : 0
    const avail = el.clientHeight - headH
    if (avail <= 0) return
    const n = Math.max(1, Math.floor(avail / rowH))
    setPerPage(p => (p === n ? p : n))
  }, [estimate])

  // Before paint, so the provisional page size is never shown.
  useLayoutEffect(measure)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure])

  // A new result set starts at the beginning; otherwise searching from page 9
  // lands on an empty page.
  useEffect(() => { setPage(1) }, [rows.length])

  const size      = perPage || Math.max(1, Math.round(600 / estimate))
  const pageCount = Math.max(1, Math.ceil(rows.length / size))
  const current   = Math.min(page, pageCount)

  const visible = useMemo(
    () => rows.slice((current - 1) * size, current * size),
    [rows, current, size]
  )

  return {
    /** Put this on the scrolling container that holds the table. */
    scrollRef: ref,
    visible,
    page: current,
    pageCount,
    setPage,
    total: rows.length,
    from: rows.length === 0 ? 0 : (current - 1) * size + 1,
    to:   Math.min(current * size, rows.length),
  }
}

/**
 * The bar under a register: where you are, and how to move.
 */
export function Pager({
  page, pageCount, setPage, from, to, total, noun = 'row',
}: {
  page: number
  pageCount: number
  setPage: (n: number) => void
  from: number
  to: number
  total: number
  noun?: string
}) {
  const atStart = page <= 1
  const atEnd   = page >= pageCount

  return (
    <div className="shrink-0 flex items-center gap-2 px-2 py-1 text-[11px] text-gray-500
                    bg-gray-50 border border-t-0 border-gray-300 rounded-b">
      <span>
        {total === 0
          ? `No ${noun}s`
          : <>Showing <strong className="text-gray-700">{from.toLocaleString()}</strong>–
             <strong className="text-gray-700">{to.toLocaleString()}</strong> of{' '}
             <strong className="text-gray-700">{total.toLocaleString()}</strong></>}
      </span>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => setPage(1)}
          disabled={atStart}
          className="btn-mini disabled:opacity-40 disabled:cursor-not-allowed"
          title="First page"
        >
          First
        </button>
        <button
          type="button"
          onClick={() => setPage(page - 1)}
          disabled={atStart}
          className="btn-mini disabled:opacity-40 disabled:cursor-not-allowed"
          title="Previous page"
        >
          <ChevronLeft size={12} />
        </button>

        <span className="px-1.5 whitespace-nowrap">
          Page <strong className="text-gray-700">{page}</strong> of{' '}
          <strong className="text-gray-700">{pageCount}</strong>
        </span>

        <button
          type="button"
          onClick={() => setPage(page + 1)}
          disabled={atEnd}
          className="btn-mini disabled:opacity-40 disabled:cursor-not-allowed"
          title="Next page"
        >
          <ChevronRight size={12} />
        </button>
        <button
          type="button"
          onClick={() => setPage(pageCount)}
          disabled={atEnd}
          className="btn-mini disabled:opacity-40 disabled:cursor-not-allowed"
          title="Last page"
        >
          Last
        </button>
      </div>
    </div>
  )
}
