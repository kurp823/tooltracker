import React from 'react'
import { Spinner } from './Spinner'
import { formatDate } from '../utils/format'
import type { ToolMovement } from '../types'
import type { ColumnDef } from './ColumnPicker'
import { useResizableColumns, ResizerHandle } from './useResizableColumns'

export const MOVEMENT_COLUMNS: ColumnDef[] = [
  { key: 'TicketNo',      label: 'Ticket No', locked: true },
  { key: 'DateOut',       label: 'Date Out' },
  { key: 'Item',          label: 'Item' },
  { key: 'PartNo',        label: 'Part No', locked: true },
  { key: 'Description',   label: 'Description' },
  { key: 'Size',          label: 'Size' },
  { key: 'JobID',         label: 'Job No' },
  { key: 'Rig',           label: 'Rig' },
  { key: 'Well',          label: 'Well' },
  { key: 'RgtNo',         label: 'RGT No' },
  { key: 'DateIn',        label: 'Date In' },
  { key: 'Comments',      label: 'Comments' },
  { key: 'Supplier',      label: 'Supplier' },
  { key: 'OpsDays',       label: 'Ops Days' },
  { key: 'StandbyDays',   label: 'SB Days' },
  { key: 'OpsAmount',     label: 'Ops Value' },
  { key: 'StandbyAmount', label: 'SB Value' },
  { key: 'TotalAmount',   label: 'Total' },
]

const DEFAULT_WIDTHS: Record<string, number> = {
  TicketNo: 110, DateOut: 95, Item: 55, PartNo: 115, Description: 300, Size: 70,
  JobID: 125, Rig: 80, Well: 90, RgtNo: 110, DateIn: 95, Comments: 95,
  Supplier: 110, OpsDays: 70, StandbyDays: 70, OpsAmount: 100, StandbyAmount: 100,
  TotalAmount: 105,
}

const NUMERIC = new Set(['OpsDays', 'StandbyDays', 'OpsAmount', 'StandbyAmount', 'TotalAmount'])

const num = (v: number | null | undefined) => Number(v ?? 0)
const money = (v: number) =>
  v ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

function cell(r: ToolMovement, key: string): React.ReactNode {
  switch (key) {
    case 'DateOut':       return formatDate(r.DateOut) || '—'
    case 'DateIn':        return formatDate(r.DateIn) || '—'
    case 'Item':          return r.Item ?? '—'
    case 'OpsDays':       return num(r.OpsDays) || '—'
    case 'StandbyDays':   return num(r.StandbyDays) || '—'
    case 'OpsAmount':     return money(num(r.OpsAmount))
    case 'StandbyAmount': return money(num(r.StandbyAmount))
    case 'TotalAmount':   return money(num(r.TotalAmount))
    case 'Comments':
      return r.Comments
        ? <span className={`badge ${/^not/i.test(r.Comments) ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'}`}>{r.Comments}</span>
        : '—'
    default: {
      const v = (r as unknown as Record<string, unknown>)[key]
      return (v === null || v === undefined || v === '') ? '—' : String(v)
    }
  }
}

interface Props {
  /** Distinct id so each screen remembers its own column widths. */
  tableId: string
  rows: ToolMovement[]
  loading: boolean
  visible: Record<string, boolean>
  /** Shown when nothing has been selected yet. */
  prompt: React.ReactNode
  hasSelection: boolean
}

export function MovementTable({ tableId, rows, loading, visible, prompt, hasSelection }: Props) {
  const cols = MOVEMENT_COLUMNS.filter(c => visible[c.key] !== false)
  const { widthOf, startResize, resetColumn } = useResizableColumns(tableId, DEFAULT_WIDTHS)

  const totals = rows.reduce(
    (a, r) => ({
      ops:     a.ops     + num(r.OpsDays),
      standby: a.standby + num(r.StandbyDays),
      opsAmt:  a.opsAmt  + num(r.OpsAmount),
      sbAmt:   a.sbAmt   + num(r.StandbyAmount),
      total:   a.total   + num(r.TotalAmount),
    }),
    { ops: 0, standby: 0, opsAmt: 0, sbAmt: 0, total: 0 }
  )

  const totalFor = (key: string) => {
    switch (key) {
      case 'OpsDays':       return totals.ops || '—'
      case 'StandbyDays':   return totals.standby || '—'
      case 'OpsAmount':     return money(totals.opsAmt)
      case 'StandbyAmount': return money(totals.sbAmt)
      case 'TotalAmount':   return money(totals.total)
      default: return ''
    }
  }
  const firstNumericIdx = cols.findIndex(c => NUMERIC.has(c.key))

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Spinner size="md" /></div>
  }
  if (!hasSelection) {
    return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm px-6 text-center">{prompt}</div>
  }
  if (!rows.length) {
    return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">No records found.</div>
  }

  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-navy-head text-white">
            {cols.map(c => (
              <th
                key={c.key}
                style={{ width: widthOf(c.key), minWidth: widthOf(c.key) }}
                className={`relative px-2 py-2 font-semibold whitespace-nowrap ${
                  NUMERIC.has(c.key) ? 'text-right' : 'text-left'
                }`}
              >
                {c.label}
                <ResizerHandle
                  onMouseDown={e => startResize(c.key, e)}
                  onDoubleClick={() => resetColumn(c.key)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.TicketNo}-${r.Serial}-${r.Item}-${i}`} className="border-b border-gray-100 hover:bg-brand-50/40">
              {cols.map(c => (
                <td
                  key={c.key}
                  style={{ width: widthOf(c.key), maxWidth: widthOf(c.key) }}
                  className={[
                    'px-2 py-1.5 overflow-hidden text-ellipsis whitespace-nowrap',
                    NUMERIC.has(c.key) ? 'text-right' : 'text-left',
                    ['PartNo', 'TicketNo', 'RgtNo', 'JobID'].includes(c.key) ? 'font-mono' : '',
                    c.key === 'TotalAmount' ? 'font-semibold' : '',
                  ].join(' ')}
                  title={c.key === 'Description' ? (r.Description || '') : undefined}
                >
                  {cell(r, c.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot className="sticky bottom-0">
          <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
            {cols.map((c, i) => (
              <td key={c.key} className={`px-2 py-2 whitespace-nowrap ${NUMERIC.has(c.key) ? 'text-right' : 'text-left'}`}>
                {i === 0 ? `${rows.length} lines` : (i === firstNumericIdx - 1 && firstNumericIdx > 0 ? 'Totals' : totalFor(c.key))}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
