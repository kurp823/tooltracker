import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../utils/api'

interface UseRealtimeFetchResult<T> {
  data:      T | null
  isLoading: boolean
  error:     string | null
  refetch:   () => void
}

/**
 * Like useFetch but polls every `intervalMs` milliseconds.
 * When any user saves data, everyone's screen refreshes within that interval.
 *
 * Default: 5 seconds — fast enough to feel live, light on the server.
 */
export function useRealtimeFetch<T>(
  path: string | null,
  intervalMs = 5000
): UseRealtimeFetchResult<T> {
  const [data,      setData]      = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(!!path)
  const [error,     setError]     = useState<string | null>(null)

  const mountedRef  = useRef(true)
  const countRef    = useRef(0)
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchData = useCallback(async (showLoading = false) => {
    if (!path) return
    const callId = ++countRef.current
    if (showLoading) setIsLoading(true)

    try {
      const result = await api.get<T>(path)
      if (!mountedRef.current || callId !== countRef.current) return
      setData(result)
      setError(null)
    } catch (err) {
      if (!mountedRef.current || callId !== countRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to fetch')
    } finally {
      if (mountedRef.current && callId === countRef.current) setIsLoading(false)
    }
  }, [path])

  useEffect(() => {
    mountedRef.current = true
    if (!path) { setData(null); setIsLoading(false); return }

    // Initial load shows spinner
    fetchData(true)

    // Poll silently — no spinner on subsequent refreshes.
    // Two things keep this from hammering the server:
    //  - a hidden tab does not poll (an open-but-forgotten tab used to fetch
    //    the whole inventory, 3 MB, every 5 seconds all day), and it catches
    //    up the moment the tab is shown again;
    //  - a request still in flight is not stacked with another one.
    let inFlight = false
    const tick = async () => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (inFlight) return
      inFlight = true
      try { await fetchData(false) } finally { inFlight = false }
    }
    timerRef.current = setInterval(tick, intervalMs)
    const onVisible = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      mountedRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [path, intervalMs, fetchData])

  const refetch = useCallback(() => fetchData(true), [fetchData])

  return { data, isLoading, error, refetch }
}
