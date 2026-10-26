import { useState, useRef } from 'react'
import { api } from '../utils/api'
import * as XLSX from 'xlsx'

/**
 * Import a corrected DT/RT sheet.
 *
 * The sheet is one row per dispatched tool carrying its return ticket, or no
 * return ticket where the tool is still on a rig. It is parsed in the browser,
 * sent to the server in chunks, and then compared against the live tables. The
 * comparison is read-only: nothing in the app changes until the result has been
 * read and the apply step is run deliberately.
 */

/* Rows per request. A single call carrying 46,000 rows would pass neither the
 * request body limit nor the 45-second cap on a managed function. */
const CHUNK = 2000

type Row = {
  rowNo: number; jobNum: string; dtNo: string; dtDate: string; sNo: string
  partNum: string; partDesc: string; rtNo: string; rtDate: string
  remark: string; rig: string; well: string
}

type Preview = {
  batchId: string
  shape: Record<string, number>
  stillOnRigByJobStatus: Array<Record<string, string | number>>
  deliveryLines: Record<string, number>
  returnLines: Record<string, number>
  notKnownToTheApp: Array<{ Kind: string; Example: string | null; Count: number }>
  linkedTables: Array<{ Item: string; Count: number }>
}

/* The sheet's headers vary between exports, so match on a squashed form of the
 * header rather than its exact spelling. */
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

const FIELD_ALIASES: Record<keyof Omit<Row, 'rowNo'>, string[]> = {
  jobNum:   ['jobnum', 'jobno', 'jobid', 'jobnumber'],
  dtNo:     ['deliveryticketnum', 'dtno', 'dtnumber', 'deliveryticket', 'deliveryticketnumber'],
  dtDate:   ['deliverydate', 'dtdate', 'dateout'],
  sNo:      ['sno', 'serialno', 'slno', 'itemno'],
  partNum:  ['partnum', 'partnumber', 'assetno', 'asset', 'serial'],
  partDesc: ['partdescription', 'partdesc', 'description', 'tooldescription'],
  rtNo:     ['returnticketnum', 'rtno', 'rtnumber', 'returnticket', 'returnticketnumber'],
  rtDate:   ['returndate', 'rtdate', 'datein'],
  remark:   ['remark', 'remarks', 'usedstatus', 'status'],
  rig:      ['rignum', 'rig', 'rigname', 'rigno'],
  well:     ['wellnumber', 'well', 'wellno', 'wellname'],
}

