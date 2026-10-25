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

    // Poll silently — no spinner on subsequent refreshes
    timerRef.current = setInterval(() => fetchData(false), intervalMs)

    return () => {
      mountedRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [path, intervalMs, fetchData])

  const refetch = useCallback(() => fetchData(true), [fetchData])

  return { data, isLoading, error, refetch }
}
