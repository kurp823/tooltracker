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
  onLinkCalloutToJob?: (callout: Callout, job: DrillingJob) => void;
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
  onLinkCalloutToJob,
  onDispatchJob,
  isNewCalloutOpen: propIsNewOpen,
  onCloseNewCallout,
  onOpenNewCallout,
}) => {
  const handleCreateJob = onCreateJobFromCallout || onCreateJob || (() => {});
  const handleDispatch = onDispatchJob || (() => {});

  const [tab, setTab] = useState<'active' | 'closed'>('active');
  const [search, setSearch] = useState('');
  const [selectedCalloutDetail, setSelectedCalloutDetail] = useState<Callout | null>(null);
  const [linkingCallout, setLinkingCallout] = useState<Callout | null>(null);
  const [linkJobSearch, setLinkJobSearch] = useState('');

  const ongoingJobs = useMemo(() => {
    return jobs.filter((j) => {
      const s = (j.status || '').toLowerCase();
      return s === 'open' || s === 'ongoing' || s === 'active' || s === '2_ongoing';
    });
  }, [jobs]);

  const suggestedJobs = useMemo(() => {
    if (!linkingCallout) return [];
    const rigNorm = (linkingCallout.rig || '').trim().toUpperCase();
    const clientNorm = (linkingCallout.client || '').trim().toUpperCase();
    const wellNorm = (linkingCallout.well || '').trim().toUpperCase();
    return ongoingJobs.filter((j) => {
      const jRig = (j.rig || '').trim().toUpperCase();
      const jClient = (j.client || '').trim().toUpperCase();
      const jWell = (j.well || '').trim().toUpperCase();
      return (
        (rigNorm && jRig === rigNorm) ||
        (wellNorm && jWell === wellNorm) ||
        (clientNorm && jClient.includes(clientNorm))
      );
    });
  }, [linkingCallout, ongoingJobs]);

  const filteredOngoingJobs = useMemo(() => {
    if (!linkJobSearch.trim()) return ongoingJobs;
    const q = linkJobSearch.trim().toLowerCase();
    return ongoingJobs.filter(
      (j) =>
        (j.id || '').toLowerCase().includes(q) ||
        (j.rig || '').toLowerCase().includes(q) ||
        (j.well || '').toLowerCase().includes(q) ||
        (j.client || '').toLowerCase().includes(q) ||
        (j.contract || '').toLowerCase().includes(q)
    );
  }, [ongoingJobs, linkJobSearch]);

  const handlePrintCallout = (cal: Callout) => {
    window.print();
  };

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

  const [sortField, setSortField] = useState<'id' | 'rig' | 'date' | 'client' | 'status'>('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSortToggle = (field: 'id' | 'rig' | 'date' | 'client' | 'status') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortedCallouts = useMemo(() => {
    return [...filteredCallouts].sort((a, b) => {
      let valA = '';
      let valB = '';
      if (sortField === 'id') {
        valA = a.id;
        valB = b.id;
      } else if (sortField === 'rig') {
        valA = `${a.rig} ${a.well}`;
        valB = `${b.rig} ${b.well}`;
      } else if (sortField === 'client') {
        valA = `${a.client} ${a.contract || ''}`;
        valB = `${b.client} ${b.contract || ''}`;
      } else if (sortField === 'date') {
        valA = a.createdDate;
        valB = b.createdDate;
      } else if (sortField === 'status') {
        valA = a.status;
        valB = b.status;
      }
      return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
  }, [filteredCallouts, sortField, sortOrder]);

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
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rig, well, client, PO ref, callout #..."
            className="bg-white border border-[#b8c9db] rounded px-3 py-1.5 text-xs w-64 outline-none font-medium focus:ring-1 focus:ring-amber-400 shadow-2xs"
          />
        </div>
      </div>

      {/* Callouts Ledger Table */}
      <div className="bg-white border border-[#b8c9db] rounded overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-[#24476b] border-b border-[#b8c9db] font-bold select-none">
              <tr>
                <th
                  onClick={() => handleSortToggle('id')}
                  className="px-3 py-2.5 cursor-pointer hover:bg-slate-100"
                >
                  Callout # {sortField === 'id' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('rig')}
                  className="px-3 py-2.5 cursor-pointer hover:bg-slate-100"
                >
                  Rig / Well {sortField === 'rig' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('client')}
                  className="px-3 py-2.5 cursor-pointer hover:bg-slate-100"
                >
                  Client / Contract {sortField === 'client' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="px-3 py-2.5">PO Ref</th>
                <th
                  onClick={() => handleSortToggle('date')}
                  className="px-3 py-2.5 cursor-pointer hover:bg-slate-100"
                >
                  Date {sortField === 'date' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="px-3 py-2.5 text-center">Req Tools</th>
                <th className="px-3 py-2.5 text-center">Assigned</th>
                <th
                  onClick={() => handleSortToggle('status')}
                  className="px-3 py-2.5 text-center cursor-pointer hover:bg-slate-100"
                >
                  Status {sortField === 'status' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {sortedCallouts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500 font-medium">
                    No rig callout records found.
                  </td>
                </tr>
              ) : (
                sortedCallouts.map((cal) => {
                  const allItems = cal.items || [];
                  const totalReq = allItems.reduce((sum, it) => sum + it.qty, 0);
                  const totalAssigned = allItems.reduce((sum, it) => sum + (it.assigned || 0), 0);
                  const linkedJob = jobs.find(
                    (j) =>
                      (cal.jobId && (j.id === cal.jobId || (j as any).JobID === cal.jobId)) ||
                      (j.calloutId && j.calloutId === cal.id)
                  );

                  return (
                    <tr
                      key={cal.id}
                      onClick={() => setSelectedCalloutDetail(cal)}
                      className="hover:bg-blue-50/40 transition cursor-pointer"
                      title="Click to open full callout details window"
                    >
                      <td className="px-3 py-2.5 font-mono font-bold text-slate-900 hover:text-blue-700 transition">
                        <button
                          type="button"
                          onClick={() => setSelectedCalloutDetail(cal)}
                          className="font-mono font-bold text-slate-900 hover:text-blue-700 underline decoration-slate-300 cursor-pointer"
                        >
                          {cal.id}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-slate-800">
                        <span className="font-bold text-slate-900">{cal.rig}</span>{' '}
                        <span className="text-slate-400 font-normal">|</span>{' '}
                        <span className="font-normal text-slate-700">{cal.well}</span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">
                        <span className="font-semibold text-slate-900">{cal.client}</span>
                        {cal.contract && (
                          <span className="block text-[11px] text-slate-500">{cal.contract}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-700">{cal.poRef || '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-700">{formatDateDDMMYY(cal.createdDate)}</td>
                      <td className="px-3 py-2.5 font-mono font-bold text-center">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px] font-bold border border-slate-200">
                          {totalReq}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            totalAssigned >= totalReq && totalReq > 0
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : totalAssigned > 0
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {totalAssigned}/{totalReq}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            cal.status === 'Closed'
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {cal.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center space-x-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedCalloutDetail(cal)}
                          className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[11px] border border-blue-200 cursor-pointer transition shadow-2xs"
                          title="Open full callout details window"
                        >
                          View Details
                        </button>
                        {user?.role !== 'Viewer' && (
                          <>
                            <button
                              type="button"
                              onClick={() => openAssignModalForCallout(cal)}
                              className="px-2.5 py-1 rounded bg-[#ffd875] text-[#4a2e00] font-bold text-[11px] hover:brightness-105 shadow-2xs transition cursor-pointer"
                              title="Assign physical serials"
                            >
                              🔧 Assign
                            </button>
                            {!linkedJob ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleCreateJob(cal)}
                                  className="px-2.5 py-1 rounded bg-[#1a3055] text-white font-bold text-[11px] hover:bg-[#24426d] shadow-2xs transition cursor-pointer"
                                  title="Create a new drilling job for this callout"
                                >
                                  + New Job
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setLinkingCallout(cal)}
                                  className="px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-[11px] border border-indigo-200 shadow-2xs transition cursor-pointer"
                                  title="Link this callout to an ongoing drilling job"
                                >
                                  🔗 Link Job
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1">
                                <span
                                  className="font-mono text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded"
                                  title={`Linked to Job ${linkedJob.id}`}
                                >
                                  {linkedJob.id}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDispatch(linkedJob.id)}
                                  className="px-2.5 py-1 rounded bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700 shadow-2xs transition cursor-pointer"
                                  title="Issue Delivery Ticket (DT) for this job"
                                >
                                  Dispatch &rarr;
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setLinkingCallout(cal)}
                                  className="text-[10px] text-slate-500 hover:text-slate-800 underline px-0.5 cursor-pointer"
                                  title="Change linked drilling job"
                                >
                                  Change
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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

      {/* Callout Detail Window (Full Detail Modal matching Delivery Tickets) */}
      {selectedCalloutDetail && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedCalloutDetail(null);
          }}
        >
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-3.5 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base tracking-wide text-white">
                    Rig Callout: <span className="text-amber-400 font-mono">{selectedCalloutDetail.id}</span>
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      selectedCalloutDetail.status === 'Closed'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/50'
                        : 'bg-amber-950 text-amber-300 border border-amber-500/50'
                    }`}
                  >
                    {selectedCalloutDetail.status}
                  </span>
                </div>
                <div className="text-xs text-slate-300 mt-0.5">
                  Rig <span className="font-bold text-white">{selectedCalloutDetail.rig}</span> &bull; Well <span className="font-normal text-white">{selectedCalloutDetail.well}</span> &bull; Client <span className="font-semibold text-white">{selectedCalloutDetail.client}</span> {selectedCalloutDetail.poRef ? `• PO: ${selectedCalloutDetail.poRef}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintCallout(selectedCalloutDetail)}
                  className="px-2.5 py-1 rounded text-xs font-bold bg-white/10 text-white border border-white/20 hover:bg-white/20 cursor-pointer transition"
                  title="Print Callout"
                >
                  Print Callout
                </button>
                <button
                  onClick={() => setSelectedCalloutDetail(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 text-xl font-bold transition cursor-pointer"
                  title="Close Window (Esc)"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              {/* Metadata Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Callout ID</span>
                  <span className="font-bold text-[#1a3055] text-xs font-mono">{selectedCalloutDetail.id}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Rig</span>
                  <span className="font-bold text-slate-900 text-xs">{selectedCalloutDetail.rig}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Well</span>
                  <span className="font-normal text-slate-800 text-xs">{selectedCalloutDetail.well}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Client</span>
                  <span className="font-bold text-slate-800 text-xs">{selectedCalloutDetail.client}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Order Date</span>
                  <span className="font-mono text-slate-700 text-xs">{formatDateDDMMYY(selectedCalloutDetail.createdDate)}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">PO Reference</span>
                  <span className="font-mono text-slate-700 text-xs">{selectedCalloutDetail.poRef || '—'}</span>
                </div>
              </div>

              {/* Tools Manifest */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-[#1a3055]">
                    Required Tool Items &amp; Assigned Fleet ({selectedCalloutDetail.items.length} items)
                  </h4>
                  <div className="text-[11px] text-slate-500">
                    Total Required: <strong className="text-slate-800">{selectedCalloutDetail.items.reduce((s, it) => s + it.qty, 0)}</strong> &bull; Total Assigned: <strong className="text-slate-800">{selectedCalloutDetail.items.reduce((s, it) => s + (it.assigned || 0), 0)}</strong>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-[#1a3055] font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 w-12 text-center">Seq</th>
                        <th className="px-3 py-2">Size</th>
                        <th className="px-3 py-2">Tool Category / Type</th>
                        <th className="px-3 py-2 text-center">Req Qty</th>
                        <th className="px-3 py-2 text-center">Assigned</th>
                        <th className="px-3 py-2">Assigned Physical Serial(s)</th>
                        <th className="px-3 py-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedCalloutDetail.items.map((it) => (
                        <tr key={it.seq} className="hover:bg-slate-50/80">
                          <td className="px-3 py-2 text-center text-slate-400 font-mono">{it.seq}</td>
                          <td className="px-3 py-2 font-mono font-medium">{it.size}</td>
                          <td className="px-3 py-2 font-semibold text-slate-900">{it.shortDesc}</td>
                          <td className="px-3 py-2 font-mono font-bold text-center">{it.qty}</td>
                          <td
                            className={`px-3 py-2 font-mono font-bold text-center ${
                              it.assigned >= it.qty
                                ? 'text-emerald-700'
                                : it.assigned > 0
                                ? 'text-amber-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {it.assigned}/{it.qty}
                          </td>
                          <td className="px-3 py-2 font-mono">
                            {it.serialNos && it.serialNos.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {it.serialNos.map((s) => (
                                  <span
                                    key={s}
                                    className="px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-300 rounded text-[11px] font-mono font-bold"
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs italic">No serials assigned yet</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
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
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center flex-shrink-0 text-xs">
              <div className="flex items-center gap-2">
                {user?.role !== 'Viewer' && (
                  <button
                    type="button"
                    onClick={() => {
                      const cal = selectedCalloutDetail;
                      setSelectedCalloutDetail(null);
                      openAssignModalForCallout(cal);
                    }}
                    className="px-3 py-1.5 rounded bg-amber-400 text-[#1a3055] font-bold hover:bg-amber-500 shadow-sm cursor-pointer transition"
                  >
                    🔧 Assign Serials
                  </button>
                )}
                {(() => {
                  const linkedJob = jobs.find(
                    (j) =>
                      (selectedCalloutDetail.jobId &&
                        (j.id === selectedCalloutDetail.jobId || (j as any).JobID === selectedCalloutDetail.jobId)) ||
                      (j.calloutId && j.calloutId === selectedCalloutDetail.id)
                  );
                  if (user?.role !== 'Viewer') {
                    if (linkedJob) {
                      return (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 px-2.5 py-1 rounded">
                            Linked Job: {linkedJob.id}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const jId = linkedJob.id;
                              setSelectedCalloutDetail(null);
                              handleDispatch(jId);
                            }}
                            className="px-3 py-1.5 rounded bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-sm cursor-pointer transition"
                          >
                            Dispatch (DT) &rarr;
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const cal = selectedCalloutDetail;
                              setSelectedCalloutDetail(null);
                              setLinkingCallout(cal);
                            }}
                            className="px-2.5 py-1.5 rounded bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 text-xs border border-slate-300 cursor-pointer"
                          >
                            Change Job
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const cal = selectedCalloutDetail;
                            setSelectedCalloutDetail(null);
                            handleCreateJob(cal);
                          }}
                          className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] shadow-sm cursor-pointer transition"
                        >
                          + Create New Job &rarr;
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const cal = selectedCalloutDetail;
                            setSelectedCalloutDetail(null);
                            setLinkingCallout(cal);
                          }}
                          className="px-3 py-1.5 rounded bg-indigo-50 text-indigo-700 font-bold hover:bg-indigo-100 border border-indigo-200 shadow-sm cursor-pointer transition"
                        >
                          🔗 Select Ongoing Job
                        </button>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintCallout(selectedCalloutDetail)}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-800 font-bold hover:bg-slate-300 cursor-pointer transition"
                >
                  Print Document
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCalloutDetail(null)}
                  className="px-4 py-1.5 rounded bg-slate-700 text-white font-bold hover:bg-slate-800 cursor-pointer transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Link Callout to Drilling Job Modal */}
      {linkingCallout && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setLinkingCallout(null);
              setLinkJobSearch('');
            }
          }}
        >
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-3.5 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="font-bold text-base tracking-wide text-white flex items-center gap-2">
                  <span>🔗 Link Callout to Drilling Job</span>
                  <span className="font-mono text-amber-400 text-sm">({linkingCallout.id})</span>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Select an existing ongoing job or create a brand new job for this requirement.
                </p>
              </div>
              <button
                onClick={() => {
                  setLinkingCallout(null);
                  setLinkJobSearch('');
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 text-xl font-bold transition cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Callout Summary Ribbon */}
            <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4 text-slate-700">
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px]">Rig:</span>{' '}
                  <strong className="text-slate-900">{linkingCallout.rig}</strong>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px]">Well:</span>{' '}
                  <strong className="text-slate-900">{linkingCallout.well}</strong>
                </div>
                <div>
                  <span className="text-slate-400 font-bold uppercase text-[10px]">Client:</span>{' '}
                  <strong className="text-slate-900">{linkingCallout.client}</strong>
                </div>
                {linkingCallout.poRef && (
                  <div>
                    <span className="text-slate-400 font-bold uppercase text-[10px]">PO:</span>{' '}
                    <strong className="font-mono text-slate-900">{linkingCallout.poRef}</strong>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  const cal = linkingCallout;
                  setLinkingCallout(null);
                  setLinkJobSearch('');
                  handleCreateJob(cal);
                }}
                className="px-3 py-1 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] shadow-2xs cursor-pointer text-xs flex items-center gap-1.5"
              >
                <span>+</span> Create New Job Instead
              </button>
            </div>

            {/* Search Bar */}
            <div className="p-4 border-b border-slate-200">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search ongoing jobs by Job ID, Rig, Well, Client, or Contract..."
                  value={linkJobSearch}
                  onChange={(e) => setLinkJobSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <span className="absolute left-3 top-2.5 text-slate-400">🔍</span>
              </div>
            </div>

            {/* Job Selection List */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* Suggested Jobs for this Rig/Client */}
              {!linkJobSearch && suggestedJobs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-800">
                      Suggested Active Jobs for Rig {linkingCallout.rig} / {linkingCallout.client} ({suggestedJobs.length})
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {suggestedJobs.map((j) => (
                      <div
                        key={j.id}
                        className="border-2 border-emerald-200 bg-emerald-50/40 rounded-lg p-3 hover:border-emerald-500 hover:shadow-sm transition flex items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-extrabold text-sm text-[#1a3055]">{j.id}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              {j.status}
                            </span>
                            {j.calloutId && (
                              <span className="text-[10px] font-mono text-slate-500">
                                (Prev Callout: {j.calloutId})
                              </span>
                            )}
                          </div>
                          <div className="text-slate-600 text-[11px] flex flex-wrap gap-x-3">
                            <span>
                              Rig: <strong className="text-slate-900">{j.rig}</strong>
                            </span>
                            <span>
                              Well: <strong className="text-slate-900">{j.well}</strong>
                            </span>
                            <span>
                              Client: <strong className="text-slate-900">{j.client}</strong>
                            </span>
                            {j.contract && (
                              <span>
                                Contract: <span className="text-slate-700">{j.contract}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (onLinkCalloutToJob) {
                              onLinkCalloutToJob(linkingCallout, j);
                            }
                            setLinkingCallout(null);
                            setLinkJobSearch('');
                          }}
                          className="px-3 py-1.5 rounded bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-sm cursor-pointer whitespace-nowrap text-xs flex items-center gap-1"
                        >
                          Select &amp; Link &rarr;
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All Ongoing Jobs */}
              <div className="space-y-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-500">
                  {linkJobSearch
                    ? `Matching Ongoing Jobs (${filteredOngoingJobs.length})`
                    : `All Ongoing Drilling Jobs (${filteredOngoingJobs.length})`}
                </h4>
                {filteredOngoingJobs.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    No matching ongoing drilling jobs found. You can create a new job using the button above.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {filteredOngoingJobs.map((j) => (
                      <div
                        key={j.id}
                        className="border border-slate-200 bg-white rounded-lg p-3 hover:border-blue-400 hover:shadow-sm transition flex items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-extrabold text-sm text-[#1a3055]">{j.id}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {j.status}
                            </span>
                          </div>
                          <div className="text-slate-600 text-[11px] flex flex-wrap gap-x-3">
                            <span>
                              Rig: <strong className="text-slate-900">{j.rig}</strong>
                            </span>
                            <span>
                              Well: <strong className="text-slate-900">{j.well}</strong>
                            </span>
                            <span>
                              Client: <strong className="text-slate-900">{j.client}</strong>
                            </span>
                            {j.mobDate && (
                              <span>
                                Mob Date: <span className="font-mono">{j.mobDate}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (onLinkCalloutToJob) {
                              onLinkCalloutToJob(linkingCallout, j);
                            }
                            setLinkingCallout(null);
                            setLinkJobSearch('');
                          }}
                          className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] shadow-sm cursor-pointer whitespace-nowrap text-xs flex items-center gap-1"
                        >
                          Select &amp; Link &rarr;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center flex-shrink-0 text-xs">
              <span className="text-slate-500">
                Linking a callout to an ongoing job associates the requirement and enables Delivery Ticket dispatch.
              </span>
              <button
                type="button"
                onClick={() => {
                  setLinkingCallout(null);
                  setLinkJobSearch('');
                }}
                className="px-4 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
              >
                Cancel
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
