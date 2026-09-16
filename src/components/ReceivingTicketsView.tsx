import React, { useState, useMemo } from 'react';
import { RTBatch, RTLine, DTBatch, ToolItem, User, DrillingJob, Callout } from '../types';
import { extractSizeFromDescription, extractToolType } from '../services/api';
import { DocumentAttachmentModal } from './DocumentAttachmentModal';

interface ReceivingTicketsViewProps {
  user?: User | null;
  rtBatches: RTBatch[];
  dtBatches: DTBatch[];
  inventory: ToolItem[];
  jobs?: DrillingJob[];
  callouts?: Callout[];
  contracts?: any[];
  onSaveRTBatch: (batch: RTBatch) => void;
  onUpdateRTBatch?: (batch: RTBatch) => void;
  isNewRTOpen?: boolean;
  onCloseNewRT?: () => void;
  onOpenNewRT?: () => void;
}

export const ReceivingTicketsView: React.FC<ReceivingTicketsViewProps> = ({
  user,
  rtBatches,
  dtBatches,
  inventory,
  jobs = [],
  callouts = [],
  contracts = [],
  onSaveRTBatch,
  onUpdateRTBatch,
}) => {
  // Tabs: 'all' (default ledger of all RTs, exactly like Delivery Tickets) or 'onrig' (tools currently on rig awaiting backload)
  const [tab, setTab] = useState<'all' | 'onrig'>('all');
  const [search, setSearch] = useState('');
  const [selectedRTDetail, setSelectedRTDetail] = useState<RTBatch | null>(null);
  const [modalToolSearch, setModalToolSearch] = useState('');

  // Document Attachment Modal state
  const [attachTargetRT, setAttachTargetRT] = useState<RTBatch | null>(null);

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

  // Helper to determine the best display Contract # for an RT
  const getDisplayContract = useMemo(() => {
    return (r: RTBatch): string => {
      const resolveContract = (value?: unknown): string | null => {
        const key = String(value || '').trim();
        if (!key || ['—', 'null', 'undefined'].includes(key.toLowerCase())) return null;
        const match = contractMap.get(key.toUpperCase());
        return match?.contractNo || null;
      };

      const direct = (r.contract || '').trim();
      const directContract = resolveContract(direct);
      if (directContract) return directContract;

      if (r.jobId) {
        const job = jobMap.get(r.jobId.trim().toUpperCase());
        if (job) {
          const jobContract = resolveContract(job.contract);
          if (jobContract) return jobContract;

          if (job.calloutId) {
            const cal = calloutMap.get(job.calloutId.trim().toUpperCase());
            const calloutContract = resolveContract(cal?.contract);
            if (calloutContract) return calloutContract;
          }

          const clientContracts = contracts?.filter(
            (c: any) => c.client?.trim().toUpperCase() === job.client?.trim().toUpperCase()
          ) || [];
          if (clientContracts.length === 1 && clientContracts[0].contractNo) {
            return clientContracts[0].contractNo;
          }
        }
      }

      return direct && direct !== '—' ? direct : '—';
    };
  }, [contractMap, jobMap, calloutMap, contracts]);

  // Next RT Number Generator
  const nextRtNumber = useMemo(() => {
    const curYr = new Date().getFullYear().toString().slice(-2);
    const rtNums = rtBatches
      .map((b) => {
        const m = b.rtNumber.match(/^RT-\d+-(\d+)$/);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const nextSeq = rtNums.length > 0 ? Math.max(...rtNums) + 1 : 1;
    return `RT-${curYr}-${String(nextSeq).padStart(5, '0')}`;
  }, [rtBatches]);

  // Group tools on rig by Rig & Well
  const rigGroups = useMemo(() => {
    const map: Record<
      string,
      {
        rig: string;
        well: string;
        contract?: string;
        jobId: string;
        tools: Array<{
          serial: string;
          assetNo: string;
          shortDesc: string;
          size: string;
          ownership: string;
          dtNumber: string;
          dtDate: string;
          dtBatchId: string;
          jobId: string;
        }>;
      }
    > = {};

    dtBatches.forEach((b) => {
      (b.toolLines || []).forEach((t) => {
        const isCurrentlyOnRig = (t.status || (t.rtBatchId ? 'Returned' : 'OnRig')) === 'OnRig';
        if (isCurrentlyOnRig) {
          const k = `${b.rig}|||${b.well}`;
          if (!map[k]) {
            map[k] = { rig: b.rig, well: b.well, contract: b.contract, jobId: b.jobId, tools: [] };
          }
          map[k].tools.push({
            serial: t.serial,
            assetNo: t.assetNo,
            shortDesc: t.shortDesc,
            size: t.size,
            ownership: t.ownership,
            dtNumber: b.dtNumber,
            dtDate: b.rmDate,
            dtBatchId: b.id,
            jobId: b.jobId,
          });
        }
      });
    });

    return Object.entries(map).map(([key, val]) => ({ key, ...val }));
  }, [dtBatches]);

  const totalToolsOnRig = useMemo(() => {
    return rigGroups.reduce((acc, g) => acc + g.tools.length, 0);
  }, [rigGroups]);

  const totalReturnedCount = useMemo(() => {
    return rtBatches.reduce((acc, r) => acc + (r.toolLines?.length || 0), 0);
  }, [rtBatches]);

  // RT Creation Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedRigKey, setSelectedRigKey] = useState<string>('');
  const [checkedSerialMap, setCheckedSerialMap] = useState<Record<string, boolean>>({});
  const [usedStateMap, setUsedStateMap] = useState<Record<string, boolean>>({});
  const [newRtNumber, setNewRtNumber] = useState('');
  const [newRtDate, setNewRtDate] = useState(new Date().toISOString().split('T')[0]);
  const [newBackloadRmDate, setNewBackloadRmDate] = useState(new Date().toISOString().split('T')[0]);
  const [newReceivedBy, setNewReceivedBy] = useState(user?.name || 'QC Inspector');
  const [newCondition, setNewCondition] = useState('');

  // Expand state for On-Rig rows in tab 'onrig'
  const [expandedRigKeys, setExpandedRigKeys] = useState<Record<string, boolean>>({});

  // Sorting
  const [sortField, setSortField] = useState<'rtNumber' | 'jobId' | 'rig' | 'contract' | 'date'>('rtNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSortToggle = (field: 'rtNumber' | 'jobId' | 'rig' | 'contract' | 'date') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const extractRTSeq = (str: string) => {
    const m = (str || '').match(/(\d+)/g);
    return m ? parseInt(m[m.length - 1], 10) : 0;
  };

  // Filtered & Sorted RT Batches
  const filteredRTs = useMemo(() => {
    let list = [...rtBatches];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => {
        const contractStr = getDisplayContract(r);
        const textMatch = `${r.rtNumber} ${r.jobId} ${r.rig} ${r.well} ${contractStr} ${r.contract || ''} ${r.receivedBy || ''}`
          .toLowerCase()
          .includes(q);
        const toolMatch = (r.toolLines || []).some(
          (t) =>
            t.serial?.toLowerCase().includes(q) ||
            t.shortDesc?.toLowerCase().includes(q) ||
            (t as any).toolDescription?.toLowerCase().includes(q) ||
            t.size?.toLowerCase().includes(q)
        );
        return textMatch || toolMatch;
      });
    }

    return list.sort((a, b) => {
      let diff = 0;
      if (sortField === 'rtNumber') {
        diff = extractRTSeq(a.rtNumber) - extractRTSeq(b.rtNumber);
      } else if (sortField === 'jobId') {
        diff = extractRTSeq(a.jobId) - extractRTSeq(b.jobId);
      } else if (sortField === 'rig') {
        diff = `${a.rig} ${a.well}`.localeCompare(`${b.rig} ${b.well}`);
      } else if (sortField === 'contract') {
        diff = getDisplayContract(a).localeCompare(getDisplayContract(b));
      } else if (sortField === 'date') {
        diff = (a.rtDate || '').localeCompare(b.rtDate || '');
      }
      return sortOrder === 'desc' ? -diff : diff;
    });
  }, [rtBatches, search, sortField, sortOrder, getDisplayContract]);

  // Open Create Modal for a specific Rig
  const handleOpenCreateForRig = (rigKey: string) => {
    setSelectedRigKey(rigKey);
    const grp = rigGroups.find((g) => g.key === rigKey);
    const initChecked: Record<string, boolean> = {};
    const initUsed: Record<string, boolean> = {};
    if (grp) {
      grp.tools.forEach((t) => {
        initChecked[t.serial] = true; // Preselect all tools by default
        initUsed[t.serial] = true;    // Preselect Used by default
      });
    }
    setCheckedSerialMap(initChecked);
    setUsedStateMap(initUsed);
    setNewRtNumber(nextRtNumber);
    setNewRtDate(new Date().toISOString().split('T')[0]);
    setNewBackloadRmDate(new Date().toISOString().split('T')[0]);
    setNewReceivedBy(user?.name || 'QC Inspector');
    setNewCondition('');
    setIsCreateModalOpen(true);
  };

  // Open Create Modal from top ribbon button
  const handleOpenNewRT = () => {
    const firstRigKey = rigGroups.length > 0 ? rigGroups[0].key : '';
    handleOpenCreateForRig(firstRigKey);
  };

  const handleConfirmCreateRT = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRigKey) {
      alert('Please select a Rig with tools currently operating on rig.');
      return;
    }
    const grp = rigGroups.find((g) => g.key === selectedRigKey);
    if (!grp) return;

    const checkedTools = grp.tools.filter((t) => checkedSerialMap[t.serial]);
    if (checkedTools.length === 0) {
      alert('Please check at least one tool to receive back into inventory.');
      return;
    }

    const unassigned = checkedTools.filter((t) => usedStateMap[t.serial] === undefined);
    if (unassigned.length > 0) {
      alert('Please mark each checked tool as Used or Not Used.');
      return;
    }

    const lines: RTLine[] = checkedTools.map((t) => {
      const isUsed = usedStateMap[t.serial] === true;
      return {
        serial: t.serial,
        assetNo: t.assetNo,
        shortDesc: t.shortDesc,
        size: t.size,
        ownership: t.ownership,
        dtBatchId: t.dtBatchId,
        used: isUsed,
        routedTo: isUsed ? 'Inspection Bay' : 'Emdad Base',
        condition: newCondition.trim() || (isUsed ? 'Used - Pending QC' : 'Good / Standby'),
      };
    });

    const newRT: RTBatch = {
      id: `RTB-${Date.now()}`,
      rtNumber: newRtNumber.trim() || nextRtNumber,
      jobId: checkedTools[0]?.jobId || grp.jobId || '',
      rtDate: newRtDate,
      backloadRmDate: newBackloadRmDate,
      contract: grp.contract,
      rig: grp.rig,
      well: grp.well,
      receivedBy: newReceivedBy.trim() || user?.name || 'QC Inspector',
      toolLines: lines,
      condition: newCondition.trim(),
    };

    onSaveRTBatch(newRT);
    setIsCreateModalOpen(false);
    setSelectedRigKey('');
    setCheckedSerialMap({});
    setTab('all'); // Switch to All Tickets view
    setSelectedRTDetail(newRT); // Open the detail modal for immediate confirmation
  };

  const handlePrintRT = (b: RTBatch) => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      alert('Please allow popups to print Receiving Tickets.');
      return;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Receiving Ticket - ${b.rtNumber}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; padding: 24px; color: #1e293b; }
  .hdr { display: flex; justify-content: space-between; border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 16px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
  .box { border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px 10px; background: #f8fafc; }
  .lbl { font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 2px; }
  .val { font-size: 12px; font-weight: bold; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 11px; }
  th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
  th { background: #f1f5f9; font-weight: bold; }
  .sig { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 36px; padding-top: 10px; }
  .sig-box { border-top: 1px solid #0f172a; padding-top: 6px; font-size: 10px; }
</style>
</head>
<body>
  <div class="hdr">
    <div>
      <h1 style="font-size: 18px; margin: 0 0 2px; color: #1a3055;">EMDAD OILFIELD SERVICES LLC</h1>
      <div style="color: #64748b; font-size: 10px;">Backload Equipment Receiving Manifest</div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 20px; font-weight: 900; color: #059669; font-family: monospace;">${b.rtNumber}</div>
      <div style="font-size: 10px; font-weight: bold; color: #64748b;">RECEIVING TICKET (RT)</div>
    </div>
  </div>

  <div class="grid">
    <div class="box"><div class="lbl">Drilling Job Number</div><div class="val">${b.jobId || '—'}</div></div>
    <div class="box"><div class="lbl">Rig &amp; Well</div><div class="val">${b.rig} / ${b.well}</div></div>
    <div class="box"><div class="lbl">Master Contract</div><div class="val">${getDisplayContract(b)}</div></div>
    <div class="box"><div class="lbl">Receiving Date</div><div class="val">${b.rtDate}</div></div>
    <div class="box"><div class="lbl">Backload RM (Rental Stop) Date</div><div class="val">${b.backloadRmDate || b.rtDate}</div></div>
    <div class="box"><div class="lbl">Received By (Base Officer)</div><div class="val">${b.receivedBy}</div></div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 30px;">#</th>
        <th>Serial / System ID</th>
        <th>Size</th>
        <th>Tool Category</th>
        <th>Condition &amp; Usage</th>
        <th>Routed Destination</th>
      </tr>
    </thead>
    <tbody>
      ${(b.toolLines || [])
        .map(
          (t, i) => `<tr>
        <td>${i + 1}</td>
        <td style="font-family: monospace; font-weight: bold;">${t.serial}</td>
        <td style="font-family: monospace;">${t.size || '—'}</td>
        <td>${t.shortDesc || (t as any).toolDescription || 'Downhole Tool'}</td>
        <td><strong>${t.used ? 'Used' : 'Not Used'}</strong> - ${t.condition || 'Good'}</td>
        <td>${t.routedTo}</td>
      </tr>`
        )
        .join('')}
    </tbody>
  </table>

  <div class="sig">
    <div class="sig-box">Received By (EMDAD Base)<br/><br/><strong>${b.receivedBy}</strong></div>
    <div class="sig-box">QC Inspection Bay Officer<br/><br/>_______________________</div>
    <div class="sig-box">Operations Verification<br/><br/>_______________________</div>
  </div>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  // Currently selected rig group inside create modal
  const activeModalRigGroup = useMemo(() => {
    return rigGroups.find((g) => g.key === selectedRigKey) || null;
  }, [rigGroups, selectedRigKey]);

  return (
    <div className="space-y-3">
      {/* Ribbon: Exactly matching Delivery Tickets ribbon */}
      <div className="bg-white border border-[#b8c9db] rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Logistics &amp; Backload</div>
            <h1 className="text-sm font-bold text-[#1a3055]">Receiving Tickets (RT) Manifests</h1>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-slate-200">
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold">
              Total: {rtBatches.length}
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-[11px] font-semibold border border-emerald-200">
              Returned: {totalReturnedCount}
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 text-[11px] font-semibold border border-blue-200">
              On Rig: {totalToolsOnRig}
            </span>
          </div>
        </div>
        {user?.role !== 'Viewer' && (
          <button
            onClick={handleOpenNewRT}
            className="h-7 px-3 rounded bg-[#1a3055] text-white font-bold text-xs hover:bg-[#24426d] shadow-2xs transition cursor-pointer flex items-center gap-1.5"
            title="Receive backloaded tools from rig site and generate RT"
          >
            <span>+</span>
            <span>New Receiving Ticket</span>
          </button>
        )}
      </div>

      {/* Tabs & Search & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex bg-slate-100 rounded-md border border-[#b8c9db] p-0.5">
          <button
            onClick={() => setTab('all')}
            className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
              tab === 'all' ? 'bg-[#1a3055] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Tickets ({rtBatches.length})
          </button>
          <button
            onClick={() => setTab('onrig')}
            className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
              tab === 'onrig' ? 'bg-[#1a3055] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tools On Rig ({totalToolsOnRig})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search RT #, job, rig, well, contract, serial..."
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

      {/* Primary Content: TAB ALL (Clean, Compact Ledger matching Delivery Tickets) */}
      {tab === 'all' && (
        <div className="bg-white border border-[#b8c9db] rounded-lg overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/80 text-[#1a3055] border-b border-[#b8c9db] font-bold select-none text-[11px]">
                <tr>
                  <th
                    onClick={() => handleSortToggle('rtNumber')}
                    className="px-2.5 py-1.5 cursor-pointer hover:bg-slate-200/70 whitespace-nowrap"
                  >
                    RT Number {sortField === 'rtNumber' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
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
                  <th className="px-2.5 py-1.5 whitespace-nowrap">Backload RM Date</th>
                  <th
                    onClick={() => handleSortToggle('date')}
                    className="px-2.5 py-1.5 cursor-pointer hover:bg-slate-200/70 whitespace-nowrap"
                  >
                    Received Date {sortField === 'date' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                  </th>
                  <th className="px-2.5 py-1.5 text-center whitespace-nowrap">Signed Copy</th>
                  <th className="px-2.5 py-1.5 text-center whitespace-nowrap">Total Tools</th>
                  <th className="px-2.5 py-1.5 text-center whitespace-nowrap">Used</th>
                  <th className="px-2.5 py-1.5 text-center whitespace-nowrap">Not Used</th>
                  <th className="px-2.5 py-1.5 text-center whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRTs.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-8 text-center text-slate-500 font-medium">
                      No receiving tickets found.
                    </td>
                  </tr>
                ) : (
                  filteredRTs.map((r) => {
                    const totalTools = r.toolLines?.length || 0;
                    const usedCount = (r.toolLines || []).filter((t) => t.used).length;
                    const notUsedCount = totalTools - usedCount;
                    const displayContract = getDisplayContract(r);
                    const isSelected = selectedRTDetail?.id === r.id;

                    return (
                      <tr
                        key={r.id}
                        onClick={() => {
                          setSelectedRTDetail(r);
                          setModalToolSearch('');
                        }}
                        className={`transition cursor-pointer ${
                          isSelected ? 'bg-amber-50/70' : 'hover:bg-blue-50/40'
                        }`}
                        title="Click to view full ticket details and returned tools"
                      >
                        <td className="px-2.5 py-1.5 whitespace-nowrap">
                          <span className="font-mono font-bold text-slate-900 hover:text-blue-700 transition">
                            {r.rtNumber}
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-[11px] text-blue-700 font-semibold whitespace-nowrap">
                          {r.jobId || '—'}
                        </td>
                        <td className="px-2.5 py-1.5 text-slate-800 whitespace-nowrap">
                          <span className="font-bold text-slate-900">{r.rig}</span>{' '}
                          <span className="text-slate-400 font-normal">|</span>{' '}
                          <span className="font-normal text-slate-700">{r.well}</span>
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
                        <td className="px-2.5 py-1.5 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                          {r.backloadRmDate || '—'}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-slate-700 whitespace-nowrap">
                          {r.rtDate}
                        </td>
                        <td className="px-2.5 py-1.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {r.isSigned || r.signedDocUrl ? (
                            <button
                              type="button"
                              onClick={() => setAttachTargetRT(r)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200 cursor-pointer shadow-2xs"
                              title="Click to view or replace signed ticket"
                            >
                              <span>✓</span> Signed Copy
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAttachTargetRT(r)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 cursor-pointer shadow-2xs"
                              title="Click to attach signed and stamped receiving ticket"
                            >
                              <span>📎</span> Attach Signed
                            </button>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono font-bold text-center whitespace-nowrap">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-800 text-[11px] font-bold border border-slate-200">
                            {totalTools}
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5 font-mono font-bold text-center whitespace-nowrap">
                          {usedCount > 0 ? (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[11px] font-bold border border-amber-300">
                              {usedCount}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">0</span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono text-center whitespace-nowrap">
                          {notUsedCount > 0 ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-200">
                              {notUsedCount}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-normal">0</span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 text-center space-x-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedRTDetail(r);
                              setModalToolSearch('');
                            }}
                            className="h-6 px-2 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-[11px] border border-blue-200 cursor-pointer transition shadow-2xs"
                            title="Open full ticket details window"
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintRT(r)}
                            className="h-6 px-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-medium border border-slate-300 cursor-pointer transition shadow-2xs"
                            title="Print Receiving Ticket"
                          >
                            Print
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
      )}

      {/* Secondary Content: TAB ON RIG (Clean Table of Rigs awaiting return with one-click Receive action) */}
      {tab === 'onrig' && (
        <div className="bg-white border border-[#b8c9db] rounded-lg overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/80 text-[#1a3055] border-b border-[#b8c9db] font-bold select-none text-[11px]">
                <tr>
                  <th className="px-2.5 py-1.5 whitespace-nowrap">Rig / Well</th>
                  <th className="px-2.5 py-1.5 whitespace-nowrap">Linked Job #</th>
                  <th className="px-2.5 py-1.5 whitespace-nowrap">Contract #</th>
                  <th className="px-2.5 py-1.5 text-center whitespace-nowrap">Tools On Rig</th>
                  <th className="px-2.5 py-1.5 whitespace-nowrap">Latest DT Ref</th>
                  <th className="px-2.5 py-1.5 text-center whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rigGroups.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-500 font-medium">
                      No tools currently mobilized to rig. All tools are located at EMDAD Base or in QC inspection.
                    </td>
                  </tr>
                ) : (
                  rigGroups.map((grp) => {
                    const isExpanded = Boolean(expandedRigKeys[grp.key]);
                    const latestDT = grp.tools[0]?.dtNumber || '—';

                    return (
                      <React.Fragment key={grp.key}>
                        <tr className="hover:bg-blue-50/40 transition">
                          <td className="px-2.5 py-2 font-bold text-slate-900 whitespace-nowrap">
                            <span>{grp.rig}</span>{' '}
                            <span className="text-slate-400 font-normal">|</span>{' '}
                            <span className="font-normal text-slate-700">{grp.well}</span>
                          </td>
                          <td className="px-2.5 py-2 font-mono text-[11px] text-blue-700 font-semibold whitespace-nowrap">
                            {grp.jobId || '—'}
                          </td>
                          <td className="px-2.5 py-2 text-slate-700 whitespace-nowrap">
                            <span className="inline-flex items-center font-mono text-[11px] font-medium text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              {grp.contract || '—'}
                            </span>
                          </td>
                          <td className="px-2.5 py-2 text-center whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-mono text-[11px] font-bold border border-blue-200">
                              {grp.tools.length} Tools on Rig
                            </span>
                          </td>
                          <td className="px-2.5 py-2 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                            {latestDT}
                          </td>
                          <td className="px-2.5 py-2 text-center space-x-2 whitespace-nowrap">
                            {user?.role !== 'Viewer' && (
                              <button
                                type="button"
                                onClick={() => handleOpenCreateForRig(grp.key)}
                                className="h-6 px-2.5 rounded bg-emerald-700 text-white hover:bg-emerald-800 font-bold text-[11px] cursor-pointer shadow-2xs transition inline-flex items-center gap-1"
                              >
                                <span>+ Receive Tools</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedRigKeys((prev) => ({
                                  ...prev,
                                  [grp.key]: !prev[grp.key],
                                }))
                              }
                              className="h-6 px-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium border border-slate-300 cursor-pointer transition shadow-2xs"
                            >
                              {isExpanded ? 'Hide Tools ▲' : 'View Tools ▼'}
                            </button>
                          </td>
                        </tr>

                        {/* Inline Tools Breakdown when expanded */}
                        {isExpanded && (
                          <tr className="bg-slate-50">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="border border-slate-200 rounded-md overflow-hidden bg-white shadow-2xs">
                                <table className="w-full text-left text-xs border-collapse">
                                  <thead className="bg-slate-100 text-slate-700 font-semibold text-[11px] border-b border-slate-200">
                                    <tr>
                                      <th className="px-2.5 py-1.5">#</th>
                                      <th className="px-2.5 py-1.5">Serial #</th>
                                      <th className="px-2.5 py-1.5">Size</th>
                                      <th className="px-2.5 py-1.5">Tool Description</th>
                                      <th className="px-2.5 py-1.5">Ownership</th>
                                      <th className="px-2.5 py-1.5">Dispatched DT</th>
                                      <th className="px-2.5 py-1.5">Dispatch Date</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {grp.tools.map((t, idx) => (
                                      <tr key={t.serial} className="hover:bg-slate-50">
                                        <td className="px-2.5 py-1 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                                        <td className="px-2.5 py-1 font-mono font-bold text-amber-900">{t.serial}</td>
                                        <td className="px-2.5 py-1 font-mono">{t.size || '—'}</td>
                                        <td className="px-2.5 py-1 font-medium text-slate-800">{t.shortDesc}</td>
                                        <td className="px-2.5 py-1 text-slate-600">{t.ownership || 'EMDAD'}</td>
                                        <td className="px-2.5 py-1 font-mono text-blue-700 text-[11px]">{t.dtNumber}</td>
                                        <td className="px-2.5 py-1 font-mono text-slate-600">{t.dtDate}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
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
      )}

      {/* New Receiving Ticket Modal (Structured like New Delivery Ticket Manifest Modal) */}
      {isCreateModalOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreateModalOpen(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="font-bold text-base tracking-wide text-white">
                  New Receiving Ticket (RT) Manifest
                </h3>
                <div className="text-xs text-slate-300 mt-0.5">
                  Process returned downhole equipment from rig and log rental cessation
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 text-xl font-bold transition cursor-pointer"
                title="Close"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleConfirmCreateRT} className="p-5 space-y-4 overflow-y-auto text-xs flex-1">
              {/* Rig & Well Selection */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">
                    Select Rig &amp; Well (Tools on Rig) *
                  </label>
                  <select
                    value={selectedRigKey}
                    onChange={(e) => {
                      const newKey = e.target.value;
                      setSelectedRigKey(newKey);
                      const grp = rigGroups.find((g) => g.key === newKey);
                      const initChecked: Record<string, boolean> = {};
                      const initUsed: Record<string, boolean> = {};
                      if (grp) {
                        grp.tools.forEach((t) => {
                          initChecked[t.serial] = true;
                          initUsed[t.serial] = true;
                        });
                      }
                      setCheckedSerialMap(initChecked);
                      setUsedStateMap(initUsed);
                    }}
                    required
                    className="w-full bg-white border border-[#b8c9db] rounded px-2.5 py-1.5 font-bold text-slate-900 outline-none focus:ring-1 focus:ring-amber-400"
                  >
                    <option value="">-- Choose Rig with Tools On Rig --</option>
                    {rigGroups.map((grp) => (
                      <option key={grp.key} value={grp.key}>
                        {grp.rig} | {grp.well} ({grp.tools.length} tools on rig) &bull; Job: {grp.jobId}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Linked Contract #
                  </label>
                  <div className="bg-slate-100 border border-slate-200 rounded px-2.5 py-1.5 font-mono text-slate-800 font-bold">
                    {activeModalRigGroup?.contract || 'Standard Master'}
                  </div>
                </div>
              </div>

              {/* Tools on Rig Checklist */}
              {activeModalRigGroup ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-[#1a3055] text-xs uppercase tracking-wider">
                        Select Tools Received Back to Base ({activeModalRigGroup.tools.length} Available on Rig)
                      </h4>
                      <span className="text-[11px] text-slate-500">
                        Check the tools being unloaded and indicate whether they were Used in the well.
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const all: Record<string, boolean> = {};
                          activeModalRigGroup.tools.forEach((t) => (all[t.serial] = true));
                          setCheckedSerialMap(all);
                        }}
                        className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold text-[11px] border border-slate-300 cursor-pointer"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setCheckedSerialMap({})}
                        className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold text-[11px] border border-slate-300 cursor-pointer"
                      >
                        Deselect All
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          const all: Record<string, boolean> = {};
                          activeModalRigGroup.tools.forEach((t) => (all[t.serial] = true));
                          setUsedStateMap(all);
                        }}
                        className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 hover:bg-amber-100 font-semibold text-[11px] border border-amber-300 cursor-pointer"
                      >
                        All Used
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const all: Record<string, boolean> = {};
                          activeModalRigGroup.tools.forEach((t) => (all[t.serial] = false));
                          setUsedStateMap(all);
                        }}
                        className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 hover:bg-emerald-100 font-semibold text-[11px] border border-emerald-300 cursor-pointer"
                      >
                        All Not Used
                      </button>
                    </div>
                  </div>

                  <div className="border border-[#b8c9db] rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-[#1a3055] font-bold border-b border-[#b8c9db] sticky top-0 text-[11px]">
                        <tr>
                          <th className="p-2 w-10 text-center">Receive</th>
                          <th className="p-2">Serial #</th>
                          <th className="p-2">Size</th>
                          <th className="p-2">Description</th>
                          <th className="p-2">Ownership</th>
                          <th className="p-2 text-center">Usage Condition</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeModalRigGroup.tools.map((t) => {
                          const isChecked = Boolean(checkedSerialMap[t.serial]);
                          const isUsed = usedStateMap[t.serial] === true;

                          return (
                            <tr
                              key={t.serial}
                              className={`hover:bg-blue-50/50 transition ${
                                isChecked ? 'bg-amber-50/30' : ''
                              }`}
                            >
                              <td className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) =>
                                    setCheckedSerialMap((prev) => ({
                                      ...prev,
                                      [t.serial]: e.target.checked,
                                    }))
                                  }
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                                />
                              </td>
                              <td className="p-2 font-mono font-bold text-amber-900">{t.serial}</td>
                              <td className="p-2 font-mono">{t.size || '—'}</td>
                              <td className="p-2 text-slate-800">{t.shortDesc}</td>
                              <td className="p-2 text-slate-600">{t.ownership || 'EMDAD'}</td>
                              <td className="p-2 text-center">
                                {isChecked ? (
                                  <div className="inline-flex rounded-md shadow-2xs border border-slate-200 overflow-hidden text-[11px]">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setUsedStateMap((prev) => ({
                                          ...prev,
                                          [t.serial]: true,
                                        }))
                                      }
                                      className={`px-2 py-0.5 font-bold transition cursor-pointer ${
                                        isUsed
                                          ? 'bg-amber-600 text-white'
                                          : 'bg-white text-slate-600 hover:bg-slate-100'
                                      }`}
                                    >
                                      Used
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setUsedStateMap((prev) => ({
                                          ...prev,
                                          [t.serial]: false,
                                        }))
                                      }
                                      className={`px-2 py-0.5 font-bold transition cursor-pointer ${
                                        !isUsed
                                          ? 'bg-emerald-600 text-white'
                                          : 'bg-white text-slate-600 hover:bg-slate-100'
                                      }`}
                                    >
                                      Not Used
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">Not Selected</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-lg text-slate-500">
                  Select a rig from the dropdown above to load tools currently on rig.
                </div>
              )}

              {/* RT Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">RT Number *</label>
                  <input
                    type="text"
                    required
                    value={newRtNumber}
                    onChange={(e) => setNewRtNumber(e.target.value)}
                    className="w-full bg-white border border-[#b8c9db] rounded px-2.5 py-1.5 font-mono font-bold text-slate-900 outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">RT Receiving Date *</label>
                  <input
                    type="date"
                    required
                    value={newRtDate}
                    onChange={(e) => setNewRtDate(e.target.value)}
                    className="w-full bg-white border border-[#b8c9db] rounded px-2.5 py-1.5 font-mono text-slate-800 outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>

                <div>
                  <label className="block font-bold text-emerald-800 mb-1">
                    Backload RM (Rental Stop) Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newBackloadRmDate}
                    onChange={(e) => setNewBackloadRmDate(e.target.value)}
                    className="w-full bg-white border border-emerald-400 rounded px-2.5 py-1.5 font-mono text-emerald-900 font-bold outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Received By (Officer) *</label>
                  <input
                    type="text"
                    required
                    value={newReceivedBy}
                    onChange={(e) => setNewReceivedBy(e.target.value)}
                    className="w-full bg-white border border-[#b8c9db] rounded px-2.5 py-1.5 font-medium text-slate-800 outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Return Condition &amp; QC Inspection Remarks
                </label>
                <input
                  type="text"
                  placeholder="e.g. Normal thread wear, seal surfaces intact; 1 tool scheduled for standard MPI redressing."
                  value={newCondition}
                  onChange={(e) => setNewCondition(e.target.value)}
                  className="w-full bg-white border border-[#b8c9db] rounded px-2.5 py-1.5 text-slate-800 outline-none focus:ring-1 focus:ring-amber-400"
                />
              </div>

              {/* Modal Footer */}
              <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                <span className="text-slate-500 text-[11px]">
                  {activeModalRigGroup
                    ? `${Object.values(checkedSerialMap).filter(Boolean).length} tool(s) selected for receiving`
                    : ''}
                </span>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="px-3.5 py-1.5 rounded-lg bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer transition shadow-2xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!activeModalRigGroup || Object.values(checkedSerialMap).filter(Boolean).length === 0}
                    className="px-4 py-1.5 rounded-lg bg-[#1a3055] text-white font-bold hover:bg-[#24426d] disabled:opacity-50 cursor-pointer transition shadow-2xs flex items-center gap-1.5"
                  >
                    <span>Confirm Backload &amp; Generate RT &rarr;</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RT Detail Window (Full Detail Modal matching Delivery Tickets) */}
      {selectedRTDetail && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedRTDetail(null);
          }}
        >
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-5 py-3.5 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base tracking-wide text-white">
                    Receiving Ticket: <span className="text-amber-400 font-mono">{selectedRTDetail.rtNumber}</span>
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/50">
                    ✓ Returned to Base / Routed
                  </span>
                </div>
                <div className="text-xs text-slate-300 mt-0.5">
                  Job <span className="font-mono text-blue-300">{selectedRTDetail.jobId}</span> &bull; Rig <span className="font-bold text-white">{selectedRTDetail.rig}</span> &bull; Well <span className="font-normal text-white">{selectedRTDetail.well}</span> &bull; Received by <span className="font-semibold text-white">{selectedRTDetail.receivedBy}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintRT(selectedRTDetail)}
                  className="px-2.5 py-1 rounded text-xs font-bold bg-white/10 text-white border border-white/20 hover:bg-white/20 cursor-pointer transition"
                  title="Print Receiving Ticket"
                >
                  Print Document
                </button>
                <button
                  onClick={() => setSelectedRTDetail(null)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 text-xl font-bold transition cursor-pointer"
                  title="Close Window (Esc)"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="p-5 space-y-4 overflow-y-auto text-xs flex-1">
              {/* Metadata Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">RT Number</span>
                  <span className="font-bold text-[#1a3055] text-xs font-mono">{selectedRTDetail.rtNumber}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Job ID</span>
                  <span className="font-bold text-blue-700 text-xs font-mono">{selectedRTDetail.jobId || '—'}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Rig</span>
                  <span className="font-bold text-slate-900 text-xs">{selectedRTDetail.rig}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Well</span>
                  <span className="font-normal text-slate-800 text-xs">{selectedRTDetail.well}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">RT Date</span>
                  <span className="font-mono text-slate-700 text-xs">{selectedRTDetail.rtDate}</span>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-slate-500 block text-[10px] uppercase tracking-wider">Backload RM Date</span>
                  <span className="font-mono text-slate-700 text-xs">{selectedRTDetail.backloadRmDate || '—'}</span>
                </div>
              </div>

              {/* Tools Manifest */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-[#1a3055]">
                    Returned Tools Manifest ({selectedRTDetail.toolLines?.length || 0} Tools)
                  </h4>
                  <div className="text-[11px] text-slate-500">
                    Received By: <strong className="text-slate-800">{selectedRTDetail.receivedBy}</strong> &bull; Contract: <strong className="text-slate-800">{getDisplayContract(selectedRTDetail)}</strong>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-[#1a3055] font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 w-12 text-center">#</th>
                        <th className="px-3 py-2">Serial Number</th>
                        <th className="px-3 py-2">Size</th>
                        <th className="px-3 py-2">Tool Category</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2">Ownership</th>
                        <th className="px-3 py-2 text-center">Usage</th>
                        <th className="px-3 py-2">Routing Destination</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedRTDetail.toolLines || []).map((t, idx) => {
                        const invTool = t.serial ? inventoryMap.get(t.serial.trim().toUpperCase()) : undefined;
                        const toolType = extractToolType(t.shortDesc || invTool?.shortDesc || '');
                        const displaySize = t.size || invTool?.size || extractSizeFromDescription(t.shortDesc || '') || '—';

                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition">
                            <td className="px-3 py-2 text-slate-400 font-mono text-[11px] text-center">{idx + 1}</td>
                            <td className="px-3 py-2 font-mono font-bold text-amber-900">{t.serial}</td>
                            <td className="px-3 py-2 font-mono font-semibold text-slate-800">{displaySize}</td>
                            <td className="px-3 py-2 font-bold text-[#1a3055] whitespace-nowrap">{toolType}</td>
                            <td className="px-3 py-2 text-slate-700 text-xs">{t.shortDesc || (t as any).toolDescription || 'Downhole Tool'}</td>
                            <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{t.ownership || invTool?.ownership || 'EMDAD'}</td>
                            <td className="px-3 py-2 text-center whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  t.used
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                }`}
                              >
                                {t.used ? 'Used' : 'Not Used'}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">
                              {t.routedTo || (t.used ? 'Inspection Bay' : 'Emdad Base')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Remarks */}
              {selectedRTDetail.condition && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                  <strong className="text-slate-700 block mb-1">Return Condition &amp; QC Remarks:</strong>
                  <div className="text-slate-600 font-mono text-[11px] bg-white p-2.5 rounded border border-slate-200">
                    {selectedRTDetail.condition}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center flex-shrink-0 text-xs">
              <button
                type="button"
                onClick={() => handlePrintRT(selectedRTDetail)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-200 text-slate-800 font-bold hover:bg-slate-300 cursor-pointer transition flex items-center gap-1.5 shadow-2xs"
              >
                <span>🖨</span> Print Receiving Ticket
              </button>
              <button
                type="button"
                onClick={() => setSelectedRTDetail(null)}
                className="px-4 py-1.5 rounded-lg bg-[#1a3055] text-white font-bold hover:bg-[#24426d] cursor-pointer transition shadow-2xs"
              >
                Close Window
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Attachment Modal */}
      {attachTargetRT && (
        <DocumentAttachmentModal
          title="Receiving Ticket Attachment"
          subtitle={`Rig: ${attachTargetRT.rig} | Well: ${attachTargetRT.well} | Job: ${attachTargetRT.jobId}`}
          referenceNumber={attachTargetRT.rtNumber}
          currentDocUrl={attachTargetRT.signedDocUrl}
          currentDocName={attachTargetRT.signedDocName}
          currentSignedDate={attachTargetRT.signedDate}
          isSigned={attachTargetRT.isSigned}
          onSave={({ docUrl, docName, signedDate }) => {
            const updated: RTBatch = {
              ...attachTargetRT,
              isSigned: Boolean(docUrl),
              signedDocUrl: docUrl,
              signedDocName: docName,
              signedDate: signedDate || new Date().toISOString().split('T')[0],
            };
            if (onUpdateRTBatch) {
              onUpdateRTBatch(updated);
            } else {
              onSaveRTBatch(updated);
            }
            setAttachTargetRT(null);
          }}
          onClose={() => setAttachTargetRT(null)}
        />
      )}
    </div>
  );
};
