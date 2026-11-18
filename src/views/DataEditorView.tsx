import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Download, RefreshCw, Search, Upload, X, Check, Table2, Pencil } from 'lucide-react'
import * as XLSX from 'xlsx'
import { api } from '../utils/api'
import { useFetch } from '../hooks/useFetch'
import { useToast } from '../components/Toast'
import { Spinner } from '../components/Spinner'

/**
 * Administration → Data Editor.
 *
 * Open any live table, find rows, correct a cell in place, or load new rows
 * from a sheet — without leaving the app. Every edit and import is written to
 * the audit log with the old and new values. There is no delete here.
 */

interface TableInfo { name: string; rows: number; cols: number }
interface Col { name: string; type: string; len: number | null; nullable: boolean; identity: boolean; computed: boolean; pk: boolean }
interface Structure { table: string; rows: number; pk: string[]; columns: Col[] }
interface Page { page: number; size: number; total: number; sort: string; dir: string; rows: Record<string, any>[] }

const DATE_T = new Set(['date', 'datetime', 'datetime2', 'smalldatetime'])
const NUM_T = new Set(['int', 'bigint', 'smallint', 'tinyint', 'decimal', 'numeric', 'money', 'smallmoney', 'float', 'real'])

function show(v: any, c?: Col): string {
  if (v === null || v === undefined) return ''
  if (c && DATE_T.has(c.type)) {
    const d = new Date(v); if (isNaN(d.getTime())) return String(v)
    return c.type === 'date' || /T00:00:00(\.000)?Z$/.test(String(v))
      ? d.toISOString().slice(0, 10)
      : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
const editValue = (v: any, c: Col) => {
  if (v === null || v === undefined) return ''
  if (DATE_T.has(c.type)) { const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, c.type === 'date' ? 10 : 16) }
  return show(v, c)
}

export function DataEditorView() {
  const { showToast } = useToast()
  const { data: tables, isLoading: loadingTables } = useFetch<TableInfo[]>('/data')
  const [table, setTable] = useState('')
  const [tq, setTq] = useState('')
  const [struct, setStruct] = useState<Structure | null>(null)
  const [q, setQ] = useState('')
  const [qApplied, setQApplied] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null)
  const [data, setData] = useState<Page | null>(null)
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState<{ rowIdx: number; col: string; value: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const SIZE = 100

  const tableList = useMemo(() => {
    const t = tq.trim().toLowerCase()
    return (tables || []).filter(x => !t || x.name.toLowerCase().includes(t))
  }, [tables, tq])

  // Structure when the table changes
  useEffect(() => {
    setStruct(null); setData(null); setPage(1); setSort(null); setQ(''); setQApplied(''); setEdit(null); setImportOpen(false)
    if (!table) return
    api.get<Structure>(`/data/${encodeURIComponent(table)}`).then(setStruct).catch(e => showToast(e.message || 'Could not read table', 'error'))
  }, [table]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    if (!table) return
    setBusy(true)
    try {
      const qs = new URLSearchParams({ page: String(page), size: String(SIZE) })
      if (qApplied) qs.set('q', qApplied)
      if (sort) { qs.set('sort', sort.col); qs.set('dir', sort.dir) }
      setData(await api.get<Page>(`/data/${encodeURIComponent(table)}/rows?${qs}`))
    } catch (e: any) { showToast(e.message || 'Could not load rows', 'error') }
    finally { setBusy(false) }
  }
  useEffect(() => { load() }, [table, page, qApplied, sort]) // eslint-disable-line react-hooks/exhaustive-deps

  const cols = struct?.columns || []
  const pk = struct?.pk || []
  const editable = (c: Col) => pk.length > 0 && !c.pk && !c.identity && !c.computed

  const commit = async () => {
    if (!edit || !data || !struct) return
    const row = data.rows[edit.rowIdx]
    const col = cols.find(c => c.name === edit.col)!
    const before = editValue(row[edit.col], col)
    if (before === edit.value) { setEdit(null); return }
    setSaving(true)
    try {
      const key: Record<string, any> = {}; pk.forEach(k => { key[k] = row[k] })
      await api.put(`/data/${encodeURIComponent(table)}/rows`, { key, set: { [edit.col]: edit.value } })
      const rows = data.rows.slice(); rows[edit.rowIdx] = { ...row, [edit.col]: edit.value === '' ? null : edit.value }
      setData({ ...data, rows }); setEdit(null)
      showToast('Saved', 'success')
    } catch (e: any) { showToast(e.message || 'Save failed', 'error') }
    finally { setSaving(false) }
  }

  const exportCsv = () => {
    if (!data) return
    const ws = XLSX.utils.json_to_sheet(data.rows.map(r => { const o: any = {}; cols.forEach(c => { o[c.name] = show(r[c.name], c) }); return o }))
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, table.slice(0, 31))
    XLSX.writeFile(wb, `${table}_page${data.page}.xlsx`)
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1

  return (
    <div className="screen gap-1.5">
      <div className="flex-1 min-h-0 flex gap-1.5">
        {/* Table list */}
        <div className="w-64 shrink-0 bg-white border border-gray-300 rounded flex flex-col min-h-0">
          <div className="p-1.5 border-b border-gray-200">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="field-input !pl-6" placeholder="Find a table…" value={tq} onChange={e => setTq(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {loadingTables ? <div className="p-3"><Spinner size="sm" /></div> : tableList.map(t => (
              <button key={t.name} onClick={() => setTable(t.name)}
                      className={`w-full text-left px-2 py-1 text-[11px] border-b border-gray-100 flex justify-between gap-2 hover:bg-brand-50 ${table === t.name ? 'bg-brand-100 font-semibold' : ''}`}>
                <span className="truncate">{t.name.replace(/^tbl_/, '')}</span>
                <span className={`tabular-nums ${t.rows === 0 ? 'text-amber-600' : 'text-gray-400'}`}>{t.rows.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 min-w-0 bg-white border border-gray-300 rounded flex flex-col min-h-0">
          {!table ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm">
              <Table2 size={28} className="mb-2 opacity-40" />
              Pick a table on the left. Click a cell to correct it; use Import to add rows from a sheet.
            </div>
          ) : (
            <>
              <div className="screen-bar !border-0 !rounded-none border-b border-gray-200 px-2 py-1.5">
                <span className="font-semibold text-sm">{table}</span>
                <span className="text-[11px] text-gray-500">{struct ? `${struct.rows.toLocaleString()} rows · key: ${pk.join(', ') || 'none (read-only)'}` : ''}</span>
                <form className="relative w-72 ml-2" onSubmit={e => { e.preventDefault(); setPage(1); setQApplied(q.trim()) }}>
                  <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input className="field-input !pl-7" placeholder="Search any text column… (Enter)" value={q} onChange={e => setQ(e.target.value)} />
                  {qApplied && <button type="button" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700" onClick={() => { setQ(''); setQApplied(''); setPage(1) }}><X size={12} /></button>}
                </form>
                <button className="btn-mini" onClick={load} title="Reload"><RefreshCw size={12} className={busy ? 'animate-spin' : ''} /></button>
                <button className="btn-mini" onClick={exportCsv} disabled={!data?.rows.length} title="Download this page as Excel"><Download size={12} /> Export</button>
                <button className={`btn-mini ${importOpen ? 'bg-brand-100' : ''}`} onClick={() => setImportOpen(v => !v)} title="Add rows from a sheet"><Upload size={12} /> Import</button>
                <div className="ml-auto flex items-center gap-1 text-[11px] text-gray-600">
                  <button className="btn-mini" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={12} /></button>
                  <span>Page {data?.page || page} of {pages}{data ? ` · ${data.total.toLocaleString()} ${qApplied ? 'matching' : ''}` : ''}</span>
                  <button className="btn-mini" disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight size={12} /></button>
                </div>
              </div>

              {importOpen && struct && <ImportPanel table={table} struct={struct} onDone={() => { setImportOpen(false); load() }} onClose={() => setImportOpen(false)} />}

              <div className="flex-1 overflow-auto relative">
                {busy && !data && <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>}
                <table className="border-collapse text-[11px] whitespace-nowrap">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {cols.map(c => (
                        <th key={c.name} className="table-th cursor-pointer select-none" title={`${c.type}${c.len ? `(${c.len})` : ''}${c.nullable ? '' : ' · required'}${c.pk ? ' · key' : ''}${c.identity ? ' · auto' : ''}`}
                            onClick={() => setSort(s => s && s.col === c.name ? { col: c.name, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col: c.name, dir: 'asc' })}>
                          {c.name}{c.pk && <span className="text-brand-600 ml-0.5">●</span>}
                          {sort?.col === c.name && <span className="ml-0.5 text-gray-400">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data && data.rows.length === 0 && (
                      <tr><td colSpan={cols.length || 1} className="table-td text-center text-gray-400 py-10">{qApplied ? 'No rows match.' : 'This table is empty — use Import to load it.'}</td></tr>
                    )}
                    {(data?.rows || []).map((r, ri) => (
                      <tr key={ri} className="table-tr">
                        {cols.map(c => {
                          const isEdit = edit && edit.rowIdx === ri && edit.col === c.name
                          return (
                            <td key={c.name}
                                className={`table-td max-w-[320px] truncate ${NUM_T.has(c.type) ? 'text-right tabular-nums' : ''} ${editable(c) ? 'cursor-text hover:bg-amber-50' : 'text-gray-500'} ${isEdit ? '!p-0' : ''}`}
                                title={editable(c) ? `${show(r[c.name], c)}\n(click to edit)` : show(r[c.name], c)}
                                onClick={() => { if (editable(c) && !isEdit) setEdit({ rowIdx: ri, col: c.name, value: editValue(r[c.name], c) }) }}>
                              {isEdit ? (
                                <span className="flex items-center">
                                  <input autoFocus className="field-input !h-6 !text-[11px] min-w-[160px]" value={edit!.value}
                                         type={c.type === 'date' ? 'date' : DATE_T.has(c.type) ? 'datetime-local' : NUM_T.has(c.type) ? 'text' : 'text'}
                                         onChange={e => setEdit({ ...edit!, value: e.target.value })}
                                         onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEdit(null) }} />
                                  <button className="px-1 text-green-600" onClick={e => { e.stopPropagation(); commit() }} disabled={saving}>{saving ? <Spinner size="sm" /> : <Check size={12} />}</button>
                                  <button className="px-1 text-gray-400" onClick={e => { e.stopPropagation(); setEdit(null) }}><X size={12} /></button>
                                </span>
                              ) : show(r[c.name], c) || <span className="text-gray-300">—</span>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="shrink-0 border-t border-gray-200 px-2 py-1 text-[10px] text-gray-500 flex items-center gap-1">
                <Pencil size={10} /> Click a cell to correct it (Enter saves, Esc cancels). Key and auto-number columns are fixed. Every change is written to the Audit Log with the old value. Rows cannot be deleted here.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Import rows from a pasted range or a CSV/XLSX file ───────────────────── */
function ImportPanel({ table, struct, onDone, onClose }: { table: string; struct: Structure; onDone: () => void; onClose: () => void }) {
  const { showToast } = useToast()
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<any[][]>([])
  const [map, setMap] = useState<Record<string, string>>({})   // sheet header → table column
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ inserted: number; failed: number; errors: { row: number; error: string }[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const targets = struct.columns.filter(c => !c.identity && !c.computed)

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const autoMap = (hs: string[]) => {
    const m: Record<string, string> = {}
    hs.forEach(h => { const t = targets.find(c => norm(c.name) === norm(h)); if (t) m[h] = t.name })
    setMap(m)
  }
  const take = (aoa: any[][]) => {
    const clean = aoa.filter(r => r.some(v => v !== null && v !== undefined && String(v).trim() !== ''))
    if (clean.length < 2) { showToast('Need a header row and at least one data row', 'error'); return }
    const hs = clean[0].map(h => String(h ?? '').trim())
    setHeaders(hs); setRows(clean.slice(1)); setResult(null); autoMap(hs)
  }
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text/plain'); if (!text) return
    e.preventDefault()
    take(text.split(/\r?\n/).map(l => l.split('\t')))
  }
  const onFile = async (f: File) => {
    const buf = await f.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    take(XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' }) as any[][])
  }
  const mapped = headers.filter(h => map[h])
  const missingRequired = targets.filter(c => !c.nullable && !Object.values(map).includes(c.name))

  const run = async () => {
    if (!mapped.length) return
    setBusy(true); setResult(null)
    try {
      const payload = rows.map(r => { const o: Record<string, any> = {}; headers.forEach((h, i) => { if (map[h]) o[map[h]] = r[i] instanceof Date ? r[i].toISOString() : r[i] }); return o })
      const res = await api.post<any>(`/data/${encodeURIComponent(table)}/rows`, { rows: payload })
      setResult(res)
      if (res.inserted) showToast(`${res.inserted} row(s) added to ${table}`, 'success')
      if (!res.failed) onDone()
    } catch (e: any) { showToast(e.message || 'Import failed', 'error') }
    finally { setBusy(false) }
  }

  return (
    <div className="shrink-0 border-b border-gray-200 bg-amber-50/40 p-2 text-[11px] space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold">Import rows into {table}</span>
        <span className="text-gray-500">Paste a range from Excel (with its header row) or choose a file. Headers matching column names are mapped automatically.</span>
        <button className="ml-auto text-gray-400 hover:text-gray-700" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="flex gap-2 items-start">
        <textarea className="field-input !h-14 w-[420px] font-mono" placeholder="Paste here (Ctrl+V)…" onPaste={onPaste} readOnly value={headers.length ? `${rows.length} rows × ${headers.length} columns ready` : ''} />
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = '' }} />
        <button className="btn-mini" onClick={() => fileRef.current?.click()}><Upload size={12} /> Choose CSV / Excel</button>
        {headers.length > 0 && <button className="btn-mini" onClick={() => { setHeaders([]); setRows([]); setMap({}); setResult(null) }}>Clear</button>}
      </div>
      {headers.length > 0 && (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-1">
            {headers.map(h => (
              <label key={h} className="flex items-center gap-1 bg-white border border-gray-200 rounded px-1.5 py-0.5">
                <span className="truncate flex-1" title={h}>{h || <i className="text-gray-400">(blank)</i>}</span>
                <span className="text-gray-400">→</span>
                <select className="field-input !h-6 !text-[11px] w-40" value={map[h] || ''} onChange={e => setMap(m => ({ ...m, [h]: e.target.value }))}>
                  <option value="">skip</option>
                  {targets.map(c => <option key={c.name} value={c.name}>{c.name}{c.nullable ? '' : ' *'}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn-accent" disabled={busy || !mapped.length || missingRequired.length > 0} onClick={run}>
              {busy ? <Spinner size="sm" /> : <Upload size={12} />} Add {rows.length} row(s)
            </button>
            {missingRequired.length > 0 && <span className="text-red-600">Required column(s) not mapped: {missingRequired.map(c => c.name).join(', ')}</span>}
            <span className="text-gray-500">Rows are added only — existing rows are never changed or removed by an import.</span>
          </div>
          {result && result.failed > 0 && (
            <div className="bg-white border border-red-200 rounded p-1.5 max-h-32 overflow-auto">
              <div className="font-semibold text-red-700">{result.inserted} added · {result.failed} failed</div>
              {result.errors.map(e => <div key={e.row}>Row {e.row}: {e.error}</div>)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
