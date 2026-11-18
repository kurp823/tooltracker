import React, { useEffect, useMemo, useState } from 'react'
import { Check, CheckCheck, Copy, RefreshCw, Search, Tag, X } from 'lucide-react'
import { api } from '../utils/api'
import { useToast } from '../components/Toast'
import { ComboBox } from '../components/ComboBox'
import { PageLoader, Spinner } from '../components/Spinner'

/**
 * Inventory → Categorise Tools.
 *
 * Tools the history import created as 'TO BE CATEGORISED' stubs, each with a
 * proposed category and size worked out from the category list and from how
 * similar tools are already categorised. Accept a row, accept all the
 * high-confidence rows, or type a different category. A second tab lists
 * stubs that are spelling variants of a real catalogue asset, to merge.
 */

interface Row {
  SystemID: string; AssetNo: string; Description: string; Size: string | null; Location: string | null; Status: string | null
  Ownership: string | null; Supplier: string | null; dtLines: number; days: number
  proposedShortDesc: string | null; proposedSize: string | null; confidence: 'high' | 'medium' | 'low' | 'none'; why: string
}
interface Proposals { total: number; summary: Record<string, number>; categories: string[]; rows: Row[] }
interface Dup {
  stub: string; stubAsset: string; stubDesc: string; stubLocation: string; stubStatus: string; stubDt: number; stubRt: number; stubDays: number
  real: string; realAsset: string; realShortDesc: string; realDesc: string; realLocation: string; realStatus: string; realDt: number
}

const CONF: Record<string, string> = { high: 'bg-green-100 text-green-700', medium: 'bg-amber-100 text-amber-800', low: 'bg-orange-100 text-orange-700', none: 'bg-gray-100 text-gray-500' }

