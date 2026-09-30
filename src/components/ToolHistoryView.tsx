import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { ToolItem, DrillingJob, DTBatch, RTBatch } from '../types';
import { JobToolReconRow } from './JobToolsListView';
import { normalizeJobKey } from '../services/api';

interface ToolHistoryViewProps {
  inventory: ToolItem[];
  jobs: DrillingJob[];
  dtBatches: DTBatch[];
  rtBatches: RTBatch[];
  preSelectedSerial?: string | null;
  onNavigate?: (view: any, param?: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ToolHistoryView: React.FC<ToolHistoryViewProps> = ({
  inventory,
  jobs,
  dtBatches,
  rtBatches,
  preSelectedSerial,
  showToast,
}) => {
  // Precompute deployment occurrences per tool serial
  const toolDeploymentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    dtBatches.forEach((dt) => {
      (dt.toolLines || []).forEach((line) => {
        const s = (line.serial || line.assetNo || '').trim().toUpperCase();
        if (s) counts.set(s, (counts.get(s) || 0) + 1);
      });
    });
    return counts;
  }, [dtBatches]);

  // Sort inventory: Tools with deployment history first (highest count descending), then alphabetical
  const sortedInventory = useMemo(() => {
    return [...inventory].sort((a, b) => {
      const aRaw = (a.serial || a.assetNo || '').trim().toUpperCase();
      const bRaw = (b.serial || b.assetNo || '').trim().toUpperCase();
      const countA = toolDeploymentCounts.get(aRaw) || 0;
      const countB = toolDeploymentCounts.get(bRaw) || 0;
      if (countB !== countA) return countB - countA;
      return (a.serial || '').localeCompare(b.serial || '');
    });
  }, [inventory, toolDeploymentCounts]);

  // Default selected tool: preSelectedSerial or first tool with deployments
  const [selectedSerial, setSelectedSerial] = useState<string>(() => {
    if (preSelectedSerial) return preSelectedSerial;
    const firstWithDeployments = sortedInventory.find((t) => {
      const s = (t.serial || t.assetNo || '').trim().toUpperCase();
      return (toolDeploymentCounts.get(s) || 0) > 0;
    });
    return firstWithDeployments?.serial || sortedInventory[0]?.serial || '';
  });

