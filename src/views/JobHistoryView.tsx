import React, { useCallback, useState } from 'react'
import { RefreshCw, Download, Printer } from 'lucide-react'
import { api } from '../utils/api'
import { useToast } from '../components/Toast'
import { SearchSelect, type SearchOption } from '../components/SearchSelect'
import { ColumnPicker, loadColumnPrefs, saveColumnPrefs } from '../components/ColumnPicker'
import { MovementTable, MOVEMENT_COLUMNS } from '../components/MovementTable'
import type { ToolMovement, Job } from '../types'

const PREF_KEY = 'tt_cols_job_history'

/**
 * Job History — the tools list for one job.
 *
 * Nothing loads until a job is picked; the picker queries jobs server-side as
 * you type rather than pulling all 3,824.
 */
export function JobHistoryView() {
  const { showToast } = useToast()
  const [job,     setJob]     = useState<string | null>(null)
  const [label,   setLabel]   = useState<string | null>(null)
  const [rows,    setRows]    = useState<ToolMovement[]>([])
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(() => loadColumnPrefs(PREF_KEY, MOVEMENT_COLUMNS))

  const searchJobs = useCallback(async (term: string): Promise<SearchOption[]> => {
    const jobs = await api.get<Job[]>(`/jobs?search=${encodeURIComponent(term)}&limit=50`)
    return (jobs || []).map(j => ({
      value: j.JobID,
      label: j.JobID,
      sub: [j.Client, j.Rig, j.Well].filter(Boolean).join(' · '),
    }))
  }, [])

  const load = useCallback(async (jobNo: string) => {
    setLoading(true)
    try {
      setRows((await api.get<ToolMovement[]>(`/tool-history?job=${encodeURIComponent(jobNo)}&limit=5000`)) || [])
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load job history', 'error')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [showToast])

  function onPick(value: string | null, opt?: SearchOption) {
    setJob(value)
    setLabel(opt?.label ?? null)
    if (value) load(value)
    else setRows([])
  }

  function updateCols(next: Record<string, boolean>) {
    setVisible(next)
    saveColumnPrefs(PREF_KEY, next)
  }

  function exportCsv() {
    const cols = MOVEMENT_COLUMNS.filter(c => visible[c.key] !== false)
    const head = cols.map(c => c.label).join(',')
    const body = rows.map(r =>
      cols.map(c => {
        const v = (r as unknown as Record<string, unknown>)[c.key]
        const s = v === null || v === undefined ? '' : String(v)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }).join(',')
    ).join('\n')
    const blob = new Blob([`${head}\n${body}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `job-tools-${label || job}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const head = rows[0]

  return (
    <div className="flex flex-col h-[calc(100vh-104px)]">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap mb-3 print:hidden">
        <div className="w-80">
          <SearchSelect
            placeholder="Type job no, client, rig or well…"
            value={job}
            selectedLabel={label}
            onChange={onPick}
            search={searchJobs}
            autoFocus
          />
        </div>
        {job && (
          <button className="btn-ghost" onClick={() => load(job)} title="Refresh">
            <RefreshCw size={15} />
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {rows.length > 0 && (
            <>
              <button className="btn-ghost" onClick={() => window.print()}>
                <Printer size={15} /> Print
              </button>
              <button className="btn-ghost" onClick={exportCsv}>
                <Download size={15} /> Export CSV
              </button>
            </>
          )}
          <ColumnPicker columns={MOVEMENT_COLUMNS} visible={visible} onChange={updateCols} />
        </div>
      </div>

      {/* Job header strip */}
      {head && (
        <div className="card px-4 py-2 mb-3 flex items-center gap-6 text-xs flex-wrap">
          <span><span className="text-gray-500">Job Order </span><b className="font-mono">{head.JobID}</b></span>
          <span><span className="text-gray-500">Rig </span><b>{head.Rig || '—'}</b></span>
          <span><span className="text-gray-500">Well </span><b>{head.Well || '—'}</b></span>
          <span><span className="text-gray-500">Taskorder </span><b>{head.PONumber || '—'}</b></span>
        </div>
      )}

      {/* Table */}
      <div className="card flex-1 flex flex-col overflow-hidden">
        <MovementTable
          tableId="job-history"
          rows={rows}
          loading={loading}
          visible={visible}
          hasSelection={!!job}
          prompt={<>Pick a job above to see its tools list.<br />Nothing is loaded until you choose one.</>}
        />
      </div>
    </div>
  )
}
