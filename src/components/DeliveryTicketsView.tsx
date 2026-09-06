import React, { useState, useMemo } from 'react';
import { DTBatch, DTLine, DrillingJob, Callout, ToolItem, User } from '../types';
import { DocumentAttachmentModal } from './DocumentAttachmentModal';

interface DeliveryTicketsViewProps {
  user?: User | null;
  dtBatches: DTBatch[];
  jobs: DrillingJob[];
  callouts: Callout[];
  inventory: ToolItem[];
  onSaveDTBatch: (batch: DTBatch) => void;
  onUpdateDTBatch?: (batch: DTBatch, addedTools?: ToolItem[], removedTools?: ToolItem[]) => void;
  isNewDTOpen: boolean;
  onCloseNewDT: () => void;
  onOpenNewDT: () => void;
  preSelectedJobId?: string | null;
}

export const DeliveryTicketsView: React.FC<DeliveryTicketsViewProps> = ({
  user,
  dtBatches,
  jobs,
  callouts,
  inventory,
  onSaveDTBatch,
  onUpdateDTBatch,
  isNewDTOpen,
  onCloseNewDT,
  onOpenNewDT,
  preSelectedJobId,
}) => {
  const [tab, setTab] = useState<'onrig' | 'all'>('onrig');
  const [search, setSearch] = useState('');
  const [selectedDTDetail, setSelectedDTDetail] = useState<DTBatch | null>(null);

  // Collapsible state (Request #7: Default collapsed mode)
  const [expandedDTIds, setExpandedDTIds] = useState<Record<string, boolean>>({});

  // Document Attachment Modal state
  const [attachTargetDT, setAttachTargetDT] = useState<DTBatch | null>(null);

  // Admin Revision Authorization State
  const [unlockTargetDT, setUnlockTargetDT] = useState<DTBatch | null>(null);
  const [adminUnlockRemark, setAdminUnlockRemark] = useState('');
  const [unlockError, setUnlockError] = useState('');

  // Editing state for an unsealed DT
  const [editingDTId, setEditingDTId] = useState<string | null>(null);
  const [addExtraToolSearch, setAddExtraToolSearch] = useState('');

  // New DT Batch Form State
  const [newJobId, setNewJobId] = useState(preSelectedJobId || '');
  const [newDtNumber, setNewDtNumber] = useState('');
  const [newRmRef, setNewRmRef] = useState('');
  const [newDispatchDate, setNewDispatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [newRecipient, setNewRecipient] = useState('');
  const [newDispatchedBy, setNewDispatchedBy] = useState(user?.name || 'Operations');
  const [newNotes, setNewNotes] = useState('');
  const [checkedToolIds, setCheckedToolIds] = useState<string[]>([]);
  const [extraSelectedIds, setExtraSelectedIds] = useState<string[]>([]);
  const [insertNotice, setInsertNotice] = useState<string | null>(null);
  const [showExtraPicker, setShowExtraPicker] = useState(true);
  const [extraSearch, setExtraSearch] = useState('');

  // Next DT Number
  const nextDtNumber = useMemo(() => {
    const curYr = new Date().getFullYear().toString().slice(-2);
    const dtNums = dtBatches
      .map((b) => {
        const m = b.dtNumber.match(/^DT-\d+-(\d+)$/);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const nextSeq = dtNums.length > 0 ? Math.max(...dtNums) + 1 : 1;
    return `DT-${curYr}-${String(nextSeq).padStart(5, '0')}`;
  }, [dtBatches]);

  const activeJobs = useMemo(() => {
    return jobs.filter((j) => ['Open', 'Ongoing', 'Active'].includes(j.status));
  }, [jobs]);

  // Selected Job for New DT
  const currentJob = useMemo(() => {
    return jobs.find((j) => j.id === newJobId);
  }, [jobs, newJobId]);

  // Serials currently mobilized or dispatched on ANY active DT (status === 'OnRig')
  // This satisfies Request #8: once tool is selected and dispatched, it cannot be picked again
  const dispatchedSerials = useMemo(() => {
    const set = new Set<string>();
    dtBatches.forEach((batch) => {
      batch.toolLines.forEach((line) => {
        if (line.status === 'OnRig') {
          set.add(line.serial);
        }
      });
    });
    return set;
  }, [dtBatches]);

  // Assigned tools for this job's callout: STRICTLY EXCLUDE anything already on rig or in dispatchedSerials
  const assignedToolsForCallout = useMemo(() => {
    if (!currentJob || !currentJob.calloutId) return [];
    const cal = callouts.find((c) => c.id === currentJob.calloutId);
    if (!cal) return [];

    const serials = cal.items.flatMap((it) => it.serialNos || []);
    return inventory.filter(
      (t) =>
        serials.includes(t.serial) &&
        !dispatchedSerials.has(t.serial) &&
        t.status !== 'On Rig' &&
        t.location !== 'On Rig' &&
        !t.location?.toLowerCase().includes('rig')
    );
  }, [currentJob, callouts, inventory, dispatchedSerials]);

  // Check if all assigned tools for the callout are already mobilized to rig
  const calloutTotalAssignedCount = useMemo(() => {
    if (!currentJob || !currentJob.calloutId) return 0;
    const cal = callouts.find((c) => c.id === currentJob.calloutId);
    if (!cal) return 0;
    return cal.items.flatMap((it) => it.serialNos || []).length;
  }, [currentJob, callouts]);

  // Extra tools in base (not in callout assignment): STRICTLY EXCLUDE anything already on rig or in dispatchedSerials
  const availableBaseTools = useMemo(() => {
    const assignedIds = new Set(assignedToolsForCallout.map((t) => t.id));
    return inventory.filter(
      (t) =>
        t.status === 'Good' &&
        ['Emdad Base', 'Base', 'Our Base'].includes(t.location) &&
        !dispatchedSerials.has(t.serial) &&
        !assignedIds.has(t.id) &&
        t.status !== 'On Rig' &&
        t.location !== 'On Rig' &&
        !t.location?.toLowerCase().includes('rig')
    );
  }, [inventory, assignedToolsForCallout, dispatchedSerials]);

  const filteredExtraBaseTools = useMemo(() => {
    if (!extraSearch.trim()) return [];
    const q = extraSearch.toLowerCase();
    return availableBaseTools.filter((t) =>
      `${t.serial} ${t.assetNo} ${t.shortDesc} ${t.desc} ${t.size}`.toLowerCase().includes(q)
    );
  }, [availableBaseTools, extraSearch]);

  const [sortField, setSortField] = useState<'dtNumber' | 'jobId' | 'rig' | 'date'>('dtNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSortToggle = (field: 'dtNumber' | 'jobId' | 'rig' | 'date') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const extractDTSeq = (numStr: string) => {
    const m = numStr.match(/\d+$/);
    return m ? parseInt(m[0], 10) : 0;
  };

  const filteredDTs = useMemo(() => {
    const list = dtBatches.filter((b) => {
      const hasOnRig = b.toolLines.some((t) => t.status === 'OnRig');
      if (tab === 'onrig' && !hasOnRig) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const full = `${b.dtNumber} ${b.jobId} ${b.rig} ${b.well} ${b.contract || ''} ${b.rmRef}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      let diff = 0;
      if (sortField === 'dtNumber') {
        diff = extractDTSeq(a.dtNumber) - extractDTSeq(b.dtNumber);
      } else if (sortField === 'jobId') {
        diff = extractDTSeq(a.jobId) - extractDTSeq(b.jobId);
      } else if (sortField === 'rig') {
        diff = `${a.rig} ${a.well}`.localeCompare(`${b.rig} ${b.well}`);
      } else if (sortField === 'date') {
        diff = (a.rmDate || '').localeCompare(b.rmDate || '');
      }
      return sortOrder === 'desc' ? -diff : diff;
    });
  }, [dtBatches, tab, search, sortField, sortOrder]);

  const toggleDTExpand = (dtId: string) => {
    setExpandedDTIds((prev) => ({
      ...prev,
      [dtId]: !prev[dtId],
    }));
  };

  const handleExpandAll = () => {
    const allOpen: Record<string, boolean> = {};
    filteredDTs.forEach((b) => {
      allOpen[b.id] = true;
    });
    setExpandedDTIds(allOpen);
  };

  const handleCollapseAll = () => {
    setExpandedDTIds({});
  };

  const handleCreateDTSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJobId) {
      alert('Please select a Job.');
      return;
    }
    if (!newRmRef) {
      alert('Please enter an RM / Callout Reference.');
      return;
    }
    if (checkedToolIds.length === 0) {
      alert('Please select at least one tool to dispatch.');
      return;
    }

    const job = jobs.find((j) => j.id === newJobId);
    if (!job) return;

    const dtNum = newDtNumber.trim() || nextDtNumber;

    const lines: DTLine[] = checkedToolIds
      .map((id) => inventory.find((t) => t.id === id))
      .filter((t): t is ToolItem => Boolean(t))
      .map((t) => ({
        serial: t.serial,
        assetNo: t.assetNo || t.serial,
        shortDesc: t.shortDesc,
        desc: t.desc || `${t.size} ${t.shortDesc}`,
        size: t.size,
        status: 'OnRig',
        used: null,
        ownership: t.ownership,
        isEmdad: t.isEmdad,
      }));

    const newBatch: DTBatch = {
      id: `DTB-${Date.now()}`,
      dtNumber: dtNum,
      jobId: job.id,
      rmDate: newDispatchDate,
      rmRef: newRmRef.trim(),
      dispatchDate: newDispatchDate,
      rig: job.rig,
      well: job.well,
      contract: job.contract,
      dispatchedBy: newDispatchedBy.trim() || user?.name || 'Operations',
      recipient: newRecipient.trim(),
      notes: newNotes.trim(),
      toolLines: lines,
      isLocked: true, // Automatically locked upon dispatch
      lockedBy: user?.name || 'Operations',
      lockedDate: new Date().toISOString(),
    };

    onSaveDTBatch(newBatch);
    onCloseNewDT();
    // Reset form
    setCheckedToolIds([]);
    setShowExtraPicker(false);
    setExtraSearch('');
  };

  // Admin Unlock action with compulsory remark
  const handleConfirmAdminUnlock = () => {
    if (!adminUnlockRemark.trim()) {
      setUnlockError('Authorization remark is required to unlock this Delivery Ticket.');
      return;
    }
    if (!unlockTargetDT) return;

    const auditRemark = `[Admin Reopened on ${new Date().toISOString().split('T')[0]} by ${user?.name || 'Admin'}: ${adminUnlockRemark.trim()}]`;
    const updatedBatch: DTBatch = {
      ...unlockTargetDT,
      isLocked: false,
      notes: unlockTargetDT.notes ? `${unlockTargetDT.notes}\n${auditRemark}` : auditRemark,
    };

    if (onUpdateDTBatch) {
      onUpdateDTBatch(updatedBatch);
    }
    setEditingDTId(unlockTargetDT.id);
    setUnlockTargetDT(null);
    setAdminUnlockRemark('');
    setUnlockError('');
  };

  // Lock and reseal DT
  const handleLockDT = (batch: DTBatch) => {
    const sealedBatch: DTBatch = {
      ...batch,
      isLocked: true,
      lockedBy: user?.name || 'Admin',
      lockedDate: new Date().toISOString(),
    };
    if (onUpdateDTBatch) {
      onUpdateDTBatch(sealedBatch);
    }
    setEditingDTId(null);
  };

  // Add tool to unlocked DT
  const handleAddToolToUnlockedDT = (batch: DTBatch, tool: ToolItem) => {
    const newLine: DTLine = {
      serial: tool.serial,
      assetNo: tool.assetNo || tool.serial,
      shortDesc: tool.shortDesc,
      desc: tool.desc || `${tool.size} ${tool.shortDesc}`,
      size: tool.size,
      status: 'OnRig',
      used: null,
      ownership: tool.ownership,
      isEmdad: tool.isEmdad,
    };

    const updatedBatch: DTBatch = {
      ...batch,
      toolLines: [...batch.toolLines, newLine],
    };

    if (onUpdateDTBatch) {
      onUpdateDTBatch(updatedBatch, [tool], undefined);
    }
  };

  // Remove tool from unlocked DT back to Base
  const handleRemoveToolFromUnlockedDT = (batch: DTBatch, serialToRemove: string) => {
    const removedLine = batch.toolLines.find((l) => l.serial === serialToRemove);
    const updatedLines = batch.toolLines.filter((l) => l.serial !== serialToRemove);

    const updatedBatch: DTBatch = {
      ...batch,
      toolLines: updatedLines,
    };

    const toolObj = inventory.find((t) => t.serial === serialToRemove);
    if (onUpdateDTBatch) {
      onUpdateDTBatch(updatedBatch, undefined, toolObj ? [toolObj] : undefined);
    }
  };

  const handlePrintDT = (b: DTBatch) => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert('Please allow popups to print Delivery Tickets.');
      return;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Delivery Ticket - ${b.dtNumber}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; padding: 24px; color: #1e293b; }
  .hdr { display: flex; justify-content: space-between; border-bottom: 2px solid #f59e0b; padding-bottom: 12px; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
  .box { border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px 10px; background: #f8fafc; }
  .lbl { font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 2px; }
  .val { font-size: 12px; font-weight: bold; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
  th { background: #f1f5f9; font-weight: bold; }
  .sig { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 36px; padding-top: 10px; }
  .sig-box { border-top: 1px solid #0f172a; padding-top: 6px; font-size: 10px; }
  .seal-badge { display: inline-block; padding: 4px 8px; background: #fee2e2; border: 1px solid #f87171; color: #991b1b; font-weight: bold; font-size: 10px; border-radius: 4px; }
</style>
</head>
<body>
  <div class="hdr">
    <div>
      <h1 style="font-size: 18px; margin: 0 0 2px; color: #1a3055;">EMDAD OILFIELD SERVICES LLC</h1>
      <div style="color: #64748b; font-size: 10px;">Downhole Tool Rental &amp; Logistics Manifest</div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 20px; font-weight: 900; color: #d97706; font-family: monospace;">${b.dtNumber}</div>
      <div style="font-size: 10px; font-weight: bold; color: #64748b;">DELIVERY TICKET (DT)</div>
      <div class="seal-badge" style="margin-top: 4px;">${b.isLocked !== false ? 'SEALED & DISPATCHED' : 'UNLOCKED / MODIFIED'}</div>
    </div>
  </div>

  <div class="grid">
    <div class="box"><div class="lbl">Drilling Job Number</div><div class="val">${b.jobId}</div></div>
    <div class="box"><div class="lbl">RM / ATK Reference</div><div class="val">${b.rmRef}</div></div>
    <div class="box"><div class="lbl">Rig &amp; Well</div><div class="val">${b.rig} / ${b.well}</div></div>
    <div class="box"><div class="lbl">Master Contract</div><div class="val">${b.contract || '—'}</div></div>
    <div class="box"><div class="lbl">Dispatch Date</div><div class="val">${b.rmDate}</div></div>
    <div class="box"><div class="lbl">Dispatched By</div><div class="val">${b.dispatchedBy}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 30px;">#</th>
        <th>Serial / System ID</th>
        <th>Size</th>
        <th>Tool Description</th>
        <th>Ownership</th>
        <th style="width: 40px; text-align: center;">Qty</th>
      </tr>
    </thead>
    <tbody>
      ${b.toolLines
        .map(
          (t, i) => `<tr>
        <td>${i + 1}</td>
        <td style="font-family: monospace; font-weight: bold;">${t.serial}</td>
        <td style="font-family: monospace;">${t.size}</td>
        <td>${t.desc || t.shortDesc}</td>
        <td>${t.ownership}</td>
        <td style="text-align: center;">1</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>

  ${
    b.notes
      ? `<div style="background: #fffbeb; border: 1px solid #fde68a; padding: 8px; border-radius: 4px; font-size: 11px; margin-bottom: 16px;"><strong>Notes &amp; Audit Trail:</strong><br/>${b.notes.replace(
          /\n/g,
          '<br/>'
        )}</div>`
      : ''
  }

  <div class="sig">
    <div class="sig-box">Prepared By (EMDAD Base)<br/><br/><strong>${b.dispatchedBy}</strong></div>
    <div class="sig-box">Authorized Transport<br/><br/>_______________________</div>
    <div class="sig-box">Received at Rig Site<br/><br/><strong>${b.recipient || '_______________________'}</strong></div>
  </div>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  return (
    <div className="space-y-4">
      {/* Ribbon */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="text-[11px] text-slate-500 font-medium">Logistics &amp; Dispatch</div>
          <h1 className="text-base font-bold text-[#1a3055]">Delivery Tickets (DT) Manifests</h1>
        </div>
        {user?.role !== 'Viewer' && (
          <button
            onClick={() => {
              setNewDtNumber(nextDtNumber);
              setCheckedToolIds([]);
              onOpenNewDT();
            }}
            className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-bold text-xs hover:bg-[#24426d] shadow-sm transition cursor-pointer"
          >
            + New Delivery Ticket
          </button>
        )}
      </div>

      {/* Tabs & Search & Expand/Collapse All (Request #7) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex bg-white rounded border border-[#b8c9db] p-0.5">
          <button
            onClick={() => setTab('onrig')}
            className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
              tab === 'onrig' ? 'bg-[#1a3055] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🛢 Tools On Rig ({dtBatches.filter((b) => b.toolLines.some((t) => t.status === 'OnRig')).length})
          </button>
          <button
            onClick={() => setTab('all')}
            className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
              tab === 'all' ? 'bg-[#1a3055] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📋 All Tickets ({dtBatches.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExpandAll}
            className="px-2.5 py-1 text-xs font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer"
            title="Expand All Delivery Tickets"
          >
            ▼ Expand All
          </button>
          <button
            onClick={handleCollapseAll}
            className="px-2.5 py-1 text-xs font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer"
            title="Collapse All Delivery Tickets"
          >
            ▲ Collapse All
          </button>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search DT #, job, rig, well, RM ref..."
            className="bg-white border border-[#b8c9db] rounded px-3 py-1 text-xs w-60 outline-none font-medium focus:ring-1 focus:ring-amber-400"
          />
        </div>
      </div>

      {/* DT List (Default Collapsed with Expandable Manifests) */}
      <div className="bg-white border border-[#b8c9db] rounded overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-[#24476b] border-b border-[#b8c9db] font-bold select-none">
              <tr>
                <th className="px-2 py-2 w-8 text-center"></th>
                <th
                  onClick={() => handleSortToggle('dtNumber')}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-100"
                >
                  DT Number {sortField === 'dtNumber' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('jobId')}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-100"
                >
                  Job # {sortField === 'jobId' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('rig')}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-100"
                >
                  Rig / Well {sortField === 'rig' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="px-3 py-2">Contract</th>
                <th className="px-3 py-2">RM Ref</th>
                <th
                  onClick={() => handleSortToggle('date')}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-100"
                >
                  Date {sortField === 'date' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="px-3 py-2 text-center">Signed Copy</th>
                <th className="px-3 py-2 text-center">Total Tools</th>
                <th className="px-3 py-2 text-center">On Rig</th>
                <th className="px-3 py-2 text-center">Returned</th>
                <th className="px-3 py-2 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {filteredDTs.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-8 text-center text-slate-500 font-medium">
                    No delivery tickets found.
                  </td>
                </tr>
              ) : (
                filteredDTs.map((b) => {
                  const onRig = b.toolLines.filter((t) => t.status === 'OnRig').length;
                  const ret = b.toolLines.filter((t) => t.status === 'Returned').length;
                  const isOpen = Boolean(expandedDTIds[b.id]);
                  const isLocked = b.isLocked !== false;
                  const isEditingThis = editingDTId === b.id;

                  return (
                    <React.Fragment key={b.id}>
                      <tr
                        className={`transition cursor-pointer ${
                          isOpen ? 'bg-[#edf4fb]' : 'hover:bg-[#f3f7fb]'
                        }`}
                        onClick={() => toggleDTExpand(b.id)}
                      >
                        <td className="px-2 py-2 text-center text-slate-400 font-bold">
                          {isOpen ? '▲' : '▼'}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-amber-900">
                          {b.dtNumber}
                        </td>
                        <td className="px-3 py-2 font-mono text-[10px] text-blue-700">{b.jobId}</td>
                        <td className="px-3 py-2 font-medium">
                          {b.rig} <span className="text-slate-400">|</span> {b.well}
                        </td>
                        <td className="px-3 py-2">{b.contract || '—'}</td>
                        <td className="px-3 py-2 font-mono text-slate-500 text-[10px]">{b.rmRef}</td>
                        <td className="px-3 py-2 font-mono">{b.rmDate}</td>
                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                          {b.isSigned || b.signedDocUrl ? (
                            <button
                              type="button"
                              onClick={() => setAttachTargetDT(b)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200 cursor-pointer shadow-2xs"
                              title="Click to view or replace signed ticket"
                            >
                              <span>✓</span> Signed Copy
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAttachTargetDT(b)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 cursor-pointer shadow-2xs"
                              title="Click to attach signed and stamped ticket"
                            >
                              <span>📎</span> Attach Signed
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-center">{b.toolLines.length}</td>
                        <td
                          className={`px-3 py-2 font-mono font-bold text-center ${
                            onRig > 0 ? 'text-amber-700' : 'text-slate-400'
                          }`}
                        >
                          {onRig}
                        </td>
                        <td
                          className={`px-3 py-2 font-mono text-center ${
                            ret > 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'
                          }`}
                        >
                          {ret}
                        </td>
                        <td className="px-3 py-2 text-center space-x-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedDTDetail(b)}
                            className="text-blue-700 hover:underline font-bold text-[11px] cursor-pointer"
                          >
                            View
                          </button>
                          <button
                            onClick={() => handlePrintDT(b)}
                            className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[10px] font-bold border border-slate-300 cursor-pointer"
                          >
                            🖨 Print
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Manifest Body (Request #7 & Request #8) */}
                      {isOpen && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={12} className="p-4 border-t border-b border-slate-200">
                            <div className="space-y-3">
                              {/* Header & Revision Controls */}
                              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-200">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-[#1a3055] text-xs">
                                    Tools Mobilized under {b.dtNumber}
                                  </span>
                                  {isLocked ? (
                                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-300">
                                      Dispatched Manifest
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 text-[10px] font-bold border border-amber-300">
                                      Manifest in Revision
                                    </span>
                                  )}
                                  {b.dispatchedBy && (
                                    <span className="text-slate-500 text-[11px]">
                                      Dispatched by <strong>{b.dispatchedBy}</strong>
                                    </span>
                                  )}
                                </div>

                                {/* Actions for Amendment */}
                                <div className="flex items-center gap-2">
                                  {isLocked ? (
                                    user?.role === 'Admin' ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setUnlockTargetDT(b);
                                          setAdminUnlockRemark('');
                                          setUnlockError('');
                                        }}
                                        className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs shadow-xs cursor-pointer"
                                      >
                                        Amend Manifest
                                      </button>
                                    ) : (
                                      <span className="text-[11px] text-slate-500 italic">
                                        Dispatched: Admin authorization required to amend
                                      </span>
                                    )
                                  ) : (
                                    user?.role === 'Admin' && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => setEditingDTId(isEditingThis ? null : b.id)}
                                          className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs cursor-pointer"
                                        >
                                          {isEditingThis ? 'Done Picking' : '+ Add Tool from Base'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleLockDT(b)}
                                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer"
                                        >
                                          Finalize Manifest
                                        </button>
                                      </>
                                    )
                                  )}
                                </div>
                              </div>

                              {/* Tools Table in Expanded Manifest */}
                              <div className="border border-[#b8c9db] rounded overflow-hidden bg-white">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead className="bg-[#eef3f9] text-[#1a3055] font-bold border-b border-[#b8c9db]">
                                    <tr>
                                      <th className="px-3 py-1.5 w-10">#</th>
                                      <th className="px-3 py-1.5">Serial / ID</th>
                                      <th className="px-3 py-1.5">Size</th>
                                      <th className="px-3 py-1.5">Tool Category</th>
                                      <th className="px-3 py-1.5">Ownership</th>
                                      <th className="px-3 py-1.5 text-center">Status</th>
                                      {!isLocked && user?.role === 'Admin' && (
                                        <th className="px-3 py-1.5 text-center w-24">Action</th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-200">
                                    {b.toolLines.map((t, idx) => (
                                      <tr key={idx} className="hover:bg-slate-50">
                                        <td className="px-3 py-1.5 text-slate-400 font-mono">{idx + 1}</td>
                                        <td className="px-3 py-1.5 font-mono font-bold text-amber-900">
                                          {t.serial}
                                        </td>
                                        <td className="px-3 py-1.5 font-mono">{t.size}</td>
                                        <td className="px-3 py-1.5 font-semibold text-slate-800">
                                          {t.shortDesc}
                                        </td>
                                        <td className="px-3 py-1.5 text-slate-600">{t.ownership}</td>
                                        <td className="px-3 py-1.5 text-center">
                                          <span
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                              t.status === 'OnRig'
                                                ? 'bg-blue-100 text-blue-800'
                                                : 'bg-emerald-100 text-emerald-800'
                                            }`}
                                          >
                                            {t.status}
                                          </span>
                                        </td>
                                        {!isLocked && user?.role === 'Admin' && (
                                          <td className="px-3 py-1.5 text-center">
                                            <button
                                              type="button"
                                              onClick={() => handleRemoveToolFromUnlockedDT(b, t.serial)}
                                              className="text-rose-600 hover:text-rose-800 font-bold text-[11px] cursor-pointer"
                                            >
                                              Return to Base
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              {/* Unlocked DT: Picker to add tools from Base */}
                              {!isLocked && isEditingThis && user?.role === 'Admin' && (
                                <div className="p-3 bg-amber-50/70 border border-amber-300 rounded space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="font-bold text-xs text-amber-900">
                                      Select Available Tool from Base to Add to {b.dtNumber}:
                                    </div>
                                    <input
                                      type="text"
                                      value={addExtraToolSearch}
                                      onChange={(e) => setAddExtraToolSearch(e.target.value)}
                                      placeholder="Filter serial, category, size..."
                                      className="border rounded px-2 py-1 text-xs bg-white w-56"
                                    />
                                  </div>

                                  <div className="max-h-48 overflow-y-auto border border-amber-200 rounded bg-white">
                                    <table className="w-full text-left text-xs">
                                      <thead className="bg-slate-50 font-bold border-b">
                                        <tr>
                                          <th className="px-2 py-1">Serial</th>
                                          <th className="px-2 py-1">Size</th>
                                          <th className="px-2 py-1">Tool Category</th>
                                          <th className="px-2 py-1">Owner</th>
                                          <th className="px-2 py-1 text-center">Action</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y">
                                        {availableBaseTools
                                          .filter((t) => {
                                            if (!addExtraToolSearch.trim()) return true;
                                            const q = addExtraToolSearch.toLowerCase();
                                            return `${t.serial} ${t.shortDesc} ${t.size} ${t.ownership}`
                                              .toLowerCase()
                                              .includes(q);
                                          })
                                          .slice(0, 15)
                                          .map((tool) => (
                                            <tr key={tool.id} className="hover:bg-slate-50">
                                              <td className="px-2 py-1 font-mono font-bold text-amber-900">
                                                {tool.serial}
                                              </td>
                                              <td className="px-2 py-1 font-mono">{tool.size}</td>
                                              <td className="px-2 py-1 font-semibold">{tool.shortDesc}</td>
                                              <td className="px-2 py-1 text-slate-500">{tool.ownership}</td>
                                              <td className="px-2 py-1 text-center">
                                                <button
                                                  type="button"
                                                  onClick={() => handleAddToolToUnlockedDT(b, tool)}
                                                  className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] cursor-pointer"
                                                >
                                                  + Add to Manifest
                                                </button>
                                              </td>
                                            </tr>
                                          ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Manifest Notes & Remarks */}
                              {b.notes && (
                                <div className="p-2.5 bg-slate-100/80 rounded border border-slate-200 text-xs text-slate-700">
                                  <strong>Manifest Remarks &amp; Audit Trail:</strong>
                                  <div className="whitespace-pre-line font-mono text-[11px] mt-1 text-slate-600">
                                    {b.notes}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin Unlock Modal (Request #8: Compulsory Authorization Remark) */}
      {unlockTargetDT && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setUnlockTargetDT(null);
          }}
        >
          <div className="bg-white rounded shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm">Admin Manifest Clearance Override</h3>
                <div className="text-[11px] text-slate-300">
                  Unlock {unlockTargetDT.dtNumber} for tool additions/modifications
                </div>
              </div>
              <button
                onClick={() => setUnlockTargetDT(null)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-4 text-xs space-y-3">
              <div className="p-2.5 bg-amber-50 border border-amber-300 rounded text-amber-900 text-[11px] leading-relaxed">
                ⚠️ <strong>Audit Requirement:</strong> Delivery Tickets are legally binding mobilization
                records once dispatched to the rig. Unlocking requires an explicit authorization remark
                that will be permanently recorded in the ticket's audit log.
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Authorization Remark / Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Drilling supervisor requested 1 additional 8-1/4 Float Sub due to section change per Callout revision..."
                  value={adminUnlockRemark}
                  onChange={(e) => {
                    setAdminUnlockRemark(e.target.value);
                    if (e.target.value.trim()) setUnlockError('');
                  }}
                  className="w-full border border-slate-300 rounded p-2 text-xs focus:ring-1 focus:ring-amber-500 outline-none"
                />
                {unlockError && <div className="text-rose-600 font-bold text-[11px] mt-1">{unlockError}</div>}
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setUnlockTargetDT(null)}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAdminUnlock}
                  className="px-4 py-1.5 rounded bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold shadow-sm cursor-pointer"
                >
                  Authorize &amp; Unlock Manifest &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New DT Modal */}
      {isNewDTOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) onCloseNewDT();
          }}
        >
          <div className="bg-white rounded shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="font-bold text-sm">Create Delivery Ticket (DT) Manifest</h3>
                <div className="text-[11px] text-slate-300">
                  Select an active drilling job and tick the tools to mobilize to the rig
                </div>
              </div>
              <button
                onClick={onCloseNewDT}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateDTSubmit} className="p-4 overflow-y-auto flex-1 text-xs space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block font-bold mb-1">Select Drilling Job *</label>
                  <select
                    required
                    value={newJobId}
                    onChange={(e) => {
                      setNewJobId(e.target.value);
                      setCheckedToolIds([]);
                    }}
                    className="w-full border rounded px-2.5 py-1.5 font-bold"
                  >
                    <option value="">— Select job —</option>
                    {activeJobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.id} — {j.rig}/{j.well} ({j.client})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">DT Number *</label>
                  <input
                    type="text"
                    required
                    value={newDtNumber || nextDtNumber}
                    onChange={(e) => setNewDtNumber(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono font-bold text-amber-900"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">RM / Callout Ref *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ATK-2026-081"
                    value={newRmRef}
                    onChange={(e) => setNewRmRef(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Dispatch Date</label>
                  <input
                    type="date"
                    value={newDispatchDate}
                    onChange={(e) => setNewDispatchDate(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Rig Recipient Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Rig Supt Ali"
                    value={newRecipient}
                    onChange={(e) => setNewRecipient(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Dispatched By</label>
                  <input
                    type="text"
                    value={newDispatchedBy}
                    onChange={(e) => setNewDispatchedBy(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5"
                  />
                </div>
              </div>

              {/* Notification Banner when tool inserted */}
              {insertNotice && (
                <div className="p-2.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex justify-between items-center">
                  <span>✓ {insertNotice}</span>
                  <button
                    type="button"
                    onClick={() => setInsertNotice(null)}
                    className="text-emerald-700 hover:text-emerald-900 font-bold ml-2 cursor-pointer"
                  >
                    &times;
                  </button>
                </div>
              )}

              {/* 1. MANIFEST TOOLS TO DISPATCH (CURRENTLY INSERTED) */}
              <div className="space-y-2 border-t pt-3 bg-slate-50/70 p-3 rounded border border-slate-200">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                      Manifest Tools to Dispatch
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-[#1a3055] text-white">
                      {checkedToolIds.length} tool(s)
                    </span>
                  </div>
                  {checkedToolIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setCheckedToolIds([]);
                        setInsertNotice('Cleared all tools from manifest.');
                      }}
                      className="text-rose-600 hover:text-rose-800 text-[11px] font-bold cursor-pointer"
                    >
                      Clear Manifest
                    </button>
                  )}
                </div>

                {checkedToolIds.length === 0 ? (
                  <div className="p-4 bg-white rounded border border-dashed border-slate-300 text-center text-slate-500 text-xs">
                    No tools inserted into manifest yet. Click <strong>&ldquo;+ Insert&rdquo;</strong> on callout or base tools below to add them to this ticket.
                  </div>
                ) : (
                  <div className="border border-[#b8c9db] rounded overflow-hidden bg-white max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-[#eef3f9] text-[#1a3055] border-b border-[#b8c9db] font-bold sticky top-0">
                        <tr>
                          <th className="px-2.5 py-1.5 w-8">#</th>
                          <th className="px-2.5 py-1.5">Serial / ID</th>
                          <th className="px-2.5 py-1.5">Size</th>
                          <th className="px-2.5 py-1.5">Tool Category</th>
                          <th className="px-2.5 py-1.5">Source</th>
                          <th className="px-2.5 py-1.5">Owner</th>
                          <th className="px-2.5 py-1.5 text-center w-20">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {checkedToolIds.map((id, idx) => {
                          const tool = inventory.find((t) => t.id === id);
                          if (!tool) return null;
                          const isFromCallout = assignedToolsForCallout.some((t) => t.id === id);
                          return (
                            <tr key={tool.id} className="hover:bg-slate-50">
                              <td className="px-2.5 py-1.5 text-slate-400 font-mono text-[11px]">
                                {idx + 1}
                              </td>
                              <td className="px-2.5 py-1.5 font-mono font-bold text-amber-900">
                                {tool.serial}
                              </td>
                              <td className="px-2.5 py-1.5 font-mono">{tool.size}</td>
                              <td className="px-2.5 py-1.5 font-bold text-[#1a3055]">
                                {tool.shortDesc}
                              </td>
                              <td className="px-2.5 py-1.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    isFromCallout
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-purple-100 text-purple-800'
                                  }`}
                                >
                                  {isFromCallout ? 'From Callout' : 'Added from Base'}
                                </span>
                              </td>
                              <td className="px-2.5 py-1.5 text-slate-600">{tool.ownership}</td>
                              <td className="px-2.5 py-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCheckedToolIds((prev) => prev.filter((tid) => tid !== tool.id));
                                    setInsertNotice(`Removed ${tool.serial} from manifest.`);
                                  }}
                                  className="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[10px] border border-rose-200 cursor-pointer"
                                  title="Remove from this manifest"
                                >
                                  ✕ Remove
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 2. TOOLS ASSIGNED FOR THIS CALLOUT */}
              <div className="space-y-2 border-t pt-3">
                <div className="flex justify-between items-center">
                  <div className="font-bold text-slate-700">
                    Callout Reserved Tools ({assignedToolsForCallout.length})
                  </div>
                  {assignedToolsForCallout.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const newIds = assignedToolsForCallout.map((t) => t.id);
                        setCheckedToolIds((prev) => [...new Set([...prev, ...newIds])]);
                        setInsertNotice(`Inserted ${assignedToolsForCallout.length} callout tools into manifest.`);
                      }}
                      className="px-2.5 py-1 rounded bg-[#1a3055] text-white hover:bg-[#24426d] font-bold text-xs shadow-2xs cursor-pointer"
                    >
                      + Insert All Callout Tools
                    </button>
                  )}
                </div>

                {assignedToolsForCallout.length === 0 ? (
                  <div className="p-3 bg-slate-50 rounded border border-slate-200 text-slate-600 text-xs">
                    {calloutTotalAssignedCount > 0 ? (
                      <p>
                        ✓ All assigned tools for this job's callout have already been mobilized on previous Delivery Tickets. You can insert extra standby or replacement tools from Base stock below.
                      </p>
                    ) : (
                      <p>
                        No reserved tools under this job's callout. You can insert tools from Base stock below.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="border border-[#b8c9db] rounded overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-[#24476b] border-b border-[#b8c9db] font-bold">
                        <tr>
                          <th className="px-2.5 py-1.5">Serial</th>
                          <th className="px-2.5 py-1.5">Size</th>
                          <th className="px-2.5 py-1.5">Tool Category</th>
                          <th className="px-2.5 py-1.5">Owner</th>
                          <th className="px-2.5 py-1.5">Location</th>
                          <th className="px-2.5 py-1.5 text-center w-24">Insert Tool</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e2e8f0]">
                        {assignedToolsForCallout.map((t) => {
                          const isInserted = checkedToolIds.includes(t.id);
                          return (
                            <tr key={t.id} className="hover:bg-slate-50">
                              <td className="px-2.5 py-1.5 font-mono font-bold text-amber-900">{t.serial}</td>
                              <td className="px-2.5 py-1.5 font-mono">{t.size}</td>
                              <td className="px-2.5 py-1.5 font-bold text-[#1a3055]">{t.shortDesc}</td>
                              <td className="px-2.5 py-1.5 text-slate-500">{t.ownership}</td>
                              <td className="px-2.5 py-1.5 text-slate-600">{t.location}</td>
                              <td className="px-2.5 py-1.5 text-center">
                                {isInserted ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    ✓ Inserted
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setCheckedToolIds((prev) => [...prev, t.id]);
                                      setInsertNotice(`Inserted ${t.serial} into manifest.`);
                                    }}
                                    className="px-2.5 py-1 rounded bg-[#ffd875] hover:bg-[#ffcf52] text-[#4a2e00] font-bold text-xs border border-[#c8860d] shadow-2xs cursor-pointer"
                                  >
                                    + Insert
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 3. EXTRA TOOLS FROM BASE WITH DEDICATED INSERT BUTTONS */}
                <div className="pt-2 border-t mt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => setShowExtraPicker(!showExtraPicker)}
                      className="text-blue-700 hover:underline font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <span>{showExtraPicker ? '▼' : '▶'}</span>
                      <span>Extra Tools from Base Stock ({availableBaseTools.length} available)</span>
                    </button>

                    {showExtraPicker && extraSelectedIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setCheckedToolIds((prev) => [...new Set([...prev, ...extraSelectedIds])]);
                          setInsertNotice(`Inserted ${extraSelectedIds.length} base tool(s) into manifest.`);
                          setExtraSelectedIds([]);
                        }}
                        className="px-3 py-1 rounded bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-2xs cursor-pointer animate-pulse"
                      >
                        + Insert Selected ({extraSelectedIds.length}) into Manifest &uarr;
                      </button>
                    )}
                  </div>

                  {showExtraPicker && (
                    <div className="border border-slate-300 rounded p-2.5 bg-slate-50 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Search base tools by serial, category, size..."
                          value={extraSearch}
                          onChange={(e) => setExtraSearch(e.target.value)}
                          className="flex-1 border rounded px-2.5 py-1 text-xs bg-white focus:ring-1 focus:ring-[#1a3055] outline-none"
                        />
                        {extraSearch && (
                          <button
                            type="button"
                            onClick={() => setExtraSearch('')}
                            className="text-slate-400 hover:text-slate-600 text-xs font-bold"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {filteredExtraBaseTools.length === 0 ? (
                        <div className="p-3 text-center text-slate-500 text-xs">
                          {extraSearch ? 'No matching base tools found.' : 'Type to search base tools, or enter serial.'}
                        </div>
                      ) : (
                        <div className="max-h-48 overflow-y-auto border border-slate-200 rounded bg-white">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-[#24476b] border-b border-slate-200 font-bold sticky top-0">
                              <tr>
                                <th className="px-2 py-1.5 w-8 text-center">
                                  <input
                                    type="checkbox"
                                    checked={
                                      filteredExtraBaseTools.length > 0 &&
                                      filteredExtraBaseTools.every((t) =>
                                        extraSelectedIds.includes(t.id) || checkedToolIds.includes(t.id)
                                      )
                                    }
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        const uninserted = filteredExtraBaseTools
                                          .filter((t) => !checkedToolIds.includes(t.id))
                                          .map((t) => t.id);
                                        setExtraSelectedIds(uninserted);
                                      } else {
                                        setExtraSelectedIds([]);
                                      }
                                    }}
                                  />
                                </th>
                                <th className="px-2 py-1.5">Serial</th>
                                <th className="px-2 py-1.5">Size</th>
                                <th className="px-2 py-1.5">Category</th>
                                <th className="px-2 py-1.5">Owner</th>
                                <th className="px-2 py-1.5 text-center w-24">Insert Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {filteredExtraBaseTools.map((t) => {
                                const isInserted = checkedToolIds.includes(t.id);
                                const isSelected = extraSelectedIds.includes(t.id);
                                return (
                                  <tr
                                    key={t.id}
                                    className={`hover:bg-slate-50 ${
                                      isInserted ? 'bg-emerald-50/30' : isSelected ? 'bg-purple-50/50' : ''
                                    }`}
                                  >
                                    <td className="px-2 py-1 text-center">
                                      <input
                                        type="checkbox"
                                        disabled={isInserted}
                                        checked={isInserted || isSelected}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setExtraSelectedIds((prev) => [...prev, t.id]);
                                          } else {
                                            setExtraSelectedIds((prev) => prev.filter((id) => id !== t.id));
                                          }
                                        }}
                                      />
                                    </td>
                                    <td className="px-2 py-1 font-mono font-bold text-amber-900">{t.serial}</td>
                                    <td className="px-2 py-1 font-mono">{t.size}</td>
                                    <td className="px-2 py-1 font-bold text-[#1a3055]">{t.shortDesc}</td>
                                    <td className="px-2 py-1 text-slate-500">{t.ownership}</td>
                                    <td className="px-2 py-1 text-center">
                                      {isInserted ? (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                          ✓ In Manifest
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setCheckedToolIds((prev) => [...prev, t.id]);
                                            setExtraSelectedIds((prev) => prev.filter((id) => id !== t.id));
                                            setInsertNotice(`Inserted extra tool ${t.serial} into manifest.`);
                                          }}
                                          className="px-2.5 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] shadow-2xs cursor-pointer"
                                        >
                                          + Insert
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">Dispatch Remarks &amp; Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Thread protectors installed, lifting slings inspected."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5"
                />
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={onCloseNewDT}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] shadow-sm cursor-pointer"
                >
                  Confirm Dispatch &rarr;
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DT Detail Modal */}
      {selectedDTDetail && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedDTDetail(null);
          }}
        >
          <div className="bg-white rounded shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="font-bold text-sm">Delivery Ticket: {selectedDTDetail.dtNumber}</h3>
                <div className="text-[11px] text-slate-300">
                  {selectedDTDetail.jobId} &bull; {selectedDTDetail.rig} / {selectedDTDetail.well}
                </div>
              </div>
              <button
                onClick={() => setSelectedDTDetail(null)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Job Number:</span>
                  <span className="font-bold text-[#1a3055]">{selectedDTDetail.jobId}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">RM Ref:</span>
                  <span className="font-mono">{selectedDTDetail.rmRef}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Dispatch Date:</span>
                  <span>{selectedDTDetail.rmDate}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Dispatched By:</span>
                  <span>{selectedDTDetail.dispatchedBy}</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-slate-100 border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700">Manifest Status:</span>
                  {selectedDTDetail.isLocked !== false ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      ✓ Dispatched &amp; Finalized
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                      Draft / Pending Finalization
                    </span>
                  )}
                </div>
                {selectedDTDetail.isLocked !== false && user?.role === 'Admin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setUnlockTargetDT(selectedDTDetail);
                      setSelectedDTDetail(null);
                    }}
                    className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-[10px] cursor-pointer"
                  >
                    ✏️ Admin Edit Manifest
                  </button>
                )}
              </div>

              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-[#24476b] border-b border-slate-200 font-bold">
                    <tr>
                      <th className="px-2.5 py-1.5 w-10">#</th>
                      <th className="px-2.5 py-1.5">Serial</th>
                      <th className="px-2.5 py-1.5">Size</th>
                      <th className="px-2.5 py-1.5">Tool Category</th>
                      <th className="px-2.5 py-1.5">Owner</th>
                      <th className="px-2.5 py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedDTDetail.toolLines.map((t, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-2.5 py-1.5 text-slate-400 font-mono">{i + 1}</td>
                        <td className="px-2.5 py-1.5 font-mono font-bold text-amber-900">{t.serial}</td>
                        <td className="px-2.5 py-1.5 font-mono">{t.size}</td>
                        <td className="px-2.5 py-1.5 font-semibold text-[#1a3055]">{t.shortDesc}</td>
                        <td className="px-2.5 py-1.5 text-slate-600">{t.ownership}</td>
                        <td className="px-2.5 py-1.5">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              t.status === 'OnRig'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selectedDTDetail.notes && (
                <div className="p-2.5 bg-slate-50 rounded border border-slate-200 text-xs">
                  <strong className="text-slate-700">Remarks &amp; Audit Log:</strong>
                  <div className="whitespace-pre-line text-slate-600 font-mono text-[11px] mt-1">
                    {selectedDTDetail.notes}
                  </div>
                </div>
              )}
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-[#b8c9db] flex justify-between items-center flex-shrink-0 text-xs">
              <button
                onClick={() => handlePrintDT(selectedDTDetail)}
                className="px-3 py-1.5 rounded bg-slate-200 text-slate-800 font-bold hover:bg-slate-300 cursor-pointer"
              >
                🖨 Print Document
              </button>
              <button
                onClick={() => setSelectedDTDetail(null)}
                className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Attachment Modal */}
      {attachTargetDT && (
        <DocumentAttachmentModal
          documentType="DT"
          ticketNumber={attachTargetDT.dtNumber}
          jobId={attachTargetDT.jobId}
          rig={attachTargetDT.rig}
          well={attachTargetDT.well}
          existingFileUrl={attachTargetDT.signedDocUrl}
          existingFileName={attachTargetDT.signedDocName}
          existingSignedDate={attachTargetDT.signedDate}
          onSave={({ fileUrl, fileName, signedDate, notes }) => {
            const updated: DTBatch = {
              ...attachTargetDT,
              isSigned: true,
              signedDocUrl: fileUrl,
              signedDocName: fileName,
              signedDate: signedDate,
              notes: attachTargetDT.notes
                ? `${attachTargetDT.notes}\n[Signed Copy attached by ${user?.name || 'User'}: ${notes || fileName}]`
                : `[Signed Copy attached by ${user?.name || 'User'}: ${notes || fileName}]`,
            };
            if (onUpdateDTBatch) {
              onUpdateDTBatch(updated);
            }
            setAttachTargetDT(null);
          }}
          onClose={() => setAttachTargetDT(null)}
        />
      )}
    </div>
  );
};