export function CategoriseToolsView() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<'cat' | 'dup'>('cat')
  const [data, setData] = useState<Proposals | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [conf, setConf] = useState<'all' | 'high' | 'medium' | 'low' | 'none'>('all')
  const [edits, setEdits] = useState<Record<string, { ShortDesc: string; Size: string }>>({})
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [dups, setDups] = useState<Dup[] | null>(null)
  const [merging, setMerging] = useState<string | null>(null)
  const [confirmMerge, setConfirmMerge] = useState<Dup | null>(null)

  const load = async () => {
    setLoading(true)
    try { setData(await api.get<Proposals>('/categorise/proposals')); setEdits({}); setSel(new Set()) }
    catch (e: any) { showToast(e.message || 'Could not load', 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => { if (tab === 'dup' && !dups) api.get<Dup[]>('/categorise/duplicates').then(setDups).catch(e => showToast(e.message, 'error')) }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const catOptions = useMemo(() => (data?.categories || []).map(c => ({ value: c, label: c })), [data])
  const valueOf = (r: Row) => edits[r.SystemID] || { ShortDesc: r.proposedShortDesc || '', Size: r.proposedSize || '' }

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (data?.rows || []).filter(r => (conf === 'all' || r.confidence === conf) &&
      (!t || [r.AssetNo, r.Description, r.Location, r.proposedShortDesc].some(v => (v || '').toLowerCase().includes(t))))
  }, [data, q, conf])

  const apply = async (ids: string[]) => {
    const items = ids.map(id => { const r = data!.rows.find(x => x.SystemID === id)!; const v = valueOf(r); return { SystemID: id, ShortDesc: v.ShortDesc, Size: v.Size } })
      .filter(i => i.ShortDesc)
    if (!items.length) { showToast('Nothing to apply — pick a category first', 'error'); return }
    setBusy(true)
    try {
      const res = await api.post<{ updated: number; rejected: { SystemID: string; error: string }[] }>('/categorise/apply', { items })
      showToast(`${res.updated} tool(s) categorised${res.rejected.length ? `, ${res.rejected.length} rejected` : ''}`, res.rejected.length ? 'error' : 'success')
      if (res.rejected.length) console.warn(res.rejected)
      const done = new Set(items.map(i => i.SystemID).filter(id => !res.rejected.some(r => r.SystemID === id)))
      setData(d => d && { ...d, total: d.total - done.size, rows: d.rows.filter(r => !done.has(r.SystemID)) })
      setSel(s => { const n = new Set(s); done.forEach(id => n.delete(id)); return n })
    } catch (e: any) { showToast(e.message || 'Apply failed', 'error') }
    finally { setBusy(false) }
  }

  const merge = async (d: Dup) => {
    setMerging(d.stub); setConfirmMerge(null)
    try {
      const r = await api.post<{ moved: Record<string, number> }>('/categorise/merge', { stub: d.stub, real: d.real })
      showToast(`Merged ${d.stubAsset} into ${d.realAsset}: ${r.moved.dtLines} DT lines, ${r.moved.rtLines} RT lines, ${r.moved.fieldLogs} days moved`, 'success')
      setDups(x => (x || []).filter(y => y.stub !== d.stub))
      setData(x => x && { ...x, total: x.total - 1, rows: x.rows.filter(y => y.SystemID !== d.stub) })
    } catch (e: any) { showToast(e.message || 'Merge failed', 'error') }
    finally { setMerging(null) }
  }

  if (loading && !data) return <PageLoader />
  const s = data?.summary || {}
  const highIds = rows.filter(r => r.confidence === 'high').map(r => r.SystemID)

  return (
    <div className="screen gap-1.5">
      <div className="screen-bar">
        <button className={`btn-mini ${tab === 'cat' ? 'bg-brand-100' : ''}`} onClick={() => setTab('cat')}><Tag size={12} /> Uncategorised ({data?.total ?? 0})</button>
        <button className={`btn-mini ${tab === 'dup' ? 'bg-brand-100' : ''}`} onClick={() => setTab('dup')}><Copy size={12} /> Possible duplicates{dups ? ` (${dups.length})` : ''}</button>
        {tab === 'cat' && (
          <>
            <span className="text-[11px] text-gray-500 ml-2">
              Proposal confidence: <b className="text-green-700">{s.high || 0} high</b> · <b className="text-amber-700">{s.medium || 0} medium</b> · <b className="text-orange-700">{s.low || 0} low</b> · {s.none || 0} none
            </span>
            <select className="field-input w-auto" value={conf} onChange={e => setConf(e.target.value as any)}>
              <option value="all">All</option><option value="high">High only</option><option value="medium">Medium</option><option value="low">Low</option><option value="none">No proposal</option>
            </select>
            <div className="relative w-72">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="field-input !pl-7" placeholder="Asset, description, location, category…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
            <button className="btn-mini" onClick={load} title="Recompute proposals"><RefreshCw size={12} /></button>
            <div className="ml-auto flex items-center gap-1.5">
              <button className="btn-mini" disabled={busy || !sel.size} onClick={() => apply([...sel])}><Check size={12} /> Apply selected ({sel.size})</button>
              <button className="btn-accent" disabled={busy || !highIds.length} onClick={() => apply(highIds)} title="Apply every high-confidence proposal in the current list">
                {busy ? <Spinner size="sm" /> : <CheckCheck size={12} />} Apply all high ({highIds.length})
              </button>
            </div>
          </>
        )}
      </div>

      {tab === 'cat' ? (
        <div className="flex-1 min-h-0 overflow-auto bg-white border border-gray-300 rounded">
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0 z-10"><tr>
              <th className="table-th w-6"><input type="checkbox" checked={rows.length > 0 && rows.every(r => sel.has(r.SystemID))}
                     onChange={e => setSel(e.target.checked ? new Set(rows.map(r => r.SystemID)) : new Set())} /></th>
              <th className="table-th">Asset</th><th className="table-th">Description</th><th className="table-th">Location</th><th className="table-th">Status</th>
              <th className="table-th text-right" title="Delivery ticket lines / days on rig in history">History</th>
              <th className="table-th">Category</th><th className="table-th">Size</th><th className="table-th">Confidence</th><th className="table-th w-16"></th>
            </tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={10} className="table-td text-center text-gray-400 py-10">{data?.total ? 'No rows match the filter.' : 'Every tool has a category.'}</td></tr>
              ) : rows.map(r => {
                const v = valueOf(r)
                return (
                  <tr key={r.SystemID} className={`table-tr ${sel.has(r.SystemID) ? 'bg-brand-50/60' : ''}`}>
                    <td className="table-td"><input type="checkbox" checked={sel.has(r.SystemID)} onChange={e => setSel(s => { const n = new Set(s); e.target.checked ? n.add(r.SystemID) : n.delete(r.SystemID); return n })} /></td>
                    <td className="table-td font-mono whitespace-nowrap">{r.AssetNo}</td>
                    <td className="table-td max-w-[420px] truncate" title={r.Description}>{r.Description}</td>
                    <td className="table-td whitespace-nowrap">{r.Location || '—'}</td>
                    <td className="table-td whitespace-nowrap">{r.Status || '—'}</td>
                    <td className="table-td text-right whitespace-nowrap text-gray-500">{r.dtLines} DT · {r.days} d</td>
                    <td className="table-td min-w-[220px]">
                      <ComboBox value={v.ShortDesc} onChange={val => setEdits(e => ({ ...e, [r.SystemID]: { ...v, ShortDesc: val } }))} options={catOptions} placeholder="Pick a category…" />
                    </td>
                    <td className="table-td w-24"><input className="field-input !h-6 !text-[11px]" value={v.Size} onChange={e => setEdits(x => ({ ...x, [r.SystemID]: { ...v, Size: e.target.value } }))} /></td>
                    <td className="table-td whitespace-nowrap"><span className={`badge ${CONF[r.confidence]}`} title={r.why}>{r.confidence}</span></td>
                    <td className="table-td"><button className="btn-mini" disabled={busy || !v.ShortDesc} onClick={() => apply([r.SystemID])} title="Save this category"><Check size={12} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto bg-white border border-gray-300 rounded">
          <div className="px-3 py-2 text-[11px] text-gray-600 border-b border-gray-200">
            Each pair is an uncategorised stub whose asset number equals a real catalogue asset once dashes, slashes and spaces are ignored.
            <b> Merge</b> moves the stub's delivery/return ticket lines and rig days onto the real asset and retires the stub (status Merged). Nothing is deleted; the merge is recorded in the Audit Log.
          </div>
          {!dups ? <div className="p-6"><Spinner /></div> : (
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10"><tr>
                <th className="table-th">Stub (uncategorised)</th><th className="table-th">Stub description</th><th className="table-th text-right">Stub history</th>
                <th className="table-th">Real asset</th><th className="table-th">Category</th><th className="table-th">Real description</th><th className="table-th text-right">Real DT</th><th className="table-th w-24"></th>
              </tr></thead>
              <tbody>
                {dups.length === 0 ? <tr><td colSpan={8} className="table-td text-center text-gray-400 py-10">No duplicates found.</td></tr> : dups.map(d => (
                  <tr key={d.stub} className="table-tr">
                    <td className="table-td font-mono whitespace-nowrap">{d.stubAsset}<div className="text-[10px] text-gray-400">{d.stubLocation} · {d.stubStatus}</div></td>
                    <td className="table-td max-w-[300px] truncate" title={d.stubDesc}>{d.stubDesc}</td>
                    <td className="table-td text-right whitespace-nowrap">{d.stubDt} DT · {d.stubRt} RT · {d.stubDays} d</td>
                    <td className="table-td font-mono whitespace-nowrap">{d.realAsset}<div className="text-[10px] text-gray-400">{d.realLocation} · {d.realStatus}</div></td>
                    <td className="table-td whitespace-nowrap">{d.realShortDesc}</td>
                    <td className="table-td max-w-[300px] truncate" title={d.realDesc}>{d.realDesc}</td>
                    <td className="table-td text-right">{d.realDt}</td>
                    <td className="table-td">
                      {confirmMerge?.stub === d.stub ? (
                        <span className="flex items-center gap-1">
                          <button className="btn-accent !py-0.5" onClick={() => merge(d)}>Confirm</button>
                          <button className="btn-mini" onClick={() => setConfirmMerge(null)}><X size={12} /></button>
                        </span>
                      ) : (
                        <button className="btn-mini" disabled={!!merging} onClick={() => setConfirmMerge(d)}>{merging === d.stub ? <Spinner size="sm" /> : 'Merge →'}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
