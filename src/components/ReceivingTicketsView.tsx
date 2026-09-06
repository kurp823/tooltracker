import React, { useState, useMemo } from 'react';
import { RTBatch, RTLine, DTBatch, ToolItem, User } from '../types';

interface ReceivingTicketsViewProps {
  user?: User | null;
  rtBatches: RTBatch[];
  dtBatches: DTBatch[];
  inventory: ToolItem[];
  onSaveRTBatch: (batch: RTBatch) => void;
}

export const ReceivingTicketsView: React.FC<ReceivingTicketsViewProps> = ({
  user,
  rtBatches,
  dtBatches,
  inventory,
  onSaveRTBatch,
}) => {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [search, setSearch] = useState('');
  const [selectedRTDetail, setSelectedRTDetail] = useState<RTBatch | null>(null);

  // Collapsible state (Request #7: default display is collapsed)
  const [openRigKeys, setOpenRigKeys] = useState<Record<string, boolean>>({});
  const [openHistoryKeys, setOpenHistoryKeys] = useState<Record<string, boolean>>({});

  // RT Creation State
  const [selectedRigKey, setSelectedRigKey] = useState<string | null>(null);
  const [usedStateMap, setUsedStateMap] = useState<Record<string, boolean>>({});
  const [checkedSerialMap, setCheckedSerialMap] = useState<Record<string, boolean>>({});
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newRtNumber, setNewRtNumber] = useState('');
  const [newRtDate, setNewRtDate] = useState(new Date().toISOString().split('T')[0]);
  const [newBackloadRmDate, setNewBackloadRmDate] = useState(new Date().toISOString().split('T')[0]);
  const [newReceivedBy, setNewReceivedBy] = useState(user?.name || 'QC Inspector');
  const [newCondition, setNewCondition] = useState('');

  // Next RT Number
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

  // Aggregate tools on rig grouped by Rig & Well
  const rigGroups = useMemo(() => {
    const map: Record<
      string,
      {
        rig: string;
        well: string;
        contract?: string;
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
      b.toolLines.forEach((t) => {
        if (t.status === 'OnRig') {
          const k = `${b.rig}|||${b.well}|||${b.contract || ''}`;
          if (!map[k]) {
            map[k] = { rig: b.rig, well: b.well, contract: b.contract, tools: [] };
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

  const filteredRigGroups = useMemo(() => {
    if (!search.trim()) return rigGroups;
    const q = search.toLowerCase();
    return rigGroups.filter((g) =>
      `${g.rig} ${g.well} ${g.contract || ''}`.toLowerCase().includes(q)
    );
  }, [rigGroups, search]);

  const openCreateModalForRig = (grpKey: string) => {
    const grp = rigGroups.find((g) => g.key === grpKey);
    if (!grp) return;

    const checkedTools = grp.tools.filter((t) => checkedSerialMap[t.serial]);
    if (checkedTools.length === 0) {
      alert('Please check at least one tool from this rig to receive.');
      return;
    }

    const unassignedUsed = checkedTools.filter((t) => usedStateMap[t.serial] === undefined);
    if (unassignedUsed.length > 0) {
      alert('Please select whether each checked tool was "Used" or "Not Used".');
      return;
    }

    setSelectedRigKey(grpKey);
    setNewRtNumber(nextRtNumber);
    setIsCreateModalOpen(true);
  };

  const handleConfirmCreateRT = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRigKey) return;
    const grp = rigGroups.find((g) => g.key === selectedRigKey);
    if (!grp) return;

    const checkedTools = grp.tools.filter((t) => checkedSerialMap[t.serial]);
    if (checkedTools.length === 0) return;

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
        condition: newCondition.trim() || (isUsed ? 'Used - Pending Inspection' : 'Good / Standby'),
      };
    });

    const newRT: RTBatch = {
      id: `RTB-${Date.now()}`,
      rtNumber: newRtNumber.trim() || nextRtNumber,
      jobId: checkedTools[0]?.jobId || '',
      rtDate: newRtDate,
      backloadRmDate: newBackloadRmDate,
      contract: grp.contract,
      rig: grp.rig,
      well: grp.well,
      receivedBy: newReceivedBy.trim() || user?.name || 'QC Inspector',
      toolLines: lines,
    };

    onSaveRTBatch(newRT);
    setIsCreateModalOpen(false);
    setSelectedRigKey(null);
    setCheckedSerialMap({});
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
    <div class="box"><div class="lbl">Master Contract</div><div class="val">${b.contract || '—'}</div></div>
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
      ${b.toolLines
        .map(
          (t, i) => `<tr>
        <td>${i + 1}</td>
        <td style="font-family: monospace; font-weight: bold;">${t.serial}</td>
        <td style="font-family: monospace;">${t.size || '—'}</td>
        <td>${t.shortDesc}</td>
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

  const [sortField, setSortField] = useState<'rtNumber' | 'jobId' | 'rig' | 'date'>('rtNumber');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const handleSortToggle = (field: 'rtNumber' | 'jobId' | 'rig' | 'date') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const sortedRTBatches = useMemo(() => {
    let list = [...rtBatches];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        `${r.rtNumber} ${r.jobId} ${r.rig} ${r.well} ${r.contract || ''} ${r.receivedBy}`
          .toLowerCase()
          .includes(q)
      );
    }
    return list.sort((a, b) => {
      let diff = 0;
      if (sortField === 'rtNumber') {
        const seqA = parseInt(a.rtNumber.replace(/\D/g, ''), 10) || 0;
        const seqB = parseInt(b.rtNumber.replace(/\D/g, ''), 10) || 0;
        diff = seqA - seqB;
      } else if (sortField === 'jobId') {
        const seqA = parseInt(a.jobId.replace(/\D/g, ''), 10) || 0;
        const seqB = parseInt(b.jobId.replace(/\D/g, ''), 10) || 0;
        diff = seqA - seqB;
      } else if (sortField === 'rig') {
        diff = `${a.rig} ${a.well}`.localeCompare(`${b.rig} ${b.well}`);
      } else if (sortField === 'date') {
        diff = (a.rtDate || '').localeCompare(b.rtDate || '');
      }
      return sortOrder === 'desc' ? -diff : diff;
    });
  }, [rtBatches, search, sortField, sortOrder]);

  return (
    <div className="space-y-4">
      {/* Ribbon */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="text-[11px] text-slate-500 font-medium">Backload &amp; Receiving</div>
          <h1 className="text-base font-bold text-[#1a3055]">Receiving Tickets (RT) Manifests</h1>
        </div>
        <div className="text-slate-500 text-xs font-bold">
          {rtBatches.length} RT Batches Recorded
        </div>
      </div>

      {/* Tabs & Search & Expand/Collapse All */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex bg-white rounded border border-[#b8c9db] p-0.5">
          <button
            onClick={() => setTab('pending')}
            className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
              tab === 'pending' ? 'bg-[#1a3055] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🛢 Pending Return from Rig ({rigGroups.reduce((s, g) => s + g.tools.length, 0)} tools on rig)
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
              tab === 'history' ? 'bg-[#1a3055] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📄 RT Receiving History ({rtBatches.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {tab === 'pending' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  const all: Record<string, boolean> = {};
                  filteredRigGroups.forEach((g) => {
                    all[g.key] = true;
                  });
                  setOpenRigKeys(all);
                }}
                className="px-2.5 py-1 text-xs font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer"
              >
                ▼ Expand All Rigs
              </button>
              <button
                type="button"
                onClick={() => setOpenRigKeys({})}
                className="px-2.5 py-1 text-xs font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer"
              >
                ▲ Collapse All
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  const all: Record<string, boolean> = {};
                  rtBatches.forEach((r) => {
                    all[r.id] = true;
                  });
                  setOpenHistoryKeys(all);
                }}
                className="px-2.5 py-1 text-xs font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer"
              >
                ▼ Expand All RTs
              </button>
              <button
                type="button"
                onClick={() => setOpenHistoryKeys({})}
                className="px-2.5 py-1 text-xs font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition cursor-pointer"
              >
                ▲ Collapse All
              </button>
            </>
          )}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rig, well, contract, RT #..."
            className="bg-white border border-[#b8c9db] rounded px-3 py-1 text-xs w-60 outline-none font-medium focus:ring-1 focus:ring-amber-400"
          />
        </div>
      </div>

      {tab === 'pending' ? (
        filteredRigGroups.length === 0 ? (
          <div className="bg-white border border-[#b8c9db] rounded p-12 text-center text-slate-500 font-medium shadow-sm">
            No tools currently operating on rig. All tools are at base or in workshop.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRigGroups.map((grp) => {
              const isOpen = Boolean(openRigKeys[grp.key]);

              return (
                <div key={grp.key} className="bg-white border border-[#b8c9db] rounded overflow-hidden shadow-sm">
                  <div
                    className="px-4 py-2.5 bg-[#dbe6f1] border-b border-[#b8c9db] flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-[#d0dfec] transition select-none"
                    onClick={() =>
                      setOpenRigKeys((prev) => ({
                        ...prev,
                        [grp.key]: !prev[grp.key],
                      }))
                    }
                  >
                    <div className="flex items-center space-x-3">
                      <span className="text-slate-500 font-bold text-xs">{isOpen ? '▲' : '▼'}</span>
                      <span className="font-bold text-sm text-[#1a3055]">
                        {grp.rig} <span className="text-slate-400 font-normal">|</span> {grp.well}
                      </span>
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">
                        {grp.contract || 'Direct Contract'}
                      </span>
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
                        {grp.tools.length} Tools on Rig
                      </span>
                    </div>

                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {user?.role !== 'Viewer' && (
                        <button
                          onClick={() => openCreateModalForRig(grp.key)}
                          className="px-3 py-1 rounded bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 shadow-xs cursor-pointer"
                        >
                          Receive Checked Tools &rarr;
                        </button>
                      )}
                    </div>
                  </div>

                  {isOpen && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 text-[#24476b] border-b border-[#b8c9db] font-bold">
                          <tr>
                            <th className="px-3 py-2 w-10 text-center">Receive</th>
                            <th className="px-3 py-2">Serial</th>
                            <th className="px-3 py-2">Size</th>
                            <th className="px-3 py-2">Tool Category</th>
                            <th className="px-3 py-2">Job #</th>
                            <th className="px-3 py-2">DT #</th>
                            <th className="px-3 py-2">Dispatched Date</th>
                            <th className="px-3 py-2">Ownership</th>
                            <th className="px-3 py-2 text-center">Mark Usage</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#e2e8f0]">
                          {grp.tools.map((t) => {
                            const isChecked = checkedSerialMap[t.serial] === true;
                            const usedStatus = usedStateMap[t.serial];

                            return (
                              <tr key={t.serial} className="hover:bg-[#e4eef8] transition">
                                <td className="px-3 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) =>
                                      setCheckedSerialMap({
                                        ...checkedSerialMap,
                                        [t.serial]: e.target.checked,
                                      })
                                    }
                                    className="cursor-pointer"
                                  />
                                </td>
                                <td className="px-3 py-2 font-mono font-bold text-amber-900">{t.serial}</td>
                                <td className="px-3 py-2 font-mono">{t.size}</td>
                                <td className="px-3 py-2 font-semibold text-[#1a3055]">{t.shortDesc}</td>
                                <td className="px-3 py-2 font-mono text-[10px] text-blue-700">{t.jobId}</td>
                                <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{t.dtNumber}</td>
                                <td className="px-3 py-2 font-mono">{t.dtDate}</td>
                                <td className="px-3 py-2 font-bold text-slate-500">{t.ownership}</td>
                                <td className="px-3 py-2 text-center">
                                  <div className="inline-flex rounded border border-slate-300 p-0.5 space-x-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setUsedStateMap({ ...usedStateMap, [t.serial]: true });
                                        setCheckedSerialMap({ ...checkedSerialMap, [t.serial]: true });
                                      }}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
                                        usedStatus === true
                                          ? 'bg-amber-500 text-white'
                                          : 'text-slate-600 hover:bg-slate-100'
                                      }`}
                                    >
                                      Used
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setUsedStateMap({ ...usedStateMap, [t.serial]: false });
                                        setCheckedSerialMap({ ...checkedSerialMap, [t.serial]: true });
                                      }}
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition ${
                                        usedStatus === false
                                          ? 'bg-emerald-600 text-white'
                                          : 'text-slate-600 hover:bg-slate-100'
                                      }`}
                                    >
                                      Not Used
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* History Table (Default Collapsed with Expandable Manifests) */
        <div className="bg-white border border-[#b8c9db] rounded overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-[#24476b] border-b border-[#b8c9db] font-bold select-none">
                <tr>
                  <th className="px-2 py-2 w-8 text-center"></th>
                  <th
                    onClick={() => handleSortToggle('rtNumber')}
                    className="px-3 py-2 cursor-pointer hover:bg-slate-100"
                  >
                    RT Number {sortField === 'rtNumber' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
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
                  <th
                    onClick={() => handleSortToggle('date')}
                    className="px-3 py-2 cursor-pointer hover:bg-slate-100"
                  >
                    Received Date {sortField === 'date' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                  </th>
                  <th className="px-3 py-2 text-center">Tools Received</th>
                  <th className="px-3 py-2">Received By</th>
                  <th className="px-3 py-2 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2e8f0]">
                {rtBatches.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500 font-medium">
                      No receiving tickets on record yet.
                    </td>
                  </tr>
                ) : (
                  sortedRTBatches.map((r) => {
                    const isHistoryOpen = Boolean(openHistoryKeys[r.id]);

                    return (
                      <React.Fragment key={r.id}>
                        <tr
                          className={`transition cursor-pointer ${
                            isHistoryOpen ? 'bg-[#edf4fb]' : 'hover:bg-[#f3f7fb]'
                          }`}
                          onClick={() =>
                            setOpenHistoryKeys((prev) => ({
                              ...prev,
                              [r.id]: !prev[r.id],
                            }))
                          }
                        >
                          <td className="px-2 py-2 text-center text-slate-400 font-bold">
                            {isHistoryOpen ? '▲' : '▼'}
                          </td>
                          <td className="px-3 py-2 font-mono font-bold text-emerald-800">{r.rtNumber}</td>
                          <td className="px-3 py-2 font-mono text-[10px] text-blue-700">{r.jobId}</td>
                          <td className="px-3 py-2 font-medium">
                            {r.rig} <span className="text-slate-400">|</span> {r.well}
                          </td>
                          <td className="px-3 py-2">{r.contract || '—'}</td>
                          <td className="px-3 py-2 font-mono">{r.rtDate}</td>
                          <td className="px-3 py-2 font-mono font-bold text-center">{r.toolLines.length}</td>
                          <td className="px-3 py-2">{r.receivedBy}</td>
                          <td className="px-3 py-2 text-center space-x-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setSelectedRTDetail(r)}
                              className="text-blue-700 hover:underline font-bold text-[11px] cursor-pointer"
                            >
                              View
                            </button>
                            <button
                              onClick={() => handlePrintRT(r)}
                              className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-[10px] font-bold border border-slate-300 cursor-pointer"
                            >
                              🖨 Print
                            </button>
                          </td>
                        </tr>

                        {isHistoryOpen && (
                          <tr className="bg-slate-50/80">
                            <td colSpan={9} className="p-4 border-t border-b border-slate-200">
                              <div className="space-y-2">
                                <div className="font-bold text-[#1a3055] text-xs">
                                  Received Manifest Tools under {r.rtNumber} ({r.toolLines.length} Tools)
                                </div>
                                <div className="border border-[#b8c9db] rounded overflow-hidden bg-white">
                                  <table className="w-full text-left text-xs border-collapse">
                                    <thead className="bg-[#eef3f9] text-[#1a3055] font-bold border-b border-[#b8c9db]">
                                      <tr>
                                        <th className="px-3 py-1.5 w-10">#</th>
                                        <th className="px-3 py-1.5">Serial</th>
                                        <th className="px-3 py-1.5">Size</th>
                                        <th className="px-3 py-1.5">Tool Category</th>
                                        <th className="px-3 py-1.5">Owner</th>
                                        <th className="px-3 py-1.5 text-center">Rig Usage</th>
                                        <th className="px-3 py-1.5 text-center">Post-Return Routing</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                      {r.toolLines.map((t, i) => (
                                        <tr key={i} className="hover:bg-slate-50">
                                          <td className="px-3 py-1.5 text-slate-400 font-mono">{i + 1}</td>
                                          <td className="px-3 py-1.5 font-mono font-bold text-amber-900">{t.serial}</td>
                                          <td className="px-3 py-1.5 font-mono">{t.size}</td>
                                          <td className="px-3 py-1.5 font-semibold text-slate-800">{t.shortDesc}</td>
                                          <td className="px-3 py-1.5 text-slate-600">{t.ownership}</td>
                                          <td className="px-3 py-1.5 text-center">
                                            <span
                                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                t.used ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
                                              }`}
                                            >
                                              {t.used ? 'Used on Well' : 'Standby (Not Used)'}
                                            </span>
                                          </td>
                                          <td className="px-3 py-1.5 text-center">
                                            <span
                                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                t.used
                                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                              }`}
                                            >
                                              {t.used ? '🛠 Routed to QC / Maintenance' : '✓ Restored to Base Ready Stock'}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                {r.condition && (
                                  <div className="text-[11px] text-slate-600 p-2 bg-slate-100 rounded border border-slate-200">
                                    <strong>Receiving Notes:</strong> {r.condition}
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
      )}

      {/* Create RT Modal */}
      {isCreateModalOpen && selectedRigKey && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreateModalOpen(false);
          }}
        >
          <div className="bg-white rounded shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="font-bold text-sm">Generate Receiving Ticket (RT)</h3>
                <div className="text-[11px] text-slate-300">
                  Confirm returned tools condition and rental stop date
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleConfirmCreateRT} className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">RT Number *</label>
                  <input
                    type="text"
                    required
                    value={newRtNumber || nextRtNumber}
                    onChange={(e) => setNewRtNumber(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono font-bold text-emerald-800"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">RT Receiving Date</label>
                  <input
                    type="date"
                    value={newRtDate}
                    onChange={(e) => setNewRtDate(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1 text-emerald-800">
                    Backload RM (Rental Stop) Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newBackloadRmDate}
                    onChange={(e) => setNewBackloadRmDate(e.target.value)}
                    className="w-full border border-emerald-400 rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Received By (Officer)</label>
                  <input
                    type="text"
                    value={newReceivedBy}
                    onChange={(e) => setNewReceivedBy(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">Overall Return Condition &amp; Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Normal thread wear, seal rubbers intact"
                  value={newCondition}
                  onChange={(e) => setNewCondition(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5"
                />
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-sm cursor-pointer"
                >
                  Confirm Backload Receiving &rarr;
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RT Detail Modal */}
      {selectedRTDetail && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedRTDetail(null);
          }}
        >
          <div className="bg-white rounded shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="font-bold text-sm">Receiving Ticket: {selectedRTDetail.rtNumber}</h3>
                <div className="text-[11px] text-slate-300">
                  {selectedRTDetail.rig} / {selectedRTDetail.well} &bull; Received by {selectedRTDetail.receivedBy}
                </div>
              </div>
              <button
                onClick={() => setSelectedRTDetail(null)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="border border-slate-200 rounded overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-[#24476b] border-b border-slate-200 font-bold">
                    <tr>
                      <th className="px-2.5 py-1.5 w-10">#</th>
                      <th className="px-2.5 py-1.5">Serial</th>
                      <th className="px-2.5 py-1.5">Tool</th>
                      <th className="px-2.5 py-1.5">Usage</th>
                      <th className="px-2.5 py-1.5">Destination</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedRTDetail.toolLines.map((t, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-2.5 py-1.5 text-slate-400 font-mono">{i + 1}</td>
                        <td className="px-2.5 py-1.5 font-mono font-bold text-amber-900">{t.serial}</td>
                        <td className="px-2.5 py-1.5 font-semibold text-[#1a3055]">{t.shortDesc}</td>
                        <td className="px-2.5 py-1.5 font-bold">
                          {t.used ? (
                            <span className="text-amber-700">Used</span>
                          ) : (
                            <span className="text-emerald-700">Not Used</span>
                          )}
                        </td>
                        <td className="px-2.5 py-1.5 text-slate-600">{t.routedTo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-[#b8c9db] flex justify-between items-center flex-shrink-0 text-xs">
              <button
                onClick={() => handlePrintRT(selectedRTDetail)}
                className="px-3 py-1.5 rounded bg-slate-200 text-slate-800 font-bold hover:bg-slate-300 cursor-pointer"
              >
                🖨 Print Document
              </button>
              <button
                onClick={() => setSelectedRTDetail(null)}
                className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
