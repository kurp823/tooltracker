import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { ToolItem, DrillingJob, DTBatch, RTBatch } from '../types';
import { JobToolReconRow } from './JobToolsListView';
import { normalizeJobKey } from '../services/api';
import { formatDateDDMMYYYY } from '../utils';
import { SearchableSelect } from './SearchableSelect';

interface ToolHistoryViewProps {
  inventory: ToolItem[];
  jobs: DrillingJob[];
  dtBatches: DTBatch[];
  rtBatches: RTBatch[];
  preSelectedSerial?: string | null;
  onSelectTool?: (serial: string | null) => void;
  onNavigate?: (view: any, param?: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefresh?: () => void;
}

export const ToolHistoryView: React.FC<ToolHistoryViewProps> = ({
  inventory,
  jobs,
  dtBatches,
  rtBatches,
  preSelectedSerial,
  onSelectTool,
  showToast,
  onRefresh,
}) => {
  // Precompute deployment occurrences per tool serial and asset number
  const toolDeploymentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    dtBatches.forEach((dt) => {
      (dt.toolLines || []).forEach((line) => {
        const s = (line.serial || '').trim().toUpperCase();
        const a = (line.assetNo || '').trim().toUpperCase();
        if (s) {
          counts.set(s, (counts.get(s) || 0) + 1);
          counts.set(s.replace(/^EMD-?/i, ''), (counts.get(s.replace(/^EMD-?/i, '')) || 0) + 1);
        }
        if (a) {
          counts.set(a, (counts.get(a) || 0) + 1);
          counts.set(a.replace(/^EMD-?/i, ''), (counts.get(a.replace(/^EMD-?/i, '')) || 0) + 1);
        }
      });
    });
    return counts;
  }, [dtBatches]);

  // Inventory fast lookup by serial and asset number (with and without EMD- prefix)
  const inventoryLookup = useMemo(() => {
    const map = new Map<string, ToolItem>();
    inventory.forEach((t) => {
      const s = (t.serial || '').trim().toUpperCase();
      const a = (t.assetNo || '').trim().toUpperCase();
      if (s) {
        map.set(s, t);
        map.set(s.replace(/^EMD-?/i, ''), t);
      }
      if (a) {
        map.set(a, t);
        map.set(a.replace(/^EMD-?/i, ''), t);
      }
    });
    return map;
  }, [inventory]);

  // Sort inventory: Natural alphanumeric order by Asset No, fallback to Serial Number
  const sortedInventory = useMemo(() => {
    return [...inventory].sort((a, b) => {
      const aKey = (a.assetNo || a.serial || '').trim();
      const bKey = (b.assetNo || b.serial || '').trim();
      return aKey.localeCompare(bKey, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [inventory]);

  const toolSelectOptions = useMemo(() => {
    return sortedInventory.map((t) => {
      const asset = (t.assetNo || '').trim();
      const serial = (t.serial || '').trim();
      const primary = asset || serial;
      const count =
        (serial ? toolDeploymentCounts.get(serial.toUpperCase()) || 0 : 0) ||
        (asset ? toolDeploymentCounts.get(asset.toUpperCase()) || 0 : 0);
      const desc = t.shortDesc || t.desc || (t as any).description || '';
      const sizeStr = t.size ? ` (${t.size})` : '';
      return {
        value: serial || asset,
        label: asset && serial && asset !== serial ? `${asset} (${serial})` : primary,
        subLabel: `${desc}${sizeStr}`.trim(),
        count: `${count} Runs`,
      };
    });
  }, [sortedInventory, toolDeploymentCounts]);

  // Default selected tool: preSelectedSerial or empty ("-- All Tools --")
  const [selectedSerial, setSelectedSerial] = useState<string>(preSelectedSerial || '');

  const handleSelectTool = (val: string) => {
    setSelectedSerial(val);
    if (onSelectTool) {
      onSelectTool(val ? val : null);
    }
  };

  // Table filters & pagination
  const [tableSearchFilter, setTableSearchFilter] = useState('');
  const [remarkFilter, setRemarkFilter] = useState<'All' | 'Used' | 'Not Used' | 'On Rig'>('All');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // 3-dots action menu
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setIsActionMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Update selected tool if preSelectedSerial changes externally
  useEffect(() => {
    setSelectedSerial(preSelectedSerial || '');
    setCurrentPage(1);
  }, [preSelectedSerial]);

  // Reset page when tool selection or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSerial, tableSearchFilter, remarkFilter]);

  // Currently selected tool master record (matches serial, assetNo, with or without EMD- prefix)
  const currentTool = useMemo(() => {
    if (!selectedSerial) return null;
    const clean = selectedSerial.trim().toUpperCase();
    const cleanStrip = clean.replace(/^EMD-?/i, '');
    return (
      inventory.find((t) => {
        const s = (t.serial || '').trim().toUpperCase();
        const a = (t.assetNo || '').trim().toUpperCase();
        const sStrip = s.replace(/^EMD-?/i, '');
        const aStrip = a.replace(/^EMD-?/i, '');
        return s === clean || a === clean || (cleanStrip && (sStrip === cleanStrip || aStrip === cleanStrip));
      }) || null
    );
  }, [selectedSerial, inventory]);

  // Map of jobs by JobID and normalized job key for instant metadata lookup
  const jobsMap = useMemo(() => {
    const map = new Map<string, DrillingJob>();
    jobs.forEach((j) => {
      if (j.id) {
        map.set(j.id.trim().toUpperCase(), j);
        map.set(normalizeJobKey(j.id), j);
      }
      if (j.jobNumber) {
        map.set(j.jobNumber.trim().toUpperCase(), j);
        map.set(normalizeJobKey(j.jobNumber), j);
      }
    });
    return map;
  }, [jobs]);

  // Build movement records: if a tool is selected, show that tool's history; if empty, show all tool movements
  const historyRows = useMemo(() => {
    // Collect all valid keys for the target tool
    const targetKeys = new Set<string>();
    if (currentTool) {
      const s = (currentTool.serial || '').trim().toUpperCase();
      const a = (currentTool.assetNo || '').trim().toUpperCase();
      if (s) {
        targetKeys.add(s);
        targetKeys.add(s.replace(/^EMD-?/i, ''));
      }
      if (a) {
        targetKeys.add(a);
        targetKeys.add(a.replace(/^EMD-?/i, ''));
      }
    } else if (selectedSerial) {
      const s = selectedSerial.trim().toUpperCase();
      targetKeys.add(s);
      targetKeys.add(s.replace(/^EMD-?/i, ''));
    }

    // Map all RT tool lines
    const rtLinesByTicket = new Map<
      string,
      { rtNumber: string; rtDate: string; used: boolean; condition?: string }
    >();

    rtBatches.forEach((rt) => {
      (rt.toolLines || []).forEach((rtl) => {
        const lineSerial = (rtl.serial || '').trim().toUpperCase();
        const lineAsset = (rtl.assetNo || '').trim().toUpperCase();
        const effDate = rt.rtDate || rt.backloadRmDate || rt.loadingNoteDate || rt.lNoteDate || (rtl as any).rtDate || (rtl as any).dateIn || (rtl as any).Date_In || (rtl as any).returnDate || '';
        const entry = {
          rtNumber: rt.rtNumber,
          rtDate: effDate,
          used: Boolean(rtl.used),
          condition: rtl.condition,
        };

        const registerRtKey = (k: string) => {
          if (!k) return;
          rtLinesByTicket.set(`${k}_${rt.rtNumber.trim().toUpperCase()}`, entry);
          const normJob = normalizeJobKey(rt.jobId || rt.jobNumber || '');
          if (normJob) {
            rtLinesByTicket.set(`${k}_JOB_${normJob}`, entry);
          }
        };

        if (lineSerial) {
          registerRtKey(lineSerial);
          registerRtKey(lineSerial.replace(/^EMD-?/i, ''));
        }
        if (lineAsset) {
          registerRtKey(lineAsset);
          registerRtKey(lineAsset.replace(/^EMD-?/i, ''));
        }
      });
    });

    const rows: (JobToolReconRow & { assetNo?: string; serial?: string })[] = [];

    // Find all DTs that included this tool (or all tools if empty)
    dtBatches.forEach((dt) => {
      const lines = dt.toolLines || [];
      lines.forEach((line, idx) => {
        const lineSerial = (line.serial || '').trim().toUpperCase();
        const lineAsset = (line.assetNo || '').trim().toUpperCase();
        const lineSerialStrip = lineSerial.replace(/^EMD-?/i, '');
        const lineAssetStrip = lineAsset.replace(/^EMD-?/i, '');

        const matchedInv = inventoryLookup.get(lineSerial) ||
          inventoryLookup.get(lineAsset) ||
          inventoryLookup.get(lineSerialStrip) ||
          inventoryLookup.get(lineAssetStrip);

        const effectiveAssetNo = line.assetNo || matchedInv?.assetNo || '';
        const effectiveSerial = line.serial || matchedInv?.serial || '';

        // If target specified, verify match across serial, assetNo, and stripped variants
        if (targetKeys.size > 0) {
          const invS = (matchedInv?.serial || '').trim().toUpperCase();
          const invA = (matchedInv?.assetNo || '').trim().toUpperCase();
          const isMatch =
            (lineSerial && targetKeys.has(lineSerial)) ||
            (lineAsset && targetKeys.has(lineAsset)) ||
            (lineSerialStrip && targetKeys.has(lineSerialStrip)) ||
            (lineAssetStrip && targetKeys.has(lineAssetStrip)) ||
            (invS && targetKeys.has(invS)) ||
            (invA && targetKeys.has(invA));
          if (!isMatch) return;
        }

        const jobKey = (dt.jobId || dt.jobNumber || '').trim().toUpperCase();
        const normJob = normalizeJobKey(jobKey);
        const linkedJob = jobsMap.get(jobKey) || jobsMap.get(normJob);

        let retNum = '';
        let retDate = '';
        let remark: 'Used' | 'Not Used' | 'On Rig' = 'On Rig';

        const matchedByJob =
          rtLinesByTicket.get(`${lineSerial}_JOB_${normJob}`) ||
          rtLinesByTicket.get(`${lineAsset}_JOB_${normJob}`) ||
          rtLinesByTicket.get(`${lineSerialStrip}_JOB_${normJob}`) ||
          rtLinesByTicket.get(`${lineAssetStrip}_JOB_${normJob}`);

        if (matchedByJob) {
          retNum = matchedByJob.rtNumber;
          retDate = matchedByJob.rtDate;
          remark = matchedByJob.used ? 'Used' : 'Not Used';
        } else if (line.status === 'Returned' || line.rtBatchId) {
          retNum = line.rtBatchId || 'Returned';
          remark = line.used ? 'Used' : 'Not Used';
        }

        // Show Asset Number primarily; fallback to Serial Number
        const displayPartNum = effectiveAssetNo || effectiveSerial || '—';

        rows.push({
          jobNum: linkedJob?.id || dt.jobId || dt.jobNumber || '—',
          deliveryTicketNum: dt.dtNumber,
          deliveryDate: dt.deliveryDate || dt.rmDate || '',
          sNo: idx + 1,
          partNum: displayPartNum,
          assetNo: effectiveAssetNo,
          serial: effectiveSerial,
          partDescription: line.desc || line.shortDesc || matchedInv?.desc || matchedInv?.shortDesc || currentTool?.desc || 'Drilling Tool',
          returnTicketNum: retNum,
          returnDate: retDate,
          remark,
          rigNum: linkedJob?.rig || dt.rig || '—',
          wellNumber: linkedJob?.well || dt.well || '—',
          toolType: line.shortDesc || matchedInv?.shortDesc,
          size: line.size || matchedInv?.size,
        });
      });
    });

    // Sort most recent delivery date first
    return rows.sort((a, b) => (b.deliveryDate || '').localeCompare(a.deliveryDate || ''));
  }, [selectedSerial, dtBatches, rtBatches, jobsMap, currentTool, inventoryLookup]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return historyRows.filter((r) => {
      if (remarkFilter !== 'All' && r.remark !== remarkFilter) return false;

      if (!tableSearchFilter.trim()) return true;
      const q = tableSearchFilter.toLowerCase();
      return (
        r.partNum.toLowerCase().includes(q) ||
        r.partDescription.toLowerCase().includes(q) ||
        r.jobNum.toLowerCase().includes(q) ||
        r.deliveryTicketNum.toLowerCase().includes(q) ||
        r.returnTicketNum.toLowerCase().includes(q) ||
        r.rigNum.toLowerCase().includes(q) ||
        r.wellNumber.toLowerCase().includes(q)
      );
    });
  }, [historyRows, remarkFilter, tableSearchFilter]);

  // Paged rows
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Summary Metrics
  const totalDeployments = historyRows.length;
  const usedRuns = historyRows.filter((r) => r.remark === 'Used').length;
  const notUsedRuns = historyRows.filter((r) => r.remark === 'Not Used').length;
  const uniqueRigs = new Set(historyRows.map((r) => r.rigNum).filter((rig) => rig && rig !== '—')).size;

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      if (showToast) showToast('No movement records available to export.', 'info');
      return;
    }

    const exportData = filteredRows.map((r) => ({
      JobNum: r.jobNum,
      DeliveryTicketNum: r.deliveryTicketNum,
      DeliveryDate: formatDateDDMMYYYY(r.deliveryDate) || r.deliveryDate,
      'S.No': r.sNo,
      'Asset No / PartNum': r.partNum,
      'Serial No': (r as any).serial || '',
      PartDescription: r.partDescription,
      ReturnTicketNum: r.returnTicketNum || '—',
      ReturnDate: formatDateDDMMYYYY(r.returnDate) || r.returnDate || '—',
      Remark: r.remark,
      RigNum: r.rigNum,
      'Well number': r.wellNumber,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tool_History');

    const fileName = selectedSerial
      ? `ToolHistory_${selectedSerial.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`
      : 'AllTools_MovementHistory.xlsx';

    XLSX.writeFile(wb, fileName);

    if (showToast) {
      showToast(`Exported ${filteredRows.length} movement records to ${fileName}`, 'success');
    }
    setIsActionMenuOpen(false);
  };

  return (
    <div className="space-y-3.5 w-full animate-fade-in text-slate-800">
      {/* Sleek, Professional Header Banner */}
      <div className="bg-white rounded-lg border border-slate-200/90 px-4 py-3 shadow-xs flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
            OPERATIONS • ASSET LIFECYCLE LEDGER
          </div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight">
            Tool Movement History
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              title="Refresh Tool Movement History from Azure SQL / Database"
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>🔄</span>
              <span>Refresh</span>
            </button>
          )}

          {/* 3-Vertical-Dots Action Menu */}
          <div className="relative" ref={actionMenuRef}>
            <button
              type="button"
              onClick={() => setIsActionMenuOpen((prev) => !prev)}
              className="p-1.5 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition cursor-pointer flex items-center justify-center"
              title="Options & Export"
            >
              <span className="font-bold text-base leading-none px-1">⋮</span>
            </button>

          {isActionMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-30 text-xs animate-scale-in">
              <button
                type="button"
                onClick={handleExportExcel}
                className="w-full px-3 py-2 text-left hover:bg-slate-50 font-semibold text-slate-700 flex items-center gap-2 cursor-pointer"
              >
                <span>📥</span>
                <span>Export to Excel (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleSelectTool('');
                  setRemarkFilter('All');
                  setTableSearchFilter('');
                  setIsActionMenuOpen(false);
                }}
                className="w-full px-3 py-2 text-left hover:bg-slate-50 text-slate-500 flex items-center gap-2 cursor-pointer border-t border-slate-100"
              >
                <span>🔄</span>
                <span>Reset All Filters</span>
              </button>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Control Panel: Tool Selector & Search */}
      <div className="bg-white rounded-lg border border-slate-200/90 p-3 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Tool Dropdown Selector with clear button */}
          <div className="flex items-center gap-2 flex-1 min-w-[320px]">
            <label className="text-xs font-bold text-slate-700 shrink-0">
              Select Tool (Asset / Serial):
            </label>

            <div className="flex-1 max-w-xl">
              <SearchableSelect
                options={toolSelectOptions}
                value={selectedSerial}
                onChange={handleSelectTool}
                allOptionLabel="-- All Tools (Show All Fleet Movements) --"
                allOptionValue=""
                searchPlaceholder="Type asset no, serial, description, or size (e.g. 1338HT-WS-001, EMD-1566, JAR)..."
                buttonClassName="w-full h-8 font-mono font-bold bg-slate-50 border-slate-300"
                dropdownClassName="min-w-[360px] max-w-[560px]"
              />
            </div>
          </div>

          {/* Unified search bar and status chips */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search serial, part, job, rig, ticket..."
                value={tableSearchFilter}
                onChange={(e) => setTableSearchFilter(e.target.value)}
                className="w-52 sm:w-64 text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 pr-6"
              />
              {tableSearchFilter && (
                <button
                  type="button"
                  onClick={() => setTableSearchFilter('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Remark Filter Chips */}
            <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded border border-slate-200 text-[11px] font-bold">
              {(['All', 'Used', 'Not Used', 'On Rig'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setRemarkFilter(mode)}
                  className={`px-2 py-1 rounded transition cursor-pointer ${
                    remarkFilter === mode
                      ? 'bg-[#0b192c] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Selected Tool Metadata & KPI Strip */}
        <div className="bg-[#0b192c] rounded-lg p-3 text-white text-xs flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {currentTool ? (
              <>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">ASSET NUMBER</span>
                  <span className="font-mono font-bold text-amber-300 text-sm">
                    {currentTool.assetNo || currentTool.serial}
                  </span>
                </div>
                {currentTool.serial && currentTool.serial !== currentTool.assetNo && (
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">SERIAL NO</span>
                    <span className="font-mono font-bold text-slate-200 text-sm">{currentTool.serial}</span>
                  </div>
                )}
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">TOOL DESCRIPTION</span>
                  <span className="font-semibold text-slate-100">{currentTool.shortDesc || 'Downhole Tool'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">SIZE &amp; OWNERSHIP</span>
                  <span className="font-semibold text-slate-100">
                    {currentTool.size || '—'} · {currentTool.ownership || 'EMDAD'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">CURRENT LOCATION</span>
                  <span className="font-semibold text-emerald-400">{currentTool.location || 'Emdad Base'}</span>
                </div>
              </>
            ) : (
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">VIEW SCOPE</span>
                <span className="font-mono font-bold text-amber-300 text-sm">ALL FLEET TOOLS</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4 border-t sm:border-t-0 sm:border-l border-white/15 pt-2 sm:pt-0 sm:pl-4 text-center">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-bold">TOTAL DEPLOYMENTS</span>
              <span className="font-mono font-bold text-white text-sm">{totalDeployments}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-bold">DOWNHOLE RUNS</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {usedRuns}{' '}
                <span className="text-[10px] text-slate-300 font-normal">({notUsedRuns} standby)</span>
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-bold">UNIQUE RIGS</span>
              <span className="font-mono font-bold text-amber-400 text-sm">{uniqueRigs}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Movement History Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="font-bold text-slate-700">
            Historical Movement Records ({filteredRows.length.toLocaleString()} deployments)
          </div>
          <div className="text-slate-500 font-mono text-[11px]">
            {selectedSerial
              ? `Chronological audit for tool ${currentTool?.assetNo || selectedSerial}`
              : 'Chronological audit across all fleet equipment'}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#14263f] text-white border-b border-slate-700 text-[11px] font-bold tracking-wider uppercase">
                <th className="px-3 py-2 font-mono">JobNum</th>
                <th className="px-3 py-2 font-mono">DeliveryTicketNum</th>
                <th className="px-3 py-2 font-mono">DeliveryDate</th>
                <th className="px-3 py-2 text-center w-12 font-mono">S.No</th>
                <th className="px-3 py-2 font-mono">Asset No / PartNum</th>
                <th className="px-3 py-2">PartDescription</th>
                <th className="px-3 py-2 font-mono">ReturnTicketNum</th>
                <th className="px-3 py-2 font-mono">ReturnDate</th>
                <th className="px-3 py-2 text-center">Remark</th>
                <th className="px-3 py-2">RigNum</th>
                <th className="px-3 py-2">Well number</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800">
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    <div className="max-w-md mx-auto space-y-2">
                      <div className="text-sm font-bold text-slate-700">
                        No movement records found for this selection.
                      </div>
                      <div className="text-xs text-slate-500">
                        {selectedSerial
                          ? `Tool ${currentTool?.assetNo || selectedSerial} has not been dispatched on any Delivery Tickets yet.`
                          : 'Try clearing the search or status filters.'}
                      </div>
                      {selectedSerial && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => handleSelectTool('')}
                            className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs cursor-pointer transition"
                          >
                            Show All Tools (All Fleet Movements)
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pagedRows.map((r, idx) => (
                  <tr key={`${r.jobNum}-${r.deliveryTicketNum}-${r.sNo}-${idx}`} className="hover:bg-slate-50/80 transition">
                    <td className="px-3 py-2 font-mono font-bold text-blue-800 whitespace-nowrap">
                      {r.jobNum}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-900 font-semibold whitespace-nowrap">
                      {r.deliveryTicketNum}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600 text-[11px] whitespace-nowrap">
                      {formatDateDDMMYYYY(r.deliveryDate) || r.deliveryDate || '—'}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-slate-500">{r.sNo}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="font-mono font-bold text-slate-900">{r.partNum}</div>
                      {(r as any).serial && (r as any).serial !== r.partNum && (
                        <div className="text-[10px] font-mono text-slate-500">SN: {(r as any).serial}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800 max-w-sm truncate" title={r.partDescription}>
                      {r.partDescription}
                    </td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap">
                      {r.returnTicketNum ? (
                        <span className="font-semibold text-emerald-700">{r.returnTicketNum}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600 text-[11px] whitespace-nowrap">
                      {formatDateDDMMYYYY(r.returnDate) || r.returnDate || '—'}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      {r.remark === 'Used' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          Used
                        </span>
                      ) : r.remark === 'Not Used' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                          Not Used
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          On Rig
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">
                      {r.rigNum}
                    </td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                      {r.wellNumber}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div>
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length.toLocaleString()} records
            </div>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                &larr; Prev
              </button>
              <span className="font-mono font-bold text-slate-800 px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded border border-slate-300 bg-white hover:bg-slate-100 font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Next &rarr;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