const cell = (v: unknown) => {
  if (v === undefined || v === null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  return s === 'nan' || s === 'NaN' || s === 'undefined' || s === 'null' ? '' : s
}

export function DataImportView() {
  const [rows, setRows] = useState<Row[]>([])
  const [fileName, setFileName] = useState('')
  const [headerMap, setHeaderMap] = useState<Record<string, string>>({})
  const [unmapped, setUnmapped] = useState<string[]>([])
  const [batchId, setBatchId] = useState('')
  const [sent, setSent] = useState(0)
  const [busy, setBusy] = useState<'' | 'parsing' | 'uploading' | 'checking'>('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setRows([]); setFileName(''); setHeaderMap({}); setUnmapped([])
    setBatchId(''); setSent(0); setPreview(null); setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    reset()
    setFileName(f.name)
    setBusy('parsing')
    setError('')
    try {
      const buf = await f.arrayBuffer()
      const wb = XLSX.read(buf, { cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })
      if (!grid.length) throw new Error('The first sheet is empty')

      const headers = (grid[0] as unknown[]).map(cell)
      const idx: Partial<Record<keyof Row, number>> = {}
      const map: Record<string, string> = {}
      for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
        const at = headers.findIndex((h) => aliases.includes(norm(h)))
        if (at >= 0) { idx[field as keyof Row] = at; map[field] = headers[at] }
      }
      setHeaderMap(map)
      setUnmapped(Object.keys(FIELD_ALIASES).filter((k) => !(k in map)))

      // A delivery ticket number is the one column nothing works without.
      if (idx.dtNo === undefined) {
        throw new Error('No delivery-ticket column found. Expected a header like "DeliveryTicketNum".')
      }

      const out: Row[] = []
      for (let r = 1; r < grid.length; r++) {
        const g = grid[r] as unknown[]
        const get = (f: keyof Row) => (idx[f] === undefined ? '' : cell(g[idx[f] as number]))
        const dtNo = get('dtNo')
        if (!dtNo) continue            // trailing blank rows Excel leaves behind
        out.push({
          rowNo: r + 1,
          jobNum: get('jobNum'), dtNo, dtDate: get('dtDate'), sNo: get('sNo'),
          partNum: get('partNum'), partDesc: get('partDesc').slice(0, 400),
          rtNo: get('rtNo'), rtDate: get('rtDate'), remark: get('remark'),
          rig: get('rig'), well: get('well'),
        })
      }
      setRows(out)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  async function upload() {
    if (!rows.length) return
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    setBatchId(id); setSent(0); setPreview(null); setError('')
    setBusy('uploading')
    try {
      // Clear first so a re-run cannot double-count a half-finished upload.
      await api.post('/import-dtrt/reset', { batchId: id })
      for (let i = 0; i < rows.length; i += CHUNK) {
        await api.post('/import-dtrt/rows', { batchId: id, rows: rows.slice(i, i + CHUNK) })
        setSent(Math.min(i + CHUNK, rows.length))
      }
      setBusy('checking')
      setPreview(await api.get<Preview>(`/import-dtrt/preview?batchId=${encodeURIComponent(id)}`))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
    }
  }

  const noRT = preview?.shape?.LinesWithNoRT ?? 0

  return (
    <div className="screen">
      <div className="screen-bar">
        <h1 className="page-title">Import corrected DT / RT sheet</h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef} type="file" accept=".xlsx,.xlsm,.csv" onChange={onFile}
            className="text-[12px] file:mr-2 file:py-[3px] file:px-2 file:rounded file:border-0
                       file:bg-slate-200 file:text-slate-700 file:text-[12px]"
          />
          <button
            className="btn-primary" onClick={upload}
            disabled={!rows.length || busy !== ''}
          >
            {busy === 'uploading'
              ? `Uploading ${sent.toLocaleString()} / ${rows.length.toLocaleString()}`
              : busy === 'checking' ? 'Comparing…' : 'Upload and compare'}
          </button>
          <button className="btn-ghost" onClick={reset} disabled={busy !== ''}>Clear</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-3 py-2 space-y-3">
        {error && (
          <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
            {error}
          </div>
        )}

        {busy === 'parsing' && <p className="text-[12px] text-slate-500">Reading {fileName}…</p>}

        {!!rows.length && (
          <section className="rounded border border-slate-200">
            <header className="border-b border-slate-200 bg-slate-50 px-3 py-[6px] text-[12px] font-semibold">
              {fileName} — {rows.length.toLocaleString()} rows read
            </header>
            <div className="px-3 py-2 text-[12px] space-y-1">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {Object.entries(headerMap).map(([field, header]) => (
                  <span key={field} className="text-slate-600">
                    <span className="font-medium">{field}</span> ← {header}
                  </span>
                ))}
              </div>
              {!!unmapped.length && (
                <p className="text-amber-700">
                  No column found for: {unmapped.join(', ')} — those will be stored empty.
                </p>
              )}
              <p className="text-slate-500">
                Nothing is written to the app by uploading. The rows are staged and compared, and
                the comparison below is read-only.
              </p>
            </div>
          </section>
        )}

        {preview && (
          <>
            <Block title="What the sheet contains">
              <Grid obj={preview.shape} />
              <p className="mt-1 text-[12px] text-slate-600">
                {noRT.toLocaleString()} lines carry no return ticket. Those tools are still on a rig.
              </p>
            </Block>

            <Block title="Still on a rig, by the job's status in the app">
              <Table
                cols={['JobStatus', 'Invoiced', 'LinesStillOut', 'Jobs', 'Assets']}
                rows={preview.stillOnRigByJobStatus}
              />
            </Block>

            <div className="grid gap-3 md:grid-cols-2">
              <Block title="Delivery lines — sheet against app">
                <Grid obj={preview.deliveryLines} />
              </Block>
              <Block title="Return lines — sheet against app">
                <Grid obj={preview.returnLines} />
              </Block>
            </div>

            <Block title="Named in the sheet but unknown to the app">
              <Table cols={['Kind', 'Count', 'Example']} rows={preview.notKnownToTheApp} />
            </Block>

            <Block title="Linked tables the apply step would have to write">
              <Table cols={['Item', 'Count']} rows={preview.linkedTables} />
              <p className="mt-1 text-[12px] text-slate-600">
                Tool history and job history need nothing of their own — both are derived from the
                ticket tables and the field logs, so they follow once those are right.
              </p>
            </Block>
          </>
        )}

        {!rows.length && !preview && busy === '' && (
          <p className="text-[12px] text-slate-500">
            Choose the corrected sheet. It should carry one row per dispatched tool, with the
            return ticket where the tool came back and blank where it is still out — column
            headings like JobNum, DeliveryTicketNum, PartNum, ReturnTicketNum, Remark, RigNum.
          </p>
        )}
      </div>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-slate-200">
      <header className="border-b border-slate-200 bg-slate-50 px-3 py-[6px] text-[12px] font-semibold">
        {title}
      </header>
      <div className="px-3 py-2">{children}</div>
    </section>
  )
}

function Grid({ obj }: { obj: Record<string, number> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-[2px] text-[12px] sm:grid-cols-3">
      {Object.entries(obj || {}).map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-slate-100 py-[2px]">
          <dt className="text-slate-600">{k.replace(/([a-z])([A-Z])/g, '$1 $2')}</dt>
          <dd className="font-medium tabular-nums">{Number(v).toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  )
}

function Table({ cols, rows }: { cols: string[]; rows: Array<Record<string, unknown>> }) {
  if (!rows?.length) return <p className="text-[12px] text-slate-500">Nothing to show.</p>
  return (
    <table className="w-full table-fixed text-[12px]">
      <thead>
        <tr>{cols.map((c) => (
          <th key={c} className="table-th text-left">{c.replace(/([a-z])([A-Z])/g, '$1 $2')}</th>
        ))}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {cols.map((c) => (
              <td key={c} className="table-td whitespace-nowrap">
                {typeof r[c] === 'number' ? Number(r[c]).toLocaleString() : String(r[c] ?? '')}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
