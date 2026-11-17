import { useEffect, useMemo, useState } from 'react'
import { useRealtimeFetch } from './useRealtimeFetch'

/**
 * Data for a big register (inventory, tickets, invoices).
 *
 * The lists used to be pulled whole on every visit and every poll — the
 * inventory took 7 s of server time per load (go-live bug 33). Now the
 * screen asks the server for the newest `cap` rows, sends the search box
 * to the server (debounced) so a search covers the whole table, and offers
 * "show all" for the rare full browse.
 */
export function useRegister<T>(
  base: string,
  opts: { search: string; status?: string; cap?: number; extra?: Record<string, string | undefined>; pollMs?: number },
) {
  const cap = opts.cap ?? 500
  const [debounced, setDebounced] = useState(opts.search)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(opts.search.trim()), 300)
    return () => clearTimeout(t)
  }, [opts.search])

  const path = useMemo(() => {
    const p = new URLSearchParams()
    if (debounced) p.set('search', debounced)
    if (opts.status && opts.status !== 'All') p.set('status', opts.status)
    for (const [k, v] of Object.entries(opts.extra || {})) if (v) p.set(k, v)
    // A search or "show all" lifts the cap; the default view is the newest rows.
    if (!debounced && !showAll && cap > 0) p.set('top', String(cap))
    const qs = p.toString()
    return qs ? `${base}?${qs}` : base
  }, [base, debounced, opts.status, showAll, cap, JSON.stringify(opts.extra || {})])

  const res = useRealtimeFetch<T[]>(path, opts.pollMs ?? 30000)
  const rows = res.data || []
  const capped = !debounced && !showAll && cap > 0 && rows.length >= cap

  return { ...res, rows, capped, showAll, setShowAll, cap, searching: !!debounced }
}
