import React, { useCallback, useState } from 'react'
import { RefreshCw, Download } from 'lucide-react'
import { api } from '../utils/api'
import { useToast } from '../components/Toast'
import { SearchSelect, type SearchOption } from '../components/SearchSelect'
import { ColumnPicker, loadColumnPrefs, saveColumnPrefs } from '../components/ColumnPicker'
import { MovementTable, MOVEMENT_COLUMNS } from '../components/MovementTable'
import type { ToolMovement, InventoryItem } from '../types'

const PREF_KEY = 'tt_cols_tool_history'

/**
 * Tool Movement History — one asset at a time.
 *
 * Nothing loads until an asset is picked, so the screen never pulls the whole
 * 105k-row movement table. The picker queries inventory as you type.
 */
export function ToolHistoryView() {
  const { showToast } = useToast()
  const [asset,   setAsset]   = useState<string | null>(null)
  const [label,   setLabel]   = useState<string | null>(null)
  const [rows,    setRows]    = useState<ToolMovement[]>([])
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(() => loadColumnPrefs(PREF_KEY, MOVEMENT_COLUMNS))

  const searchAssets = useCallback(async (term: string): Promise<SearchOption[]> => {
    const items = await api.get<InventoryItem[]>(`/inventory?search=${encodeURIComponent(term)}`)
    return (items || []).slice(0, 50).map(i => ({
      value: i.SystemID,
      label: i.AssetNo || i.SystemID,
      sub: [i.ShortDesc || i.Description, i.Size].filter(Boolean).join(' · '),
    }))
  }, [])

  const load = useCallback(async (systemId: string) => {
    setLoading(true)
    try {
      setRows((await api.get<ToolMovement[]>(`/tool-history?serial=${encodeURIComponent(systemId)}&limit=5000`)) || [])
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load tool history', 'error')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [showToast])

  function onPick(value: string | null, opt?: SearchOption) {
    setAsset(value)
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
    a.download = `tool-history-${label || asset}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-104px)]">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className="w-80">
          <SearchSelect
            placeholder="Type asset no, serial or description…"
            value={asset}
            selectedLabel={label}
            onChange={onPick}
            search={searchAssets}
            autoFocus
          />
        </div>
        {asset && (
          <button className="btn-ghost" onClick={() => load(asset)} title="Refresh">
            <RefreshCw size={15} />
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {rows.length > 0 && (
            <button className="btn-ghost" onClick={exportCsv}>
              <Download size={15} /> Export CSV
            </button>
          )}
          <ColumnPicker columns={MOVEMENT_COLUMNS} visible={visible} onChange={updateCols} />
        </div>
      </div>

      {/* Table */}
      <div className="card flex-1 flex flex-col overflow-hidden">
        <MovementTable
          rows={rows}
          loading={loading}
          visible={visible}
          hasSelection={!!asset}
          prompt={<>Pick an asset above to see its movement history.<br />Nothing is loaded until you choose one.</>}
        />
      </div>
    </div>
  )
}
