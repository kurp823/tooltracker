import React, { useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { api } from '../utils/api'
import { formatDate } from '../utils/format'

export interface InspectionLine {
  InspectionID: number
  WONumber: number | null
  LineNum: number | null
  JobID: string | null
  AssetNo: string | null
  SerialNumber: string | null
  ToolDescription: string | null
  InspectionType: string | null
  InspectionDate: string | null
  Inspector: string | null
  Result: string | null
  Action: string | null
  CertNumber: string | null
  Status: string
  Source: string | null
  Notes: string | null
}

export function actionBadge (a: string | null, r: string | null) {
  const v = a || (r === 'Pass' ? 'Stock' : r === 'Fail' ? 'DMR' : r) || '—'
  const cls = v === 'Stock' ? 'bg-green-100 text-green-700'
            : v === 'DMR'   ? 'bg-red-100 text-red-700'
            : v === 'Conditional' ? 'bg-yellow-100 text-yellow-700'
            : 'bg-gray-100 text-gray-600'
  return <span className={`badge text-xs ${cls}`}>{v}</span>
}

/**
 * Inspection history for one tool (`serial=…`) or one job (`job=…`).
 * Shown under the movement history so a user searching a tool or a job sees
 * every inspection work order, report number and action in one place.
 */
export function InspectionHistory ({ query, showTool = false }: { query: string | null; showTool?: boolean }) {
  const [rows, setRows] = useState<InspectionLine[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!query) { setRows([]); return }
    let alive = true
    setLoading(true)
    api.get<InspectionLine[]>(`/inspections?${query}&limit=5000`)
      .then(r => { if (alive) setRows(r || []) })
      .catch(() => { if (alive) setRows([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [query])

  if (!query) return null
  return (
    <div className="card mt-3 overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2 text-sm font-medium text-gray-700">
        <ClipboardCheck size={14} className="text-brand-600" /> Inspection history
        <span className="text-xs text-gray-400 font-normal">{loading ? 'loading…' : `${rows.length} lines`}</span>
      </div>
      {rows.length > 0 && (
        <div className="overflow-auto max-h-80">
          <table className="w-full">
            <thead><tr>
              <th className="table-th">WO</th>
              <th className="table-th">Date</th>
              {showTool && <th className="table-th">Asset</th>}
              {showTool && <th className="table-th">Description</th>}
              <th className="table-th">Job</th>
              <th className="table-th">Report No</th>
              <th className="table-th">Action</th>
              <th className="table-th">Status</th>
              <th className="table-th">Inspector</th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.InspectionID} className="table-tr">
                  <td className="table-td font-mono text-xs">{r.WONumber ?? '—'}{r.LineNum ? `/${r.LineNum}` : ''}</td>
                  <td className="table-td text-xs">{formatDate(r.InspectionDate)}</td>
                  {showTool && <td className="table-td font-mono text-xs">{r.AssetNo || r.SerialNumber || '—'}</td>}
                  {showTool && <td className="table-td text-xs max-w-[260px] truncate" title={r.ToolDescription || ''}>{r.ToolDescription || '—'}</td>}
                  <td className="table-td text-xs">{r.JobID || '—'}</td>
                  <td className="table-td font-mono text-xs">{r.CertNumber || '—'}</td>
                  <td className="table-td">{actionBadge(r.Action, r.Result)}</td>
                  <td className="table-td text-xs">{r.Status}</td>
                  <td className="table-td text-xs text-gray-500">{r.Inspector || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && rows.length === 0 && <p className="px-4 py-3 text-xs text-gray-400">No inspections recorded.</p>}
    </div>
  )
}