  // Filters
  const [toolSearchText, setToolSearchText] = useState('');
  const [onlyToolsWithDeployments, setOnlyToolsWithDeployments] = useState(true);
  const [tableSearchFilter, setTableSearchFilter] = useState('');
  const [remarkFilter, setRemarkFilter] = useState<'All' | 'Used' | 'Not Used' | 'On Rig'>('All');
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  // Close 3-dots menu on outside click
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
    if (preSelectedSerial) {
      setSelectedSerial(preSelectedSerial);
    }
  }, [preSelectedSerial]);

  // Filtered tools for the dropdown
  const selectableTools = useMemo(() => {
    return sortedInventory.filter((t) => {
      const s = (t.serial || t.assetNo || '').trim().toUpperCase();
      const count = toolDeploymentCounts.get(s) || 0;

      if (onlyToolsWithDeployments && count === 0) return false;

      if (!toolSearchText.trim()) return true;
      const q = toolSearchText.toLowerCase();
      return (
        t.serial.toLowerCase().includes(q) ||
        (t.shortDesc && t.shortDesc.toLowerCase().includes(q)) ||
        (t.desc && t.desc.toLowerCase().includes(q)) ||
        (t.size && t.size.toLowerCase().includes(q))
      );
    });
  }, [sortedInventory, toolDeploymentCounts, onlyToolsWithDeployments, toolSearchText]);

  // Currently selected tool master record
  const currentTool = useMemo(() => {
    if (!selectedSerial) return null;
    const clean = selectedSerial.trim().toUpperCase();
    return (
      inventory.find(
        (t) =>
          t.serial.trim().toUpperCase() === clean ||
          (t.assetNo && t.assetNo.trim().toUpperCase() === clean)
      ) || null
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

  // Build the complete historical movement audit trail for this tool
  const historyRows = useMemo(() => {
    if (!selectedSerial) return [];
    const target = selectedSerial.trim().toUpperCase();

    // Map all RT tool lines for this serial
    const rtLinesByTicket = new Map<
      string,
      { rtNumber: string; rtDate: string; used: boolean; condition?: string }
    >();

    rtBatches.forEach((rt) => {
      (rt.toolLines || []).forEach((rtl) => {
        const lineSerial = (rtl.serial || rtl.assetNo || '').trim().toUpperCase();
        if (lineSerial === target) {
          rtLinesByTicket.set(rt.rtNumber.trim().toUpperCase(), {
            rtNumber: rt.rtNumber,
            rtDate: rt.rtDate || '',
            used: Boolean(rtl.used),
            condition: rtl.condition,
          });
          const normJob = normalizeJobKey(rt.jobId || rt.jobNumber || '');
          if (normJob) {
            rtLinesByTicket.set(`JOB_${normJob}`, {
              rtNumber: rt.rtNumber,
              rtDate: rt.rtDate || '',
              used: Boolean(rtl.used),
              condition: rtl.condition,
            });
          }
        }
      });
    });

    const rows: JobToolReconRow[] = [];

    // Find all DTs that included this tool
    dtBatches.forEach((dt) => {
      const lines = dt.toolLines || [];
      lines.forEach((line, idx) => {
        const lineSerial = (line.serial || line.assetNo || '').trim().toUpperCase();
        if (lineSerial !== target) return;

        const jobKey = (dt.jobId || dt.jobNumber || '').trim().toUpperCase();
        const normJob = normalizeJobKey(jobKey);
        const linkedJob = jobsMap.get(jobKey) || jobsMap.get(normJob);

        let retNum = '';
        let retDate = '';
        let remark: 'Used' | 'Not Used' | 'On Rig' = 'On Rig';

        const matchedByJob = rtLinesByTicket.get(`JOB_${normJob}`);
        if (matchedByJob) {
          retNum = matchedByJob.rtNumber;
          retDate = matchedByJob.rtDate;
          remark = matchedByJob.used ? 'Used' : 'Not Used';
        } else if (line.status === 'Returned' || line.rtBatchId) {
          retNum = line.rtBatchId || 'Returned';
          remark = line.used ? 'Used' : 'Not Used';
        }

        rows.push({
          jobNum: linkedJob?.id || dt.jobId || dt.jobNumber || '—',
          deliveryTicketNum: dt.dtNumber,
          deliveryDate: dt.deliveryDate || dt.rmDate || '',
          sNo: idx + 1,
          partNum: line.serial || line.assetNo || selectedSerial,
          partDescription: line.desc || line.shortDesc || currentTool?.desc || currentTool?.shortDesc || 'Drilling Tool',
          returnTicketNum: retNum,
          returnDate: retDate,
          remark,
          rigNum: linkedJob?.rig || dt.rig || '—',
          wellNumber: linkedJob?.well || dt.well || '—',
          toolType: line.shortDesc || currentTool?.shortDesc,
          size: line.size || currentTool?.size,
        });
      });
    });

    // Sort most recent delivery date first
    return rows.sort((a, b) => (b.deliveryDate || '').localeCompare(a.deliveryDate || ''));
  }, [selectedSerial, dtBatches, rtBatches, jobsMap, currentTool]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return historyRows.filter((r) => {
      if (remarkFilter !== 'All' && r.remark !== remarkFilter) return false;

      if (!tableSearchFilter.trim()) return true;
      const q = tableSearchFilter.toLowerCase();
      return (
        r.jobNum.toLowerCase().includes(q) ||
        r.deliveryTicketNum.toLowerCase().includes(q) ||
        r.returnTicketNum.toLowerCase().includes(q) ||
        r.rigNum.toLowerCase().includes(q) ||
        r.wellNumber.toLowerCase().includes(q) ||
        r.partDescription.toLowerCase().includes(q)
      );
    });
  }, [historyRows, remarkFilter, tableSearchFilter]);

  // Metrics
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
      DeliveryDate: r.deliveryDate,
      'S.No': r.sNo,
      PartNum: r.partNum,
      PartDescription: r.partDescription,
      ReturnTicketNum: r.returnTicketNum || '—',
      ReturnDate: r.returnDate || '—',
      Remark: r.remark,
      RigNum: r.rigNum,
      'Well number': r.wellNumber,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tool_History');

    const cleanSerial = selectedSerial.replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `ToolHistory_${cleanSerial}.xlsx`);

    if (showToast) {
      showToast(`Exported ${filteredRows.length} movement records to ToolHistory_${cleanSerial}.xlsx`, 'success');
    }
    setIsActionMenuOpen(false);
  };

  return (
    <div className="space-y-3.5 max-w-[1600px] mx-auto animate-fade-in text-slate-800">
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
                  setRemarkFilter('All');
                  setTableSearchFilter('');
                  setIsActionMenuOpen(false);
                }}
                className="w-full px-3 py-2 text-left hover:bg-slate-50 text-slate-500 flex items-center gap-2 cursor-pointer border-t border-slate-100"
              >
                <span>🔄</span>
                <span>Reset Table Filters</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Parameter Control Panel: Tool Selector & Search */}
      <div className="bg-white rounded-lg border border-slate-200/90 p-3 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Tool Dropdown Selector */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            <label className="text-xs font-bold text-slate-700 shrink-0">
              Select Tool (PartNum / Serial):
            </label>

            <select
              value={selectedSerial}
              onChange={(e) => setSelectedSerial(e.target.value)}
              className="flex-1 min-w-[240px] max-w-xl text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-900 cursor-pointer"
            >
              {selectableTools.map((t) => {
                const s = (t.serial || t.assetNo || '').trim().toUpperCase();
                const count = toolDeploymentCounts.get(s) || 0;
                return (
                  <option key={t.id || t.serial} value={t.serial}>
                    {t.serial} — {t.shortDesc} ({t.size || '—'}) [{count} Runs]
                  </option>
                );
              })}
            </select>

            {/* Quick search input to find any tool */}
            <div className="relative">
              <input
                type="text"
                placeholder="Find serial/category..."
                value={toolSearchText}
                onChange={(e) => setToolSearchText(e.target.value)}
                className="w-36 sm:w-44 text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400 pr-5"
              />
              {toolSearchText && (
                <button
                  type="button"
                  onClick={() => setToolSearchText('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Only tools with deployments toggle */}
            <label className="flex items-center space-x-1.5 text-[11px] text-slate-600 font-medium cursor-pointer ml-1 select-none">
              <input
                type="checkbox"
                checked={onlyToolsWithDeployments}
                onChange={(e) => setOnlyToolsWithDeployments(e.target.checked)}
                className="rounded border-slate-300 text-amber-600 focus:ring-0 cursor-pointer"
              />
              <span>With Runs Only</span>
            </label>
          </div>

          {/* Table in-grid search and status filter chips */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search job, rig, ticket..."
                value={tableSearchFilter}
                onChange={(e) => setTableSearchFilter(e.target.value)}
                className="w-40 sm:w-52 text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 pr-5"
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
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-bold">SERIAL / PARTNUM</span>
              <span className="font-mono font-bold text-amber-300 text-sm">{selectedSerial}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-bold">TOOL DESCRIPTION</span>
              <span className="font-semibold text-slate-100">{currentTool?.shortDesc || 'Downhole Tool'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-bold">SIZE & OWNERSHIP</span>
              <span className="font-semibold text-slate-100">
                {currentTool?.size || '—'} · {currentTool?.ownership || 'EMDAD'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase font-bold">CURRENT LOCATION</span>
              <span className="font-semibold text-emerald-400">{currentTool?.location || 'Emdad Base'}</span>
            </div>
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
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="font-bold text-slate-700">
            Historical Movement Records ({filteredRows.length} deployments)
          </div>
          <div className="text-slate-500 font-mono text-[11px]">
            Chronological audit across all jobs and delivery tickets
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
                <th className="px-3 py-2 font-mono">PartNum</th>
                <th className="px-3 py-2">PartDescription</th>
                <th className="px-3 py-2 font-mono">ReturnTicketNum</th>
                <th className="px-3 py-2 font-mono">ReturnDate</th>
                <th className="px-3 py-2 text-center">Remark</th>
                <th className="px-3 py-2">RigNum</th>
                <th className="px-3 py-2">Well number</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-800">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    <div className="max-w-md mx-auto space-y-2">
                      <div className="text-sm font-bold text-slate-700">
                        No movement records found for tool serial {selectedSerial}.
                      </div>
                      <div className="text-xs text-slate-500">
                        {totalDeployments === 0
                          ? `Tool ${selectedSerial} has not been dispatched on any Delivery Tickets yet.`
                          : 'Try clearing the search or status filters.'}
                      </div>
                      {totalDeployments === 0 && selectableTools.length > 0 && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => setSelectedSerial(selectableTools[0].serial)}
                            className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs cursor-pointer transition"
                          >
                            Switch to Active Tool: {selectableTools[0].serial} (
                            {toolDeploymentCounts.get((selectableTools[0].serial || '').trim().toUpperCase()) || 0} Runs)
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((r, idx) => (
                  <tr key={`${r.jobNum}-${r.deliveryTicketNum}-${r.sNo}-${idx}`} className="hover:bg-slate-50/80 transition">
                    <td className="px-3 py-2 font-mono font-bold text-blue-800 whitespace-nowrap">
                      {r.jobNum}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-900 font-semibold whitespace-nowrap">
                      {r.deliveryTicketNum}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600 text-[11px] whitespace-nowrap">
                      {r.deliveryDate || '—'}
                    </td>
                    <td className="px-3 py-2 text-center font-mono text-slate-500">{r.sNo}</td>
                    <td className="px-3 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {r.partNum}
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
                      {r.returnDate || '—'}
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
      </div>
    </div>
  );
};
