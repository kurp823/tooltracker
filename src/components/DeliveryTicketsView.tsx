import React, { useState, useMemo, useEffect } from 'react';
import { DTBatch, DTLine, DrillingJob, Callout, ToolItem, User } from '../types';
import { DocumentAttachmentModal } from './DocumentAttachmentModal';
import { extractSizeFromDescription, extractToolType, normalizeJobKey } from '../services/api';
import { EMDAD_LOGO_BASE64, EmdadLogo } from '../constants/branding';
import { useModulePermission, ReadOnlyBanner } from '../services/permissionService';
import { JobSearchSelect } from './JobSearchSelect';
import {
  generateDeliveryTicketHtml,
  generateDispatchChecklistHtml,
  openPrintWindow,
  DeliveryTicketPrintData,
  DispatchChecklistPrintData,
} from '../services/ticketPrintService';
import { formatDateDD_MM_YYYY } from './JobDossierView';

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
  onRefresh?: () => void;
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
  onRefresh,
}) => {
  const { canEdit, isReadOnly } = useModulePermission(user, 'dt');
  const [tab, setTab] = useState<'onrig' | 'all'>('onrig');
  const [search, setSearch] = useState('');
  const [selectedDTId, setSelectedDTId] = useState<string | null>(null);
  const [modalToolSearch, setModalToolSearch] = useState('');

  // Fast lookup index for inventory tools by serial, assetNo, and id
  const inventoryMap = useMemo(() => {
    const map = new Map<string, ToolItem>();
    if (Array.isArray(inventory)) {
      inventory.forEach((item) => {
        if (item) {
          if (item.serial) map.set(item.serial.trim().toUpperCase(), item);
          if (item.assetNo) map.set(item.assetNo.trim().toUpperCase(), item);
          if (item.id) map.set(String(item.id).trim().toUpperCase(), item);
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
        if (j && j.id) {
          map.set(j.id.trim().toUpperCase(), j);
          map.set(normalizeJobKey(j.id), j);
        }
        if (j && j.jobNumber) {
          map.set(j.jobNumber.trim().toUpperCase(), j);
          map.set(normalizeJobKey(j.jobNumber), j);
        }
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
      const resolveContract = (value?: unknown): string | null => {
        const key = String(value || '').trim();
        if (!key || ['—', 'null', 'undefined'].includes(key.toLowerCase())) return null;
        const match = contractMap.get(key.toUpperCase());
        return match?.contractNo || null;
      };

      // Ignore descriptive values such as "MR FROM ..." unless they resolve
      // to an actual master-contract key.
      const direct = (b.contract || '').trim();
      const directContract = resolveContract(direct);
      if (directContract) return directContract;

      // Resolve via linked Job or its Callout.
      if (b.jobId) {
        const job = jobMap.get(b.jobId.trim().toUpperCase());
        if (job) {
          const jobContract = resolveContract(job.contract);
          if (jobContract) return jobContract;

          if (job.calloutId) {
            const cal = calloutMap.get(job.calloutId.trim().toUpperCase());
            const calloutContract = resolveContract(cal?.contract);
            if (calloutContract) return calloutContract;
          }

          // A client is only safe when it has one master contract.
          const clientContracts = contracts?.filter(
            (c: any) => c.client?.trim().toUpperCase() === job.client?.trim().toUpperCase()
          ) || [];
          if (clientContracts.length === 1 && clientContracts[0].contractNo) {
            return clientContracts[0].contractNo;
          }
        }
      }

      return '—';
    };
  }, [contractMap, jobMap, calloutMap, contracts]);

  // Active selected Delivery Ticket (always in sync with dtBatches)
  const selectedDTDetail = useMemo(
    () => dtBatches.find((b) => b.id === selectedDTId) || null,
    [dtBatches, selectedDTId]
  );

  // Delivery Ticket Detail Notes editor state (same like Job header)
  const [dtEditNotes, setDtEditNotes] = useState('');
  useEffect(() => {
    if (selectedDTDetail) {
      setDtEditNotes(selectedDTDetail.notes || '');
    }
  }, [selectedDTDetail?.id]);
  // Note: selectedDTDetail?.notes intentionally NOT in deps — including it causes
  // the editor to reset mid-typing whenever any other field triggers a re-render.

  const handleSaveDTDetailNotes = () => {
    if (!selectedDTDetail) return;
    const updated: DTBatch = {
      ...selectedDTDetail,
      notes: dtEditNotes.trim(),
    };
    if (onUpdateDTBatch) {
      onUpdateDTBatch(updated);
    }
  };

  // Document Attachment Modal state
  const [attachTargetDT, setAttachTargetDT] = useState<DTBatch | null>(null);

  // Admin Revision Authorization State
  const [unlockTargetDT, setUnlockTargetDT] = useState<DTBatch | null>(null);
  const [adminUnlockRemark, setAdminUnlockRemark] = useState('');
  const [unlockError, setUnlockError] = useState('');

  // Dispatch Date local edit state — prevents date picker from closing on state update
  const [dispatchDateEdit, setDispatchDateEdit] = useState(selectedDTDetail?.rmDate || '');
  useEffect(() => {
    setDispatchDateEdit(selectedDTDetail?.rmDate || '');
  }, [selectedDTDetail?.id]);

  // AD Ticket No inline edit state (ADNOC Drilling pool contract 4700024096 only)
  const [clientDtNoEdits, setClientDtNoEdits] = useState<Record<string, string>>({});
  useEffect(() => { setClientDtNoEdits({}); }, [selectedDTId]);

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
      .filter((b) => {
        const s = String(b.dtNumber || '').toUpperCase();
        return !s.includes('10001') && !s.includes('100001') && !s.includes('10002');
      })
      .map((b) => {
        const m = (b.dtNumber || '').match(/^DT-(?:\d+-)?(\d+)$/i);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => !isNaN(n) && n > 0 && n < 10000);
    const nextSeq = dtNums.length > 0 ? Math.max(...dtNums) + 1 : 2393;
    let seq = nextSeq;
    while (dtBatches.some((b) => String(b.dtNumber || '').toUpperCase() === `DT-${curYr}-${String(seq).padStart(5, '0')}`)) {
      seq++;
    }
    return `DT-${curYr}-${String(seq).padStart(5, '0')}`;
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

  // Save AD Ticket No on a DT line; auto-locks the batch when any value is entered
  // Gated: only called when contract === '4700024096'
  const handleSaveClientDtNo = (batch: DTBatch, lineIdx: number, value: string) => {
    const trimmed = value.trim();
    const updatedLines = (batch.toolLines || []).map((line, i) =>
      i === lineIdx ? { ...line, clientDtNo: trimmed } : line
    );
    const hasAnyAdTicket = updatedLines.some((l) => l.clientDtNo?.trim());
    const today = new Date().toISOString().split('T')[0];
    const updated: DTBatch = {
      ...batch,
      toolLines: updatedLines,
      ...(hasAnyAdTicket && !batch.isLocked
        ? {
            isLocked: true,
            lockedBy: user?.name || 'System',
            lockedDate: today,
            notes: batch.notes
              ? `${batch.notes}\n[Auto-locked ${today} — AD Ticket No entered by ${user?.name || 'Ops'}]`
              : `[Auto-locked ${today} — AD Ticket No entered by ${user?.name || 'Ops'}]`,
          }
        : {}),
    };
    if (onUpdateDTBatch) onUpdateDTBatch(updated);
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

  const getDTField = (b: DTBatch, field: string): string => {
    let val = (b as any)[field];
    if ((val === undefined || val === null) && typeof window !== 'undefined' && b.dtNumber) {
      try {
        const savedMeta = JSON.parse(localStorage.getItem(`emdad_dt_meta_${b.dtNumber}`) || '{}');
        if (savedMeta[field] !== undefined && savedMeta[field] !== null) {
          val = savedMeta[field];
        }
      } catch {}
    }
    return val !== undefined && val !== null ? String(val) : '';
  };

  const handlePrintDT = (b: DTBatch) => {
    const job = jobs.find((j) => j.id === b.jobId);
    const deliveredTo = getDTField(b, 'deliveredTo');
    const msvName = getDTField(b, 'vesselBoat') || getDTField(b, 'msvName');
    const vehicleVesselNo = getDTField(b, 'vehicleNo') || getDTField(b, 'vehicleVesselNo') || getDTField(b, 'vesselNo');
    const driverName = getDTField(b, 'driverName');
    const contactNo = getDTField(b, 'contactNo');

    const printData: DeliveryTicketPrintData = {
      dtNumber: b.dtNumber,
      client: b.client || job?.client || '—',
      materialRequest: b.rmRef || 'MR FROM CLIENT',
      jobNumber: b.jobId || job?.id || '—',
      clientRef: (b as any).clientRef || (job as any)?.clientRef || '—',
      radioMsgNo: (b as any).radioMsgNo || 'N/A',
      serviceTicket: (b as any).serviceTicket || b.jobId || job?.id || '—',
      ticketNo: b.dtNumber,
      contractNo: getDisplayContract(b) || job?.contractNo || job?.contract || '—',
      rig: b.rig || job?.rig || '—',
      well: b.well || job?.well || '—',
      shippedDate: b.rmDate || formatDateDD_MM_YYYY(new Date()),
      deliveredTo: deliveredTo || '—',
      msvName: msvName || '—',
      vehicleVesselNo: vehicleVesselNo || '—',
      driverName: driverName || '—',
      contactNo: contactNo || '—',
      notes: b.notes,
      tools: (b.toolLines || []).map((t, i) => {
        const sKey = (t.serial || '').trim().toUpperCase();
        const aKey = (t.assetNo || '').trim().toUpperCase();
        const invTool = (sKey ? inventoryMap.get(sKey) : undefined) || (aKey ? inventoryMap.get(aKey) : undefined);
        const resolvedAssetNo = invTool?.assetNo?.trim() || t.assetNo?.trim() || t.serial?.trim() || '—';
        const displayDesc = invTool?.desc?.trim() || t.desc?.trim() || invTool?.shortDesc?.trim() || t.shortDesc?.trim() || (t as any).toolDescription || 'Downhole Tool';
        const displaySize = t.size || invTool?.size || extractSizeFromDescription(displayDesc) || '—';
        return {
          itemNo: i + 1,
          partNo: resolvedAssetNo,
          serial: t.serial || invTool?.serial || '—',
          description: displaySize !== '—' && !displayDesc.includes(displaySize) ? `${displayDesc} (${displaySize})` : displayDesc,
          qty: (t as any).qty || 1,
          size: displaySize,
        };
      }),
    };
    const html = generateDeliveryTicketHtml(printData);
    openPrintWindow(html, `Delivery Ticket - ${b.dtNumber}`);
  };

  const handlePrintDispatchChecklist = (b: DTBatch) => {
    const job = jobs.find((j) => j.id === b.jobId);
    const checklistData: DispatchChecklistPrintData = {
      ticketNo: b.dtNumber,
      project: job?.id || b.jobId || '—',
      projectDesc: job?.jobDescription || job?.serviceCategory || 'RENTAL DRILLING TOOLS',
      dtNumber: b.dtNumber,
      rig: b.rig || job?.rig || '—',
      well: b.well || job?.well || '—',
      date: b.rmDate || formatDateDD_MM_YYYY(new Date()),
      client: b.client || job?.client || '—',
      wellId: (job as any)?.wellId || (b as any)?.wellId,
      comments: b.notes ? b.notes : (job as any)?.wellId ? `WELL'S ID - ${(job as any).wellId}` : undefined,
      tools: (b.toolLines || []).map((t, i) => {
        const sKey = (t.serial || '').trim().toUpperCase();
        const aKey = (t.assetNo || '').trim().toUpperCase();
        const invTool = (sKey ? inventoryMap.get(sKey) : undefined) || (aKey ? inventoryMap.get(aKey) : undefined);
        const resolvedAssetNo = invTool?.assetNo?.trim() || t.assetNo?.trim() || t.serial?.trim() || '—';
        const displayDesc = invTool?.desc?.trim() || t.desc?.trim() || invTool?.shortDesc?.trim() || t.shortDesc?.trim() || (t as any).toolDescription || 'Downhole Tool';
        const displaySize = t.size || invTool?.size || extractSizeFromDescription(displayDesc) || '—';
        return {
          lineNo: i + 1,
          partNo: resolvedAssetNo,
          description: displaySize !== '—' && !displayDesc.includes(displaySize) ? `${displayDesc} (${displaySize})` : displayDesc,
          qty: (t as any).qty || 1,
        };
      }),
    };
    const html = generateDispatchChecklistHtml(checklistData);
    openPrintWindow(html, `Dispatch Checklist - ${b.dtNumber}`);
  };

  return (
    <div className="space-y-3">
      {isReadOnly && <ReadOnlyBanner role={user?.role} moduleName="Delivery Tickets (DT) Manifests" />}

      {/* Ribbon */}
      <div className="bg-white border border-[#b8c9db] rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Logistics &amp; Dispatch</div>
            <h1 className="text-sm font-bold text-[#1a3055]">Delivery Tickets (DT) Manifests</h1>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-slate-200">
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold">
              Total: {dtBatches.length}
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 text-[11px] font-semibold border border-blue-200">
              On Rig: {dtBatches.filter((b) => (b.toolLines || []).some((t) => (t.status || (t.rtBatchId ? 'Returned' : 'OnRig')) === 'OnRig')).length}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="h-7 px-3 rounded bg-white text-slate-700 border border-slate-300 font-semibold text-xs hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              title="Refresh live data from server"
            >
              <span>🔄</span>
              <span>Refresh</span>
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => {
                setNewDtNumber(nextDtNumber);
                setCheckedToolIds([]);
                onOpenNewDT();
              }}
              className="h-7 px-3 rounded bg-[#1a3055] text-white font-bold text-xs hover:bg-[#24426d] shadow-2xs transition cursor-pointer flex items-center gap-1.5"
            >
              <span>+</span>
              <span>New Delivery Ticket</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs & Search & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex bg-slate-100 rounded-md border border-[#b8c9db] p-0.5">
          <button
            onClick={() => setTab('onrig')}
            className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
              tab === 'onrig' ? 'bg-[#1a3055] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tools On Rig ({dtBatches.filter((b) => (b.toolLines || []).some((t) => (t.status || (t.rtBatchId ? 'Returned' : 'OnRig')) === 'OnRig')).length})
          </button>
          <button
            onClick={() => setTab('all')}
            className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
              tab === 'all' ? 'bg-[#1a3055] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Tickets ({dtBatches.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search DT #, job, rig, well, RM ref, serial..."
            className="bg-white border border-[#b8c9db] rounded px-2.5 py-1 text-xs w-64 outline-none font-medium focus:ring-1 focus:ring-amber-400 shadow-2xs"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-xs text-slate-500 hover:text-slate-800 font-bold underline cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* DT List (Clean, Professional, Compact Ledger) */}
      <div className="bg-white border border-[#b8c9db] rounded-lg overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/80 text-[#1a3055] border-b border-[#b8c9db] font-bold select-none text-[11px]">
              <tr>
                <th
                  onClick={() => handleSortToggle('dtNumber')}
                  className="px-2.5 py-1.5 cursor-pointer hover:bg-slate-200/70 whitespace-nowrap"
                >
                  DT Number {sortField === 'dtNumber' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('jobId')}
                  className="px-2.5 py-1.5 cursor-pointer hover:bg-slate-200/70 whitespace-nowrap"
                >
                  Job # {sortField === 'jobId' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('rig')}
                  className="px-2.5 py-1.5 cursor-pointer hover:bg-slate-200/70 whitespace-nowrap"
                >
                  Rig / Well {sortField === 'rig' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('contract')}
                  className="px-2.5 py-1.5 cursor-pointer hover:bg-slate-200/70 whitespace-nowrap"
                >
                  Contract # {sortField === 'contract' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="px-2.5 py-1.5 whitespace-nowrap">RM Ref</th>
                <th
                  onClick={() => handleSortToggle('date')}
                  className="px-2.5 py-1.5 cursor-pointer hover:bg-slate-200/70 whitespace-nowrap"
                >
                  Dispatch Date {sortField === 'date' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="px-2.5 py-1.5 text-center whitespace-nowrap">Signed Copy</th>
                <th className="px-2.5 py-1.5 text-center whitespace-nowrap">Total Tools</th>
                <th className="px-2.5 py-1.5 text-center whitespace-nowrap">On Rig</th>
                <th className="px-2.5 py-1.5 text-center whitespace-nowrap">Returned</th>
                <th className="px-2.5 py-1.5 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
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
                      <td className="px-2.5 py-1.5 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-900 group-hover:text-blue-700 transition">
                          {b.dtNumber}
                        </span>
                      </td>
                      <td className="px-2.5 py-1.5 font-mono text-[11px] text-blue-700 font-semibold whitespace-nowrap">{b.jobId}</td>
                      <td className="px-2.5 py-1.5 text-slate-800 whitespace-nowrap">
                        <span className="font-bold text-slate-900">{b.rig}</span>{' '}
                        <span className="text-slate-400 font-normal">|</span>{' '}
                        <span className="font-normal text-slate-700">{b.well}</span>
                      </td>
                      <td className="px-2.5 py-1.5 text-slate-800 whitespace-nowrap">
                        {displayContract !== '—' ? (
                          <span className="inline-flex items-center font-mono text-[11px] font-medium text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {displayContract}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">—</span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 font-mono text-slate-500 text-[11px] whitespace-nowrap">{b.rmRef || '—'}</td>
                      <td className="px-2.5 py-1.5 font-mono text-slate-700 whitespace-nowrap">{b.rmDate}</td>
                      <td className="px-2.5 py-1.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {b.isSigned || b.signedDocUrl ? (
                          <button
                            type="button"
                            onClick={() => setAttachTargetDT(b)}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200 cursor-pointer shadow-2xs"
                            title="Click to view or replace signed ticket"
                          >
                            <span>✓</span> Signed Copy
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setAttachTargetDT(b)}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 cursor-pointer shadow-2xs"
                            title="Click to attach signed and stamped ticket"
                          >
                            <span>📎</span> Attach Signed
                          </button>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 font-mono font-bold text-center whitespace-nowrap">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 text-[11px] font-bold border border-slate-200">
                          {b.toolLines?.length || 0}
                        </span>
                      </td>
                      <td className="px-2.5 py-1.5 font-mono font-bold text-center whitespace-nowrap">
                        {onRig > 0 ? (
                          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[11px] font-bold border border-blue-200">
                            {onRig}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">0</span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 font-mono text-center whitespace-nowrap">
                        {ret > 0 ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-200">
                            {ret}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal">0</span>
                        )}
                      </td>
                      <td className="px-2.5 py-1.5 text-center space-x-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDTId(b.id);
                            setModalToolSearch('');
                          }}
                          className="h-6 px-2 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-[11px] border border-blue-200 cursor-pointer transition shadow-2xs"
                          title="Open full ticket details window"
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintDT(b)}
                          className="h-6 px-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-medium border border-slate-300 cursor-pointer transition shadow-2xs"
                          title="Print Official Delivery Ticket (Form DSF-001)"
                        >
                          Print DT
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintDispatchChecklist(b)}
                          className="h-6 px-2 rounded bg-amber-50 hover:bg-amber-100 text-amber-900 text-[11px] font-medium border border-amber-300 cursor-pointer transition shadow-2xs"
                          title="Print Official Dispatch Checklist (Form DSF-003)"
                        >
                          Checklist
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
                  <label className="block font-bold mb-1 text-slate-700">Select Drilling Job *</label>
                  <JobSearchSelect
                    jobs={activeJobs}
                    selectedJobId={newJobId}
                    onSelectJob={(jobId) => {
                      setNewJobId(jobId);
                      setCheckedToolIds([]);
                    }}
                    placeholder="— Type to search & select job —"
                    buttonClassName="py-1.5 px-2.5 font-bold"
                  />
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

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800">
                    Delivery Ticket Notes &amp; Manifest Remarks (Slings, Protectors, Non-Invoiced Spares, Baskets):
                  </label>
                  <span className="text-[10px] text-slate-500 font-medium">
                    Prints on Delivery Ticket DSF-001 under "Notes :"
                  </span>
                </div>
                <textarea
                  rows={3}
                  placeholder="Mention items with no invoicing value to print on the Delivery Ticket (e.g. 2 nos 3-meter lifting slings, 4 shackles, thread protectors installed, basket #EMD-04, spare O-rings, transport notes)..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full bg-white border border-[#9fb6cf] rounded p-2.5 text-xs text-slate-800 leading-relaxed font-mono shadow-inner outline-none focus:ring-1 focus:ring-blue-500"
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
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base tracking-wide text-white">
                          Delivery Ticket: <span className="text-amber-400 font-mono">{selectedDTDetail.dtNumber}</span>
                        </h3>
                        {selectedDTDetail.isLocked === true ? (
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
              const isDTLocked = selectedDTDetail.isLocked === true;
              const modalContract = getDisplayContract(selectedDTDetail);
              // Convert stored date (may be DD-MM-YYYY from older records) → YYYY-MM-DD for <input type="date">
              const toInputDate = (d: string | undefined): string => {
                if (!d) return '';
                if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;            // already YYYY-MM-DD
                const m = d.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
                if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
                return '';
              };
              // ADNOC Drilling pool contract gate — all AD Ticket No UI is conditional on this
              const isAdnocPool = modalContract === '4700024096';
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
                      <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Dispatch / Delivery Date</span>
                      {isDTLocked ? (
                        <span className="font-mono text-slate-700 text-xs">{selectedDTDetail.rmDate || '—'}</span>
                      ) : (
                        <input
                          type="date"
                          value={dispatchDateEdit || toInputDate(selectedDTDetail.rmDate)}
                          onChange={(e) => setDispatchDateEdit(e.target.value)}
                          onBlur={(e) => {
                            if (!onUpdateDTBatch) return;
                            const val = e.target.value;
                            if (val !== toInputDate(selectedDTDetail.rmDate)) {
                              onUpdateDTBatch({
                                ...selectedDTDetail,
                                rmDate: val,
                                dispatchDate: val,
                              });
                            }
                          }}
                          className="mt-0.5 w-full bg-white border border-blue-300 rounded px-1.5 py-0.5 text-xs font-mono text-slate-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      )}
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
                        canEdit && (
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
                  {!isDTLocked && editingDTId === selectedDTDetail.id && canEdit && (
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
                            <th className="px-3 py-2">Asset No</th>
                            <th className="px-3 py-2">Serial #</th>
                            <th className="px-3 py-2">Size</th>
                            <th className="px-3 py-2">Tool Type</th>
                            <th className="px-3 py-2">Description</th>
                            <th className="px-3 py-2">Owner</th>
                            <th className="px-3 py-2 text-center">Status</th>
                            {/* AD Ticket No column — ADNOC Drilling pool contract 4700024096 only */}
                            {isAdnocPool && (
                              <th className="px-3 py-2 text-center whitespace-nowrap">AD Ticket No</th>
                            )}
                            {!isDTLocked && canEdit && (
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
                              const sKey = (t.serial || '').trim().toUpperCase();
                              const aKey = (t.assetNo || '').trim().toUpperCase();
                              const invTool = (sKey ? inventoryMap.get(sKey) : undefined) || (aKey ? inventoryMap.get(aKey) : undefined);
                              const assetNo = invTool?.assetNo || t.assetNo || '';
                              const toolType = invTool?.shortDesc || t.shortDesc || '';
                              const desc = invTool?.desc || t.desc || (t as any).toolDescription || '';
                              const sz = t.size || invTool?.size || '';
                              const owner = t.ownership || invTool?.ownership || '';
                              return (
                                t.serial?.toLowerCase().includes(q) ||
                                assetNo.toLowerCase().includes(q) ||
                                toolType.toLowerCase().includes(q) ||
                                desc.toLowerCase().includes(q) ||
                                sz.toLowerCase().includes(q) ||
                                owner.toLowerCase().includes(q)
                              );
                            });

                            if (filteredModalTools.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={(!isDTLocked && user?.role === 'Admin' ? 9 : 8) + (isAdnocPool ? 1 : 0)} className="p-8 text-center text-slate-400 font-medium">
                                    {allTools.length === 0
                                      ? 'No tool lines recorded for this delivery ticket.'
                                      : 'No tools match your search filter.'}
                                  </td>
                                </tr>
                              );
                            }

                            return filteredModalTools.map((t, i) => {
                              const sKey = (t.serial || '').trim().toUpperCase();
                              const aKey = (t.assetNo || '').trim().toUpperCase();
                              const invTool = (sKey ? inventoryMap.get(sKey) : undefined) || (aKey ? inventoryMap.get(aKey) : undefined);
                              
                              // Resolve by serial/assetNo/SystemID/OEM serial only - NO description
                              // guessing. A description match can silently substitute a DIFFERENT
                              // physical tool (e.g. EMD-6380 -> an unrelated tool with similar text),
                              // which is exactly what made the same item resolve differently on the
                              // Checklist vs. the Delivery Ticket. If nothing resolves, show what is
                              // stored - that record needs a data correction, not an invented match.
                              let assetNo = '';
                              if (invTool?.assetNo && invTool.assetNo.trim() && !invTool.assetNo.toUpperCase().startsWith('EMD-')) assetNo = invTool.assetNo.trim();
                              else if (t.assetNo && t.assetNo.trim() && !t.assetNo.trim().toUpperCase().startsWith('EMD-')) assetNo = t.assetNo.trim();
                              else if (invTool?.oemSerial && invTool.oemSerial.trim() && !invTool.oemSerial.toUpperCase().startsWith('EMD-')) assetNo = invTool.oemSerial.trim();
                              else if (invTool?.serial && !invTool.serial.toUpperCase().startsWith('EMD-')) assetNo = invTool.serial;
                              else if (t.serial && !t.serial.toUpperCase().startsWith('EMD-')) assetNo = t.serial;
                              else {
                                assetNo = (invTool?.assetNo && !invTool.assetNo.toUpperCase().startsWith('EMD-') ? invTool.assetNo : '') ||
                                          (t.assetNo && !t.assetNo.toUpperCase().startsWith('EMD-') ? t.assetNo : '') ||
                                          (t.serial && !t.serial.toUpperCase().startsWith('EMD-') ? t.serial : '') ||
                                          invTool?.assetNo || t.assetNo || t.serial || '—';
                              }

                               const displaySize = invTool?.size || (t as any).size || '—';
                              const toolType = invTool?.shortDesc?.trim() || t.shortDesc?.trim() || 'Downhole Tool';
                              let description = '';
                              if (invTool?.desc && invTool.desc.trim()) description = invTool.desc.trim();
                              else if (t.desc && t.desc.trim() && t.desc.trim().toUpperCase() !== toolType.toUpperCase()) description = t.desc.trim();
                              else if ((t as any).toolDescription && (t as any).toolDescription.trim()) description = (t as any).toolDescription.trim();
                              else description = toolType;
                              const displayOwnership =
                                (invTool?.supplier && invTool.supplier.trim().toUpperCase() !== 'EMDAD' ? invTool.supplier.trim() : '') ||
                                (invTool?.ownership && invTool.ownership.trim().toUpperCase() !== 'EMDAD' ? invTool.ownership.trim() : '') ||
                                (invTool && invTool.isEmdad === false ? (invTool.ownership || invTool.supplier || 'Sub-Contractor') : '') ||
                                (t.supplier && t.supplier.trim().toUpperCase() !== 'EMDAD' ? t.supplier.trim() : '') ||
                                (t.ownership && t.ownership.trim().toUpperCase() !== 'EMDAD' ? t.ownership.trim() : '') ||
                                invTool?.supplier ||
                                invTool?.ownership ||
                                t.supplier ||
                                t.ownership ||
                                'EMDAD';
                              const statusVal = t.status || (t.rtBatchId ? 'Returned' : 'OnRig');
                              const isOnRig = statusVal === 'OnRig';

                              return (
                                <tr key={i} className="hover:bg-slate-50 transition">
                                  <td className="px-3 py-2 text-slate-400 font-mono text-[11px]">{i + 1}</td>
                                  <td className="px-3 py-2 font-mono font-bold text-slate-900">{assetNo}</td>
                                  <td className="px-3 py-2 font-mono font-semibold text-amber-900">{t.serial}</td>
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
                                  {/* AD Ticket No cell — ADNOC Drilling pool contract 4700024096 only */}
                                  {isAdnocPool && (
                                    <td className="px-3 py-2 text-center whitespace-nowrap">
                                      {isDTLocked ? (
                                        <span className="font-mono text-[11px] text-slate-700">{t.clientDtNo || '—'}</span>
                                      ) : (
                                        <input
                                          type="text"
                                          value={clientDtNoEdits[t.serial] ?? (t.clientDtNo || '')}
                                          onChange={(e) =>
                                            setClientDtNoEdits((prev) => ({ ...prev, [t.serial]: e.target.value }))
                                          }
                                          onBlur={(e) => {
                                            const val = e.target.value;
                                            if (val !== (t.clientDtNo || '')) {
                                              handleSaveClientDtNo(selectedDTDetail, i, val);
                                            }
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                          }}
                                          placeholder="Enter AD DT#"
                                          className="w-28 px-2 py-1 rounded border border-slate-300 text-[11px] font-mono bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                                        />
                                      )}
                                    </td>
                                  )}
                                  {!isDTLocked && canEdit && (
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

                  {/* Delivery Ticket Notes & Non-Invoiced Manifest Items (same like Job header) */}
                  <div className="p-3 bg-[#f8fafc] rounded-lg border border-[#b8cce0] text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-800">
                        Delivery Ticket Notes &amp; Manifest Remarks (Slings, Protectors, Non-Invoiced Spares, Baskets):
                      </label>
                      <span className="text-[10px] text-slate-500 font-medium">
                        These notes print directly on Delivery Ticket DSF-001 under "Notes :"
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      value={dtEditNotes}
                      disabled={isReadOnly}
                      onChange={(e) => setDtEditNotes(e.target.value)}
                      onBlur={() => {
                        if (!isReadOnly) handleSaveDTDetailNotes();
                      }}
                      placeholder="Enter items with no invoicing value to print on the Delivery Ticket (e.g. 2 nos 3-meter lifting slings, 4 shackles, thread protectors, basket #EMD-04, spare O-rings)..."
                      className="w-full bg-white border border-[#9fb6cf] rounded p-2.5 text-xs text-slate-800 leading-relaxed font-mono shadow-inner outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50"
                    />
                    {!isReadOnly && (
                      <div className="flex justify-end items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSaveDTDetailNotes}
                          className="bg-[#1a3055] hover:bg-[#24426d] text-white font-bold text-xs px-3.5 py-1.5 rounded shadow-2xs transition cursor-pointer flex items-center gap-1.5"
                        >
                          <span>💾</span>
                          <span>Save Delivery Ticket Notes</span>
                        </button>
                      </div>
                    )}
                  </div>
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
                  title="Print Official Delivery Ticket (Form DSF-001)"
                >
                  <span>🖨</span> Print Delivery Ticket
                </button>
                <button
                  type="button"
                  onClick={() => handlePrintDispatchChecklist(selectedDTDetail)}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-100 text-amber-900 font-bold hover:bg-amber-200 border border-amber-300 cursor-pointer transition flex items-center gap-1.5 shadow-2xs"
                  title="Print Official Dispatch Checklist (Form DSF-003)"
                >
                  <span>📋</span> Print Dispatch Checklist
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
          title="Delivery Ticket & Manifest Attachments"
          subtitle={`Rig: ${attachTargetDT.rig} | Well: ${attachTargetDT.well} | Job: ${attachTargetDT.jobId}`}
          referenceNumber={attachTargetDT.dtNumber}
          sourceType="DT"
          existingAttachments={attachTargetDT.attachments}
          currentDocUrl={attachTargetDT.signedDocUrl}
          currentDocName={attachTargetDT.signedDocName}
          currentSignedDate={attachTargetDT.signedDate}
          isSigned={attachTargetDT.isSigned}
          onSaveAttachments={(attachments) => {
            const primary = attachments[0];
            const updated: DTBatch = {
              ...attachTargetDT,
              isSigned: attachments.length > 0,
              signedDocUrl: primary?.url || '',
              signedDocName: primary?.name || '',
              signedDate: primary?.uploadDate || attachTargetDT.signedDate,
              attachments,
              notes: attachTargetDT.notes
                ? `${attachTargetDT.notes}\n[${attachments.length} Document(s) attached by ${user?.name || 'User'}: ${attachments.map(a => a.name).join(', ')}]`
                : `[${attachments.length} Document(s) attached by ${user?.name || 'User'}: ${attachments.map(a => a.name).join(', ')}]`,
            };
            if (onUpdateDTBatch) {
              onUpdateDTBatch(updated);
            }
            setAttachTargetDT(null);
          }}
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
