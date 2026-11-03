import { useEffect } from 'react'

/*
 * Drag-to-resize columns on EVERY table in the app, without each screen
 * having to opt in. Hover the right edge of any column header: the cursor
 * changes; drag to resize; double-click the edge to reset that table.
 *
 * It works by event delegation on the document, so it needs no markup in the
 * thirty-odd screens and survives React re-rendering them. Widths are kept
 * per browser, per screen and per table (keyed by route, table position and
 * the header names), so a layout survives a reload.
 *
 * Tables that already carry their own resize handle (data-resizer) are left
 * alone.
 */
const KEY = 'tt_autocolw_'
const EDGE = 7
const MIN = 40

function tableKey(table: HTMLTableElement): string {
  const all = Array.from(document.querySelectorAll('main table'))
  const idx = all.indexOf(table)
  const heads = Array.from(table.querySelectorAll('thead tr:last-child th'))
    .map(th => (th.textContent || '').trim().slice(0, 14)).join('|')
  return KEY + window.location.pathname + '#' + idx + '#' + heads
}

function headsOf(table: HTMLTableElement): HTMLTableCellElement[] {
  const row = table.querySelector('thead tr:last-child')
  return row ? Array.from(row.children) as HTMLTableCellElement[] : []
}

function freeze(table: HTMLTableElement) {
  if (table.dataset.colFrozen) return
  const ths = headsOf(table)
  const widths = ths.map(th => th.getBoundingClientRect().width)
  ths.forEach((th, i) => { th.style.width = widths[i] + 'px'; th.style.minWidth = widths[i] + 'px'; th.style.maxWidth = widths[i] + 'px' })
  table.style.tableLayout = 'fixed'
  table.style.width = widths.reduce((a, b) => a + b, 0) + 'px'
  table.style.maxWidth = 'none'
  table.dataset.colFrozen = '1'
}

function setWidth(table: HTMLTableElement, i: number, w: number) {
  const ths = headsOf(table)
  const th = ths[i]
  if (!th) return
  th.style.width = th.style.minWidth = th.style.maxWidth = w + 'px'
  table.style.width = ths.reduce((a, t) => a + parseFloat(t.style.width || String(t.getBoundingClientRect().width)), 0) + 'px'
}

function save(table: HTMLTableElement) {
  try {
    localStorage.setItem(tableKey(table), JSON.stringify(headsOf(table).map(t => parseFloat(t.style.width) || 0)))
  } catch { /* per-viewer convenience */ }
}

function restore(table: HTMLTableElement) {
  if (table.dataset.colRestored || table.querySelector('[data-resizer]')) return
  const ths = headsOf(table)
  if (!ths.length || table.getBoundingClientRect().width === 0) return
  table.dataset.colRestored = '1'
  let saved: number[] | null = null
  try { saved = JSON.parse(localStorage.getItem(tableKey(table)) || 'null') } catch { saved = null }
  if (!saved || saved.length !== ths.length || saved.some(w => !(w >= MIN))) return
  freeze(table)
  saved.forEach((w, i) => setWidth(table, i, w))
}

function reset(table: HTMLTableElement) {
  try { localStorage.removeItem(tableKey(table)) } catch { /* ignore */ }
  headsOf(table).forEach(th => { th.style.width = th.style.minWidth = th.style.maxWidth = '' })
  table.style.tableLayout = ''; table.style.width = ''; table.style.maxWidth = ''
  delete table.dataset.colFrozen
}

function edgeHit(e: MouseEvent): { th: HTMLTableCellElement; table: HTMLTableElement } | null {
  const th = (e.target as HTMLElement | null)?.closest?.('main thead th') as HTMLTableCellElement | null
  if (!th) return null
  const table = th.closest('table') as HTMLTableElement | null
  if (!table || table.querySelector('[data-resizer]')) return null
  const r = th.getBoundingClientRect()
  return e.clientX >= r.right - EDGE ? { th, table } : null
}

export function useAutoColumnResize() {
  useEffect(() => {
    let raf = 0
    const sweep = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        document.querySelectorAll<HTMLTableElement>('main table').forEach(restore)
      })
    }
    const mo = new MutationObserver(sweep)
    mo.observe(document.body, { childList: true, subtree: true })
    sweep()

    let hot: HTMLElement | null = null
    const onMove = (e: MouseEvent) => {
      const hit = edgeHit(e)
      if (hit && hit.th !== hot) { hot?.classList.remove('col-edge'); hot = hit.th; hot.classList.add('col-edge') }
      else if (!hit && hot) { hot.classList.remove('col-edge'); hot = null }
    }
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const hit = edgeHit(e)
      if (!hit) return
      e.preventDefault(); e.stopPropagation()
      const { th, table } = hit
      freeze(table)
      const i = headsOf(table).indexOf(th)
      const startX = e.clientX
      const startW = th.getBoundingClientRect().width
      const move = (ev: MouseEvent) => setWidth(table, i, Math.max(MIN, startW + ev.clientX - startX))
      const up = () => {
        document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up)
        document.body.style.cursor = ''; document.body.style.userSelect = ''
        save(table)
      }
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
      document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'
    }
    // A click on the edge must not also sort the column.
    const onClick = (e: MouseEvent) => { if (edgeHit(e)) { e.preventDefault(); e.stopPropagation() } }
    const onDbl = (e: MouseEvent) => { const hit = edgeHit(e); if (hit) reset(hit.table) }

    document.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('dblclick', onDbl, true)
    return () => {
      mo.disconnect(); cancelAnimationFrame(raf)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('dblclick', onDbl, true)
    }
  }, [])
}
