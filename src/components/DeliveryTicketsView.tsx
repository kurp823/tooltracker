import React, { useState, useMemo } from 'react';
import { DTBatch, DTLine, DrillingJob, Callout, ToolItem, User } from '../types';
import { DocumentAttachmentModal } from './DocumentAttachmentModal';
import { extractSizeFromDescription, extractToolType } from '../services/api';

interface DeliveryTicketsViewProps {
  user?: User | null;
  dtBatches: DTBatch[];
  jobs: DrillingJob[];
  callouts: Callout[];
  inventory: ToolItem[];
  contracts?: any[];
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
  contracts,
  onSaveDTBatch,
  onUpdateDTBatch,
  isNewDTOpen,
  onCloseNewDT,
  onOpenNewDT,
  preSelectedJobId,
}) => {
  const [tab, setTab] = useState<'onrig' | 'all'>('onrig');
  const [search, setSearch] = useState('');
  const [selectedDTId, setSelectedDTId] = useState<string | null>(null);
  const [modalToolSearch, setModalToolSearch] = useState('');

  // Fast lookup index for inventory tools by serial
  const inventoryMap = useMemo(() => {
    const map = new Map<string, ToolItem>();
    if (Array.isArray(inventory)) {
      inventory.forEach((item) => {
        if (item && item.serial) {
          map.set(item.serial.trim().toUpperCase(), item);
        }
      });
    }
    return map;
  }, [inventory]);

  // Fast lookup map for jobs by ID / Number
  const jobMap = useMemo(() => {
    const map = new Map<string, DrillingJob>();
    if (Array.isArray(jobs)) {
      jobs.forEach((j) => {
        if (j && j.id) map.set(j.id.trim().toUpperCase(), j);
        if (j && j.jobNumber) map.set(j.jobNumber.trim().toUpperCase(), j);
      });
    }
    return map;
  }, [jobs]);

  // Fast lookup map for callouts by ID
  const calloutMap = useMemo(() => {
    const map = new Map<string, Callout>();
    if (Array.isArray(callouts)) {
      callouts.forEach((c) => {
        if (c && c.id) map.set(c.id.trim().toUpperCase(), c);
      });
    }
    return map;
  }, [callouts]);

  // Fast lookup map for contracts by ID / Ref / No
  const contractMap = useMemo(() => {
    const map = new Map<string, any>();
    if (Array.isArray(contracts)) {
      contracts.forEach((c) => {
        if (c && c.id) map.set(String(c.id).trim().toUpperCase(), c);
        if (c && c.contractNo) map.set(String(c.contractNo).trim().toUpperCase(), c);
        if (c && c.contractRef) map.set(String(c.contractRef).trim().toUpperCase(), c);
      });
    }
    return map;
  }, [contracts]);

  // Helper to determine the best display Contract # for a Delivery Ticket
  const getDisplayContract = useMemo(() => {
    return (b: DTBatch): string => {
      // 1. Direct contract on batch if non-empty and meaningful
      const direct = (b.contract || '').trim();
      if (direct && direct !== '—' && direct !== 'null' && direct !== 'undefined') {
        const match = contractMap.get(direct.toUpperCase());
        if (match) return match.contractNo || match.shortDesc || match.name || direct;
        return direct;
      }

      // 2. Resolve via linked Job
      if (b.jobId) {
        const job = jobMap.get(b.jobId.trim().toUpperCase());
        if (job) {
          const jContract = (job.contract || '').trim();
          if (jContract && jContract !== '—' && jContract !== 'null' && jContract !== 'undefined') {
            const match = contractMap.get(jContract.toUpperCase());
            if (match) return match.contractNo || match.shortDesc || match.name || jContract;
            return jContract;
          }

          // 3. Resolve via Job's Callout
          if (job.calloutId) {
            const cal = calloutMap.get(job.calloutId.trim().toUpperCase());
            if (cal && cal.contract && cal.contract.trim() && cal.contract.trim() !== '—') {
              const match = contractMap.get(cal.contract.trim().toUpperCase());
              if (match) return match.contractNo || match.shortDesc || match.name || cal.contract.trim();
              return cal.contract.trim();
            }
          }

          // 4. Fallback to Job's client or clientRef or poNumber
          if (job.client && job.client.trim()) return job.client.trim();
          if (job.clientRef && job.clientRef.trim()) return job.clientRef.trim();
          if (job.poNumber && job.poNumber.trim()) return `PO-${job.poNumber.trim()}`;
        }
      }

      // 5. Fallback check: match rig/well with contracts
      if (b.rig && contracts && contracts.length > 0) {
        const match = contracts.find((c: any) =>
          (c.client && b.rig.toLowerCase().includes(c.client.toLowerCase())) ||
          (c.notes && c.notes.toLowerCase().includes(b.rig.toLowerCase()))
        );
        if (match) return match.contractNo || match.shortDesc || match.name;
      }

      return '—';
    };
  }, [contractMap, jobMap, calloutMap, contracts]);

  // Active selected Delivery Ticket (always in sync with dtBatches)
  const selectedDTDetail = useMemo(
    () => dtBatches.find((b) => b.id === selectedDTId) || null,
    [dtBatches, selectedDTId]
  );

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

  const [sortField, setSortField] = useState<'dtNumber' | 'jobId' | 'rig' | 'date' | 'contract'>('dtNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSortToggle = (field: 'dtNumber' | 'jobId' | 'rig' | 'date' | 'contract') => {
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
      const hasOnRig = (b.toolLines || []).some((t) => (t.status || (t.rtBatchId ? 'Returned' : 'OnRig')) === 'OnRig');
      if (tab === 'onrig' && !hasOnRig) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const contractStr = getDisplayContract(b);
        const full = `${b.dtNumber} ${b.jobId} ${b.rig} ${b.well} ${contractStr} ${b.contract || ''} ${b.rmRef}`.toLowerCase();
        const hasToolMatch = (b.toolLines || []).some(
          (t) =>
            t.serial?.toLowerCase().includes(q) ||
            t.shortDesc?.toLowerCase().includes(q) ||
            (t as any).toolDescription?.toLowerCase().includes(q) ||
            t.size?.toLowerCase().includes(q)
        );
        if (!full.includes(q) && !hasToolMatch) return false;
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
      } else if (sortField === 'contract') {
        diff = getDisplayContract(a).localeCompare(getDisplayContract(b));
      } else if (sortField === 'date') {
        diff = (a.rmDate || '').localeCompare(b.rmDate || '');
      }
      return sortOrder === 'desc' ? -diff : diff;
    });
  }, [dtBatches, tab, search, sortField, sortOrder, getDisplayContract]);

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
    <div class="box"><div class="lbl">Master Contract</div><div class="val">${getDisplayContract(b)}</div></div>
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
      ${(b.toolLines || [])
        .map(
          (t, i) => {
            const invTool = t.serial ? inventoryMap.get(t.serial.trim().toUpperCase()) : undefined;
            const displayDesc = t.desc || t.shortDesc || (t as any).toolDescription || invTool?.shortDesc || invTool?.desc || 'Downhole Tool';
            const displaySize = t.size || invTool?.size || extractSizeFromDescription(displayDesc) || '—';
            const displayOwner = t.ownership || invTool?.ownership || 'EMDAD';
            return `<tr>
        <td>${i + 1}</td>
        <td style="font-family: monospace; font-weight: bold;">${t.serial}</td>
        <td style="font-family: monospace;">${displaySize}</td>
        <td>${displayDesc}</td>
        <td>${displayOwner}</td>
        <td style="text-align: center;">${(t as any).qty || 1}</td>
      </tr>`;
          }
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
            🛢 Tools On Rig ({dtBatches.filter((b) => (b.toolLines || []).some((t) => (t.status || (t.rtBatchId ? 'Returned' : 'OnRig')) === 'OnRig')).length})
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
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search DT #, job, rig, well, RM ref, serial..."
            className="bg-white border border-[#b8c9db] rounded px-3 py-1.5 text-xs w-64 outline-none font-medium focus:ring-1 focus:ring-amber-400 shadow-2xs"
          />
        </div>
      </div>

      {/* DT List (Clean, Professional, Compact Ledger) */}
      <div className="bg-white border border-[#b8c9db] rounded overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-[#24476b] border-b border-[#b8c9db] font-bold select-none">
              <tr>
                <th
                  onClick={() => handleSortToggle('dtNumber')}
                  className="px-3 py-2.5 cursor-pointer hover:bg-slate-100"
                >
                  DT Number {sortField === 'dtNumber' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('jobId')}
                  className="px-3 py-2.5 cursor-pointer hover:bg-slate-100"
                >
                  Job # {sortField === 'jobId' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('rig')}
                  className="px-3 py-2.5 cursor-pointer hover:bg-slate-100"
                >
                  Rig / Well {sortField === 'rig' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('contract')}
                  className="px-3 py-2.5 cursor-pointer hover:bg-slate-100"
                >
                  Contract # {sortField === 'contract' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="px-3 py-2.5">RM Ref</th>
                <th
                  onClick={() => handleSortToggle('date')}
                  className="px-3 py-2.5 cursor-pointer hover:bg-slate-100"
                >
                  Dispatch Date {sortField === 'date' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="px-3 py-2.5 text-center">Signed Copy</th>
                <th className="px-3 py-2.5 text-center">Total Tools</th>
                <th className="px-3 py-2.5 text-center">On Rig</th>
                <th className="px-3 py-2.5 text-center">Returned</th>
                <th className="px-3 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {filteredDTs.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-500 font-medium">
                    No delivery tickets found.
                  </td>
                </tr>
              ) : (
                filteredDTs.map((b) => {
                  const onRig = (b.toolLines || []).filter(
                    (t) => (t.status || (t.rtBatchId ? 'Returned' : 'OnRig')) === 'OnRig'
                  ).length;
                  const ret = (b.toolLines || []).filter(
                    (t) => (t.status || (t.rtBatchId ? 'Returned' : 'OnRig')) === 'Returned'
                  ).length;
                  const isSelected = selectedDTId === b.id;
                  const displayContract = getDisplayContract(b);

                  return (
                    <tr
                      key={b.id}
                      onClick={() => {
                        setSelectedDTId(b.id);
                        setModalToolSearch('');
                      }}
                      className={`transition cursor-pointer ${
                        isSelected ? 'bg-amber-50/70' : 'hover:bg-blue-50/40'
                      }`}
                      title="Click to view full ticket details and mobilized tools"
                    >
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 font-mono font-bold text-amber-900 group hover:text-blue-700">
                          <span className="text-blue-600 text-[12px]">📄</span>
                          <span className="underline decoration-amber-300 group-hover:decoration-blue-500 font-bold">
                            {b.dtNumber}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-blue-700 font-semibold">{b.jobId}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-800">
                        {b.rig} <span className="text-slate-400">|</span> {b.well}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-800">
                        {displayContract !== '—' ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-[#1a3055] bg-slate-100/90 px-2 py-0.5 rounded border border-slate-200">
                            <span className="text-slate-400 text-[10px]">📋</span>
                            {displayContract}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-500 text-[11px]">{b.rmRef || '—'}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-700">{b.rmDate}</td>
                      <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
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
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 cursor-pointer shadow-2xs"
                            title="Click to attach signed and stamped ticket"
                          >
                            <span>📎</span> Attach Signed
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-center">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px] font-bold border border-slate-200">
                          {b.toolLines?.length || 0}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-center">
                        {onRig > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold border border-blue-200">
                            {onRig}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-center">
                        {ret > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-200">
                            {ret}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center space-x-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDTId(b.id);
                            setModalToolSearch('');
                          }}
                          className="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-[11px] border border-blue-200 cursor-pointer transition shadow-2xs"
                          title="Open full ticket details window"
                        >
                          View Details
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintDT(b)}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold border border-slate-300 cursor-pointer transition shadow-2xs"
                          title="Print Delivery Ticket"
                        >
                          🖨 Print
                        </button>
                      </td>
                    </tr>
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
                        {j.id} — {j.rig}/{j.well} ({j.client}{j.contract ? ` | ${j.contract}` : ''})
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

              {currentJob && (
                <div className="p-2.5 rounded bg-blue-50/80 border border-blue-200 text-xs flex flex-wrap items-center gap-3 text-slate-700">
                  <span>Client: <strong className="text-[#1a3055]">{currentJob.client}</strong></span>
                  <span className="text-slate-300">&bull;</span>
                  <span>Contract #: <strong className="text-amber-900 font-mono">{currentJob.contract || 'Standard Master Service Agreement'}</strong></span>
                  <span className="text-slate-300">&bull;</span>
                  <span>Rig / Well: <strong>{currentJob.rig} / {currentJob.well}</strong></span>
                </div>
              )}

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

      {/* DT Detail Window (Professional, Compact, Full Details Modal) */}
      {selectedDTDetail && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedDTId(null);
          }}
        >
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            {(() => {
              const modalContract = getDisplayContract(selectedDTDetail);
              return (
                <div className="px-5 py-3.5 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <span className="p-2 rounded-lg bg-blue-500/20 text-amber-300 text-base">
                      📄
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base tracking-wide text-white">
                          Delivery Ticket: <span className="text-amber-400 font-mono">{selectedDTDetail.dtNumber}</span>
                        </h3>
                        {selectedDTDetail.isLocked !== false ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/50">
                            ✓ Dispatched &amp; Finalized
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-500/50">
                            ⚠️ Manifest in Revision
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-300 mt-0.5">
                        Job <span className="font-semibold text-white">{selectedDTDetail.jobId}</span> &bull; Rig <span className="font-semibold text-white">{selectedDTDetail.rig}</span> &bull; Well <span className="font-semibold text-white">{selectedDTDetail.well}</span> &bull; Contract: <span className="text-amber-300 font-mono font-bold">{modalContract}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedDTDetail.isSigned || selectedDTDetail.signedDocUrl ? (
                      <button
                        type="button"
                        onClick={() => setAttachTargetDT(selectedDTDetail)}
                        className="px-2.5 py-1 rounded text-xs font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-400/40 hover:bg-emerald-500/30 cursor-pointer transition"
                        title="View signed & stamped document"
                      >
                        ✓ Signed Copy Attached
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAttachTargetDT(selectedDTDetail)}
                        className="px-2.5 py-1 rounded text-xs font-bold bg-amber-500/20 text-amber-200 border border-amber-400/40 hover:bg-amber-500/30 cursor-pointer transition"
                        title="Attach signed ticket"
                      >
                        📎 Attach Signed Copy
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedDTId(null)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 text-xl font-bold transition cursor-pointer"
                      title="Close Window (Esc)"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Scrollable Body */}
            {(() => {
              const isDTLocked = selectedDTDetail.isLocked !== false;
              const modalContract = getDisplayContract(selectedDTDetail);
              return (
                <div className="p-5 space-y-4 overflow-y-auto text-xs">
                  {/* Top Metadata Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Job Number</span>
                      <span className="font-bold text-[#1a3055] text-xs font-mono">{selectedDTDetail.jobId}</span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Contract #</span>
                      <span className="font-bold text-[#1a3055] text-xs font-mono">
                        {modalContract !== '—' ? modalContract : '—'}
                      </span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Rig &amp; Well</span>
                      <span className="font-semibold text-slate-800 text-xs">{selectedDTDetail.rig} / {selectedDTDetail.well}</span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">RM / Manifest Ref</span>
                      <span className="font-mono text-slate-700 text-xs">{selectedDTDetail.rmRef || '—'}</span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Dispatch Date</span>
                      <span className="font-mono text-slate-700 text-xs">{selectedDTDetail.rmDate || '—'}</span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Dispatched By</span>
                      <span className="font-medium text-slate-800 text-xs">{selectedDTDetail.dispatchedBy || 'Operations'}</span>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Recipient / Consignee</span>
                      <span className="font-medium text-slate-800 text-xs">{selectedDTDetail.recipient || 'Rig Operations'}</span>
                    </div>
                  </div>

                  {/* Manifest Bar: Stats + In-modal Search + Admin Amendment Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 text-xs">Mobilized Manifest:</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 font-bold text-[11px]">
                        Total: {selectedDTDetail.toolLines?.length || 0}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[11px] border border-blue-200">
                        On Rig: {(selectedDTDetail.toolLines || []).filter((t) => (t.status || (t.rtBatchId ? 'Returned' : 'OnRig')) === 'OnRig').length}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-200">
                        Returned: {(selectedDTDetail.toolLines || []).filter((t) => (t.status || (t.rtBatchId ? 'Returned' : 'OnRig')) === 'Returned').length}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={modalToolSearch}
                        onChange={(e) => setModalToolSearch(e.target.value)}
                        placeholder="Search tools in manifest..."
                        className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs w-48 sm:w-56 outline-none focus:ring-1 focus:ring-blue-500"
                      />

                      {/* Admin Amendment Controls */}
                      {isDTLocked ? (
                        user?.role === 'Admin' && (
                          <button
                            type="button"
                            onClick={() => {
                              setUnlockTargetDT(selectedDTDetail);
                              setAdminUnlockRemark('');
                              setUnlockError('');
                            }}
                            className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs shadow-xs cursor-pointer transition"
                          >
                            ✏️ Amend Manifest
                          </button>
                        )
                      ) : (
                        user?.role === 'Admin' && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingDTId(editingDTId === selectedDTDetail.id ? null : selectedDTDetail.id)}
                              className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs cursor-pointer transition"
                            >
                              {editingDTId === selectedDTDetail.id ? 'Done Picking' : '+ Add Tool from Base'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLockDT(selectedDTDetail)}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs cursor-pointer transition"
                            >
                              ✓ Finalize Manifest
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  {/* Tool Picker from Base Stock (when unlocked and admin toggles picking) */}
                  {!isDTLocked && editingDTId === selectedDTDetail.id && user?.role === 'Admin' && (
                    <div className="p-3.5 bg-amber-50/80 border border-amber-300 rounded-lg space-y-2.5 animate-in fade-in duration-150">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-bold text-xs text-amber-950 flex items-center gap-1.5">
                          <span>📦</span> Available Tools in Base Stock to Add to {selectedDTDetail.dtNumber}:
                        </div>
                        <input
                          type="text"
                          value={addExtraToolSearch}
                          onChange={(e) => setAddExtraToolSearch(e.target.value)}
                          placeholder="Filter serial, size, description..."
                          className="border border-amber-300 rounded px-2 py-1 text-xs bg-white w-52 outline-none focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto border border-amber-200 rounded-md bg-white">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-amber-100/60 font-bold border-b border-amber-200 text-amber-900 sticky top-0">
                            <tr>
                              <th className="px-2.5 py-1.5">Serial</th>
                              <th className="px-2.5 py-1.5">Size</th>
                              <th className="px-2.5 py-1.5">Tool Type</th>
                              <th className="px-2.5 py-1.5">Description</th>
                              <th className="px-2.5 py-1.5">Owner</th>
                              <th className="px-2.5 py-1.5 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-amber-100">
                            {availableBaseTools
                              .filter((t) => {
                                if (!addExtraToolSearch.trim()) return true;
                                const q = addExtraToolSearch.toLowerCase();
                                return `${t.serial} ${t.shortDesc} ${t.desc} ${t.size} ${t.ownership}`
                                  .toLowerCase()
                                  .includes(q);
                              })
                              .slice(0, 15)
                              .map((tool) => (
                                <tr key={tool.id} className="hover:bg-amber-50/50">
                                  <td className="px-2.5 py-1.5 font-mono font-bold text-amber-900">{tool.serial}</td>
                                  <td className="px-2.5 py-1.5 font-mono">{tool.size}</td>
                                  <td className="px-2.5 py-1.5 font-bold text-[#1a3055]">{tool.shortDesc}</td>
                                  <td className="px-2.5 py-1.5 text-slate-600 text-xs max-w-xs truncate" title={tool.desc}>{tool.desc}</td>
                                  <td className="px-2.5 py-1.5 text-slate-500">{tool.ownership}</td>
                                  <td className="px-2.5 py-1.5 text-center">
                                    <button
                                      type="button"
                                      onClick={() => handleAddToolToUnlockedDT(selectedDTDetail, tool)}
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

                  {/* Tools Manifest Table */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
                    <div className="max-h-96 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-[#eef3f9] text-[#1a3055] border-b border-slate-200 font-bold sticky top-0 z-10 select-none">
                          <tr>
                            <th className="px-3 py-2 w-10 text-slate-500">#</th>
                            <th className="px-3 py-2">Serial #</th>
                            <th className="px-3 py-2">Size</th>
                            <th className="px-3 py-2">Tool Type</th>
                            <th className="px-3 py-2">Description</th>
                            <th className="px-3 py-2">Owner</th>
                            <th className="px-3 py-2 text-center">Status</th>
                            {!isDTLocked && user?.role === 'Admin' && (
                              <th className="px-3 py-2 text-center w-28">Action</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {(() => {
                            const allTools = selectedDTDetail.toolLines || [];
                            const filteredModalTools = allTools.filter((t) => {
                              if (!modalToolSearch.trim()) return true;
                              const q = modalToolSearch.toLowerCase();
                              const invTool = t.serial ? inventoryMap.get(t.serial.trim().toUpperCase()) : undefined;
                              const toolType = t.shortDesc || invTool?.shortDesc || '';
                              const desc = t.desc || invTool?.desc || (t as any).toolDescription || '';
                              const sz = t.size || invTool?.size || '';
                              const owner = t.ownership || invTool?.ownership || '';
                              return (
                                t.serial?.toLowerCase().includes(q) ||
                                toolType.toLowerCase().includes(q) ||
                                desc.toLowerCase().includes(q) ||
                                sz.toLowerCase().includes(q) ||
                                owner.toLowerCase().includes(q)
                              );
                            });

                            if (filteredModalTools.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={!isDTLocked && user?.role === 'Admin' ? 8 : 7} className="p-8 text-center text-slate-400 font-medium">
                                    {allTools.length === 0
                                      ? 'No tool lines recorded for this delivery ticket.'
                                      : 'No tools match your search filter.'}
                                  </td>
                                </tr>
                              );
                            }

                            return filteredModalTools.map((t, i) => {
                              const invTool = t.serial ? inventoryMap.get(t.serial.trim().toUpperCase()) : undefined;
                              const toolType = t.shortDesc || invTool?.shortDesc || 'Downhole Tool';
                              const description = t.desc || invTool?.desc || (t as any).toolDescription || toolType;
                              const displaySize = t.size || invTool?.size || extractSizeFromDescription(description) || '—';
                              const displayOwnership = t.ownership || invTool?.ownership || (t.isEmdad ? 'EMDAD' : 'EMDAD');
                              const statusVal = t.status || (t.rtBatchId ? 'Returned' : 'OnRig');
                              const isOnRig = statusVal === 'OnRig';

                              return (
                                <tr key={i} className="hover:bg-slate-50 transition">
                                  <td className="px-3 py-2 text-slate-400 font-mono text-[11px]">{i + 1}</td>
                                  <td className="px-3 py-2 font-mono font-bold text-amber-900">{t.serial}</td>
                                  <td className="px-3 py-2 font-mono font-semibold text-slate-800">{displaySize}</td>
                                  <td className="px-3 py-2 font-bold text-[#1a3055] whitespace-nowrap">{toolType}</td>
                                  <td className="px-3 py-2 text-slate-700 text-xs" title={description}>
                                    {description}
                                  </td>
                                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{displayOwnership}</td>
                                  <td className="px-3 py-2 text-center whitespace-nowrap">
                                    <span
                                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                        isOnRig
                                          ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      }`}
                                    >
                                      {isOnRig ? 'On Rig' : 'Returned'}
                                    </span>
                                  </td>
                                  {!isDTLocked && user?.role === 'Admin' && (
                                    <td className="px-3 py-2 text-center whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveToolFromUnlockedDT(selectedDTDetail, t.serial)}
                                        className="text-rose-600 hover:text-rose-800 font-bold text-[11px] hover:underline cursor-pointer"
                                      >
                                        Return to Base
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Remarks & Audit Trail */}
                  {selectedDTDetail.notes && (
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                      <strong className="text-slate-700 block mb-1">Manifest Remarks &amp; Audit Trail:</strong>
                      <div className="whitespace-pre-line text-slate-600 font-mono text-[11px] bg-white p-2.5 rounded border border-slate-200">
                        {selectedDTDetail.notes}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Footer */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap justify-between items-center gap-3 flex-shrink-0 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintDT(selectedDTDetail)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-200 text-slate-800 font-bold hover:bg-slate-300 cursor-pointer transition flex items-center gap-1.5 shadow-2xs"
                >
                  <span>🖨</span> Print Delivery Ticket
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDTId(null)}
                className="px-4 py-1.5 rounded-lg bg-[#1a3055] text-white font-bold hover:bg-[#24426d] cursor-pointer transition shadow-2xs"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Attachment Modal */}
      {attachTargetDT && (
        <DocumentAttachmentModal
          title="Delivery Ticket Attachment"
          subtitle={`Rig: ${attachTargetDT.rig} | Well: ${attachTargetDT.well} | Job: ${attachTargetDT.jobId}`}
          referenceNumber={attachTargetDT.dtNumber}
          currentDocUrl={attachTargetDT.signedDocUrl}
          currentDocName={attachTargetDT.signedDocName}
          currentSignedDate={attachTargetDT.signedDate}
          isSigned={attachTargetDT.isSigned}
          onSave={({ docUrl, docName, signedDate }) => {
            const updated: DTBatch = {
              ...attachTargetDT,
              isSigned: true,
              signedDocUrl: docUrl,
              signedDocName: docName,
              signedDate: signedDate,
              notes: attachTargetDT.notes
                ? `${attachTargetDT.notes}\n[Signed Copy attached by ${user?.name || 'User'}: ${docName}]`
                : `[Signed Copy attached by ${user?.name || 'User'}: ${docName}]`,
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
