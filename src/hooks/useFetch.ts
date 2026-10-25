import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../utils/api'

interface FetchState<T> {
  data: T | null
  isLoading: boolean
  error: string | null
  refetch: () => void
}

export function useFetch<T>(path: string | null): FetchState<T> {
  const [data, setData]       = useState<T | null>(null)
  // Start in the loading state whenever there's a path to fetch — the
  // effect below fires it on mount, but only AFTER the first render.
  // If isLoading started false, components that do `const s = stats!`
  // (DashboardView, etc.) would read null on that very first render
  // and crash before the fetch ever goes out.
  const [isLoading, setIsLoading] = useState(!!path)
  const [error, setError]     = useState<string | null>(null)
  const mountedRef = useRef(true)
  const countRef   = useRef(0)

  const fetch = useCallback(async () => {
    if (!path) return
    const id = ++countRef.current
    setIsLoading(true)
    setError(null)
    try {
      const result = await api.get<T>(path)
      if (mountedRef.current && id === countRef.current) {
        setData(result)
      }
    } catch (e) {
      if (mountedRef.current && id === countRef.current) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      }
    } finally {
      if (mountedRef.current && id === countRef.current) {
        setIsLoading(false)
      }
    }
  }, [path])

  useEffect(() => {
    mountedRef.current = true
    fetch()
    return () => { mountedRef.current = false }
  }, [fetch])

  return { data, isLoading, error, refetch: fetch }
}
