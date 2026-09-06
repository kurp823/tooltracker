import React, { useState, useMemo } from 'react';
import { Callout, CalloutItem, ToolItem, User, DrillingJob } from '../types';
import { TOOL_SIZES } from '../data/initialData';
import { ToolPickerModal } from './ToolPickerModal';
import { formatDateDDMMYY } from '../utils';

interface CalloutsViewProps {
  user?: User | null;
  callouts: Callout[];
  inventory: ToolItem[];
  jobs?: DrillingJob[];
  onSaveCallout?: (callout: Callout, reservedTools?: ToolItem[]) => void;
  onCreateJob?: (callout: Callout) => void;
  onCreateJobFromCallout?: (callout: Callout) => void;
  onDispatchJob?: (jobId: string) => void;
  isNewCalloutOpen?: boolean;
  onCloseNewCallout?: () => void;
  onOpenNewCallout?: () => void;
}

export const CalloutsView: React.FC<CalloutsViewProps> = ({
  user,
  callouts,
  inventory,
  jobs = [],
  onSaveCallout,
  onCreateJob,
  onCreateJobFromCallout,
  onDispatchJob,
  isNewCalloutOpen: propIsNewOpen,
  onCloseNewCallout,
  onOpenNewCallout,
}) => {
  const handleCreateJob = onCreateJobFromCallout || onCreateJob || (() => {});
  const handleDispatch = onDispatchJob || (() => {});

  const [tab, setTab] = useState<'active' | 'closed'>('active');
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  // New Callout Modal State (local fallback if not controlled)
  const [localIsNewCalloutOpen, setLocalIsNewCalloutOpen] = useState(false);
  const isNewCalloutOpen = propIsNewOpen !== undefined ? propIsNewOpen : localIsNewCalloutOpen;
  const openNewCallout = onOpenNewCallout || (() => setLocalIsNewCalloutOpen(true));
  const closeNewCallout = onCloseNewCallout || (() => setLocalIsNewCalloutOpen(false));
  const [newRig, setNewRig] = useState('');
  const [newWell, setNewWell] = useState('');
  const [newClient, setNewClient] = useState('');
  const [newContract, setNewContract] = useState('');
  const [newPoRef, setNewPoRef] = useState('');
  const [newStatus, setNewStatus] = useState<Callout['status']>('Active');

  // Interactive requirement queue for Callout creator
  const [queueItems, setQueueItems] = useState<
    Array<{ shortDesc: string; size: string; qty: number; picks: ToolItem[] }>
  >([]);
  const [barCategory, setBarCategory] = useState('');
  const [barSize, setBarSize] = useState('');
  const [barQty, setBarQty] = useState(1);

  // Tool Picker Modal State
  const [pickerConfig, setPickerConfig] = useState<{
    isOpen: boolean;
    category: string;
    size: string;
    maxSelect: number;
    excludeIds: string[];
    preSelectedIds: string[];
    onConfirm: (tools: ToolItem[]) => void;
  }>({
    isOpen: false,
    category: '',
    size: '',
    maxSelect: 1,
    excludeIds: [],
    preSelectedIds: [],
    onConfirm: () => {},
  });

  // Assign Serials Modal State
  const [assignCallout, setAssignCallout] = useState<Callout | null>(null);
  const [assignPicks, setAssignPicks] = useState<Record<number, ToolItem[]>>({});

  // Categories from inventory
  const categories = useMemo(() => {
    return Array.from(new Set(inventory.map((t) => t.shortDesc).filter(Boolean))).sort();
  }, [inventory]);

  // Sizes for selected category
  const availableSizesForCategory = useMemo(() => {
    if (!barCategory) return [];
    const sizes = Array.from(
      new Set(
        inventory
          .filter((t) => (t.shortDesc || '').toUpperCase() === barCategory.toUpperCase())
          .map((t) => t.size)
      )
    ).filter(Boolean);
    return sizes.length > 0 ? sizes : TOOL_SIZES;
  }, [inventory, barCategory]);

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    const allKeys: Record<string, boolean> = {};
    callouts.forEach((c) => {
      const key = `${c.rig}||${c.well}`;
      allKeys[key] = true;
    });
    setOpenGroups(allKeys);
  };

  const collapseAll = () => {
    setOpenGroups({});
  };

  // Group callouts by Rig & Well
  const filteredCallouts = useMemo(() => {
    return callouts.filter((c) => {
      if (tab === 'active' && c.status === 'Closed') return false;
      if (tab === 'closed' && c.status !== 'Closed') return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const full = `${c.id} ${c.rig} ${c.well} ${c.client} ${c.contract} ${c.poRef}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });
  }, [callouts, tab, search]);

  const grouped = useMemo(() => {
    const map: Record<string, { rig: string; well: string; contract?: string; client: string; list: Callout[] }> = {};
    filteredCallouts.forEach((c) => {
      const k = `${c.rig}||${c.well}`;
      if (!map[k]) {
        map[k] = { rig: c.rig, well: c.well, contract: c.contract, client: c.client, list: [] };
      }
      map[k].list.push(c);
    });
    return Object.values(map);
  }, [filteredCallouts]);

  const handleBarInsert = () => {
    if (!barCategory || !barSize) {
      alert('Please select Tool Type and Size before inserting.');
      return;
    }
    setQueueItems((prev) => [
      ...prev,
      { shortDesc: barCategory, size: barSize, qty: Number(barQty) || 1, picks: [] },
    ]);
    setBarCategory('');
    setBarSize('');
    setBarQty(1);
  };

  const openPickerForQueueItem = (index: number) => {
    const item = queueItems[index];
    if (!item) return;

    // Collect all excluded IDs from other queue rows
    const excludeIds: string[] = [];
    queueItems.forEach((row, idx) => {
      if (idx !== index) {
        row.picks.forEach((p) => excludeIds.push(p.id));
      }
    });

    setPickerConfig({
      isOpen: true,
      category: item.shortDesc,
      size: item.size,
      maxSelect: item.qty,
      excludeIds,
      preSelectedIds: item.picks.map((p) => p.id),
      onConfirm: (tools) => {
        setQueueItems((prev) => {
          const next = [...prev];
          next[index] = { ...next[index], picks: tools };
          return next;
        });
        setPickerConfig((p) => ({ ...p, isOpen: false }));
      },
    });
  };

  const handleCreateCalloutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRig || !newWell || !newClient) {
      alert('Please provide Rig, Well, and Client.');
      return;
    }
    if (queueItems.length === 0) {
      alert('Please insert at least one tool requirement into the callout.');
      return;
    }

    const curYr = new Date().getFullYear().toString().slice(-2);
    const calNums = callouts
      .map((c) => {
        const m = c.id.match(/^CAL-\d+-(\d+)$/);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const nextSeq = calNums.length > 0 ? Math.max(...calNums) + 1 : 1;
    const newId = `CAL-${curYr}-${String(nextSeq).padStart(5, '0')}`;

    const items: CalloutItem[] = [];
    const allReservedTools: ToolItem[] = [];

    queueItems.forEach((row, i) => {
      const serialNos = row.picks.map((p) => p.serial);
      const assigned = Math.min(serialNos.length, row.qty);
      const status: CalloutItem['status'] =
        assigned >= row.qty ? 'Assigned' : assigned > 0 ? 'Partial' : 'Pending';

      items.push({
        seq: i + 1,
        size: row.size,
        shortDesc: row.shortDesc,
        qty: row.qty,
        assigned,
        serialNos,
        status,
      });

      row.picks.forEach((p) => allReservedTools.push(p));
    });

    const newCallout: Callout = {
      id: newId,
      rig: newRig.trim(),
      well: newWell.trim(),
      client: newClient.trim(),
      contract: newContract.trim() || 'ADNOC Onshore',
      poRef: newPoRef.trim(),
      status: newStatus,
      createdDate: new Date().toISOString().split('T')[0],
      items,
    };

    if (onSaveCallout) {
      onSaveCallout(newCallout, allReservedTools);
    }
    closeNewCallout();
    // Reset form
    setNewRig('');
    setNewWell('');
    setNewClient('');
    setNewContract('');
    setNewPoRef('');
    setQueueItems([]);
  };

  const openAssignModalForCallout = (cal: Callout) => {
    setAssignCallout(cal);
    const initialMap: Record<number, ToolItem[]> = {};
    cal.items.forEach((it, idx) => {
      const tools = (it.serialNos || [])
        .map((s) => inventory.find((t) => t.serial === s))
        .filter((t): t is ToolItem => Boolean(t));
      initialMap[idx] = tools;
    });
    setAssignPicks(initialMap);
  };

  const openPickerForAssignRow = (itemIndex: number) => {
    if (!assignCallout) return;
    const item = assignCallout.items[itemIndex];
    if (!item) return;

    const excludeIds: string[] = [];
    Object.entries(assignPicks).forEach(([k, tools]: [string, ToolItem[]]) => {
      if (parseInt(k, 10) !== itemIndex && Array.isArray(tools)) {
        tools.forEach((t: ToolItem) => excludeIds.push(t.id));
      }
    });

    setPickerConfig({
      isOpen: true,
      category: item.shortDesc,
      size: item.size,
      maxSelect: item.qty,
      excludeIds,
      preSelectedIds: (assignPicks[itemIndex] || []).map((t) => t.id),
      onConfirm: (tools) => {
        setAssignPicks((prev) => ({ ...prev, [itemIndex]: tools }));
        setPickerConfig((p) => ({ ...p, isOpen: false }));
      },
    });
  };

  const handleSaveAssignedSerials = () => {
    if (!assignCallout) return;
    const allReservedTools: ToolItem[] = [];

    const updatedItems = assignCallout.items.map((item, idx) => {
      const picked = assignPicks[idx] || [];
      const serialNos = picked.map((t) => t.serial);
      const assigned = Math.min(serialNos.length, item.qty);
      const status: CalloutItem['status'] =
        assigned >= item.qty ? 'Assigned' : assigned > 0 ? 'Partial' : 'Pending';

      picked.forEach((t) => allReservedTools.push(t));

      return {
        ...item,
        assigned,
        serialNos,
        status,
      };
    });

    const updatedCallout: Callout = {
      ...assignCallout,
      items: updatedItems,
    };

    if (onSaveCallout) {
      onSaveCallout(updatedCallout, allReservedTools);
    }
    setAssignCallout(null);
  };

  return (
    <div className="space-y-4">
      {/* Ribbon */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="text-[11px] text-slate-500 font-medium">Inbound Dispatch Requests</div>
          <h1 className="text-base font-bold text-[#1a3055]">Rig Callouts &amp; Mobilization Demands</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={expandAll}
            className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-300 shadow-sm cursor-pointer"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-300 shadow-sm cursor-pointer"
          >
            Collapse All
          </button>
          {user?.role !== 'Viewer' && (
            <button
              onClick={() => {
                setQueueItems([]);
                openNewCallout();
              }}
              className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-bold text-xs hover:bg-[#24426d] shadow-sm transition cursor-pointer"
            >
              + New Rig Callout
            </button>
          )}
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex bg-white rounded border border-[#b8c9db] p-0.5">
          <button
            onClick={() => setTab('active')}
            className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
              tab === 'active' ? 'bg-[#1a3055] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ⚡ Active &amp; Forecast ({callouts.filter((c) => c.status !== 'Closed').length})
          </button>
          <button
            onClick={() => setTab('closed')}
            className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
              tab === 'closed' ? 'bg-[#1a3055] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ✅ Closed ({callouts.filter((c) => c.status === 'Closed').length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const allOpen: Record<string, boolean> = {};
              grouped.forEach((g) => {
                allOpen[`${g.rig}||${g.well}`] = true;
              });
              setOpenGroups(allOpen);
            }}
            className="px-2.5 py-1 text-xs font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer"
            title="Expand All Rig / Well Sections"
          >
            ▼ Expand All
          </button>
          <button
            onClick={() => setOpenGroups({})}
            className="px-2.5 py-1 text-xs font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer"
            title="Collapse All Rig / Well Sections"
          >
            ▲ Collapse All
          </button>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rig, well, client, PO ref..."
            className="bg-white border border-[#b8c9db] rounded px-3 py-1 text-xs w-60 outline-none font-medium focus:ring-1 focus:ring-amber-400"
          />
        </div>
      </div>

      {/* Grouped Rig / Well Cards */}
      {grouped.length === 0 ? (
        <div className="bg-white border border-[#b8c9db] rounded p-12 text-center text-slate-500 font-medium shadow-sm">
          No callout records found in this view.
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map((grp) => {
            const grpKey = `${grp.rig}||${grp.well}`;
            const isOpen = Boolean(openGroups[grpKey]); // default collapsed as requested
            const allItems = grp.list.flatMap((c) => c.items || []);
            const pendingCount = allItems.filter((it) => it.status === 'Pending').length;
            const assignedCount = allItems.filter((it) => it.status === 'Assigned').length;

            return (
              <div key={grpKey} className="bg-white border border-[#b8c9db] rounded overflow-hidden shadow-sm">
                {/* Group Header */}
                <div
                  onClick={() => toggleGroup(grpKey)}
                  className="px-4 py-2.5 bg-[#dbe6f1] border-b border-[#b8c9db] flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-[#cddaeb] transition"
                >
                  <div className="flex items-center space-x-3">
                    <span className="font-bold text-sm text-[#1a3055]">
                      {grp.rig} <span className="text-slate-400 font-normal">|</span> {grp.well}
                    </span>
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">
                      {grp.client}
                    </span>
                    {pendingCount > 0 && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
                        {pendingCount} Pending
                      </span>
                    )}
                    {assignedCount > 0 && (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">
                        {assignedCount} Assigned
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-500 text-xs font-bold">
                      {isOpen ? '▲ Collapse' : '▼ Expand'}
                    </span>
                  </div>
                </div>

                {/* Callout items table */}
                {isOpen && (
                  <div className="p-3 space-y-3">
                    {grp.list.map((cal) => {
                      const relatedJobs = jobs.filter(
                        (j) => j.calloutId === cal.id && ['Open', 'Ongoing', 'Active'].includes(j.status)
                      );

                      return (
                        <div key={cal.id} className="border border-slate-200 rounded p-3 bg-slate-50/50 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-bold text-amber-900 text-xs">{cal.id}</span>
                              <span className="text-slate-500 text-[11px]">
                                Date: <strong>{formatDateDDMMYY(cal.createdDate)}</strong> &bull; PO: <strong>{cal.poRef || '—'}</strong>
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                                {cal.status}
                              </span>
                            </div>

                            {user?.role !== 'Viewer' && (
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => openAssignModalForCallout(cal)}
                                  className="px-2.5 py-1 rounded bg-[#ffd875] text-[#4a2e00] font-bold text-[11px] hover:brightness-105 shadow-xs transition cursor-pointer"
                                >
                                  🔧 Assign Serials
                                </button>
                                {relatedJobs.length === 0 ? (
                                  <button
                                    onClick={() => handleCreateJob(cal)}
                                    className="px-2.5 py-1 rounded bg-[#1a3055] text-white font-bold text-[11px] hover:bg-[#24426d] shadow-xs transition cursor-pointer"
                                  >
                                    Create Job &rarr;
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleDispatch(relatedJobs[0].id)}
                                    className="px-2.5 py-1 rounded bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700 shadow-xs transition cursor-pointer"
                                  >
                                    Dispatch to {relatedJobs[0].id} &rarr;
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="overflow-x-auto border border-slate-200 rounded bg-white">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead className="bg-slate-50 text-[#24476b] border-b border-slate-200 font-bold">
                                <tr>
                                  <th className="px-2.5 py-1.5 w-10">Seq</th>
                                  <th className="px-2.5 py-1.5">Size</th>
                                  <th className="px-2.5 py-1.5">Tool Type</th>
                                  <th className="px-2.5 py-1.5 text-center">Req Qty</th>
                                  <th className="px-2.5 py-1.5 text-center">Assigned</th>
                                  <th className="px-2.5 py-1.5">Assigned Physical Serial(s)</th>
                                  <th className="px-2.5 py-1.5">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {cal.items.map((it) => (
                                  <tr key={it.seq} className="hover:bg-slate-50">
                                    <td className="px-2.5 py-1.5 text-slate-400 font-mono">{it.seq}</td>
                                    <td className="px-2.5 py-1.5 font-mono font-bold">{it.size}</td>
                                    <td className="px-2.5 py-1.5 font-semibold text-[#1a3055]">{it.shortDesc}</td>
                                    <td className="px-2.5 py-1.5 font-mono font-bold text-center">{it.qty}</td>
                                    <td
                                      className={`px-2.5 py-1.5 font-mono font-bold text-center ${
                                        it.assigned >= it.qty
                                          ? 'text-emerald-700'
                                          : it.assigned > 0
                                          ? 'text-amber-700'
                                          : 'text-rose-700'
                                      }`}
                                    >
                                      {it.assigned}/{it.qty}
                                    </td>
                                    <td className="px-2.5 py-1.5 font-mono">
                                      {it.serialNos && it.serialNos.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                          {it.serialNos.map((s) => (
                                            <span
                                              key={s}
                                              className="px-1.5 py-0.2 bg-amber-50 text-amber-900 border border-amber-200 rounded text-[10px] font-bold"
                                            >
                                              {s}
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-slate-400 text-[10px]">None assigned (Shortfall)</span>
                                      )}
                                    </td>
                                    <td className="px-2.5 py-1.5">
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                          it.status === 'Assigned'
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : it.status === 'Partial'
                                            ? 'bg-amber-100 text-amber-800'
                                            : it.status === 'Released'
                                            ? 'bg-purple-100 text-purple-800'
                                            : 'bg-rose-100 text-rose-800'
                                        }`}
                                      >
                                        {it.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* New Callout Creator Modal */}
      {isNewCalloutOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeNewCallout();
          }}
        >
          <div className="bg-white rounded shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <h3 className="font-bold text-sm">Create New Rig Callout</h3>
              <button
                onClick={closeNewCallout}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateCalloutSubmit} className="p-4 overflow-y-auto flex-1 text-xs space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold mb-1">Rig *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ND-11, AD-45"
                    value={newRig}
                    onChange={(e) => setNewRig(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Well *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BU-324, GH-0512"
                    value={newWell}
                    onChange={(e) => setNewWell(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Client *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ADNOC Onshore"
                    value={newClient}
                    onChange={(e) => setNewClient(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Contract Code</label>
                  <select
                    value={newContract}
                    onChange={(e) => setNewContract(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-bold"
                  >
                    <option value="ADNOC Onshore">ADNOC Onshore</option>
                    <option value="ADNOC Drilling">ADNOC Drilling</option>
                    <option value="ADNOC Offshore">ADNOC Offshore</option>
                    <option value="Turnwell">Turnwell</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">PO Reference</label>
                  <input
                    type="text"
                    placeholder="e.g. PO-ONSHORE-47002"
                    value={newPoRef}
                    onChange={(e) => setNewPoRef(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Status</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as Callout['status'])}
                    className="w-full border rounded px-2.5 py-1.5 font-bold"
                  >
                    <option value="Active">Active</option>
                    <option value="Forecast">Forecast</option>
                  </select>
                </div>
              </div>

              {/* Requirement Insert Bar */}
              <div className="border border-[#b8c9db] rounded p-3 bg-slate-50 space-y-2">
                <div className="font-bold text-slate-700 text-xs">Add Required Tool Line Item</div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Tool Category</label>
                    <select
                      value={barCategory}
                      onChange={(e) => {
                        setBarCategory(e.target.value);
                        setBarSize('');
                      }}
                      className="w-full border rounded px-2 py-1.5 bg-white font-medium"
                    >
                      <option value="">Select category...</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-32">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Size</label>
                    <select
                      value={barSize}
                      disabled={!barCategory}
                      onChange={(e) => setBarSize(e.target.value)}
                      className="w-full border rounded px-2 py-1.5 bg-white font-mono disabled:opacity-50"
                    >
                      <option value="">Select size...</option>
                      {availableSizesForCategory.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-16">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={barQty}
                      onChange={(e) => setBarQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full border rounded px-2 py-1.5 bg-white font-mono font-bold text-center"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleBarInsert}
                    className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] shadow-sm transition cursor-pointer"
                  >
                    + Insert
                  </button>
                </div>
              </div>

              {/* Requirement Queue Table */}
              <div className="space-y-1">
                <div className="font-bold text-slate-700">Requested Tool Specifications ({queueItems.length})</div>
                {queueItems.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 bg-slate-50 rounded border border-dashed border-slate-300">
                    No tools added yet. Use the category &amp; size picker above to insert tools.
                  </div>
                ) : (
                  <div className="border border-[#b8c9db] rounded overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-[#24476b] border-b border-[#b8c9db] font-bold">
                        <tr>
                          <th className="px-2.5 py-1.5 w-10">#</th>
                          <th className="px-2.5 py-1.5">Tool Category</th>
                          <th className="px-2.5 py-1.5">Size</th>
                          <th className="px-2.5 py-1.5 text-center">Qty</th>
                          <th className="px-2.5 py-1.5">Reserved Serials (Optional)</th>
                          <th className="px-2.5 py-1.5 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {queueItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-2.5 py-1.5 font-mono text-slate-400">{idx + 1}</td>
                            <td className="px-2.5 py-1.5 font-bold text-[#1a3055]">{item.shortDesc}</td>
                            <td className="px-2.5 py-1.5 font-mono font-bold">{item.size}</td>
                            <td className="px-2.5 py-1.5 font-mono font-bold text-center">{item.qty}</td>
                            <td className="px-2.5 py-1.5">
                              <div className="flex items-center space-x-2">
                                <button
                                  type="button"
                                  onClick={() => openPickerForQueueItem(idx)}
                                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold border border-slate-300 cursor-pointer"
                                >
                                  🔧 Select Serials
                                </button>
                                {item.picks.length > 0 && (
                                  <span className="font-mono text-[10px] text-emerald-800 font-bold">
                                    {item.picks.map((p) => p.serial).join(', ')}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2.5 py-1.5 text-center">
                              <button
                                type="button"
                                onClick={() => setQueueItems(queueItems.filter((_, i) => i !== idx))}
                                className="text-rose-600 hover:underline font-bold text-xs cursor-pointer"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={closeNewCallout}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-amber-400 text-[#1a3055] font-bold hover:bg-amber-500 shadow-sm cursor-pointer"
                >
                  Submit Rig Callout &rarr;
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Serials Modal */}
      {assignCallout && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAssignCallout(null);
          }}
        >
          <div className="bg-white rounded shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="font-bold text-sm">Assign Physical Serials to Callout</h3>
                <div className="text-[11px] text-slate-300">
                  {assignCallout.id} &bull; {assignCallout.rig} / {assignCallout.well}
                </div>
              </div>
              <button
                onClick={() => setAssignCallout(null)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 text-xs space-y-3">
              <div className="border border-[#b8c9db] rounded overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-[#24476b] border-b border-[#b8c9db] font-bold">
                    <tr>
                      <th className="px-2.5 py-1.5 w-10">Seq</th>
                      <th className="px-2.5 py-1.5">Size</th>
                      <th className="px-2.5 py-1.5">Tool Type</th>
                      <th className="px-2.5 py-1.5 text-center">Req Qty</th>
                      <th className="px-2.5 py-1.5 text-center">Assigned</th>
                      <th className="px-2.5 py-1.5">Assigned Serials</th>
                      <th className="px-2.5 py-1.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assignCallout.items.map((item, idx) => {
                      const picked = assignPicks[idx] || [];
                      const isComplete = picked.length >= item.qty;

                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-2.5 py-1.5 font-mono text-slate-400">{item.seq}</td>
                          <td className="px-2.5 py-1.5 font-mono font-bold">{item.size}</td>
                          <td className="px-2.5 py-1.5 font-semibold text-[#1a3055]">{item.shortDesc}</td>
                          <td className="px-2.5 py-1.5 font-mono font-bold text-center">{item.qty}</td>
                          <td
                            className={`px-2.5 py-1.5 font-mono font-bold text-center ${
                              isComplete ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {picked.length}/{item.qty}
                          </td>
                          <td className="px-2.5 py-1.5 font-mono">
                            {picked.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {picked.map((p) => (
                                  <span
                                    key={p.id}
                                    className="px-1.5 py-0.2 bg-amber-50 text-amber-900 border border-amber-200 rounded text-[10px] font-bold"
                                  >
                                    {p.serial}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[10px]">Shortfall (Pending)</span>
                            )}
                          </td>
                          <td className="px-2.5 py-1.5 text-center">
                            <button
                              onClick={() => openPickerForAssignRow(idx)}
                              className="px-2.5 py-1 rounded bg-[#ffd875] text-[#4a2e00] font-bold text-[10px] hover:brightness-105 cursor-pointer"
                            >
                              🔧 Select
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-[#b8c9db] flex justify-end space-x-2 flex-shrink-0 text-xs">
              <button
                onClick={() => setAssignCallout(null)}
                className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAssignedSerials}
                className="px-4 py-1.5 rounded bg-amber-400 text-[#1a3055] font-bold hover:bg-amber-500 shadow-sm cursor-pointer"
              >
                Save Assigned Serials &rarr;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared Tool Picker Modal */}
      {pickerConfig.isOpen && (
        <ToolPickerModal
          category={pickerConfig.category}
          size={pickerConfig.size}
          inventory={inventory}
          excludeIds={pickerConfig.excludeIds}
          maxSelect={pickerConfig.maxSelect}
          preSelectedIds={pickerConfig.preSelectedIds}
          onConfirm={pickerConfig.onConfirm}
          onClose={() => setPickerConfig((p) => ({ ...p, isOpen: false }))}
        />
      )}
    </div>
  );
};
