import React, { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Copy, RefreshCw, Ruler, Search, Tag, X } from 'lucide-react'
import { api } from '../utils/api'
import { useToast } from '../components/Toast'
import { ComboBox } from '../components/ComboBox'
import { PageLoader, Spinner } from '../components/Spinner'

/**
 * Inventory → Master Data Clean-up (Admin).
 *
 * Categories and sizes as the inventory actually spells them, next to the
 * masters, with a proposed canonical value for each variant; one click renames
 * every row carrying the variant and retires the duplicate master. The third
 * tab merges assets that exist twice under spelling variants of one number.
 * Every action is audited; nothing is deleted.
 */

interface CatRow { name: string; tools: number; onRig: number; inMaster: boolean; masterActive: boolean | null; family: string | null; proposed: string | null; issue: string | null }
interface Cats { rows: CatRow[]; masterDupes: { keep: string; others: string[] }[]; masters: string[] }
interface SizeRow { label: string; tools: number; rateLines: number; contracts: string[]; inches: number | null; inMaster: boolean; proposed: string | null; proposedInMaster: boolean | null; issue: string | null }
interface Sizes { rows: SizeRow[]; masterDupes: { keep: string; others: string[] }[]; masters: string[] }
interface Dup {
  aId: string; aAsset: string; aCat: string; aSize: string; aDesc: string; aLoc: string; aStatus: string; aDt: number; aRt: number; aDays: number; aJobs: number
  bId: string; bAsset: string; bCat: string; bSize: string; bDesc: string; bLoc: string; bStatus: string; bDt: number; bRt: number; bDays: number; bJobs: number
  suggestKeep: 'a' | 'b'
}

