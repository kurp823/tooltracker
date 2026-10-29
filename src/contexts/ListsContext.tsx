import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../utils/api'
import { useAuth } from './AuthContext'

/*
 * Dropdown values, served from tbl_Lists.
 *
 * Every option list in the app used to be a const array in the screen that
 * showed it, so adding one value meant a code change and a deploy. They now
 * come from the database and an Admin edits them in Settings.
 *
 * Fetched once for the whole app rather than per screen: there are fifteen
 * lists and the whole set is a few kilobytes, so one request beats fifteen.
 */

export interface ListOption {
  listId:    number
  listName:  string
  value:     string
  label:     string
  sortOrder: number
  active:    boolean
  isSystem:  boolean
  notes:     string | null
}

type ListMap = Record<string, ListOption[]>

interface ListsState {
  lists:     ListMap
  isLoading: boolean
  error:     string | null
  refetch:   () => void
}

const Ctx = createContext<ListsState>({
  lists: {}, isLoading: true, error: null, refetch: () => {},
})

export function ListsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [lists, setLists]         = useState<ListMap>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const load = useCallback(async () => {
    // Nothing is fetched until there is a session.
    //
    // This provider wraps every route, the login page included. api.ts
    // treats any 401 as an expired session: it clears the token and sets
    // window.location, so an unauthenticated fetch from here reloaded the
    // page, which mounted this provider again, which fetched again — an
    // infinite refresh on the login screen that made signing in impossible.
    if (!user) { setLists({}); setIsLoading(false); setError(null); return }

    setIsLoading(true)
    setError(null)
    try {
      const data = await api.get<ListMap>('/lists')
      setLists(data && typeof data === 'object' ? data : {})
    } catch (e) {
      // Deliberately no hardcoded fallback. If the lists cannot be loaded,
      // the screens say so and offer the record's existing value, rather
      // than quietly substituting a different set of options that might not
      // match what this database actually holds.
      setError(e instanceof Error ? e.message : 'Could not load dropdown values')
      setLists({})
    } finally {
      setIsLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  const value = useMemo(
    () => ({ lists, isLoading, error, refetch: load }),
    [lists, isLoading, error, load]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLists() { return useContext(Ctx) }

/**
 * The options for one dropdown.
 *
 * `current` is the value the record already holds, and it is added to the
 * list when it is missing. That matters: a job saved years ago may carry a
 * status that has since been hidden, and if the dropdown did not offer it,
 * opening that job and pressing Save would silently change it to whatever
 * sat at the top of the list. Its origin is marked so the screen can show
 * it differently.
 */
export function useListOptions(listName: string, current?: string | null) {
  const { lists, isLoading, error } = useLists()

  return useMemo(() => {
    const rows = lists[listName] || []
    const out  = rows.map(r => ({ value: r.value, label: r.label, retired: false }))

    const cur = (current ?? '').trim()
    if (cur && !out.some(o => o.value.toLowerCase() === cur.toLowerCase())) {
      out.push({ value: cur, label: cur, retired: true })
    }
    return { options: out, isLoading, error, configured: rows.length > 0 }
  }, [lists, listName, current, isLoading, error])
}

/** Just the values, for the places that only need strings. */
export function useListValues(listName: string, current?: string | null): string[] {
  return useListOptions(listName, current).options.map(o => o.value)
}
