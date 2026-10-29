import { useMemo, useState } from 'react'
import { Database, Search, Table2 } from 'lucide-react'
import { useFetch } from '../hooks/useFetch'
import { PageLoader } from '../components/Spinner'
import { Stat, Panel } from '../components/Stat'

/*
 * Database Inspector - reads /api/schema.
 *
 * Read-only by design. It answers "what is actually in the database and how
 * much of it", which is the question that keeps coming up when a screen
 * shows a number nobody expected. An empty table is worth seeing: it usually
 * means a module was built but never loaded.
 */

interface Col { name?: string; Name?: string; type?: string; Type?: string
                nullable?: boolean; Nullable?: boolean }
interface Tbl { name?: string; Name?: string; TableName?: string
                rows?: number; Rows?: number; rowCount?: number; RowCount?: number
                columns?: Col[]; Columns?: Col[] }
interface Schema { tableCount?: number; tables?: Tbl[] }

const tName = (t: Tbl) => String(t.TableName ?? t.name ?? t.Name ?? '')
const tRows = (t: Tbl) => Number(t.rowCount ?? t.RowCount ?? t.rows ?? t.Rows ?? 0)
const tCols = (t: Tbl) => (t.columns ?? t.Columns ?? []) as Col[]
const cName = (c: Col) => String(c.name ?? c.Name ?? '')
const cType = (c: Col) => String(c.type ?? c.Type ?? '')

export function DbInspectorView() {
  const { data, isLoading, error } = useFetch<Schema>('/schema')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const m = useMemo(() => {
    const tables = (data?.tables ?? []).slice()
    tables.sort((a, b) => tRows(b) - tRows(a))
    const needle = q.trim().toLowerCase()
    return {
      tables,
      filtered: needle
        ? tables.filter(t => tName(t).toLowerCase().includes(needle) ||
                             tCols(t).some(c => cName(c).toLowerCase().includes(needle)))
        : tables,
      totalRows: tables.reduce((a, t) => a + tRows(t), 0),
      empty: tables.filter(t => tRows(t) === 0),
    }
  }, [data, q])

  if (isLoading) return <PageLoader />
  if (error) return <div className="card p-6 text-center text-sm text-red-600">{error}</div>

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Database Inspector</h2>
        <p className="text-sm text-gray-500 mt-0.5">Read-only view of the tables behind the app</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat label="Tables" value={m.tables.length}
              icon={<Table2 size={22} className="text-gray-600" />} iconBg="bg-gray-100" />
        <Stat label="Rows in total" value={m.totalRows.toLocaleString()}
              icon={<Database size={22} className="text-blue-600" />} iconBg="bg-blue-100" />
        <Stat label="Empty tables" value={m.empty.length}
              tone={m.empty.length ? 'warn' : 'good'}
              sub={m.empty.length ? 'built but never loaded' : undefined}
              icon={<Table2 size={22} className="text-amber-600" />} iconBg="bg-amber-100" />
      </div>

      <Panel
        title="Tables"
        subtitle={q ? `${m.filtered.length} matching "${q}"` : 'Largest first — click a row to see its columns'}
        action={
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Find a table or column…"
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-md w-56
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        }
      >
        <div className="max-h-[32rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left  px-4 py-2 font-medium text-gray-600">Table</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Columns</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Rows</th>
              </tr>
            </thead>
            <tbody>
              {m.filtered.map(t => {
                const name = tName(t)
                const isOpen = open === name
                return [
                  <tr
                    key={name}
                    onClick={() => setOpen(isOpen ? null : name)}
                    className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-2 font-medium text-gray-800">{name}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-600">{tCols(t).length || '—'}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${
                          tRows(t) === 0 ? 'text-amber-700' : 'text-gray-900'}`}>
                      {tRows(t).toLocaleString()}
                    </td>
                  </tr>,
                  isOpen && tCols(t).length > 0 && (
                    <tr key={`${name}-cols`} className="bg-gray-50/70">
                      <td colSpan={3} className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {tCols(t).map(c => (
                            <span key={cName(c)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded
                                             bg-white border border-gray-200 text-xs">
                              <span className="text-gray-800">{cName(c)}</span>
                              {cType(c) && <span className="text-gray-400">{cType(c)}</span>}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ),
                ]
              })}
              {m.filtered.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">Nothing matches that</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {m.empty.length > 0 && (
        <Panel title="Empty tables" subtitle="No rows at all — usually a module that was built but never loaded">
          <div className="px-4 py-3 flex flex-wrap gap-1.5">
            {m.empty.map(t => (
              <span key={tName(t)}
                    className="px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900">
                {tName(t)}
              </span>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