export function MasterCleanupView() {
  const { showToast } = useToast()
  const [tab, setTab] = useState<'cat' | 'size' | 'dup'>('cat')
  const [cats, setCats] = useState<Cats | null>(null)
  const [sizes, setSizes] = useState<Sizes | null>(null)
  const [dups, setDups] = useState<Dup[] | null>(null)
  const [onlyIssues, setOnlyIssues] = useState(true)
  const [q, setQ] = useState('')
  const [target, setTarget] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ kind: 'cat' | 'size' | 'dup'; from: string; to: string; label: string; add?: boolean } | null>(null)
  const [keepSide, setKeepSide] = useState<Record<string, 'a' | 'b'>>({})

  const loadCats = () => api.get<Cats>('/unify/categories').then(setCats).catch(e => showToast(e.message, 'error'))
  const loadSizes = () => api.get<Sizes>('/unify/sizes').then(setSizes).catch(e => showToast(e.message, 'error'))
  const loadDups = () => api.get<Dup[]>('/unify/duplicates').then(setDups).catch(e => showToast(e.message, 'error'))
  useEffect(() => { loadCats() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'size' && !sizes) loadSizes(); if (tab === 'dup' && !dups) loadDups() }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const t = q.trim().toLowerCase()
  const catRows = useMemo(() => (cats?.rows || []).filter(r => (!onlyIssues || r.issue) && (!t || r.name.toLowerCase().includes(t) || (r.proposed || '').toLowerCase().includes(t))), [cats, onlyIssues, t])
  const sizeRows = useMemo(() => (sizes?.rows || []).filter(r => (!onlyIssues || r.issue) && (!t || r.label.toLowerCase().includes(t) || (r.proposed || '').toLowerCase().includes(t))), [sizes, onlyIssues, t])
  const catOpts = useMemo(() => (cats?.masters || []).map(c => ({ value: c, label: c })), [cats])
  const sizeOpts = useMemo(() => (sizes?.masters || []).map(c => ({ value: c, label: c })), [sizes])

  const run = async () => {
    if (!confirm) return
    const c = confirm; setBusy(c.from); setConfirm(null)
    try {
      if (c.kind === 'cat') {
        const r = await api.post<{ moved: any }>('/unify/categories/rename', { from: c.from, to: c.to })
        showToast(`${c.from} → ${c.to}: ${r.moved.inventory} tools, ${r.moved.jobTools} job-tool lines${r.moved.masterDeactivated ? ', duplicate master retired' : ''}`, 'success')
        await loadCats()
      } else if (c.kind === 'size') {
        const r = await api.post<{ moved: any }>('/unify/sizes/rename', { from: c.from, to: c.to, addToMaster: !!c.add })
        showToast(`${c.from} → ${c.to}: ${r.moved.inventory} tools, ${r.moved.rateLines} rate lines${r.moved.masterAdded ? ' (size added to master)' : ''}`, 'success')
        await loadSizes()
      } else {
        const r = await api.post<{ moved: any }>('/unify/merge', { retire: c.from, keep: c.to })
        showToast(`Merged: ${r.moved.dtLines} DT lines, ${r.moved.rtLines} RT lines, ${r.moved.fieldLogs} days moved`, 'success')
        setDups(d => (d || []).filter(x => x.aId !== c.from && x.bId !== c.from))
      }
    } catch (e: any) { showToast(e.message || 'Failed', 'error') }
    finally { setBusy(null) }
  }

  if (!cats) return <PageLoader />
  const issues = { cat: (cats.rows || []).filter(r => r.issue).length, size: sizes ? sizes.rows.filter(r => r.issue).length : null, dup: dups ? dups.length : null }

  return (
    <div className="screen gap-1.5">
      <div className="screen-bar">
        <button className={`btn-mini ${tab === 'cat' ? 'bg-brand-100' : ''}`} onClick={() => setTab('cat')}><Tag size={12} /> Categories ({issues.cat} to fix)</button>
        <button className={`btn-mini ${tab === 'size' ? 'bg-brand-100' : ''}`} onClick={() => setTab('size')}><Ruler size={12} /> Sizes{issues.size != null ? ` (${issues.size} to fix)` : ''}</button>
        <button className={`btn-mini ${tab === 'dup' ? 'bg-brand-100' : ''}`} onClick={() => setTab('dup')}><Copy size={12} /> Duplicate assets{issues.dup != null ? ` (${issues.dup})` : ''}</button>
        {tab !== 'dup' && (
          <>
            <label className="text-[11px] flex items-center gap-1 ml-2"><input type="checkbox" checked={onlyIssues} onChange={e => setOnlyIssues(e.target.checked)} /> Only rows needing attention</label>
            <div className="relative w-64">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="field-input !pl-7" placeholder="Filter…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
          </>
        )}
        <button className="btn-mini" onClick={() => { tab === 'cat' ? loadCats() : tab === 'size' ? loadSizes() : loadDups() }}><RefreshCw size={12} /></button>
      </div>

      {confirm && (
        <div className="shrink-0 card p-2 border-amber-300 bg-amber-50 text-[11px] flex items-center gap-2 flex-wrap">
          <span>{confirm.label}</span>
          <button className="btn-accent !py-0.5" onClick={run}><Check size={12} /> Confirm</button>
          <button className="btn-mini" onClick={() => setConfirm(null)}><X size={12} /> Cancel</button>
        </div>
      )}

      {tab === 'cat' && (
        <div className="flex-1 min-h-0 overflow-auto bg-white border border-gray-300 rounded">
          {cats.masterDupes.length > 0 && (
            <div className="px-3 py-1.5 text-[11px] text-amber-800 bg-amber-50 border-b border-amber-200">
              Master list has duplicate names: {cats.masterDupes.map(d => `${d.others.join(', ')} → ${d.keep}`).join(' · ')}. Renaming the variant below retires the duplicate master.
            </div>
          )}
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0 z-10"><tr>
              <th className="table-th">Category as used</th><th className="table-th text-right">Tools</th><th className="table-th text-right">On rig</th>
              <th className="table-th">Master</th><th className="table-th">Issue</th><th className="table-th">Rename all to</th><th className="table-th w-20"></th>
            </tr></thead>
            <tbody>
              {catRows.length === 0 ? <tr><td colSpan={7} className="table-td text-center text-gray-400 py-10">Nothing to fix.</td></tr> : catRows.map(r => {
                const to = target['c:' + r.name] ?? r.proposed ?? ''
                return (
                  <tr key={r.name} className="table-tr">
                    <td className="table-td font-medium whitespace-nowrap">{r.name}</td>
                    <td className="table-td text-right">{r.tools}</td><td className="table-td text-right">{r.onRig}</td>
                    <td className="table-td whitespace-nowrap">{r.inMaster ? <span className={r.masterActive ? 'text-green-700' : 'text-gray-400'}>{r.family || 'yes'}{r.masterActive ? '' : ' (inactive)'}</span> : <span className="text-red-600">missing</span>}</td>
                    <td className="table-td whitespace-nowrap text-amber-800">{r.issue || '—'}</td>
                    <td className="table-td min-w-[240px]"><ComboBox value={to} onChange={v => setTarget(x => ({ ...x, ['c:' + r.name]: v }))} options={catOpts} placeholder="Pick the master category…" /></td>
                    <td className="table-td">
                      <button className="btn-mini" disabled={!to || to === r.name || !!busy}
                              onClick={() => setConfirm({ kind: 'cat', from: r.name, to, label: `Rename category "${r.name}" → "${to}" on ${r.tools} tools (and their job-tool lines)?` })}>
                        {busy === r.name ? <Spinner size="sm" /> : <><ArrowRight size={12} /> Rename</>}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'size' && (
        <div className="flex-1 min-h-0 overflow-auto bg-white border border-gray-300 rounded">
          {!sizes ? <div className="p-6"><Spinner /></div> : (
            <>
              <div className="px-3 py-1.5 text-[11px] text-gray-600 border-b border-gray-200">
                One standard list for inventory <b>and</b> contract rate sheets. Sizes are read as inches, so 8.250", 8 1/4" and 8-1/4" are one size; the proposal is the master label in fraction form, and Rename changes the tools, their job-tool lines and the contract rate lines together. Non-numeric sizes (XT-39, N/A, 2-7/8 x 3-1/2) are left as they are.
                {sizes.masterDupes.length > 0 && <> Master duplicates: {sizes.masterDupes.map(d => `${d.others.join(', ')} → ${d.keep}`).join(' · ')}.</>}
              </div>
              <table className="w-full border-collapse text-[11px]">
                <thead className="sticky top-0 z-10"><tr>
                  <th className="table-th">Size as used</th><th className="table-th text-right">Tools</th><th className="table-th text-right" title="Active contract rate lines carrying this size">Rate lines</th><th className="table-th text-right">Inches</th>
                  <th className="table-th">In master</th><th className="table-th">Issue</th><th className="table-th">Rename all to</th><th className="table-th w-24"></th>
                </tr></thead>
                <tbody>
                  {sizeRows.length === 0 ? <tr><td colSpan={8} className="table-td text-center text-gray-400 py-10">Nothing to fix.</td></tr> : sizeRows.map(r => {
                    // A label that is already canonical but missing from the master defaults to itself (add-only).
                    const to = target['s:' + r.label] ?? r.proposed ?? (r.inMaster ? '' : r.label)
                    const toInMaster = sizes.masters.some(m => m.toUpperCase() === to.toUpperCase())
                    const addOnly = to === r.label && !toInMaster
                    return (
                      <tr key={r.label} className="table-tr">
                        <td className="table-td font-mono whitespace-nowrap">{r.label}</td>
                        <td className="table-td text-right">{r.tools}</td>
                        <td className="table-td text-right whitespace-nowrap" title={r.contracts.join(', ')}>{r.rateLines || '—'}{r.contracts.length ? <span className="text-[10px] text-gray-400 ml-1">({r.contracts.length} contract{r.contracts.length > 1 ? 's' : ''})</span> : null}</td>
                        <td className="table-td text-right tabular-nums">{r.inches == null ? '—' : r.inches.toFixed(3).replace(/\.?0+$/, '')}</td>
                        <td className="table-td">{r.inMaster ? <span className="text-green-700">yes</span> : <span className="text-red-600">no</span>}</td>
                        <td className="table-td whitespace-nowrap text-amber-800">{r.issue || '—'}</td>
                        <td className="table-td min-w-[200px]"><ComboBox value={to} onChange={v => setTarget(x => ({ ...x, ['s:' + r.label]: v }))} options={sizeOpts} placeholder="Master size…" /></td>
                        <td className="table-td whitespace-nowrap">
                          <button className="btn-mini" disabled={!to || (to === r.label && toInMaster) || !!busy}
                                  onClick={() => setConfirm({ kind: 'size', from: r.label, to, add: !toInMaster,
                                    label: addOnly ? `Add "${to}" to the size master (${r.tools} tools / ${r.rateLines} rate lines already carry it)?`
                                                   : `Rename size "${r.label}" → "${to}" on ${r.tools} tools and ${r.rateLines} contract rate lines${toInMaster ? '' : `, and add "${to}" to the size master`}?` })}>
                            {busy === r.label ? <Spinner size="sm" /> : addOnly ? <><Check size={12} /> Add to master</> : <><ArrowRight size={12} /> Rename{toInMaster ? '' : ' + add'}</>}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {tab === 'dup' && (
        <div className="flex-1 min-h-0 overflow-auto bg-white border border-gray-300 rounded">
          <div className="px-3 py-1.5 text-[11px] text-gray-600 border-b border-gray-200">
            Two assets whose numbers are equal once dashes, slashes, dots and spaces are ignored. The one with more history is suggested as <b>Keep</b>; click the other side to swap. Merge moves the retired asset's ticket lines, job-tool lines and rig days onto the kept one; the retired row stays, marked Merged.
          </div>
          {!dups ? <div className="p-6"><Spinner /></div> : (
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10"><tr>
                <th className="table-th w-6"></th><th className="table-th">Asset A</th><th className="table-th">Category / size</th><th className="table-th">Description</th><th className="table-th text-right">History</th>
                <th className="table-th w-6"></th><th className="table-th">Asset B</th><th className="table-th">Category / size</th><th className="table-th">Description</th><th className="table-th text-right">History</th><th className="table-th w-24"></th>
              </tr></thead>
              <tbody>
                {dups.length === 0 ? <tr><td colSpan={11} className="table-td text-center text-gray-400 py-10">No duplicate assets.</td></tr> : dups.map(d => {
                  const k = keepSide[d.aId + d.bId] || d.suggestKeep
                  const keep = k === 'a' ? d.aId : d.bId, retire = k === 'a' ? d.bId : d.aId
                  const side = (s: 'a' | 'b') => `cursor-pointer ${k === s ? 'bg-green-50' : 'hover:bg-gray-50'}`
                  return (
                    <tr key={d.aId + d.bId} className="table-tr">
                      <td className={`table-td ${side('a')}`} onClick={() => setKeepSide(x => ({ ...x, [d.aId + d.bId]: 'a' }))}><input type="radio" readOnly checked={k === 'a'} /></td>
                      <td className={`table-td font-mono whitespace-nowrap ${side('a')}`} onClick={() => setKeepSide(x => ({ ...x, [d.aId + d.bId]: 'a' }))}>{d.aAsset}<div className="text-[10px] text-gray-400">{d.aLoc} · {d.aStatus}</div></td>
                      <td className={`table-td whitespace-nowrap ${side('a')}`}>{d.aCat || '—'}<div className="text-[10px] text-gray-400">{d.aSize || ''}</div></td>
                      <td className={`table-td max-w-[220px] truncate ${side('a')}`} title={d.aDesc}>{d.aDesc}</td>
                      <td className={`table-td text-right whitespace-nowrap ${side('a')}`}>{d.aDt} DT · {d.aRt} RT · {d.aDays} d</td>
                      <td className={`table-td ${side('b')}`} onClick={() => setKeepSide(x => ({ ...x, [d.aId + d.bId]: 'b' }))}><input type="radio" readOnly checked={k === 'b'} /></td>
                      <td className={`table-td font-mono whitespace-nowrap ${side('b')}`} onClick={() => setKeepSide(x => ({ ...x, [d.aId + d.bId]: 'b' }))}>{d.bAsset}<div className="text-[10px] text-gray-400">{d.bLoc} · {d.bStatus}</div></td>
                      <td className={`table-td whitespace-nowrap ${side('b')}`}>{d.bCat || '—'}<div className="text-[10px] text-gray-400">{d.bSize || ''}</div></td>
                      <td className={`table-td max-w-[220px] truncate ${side('b')}`} title={d.bDesc}>{d.bDesc}</td>
                      <td className={`table-td text-right whitespace-nowrap ${side('b')}`}>{d.bDt} DT · {d.bRt} RT · {d.bDays} d</td>
                      <td className="table-td">
                        <button className="btn-mini" disabled={!!busy}
                                onClick={() => setConfirm({ kind: 'dup', from: retire, to: keep, label: `Merge ${retire === d.aId ? d.aAsset : d.bAsset} into ${keep === d.aId ? d.aAsset : d.bAsset}? Its tickets and rig days move to the kept asset; it is marked Merged.` })}>
                          {busy === retire ? <Spinner size="sm" /> : 'Merge'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
