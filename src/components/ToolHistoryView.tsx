import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { ToolItem, DrillingJob, DTBatch, RTBatch } from '../types';
import { JobToolReconRow } from './JobToolsListView';
import { normalizeJobKey } from '../services/api';
import { formatDateDDMMYYYY } from '../utils';

interface ToolHistoryViewProps {
  inventory: ToolItem[];
  jobs: DrillingJob[];
  dtBatches: DTBatch[];
  rtBatches: RTBatch[];
  preSelectedSerial?: string | null;
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
  showToast,
  onRefresh,
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

  // Default selected tool: preSelectedSerial or empty ("-- All Tools --")
  const [selectedSerial, setSelectedSerial] = useState<string>(preSelectedSerial || '');

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
    if (preSelectedSerial) {
      setSelectedSerial(preSelectedSerial);
      setCurrentPage(1);
    }
  }, [preSelectedSerial]);

  // Reset page when tool selection or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSerial, tableSearchFilter, remarkFilter]);

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

  // Build movement records: if a tool is selected, show that tool's history; if empty, show all tool movements
  const historyRows = useMemo(() => {
    const target = selectedSerial ? selectedSerial.trim().toUpperCase() : '';

    // Map all RT tool lines
    const rtLinesByTicket = new Map<
      string,
      { rtNumber: string; rtDate: string; used: boolean; condition?: string }
    >();

    rtBatches.forEach((rt) => {
      (rt.toolLines || []).forEach((rtl) => {
        const lineSerial = (rtl.serial || rtl.assetNo || '').trim().toUpperCase();
        if (!target || lineSerial === target) {
          const key = `${lineSerial}_${rt.rtNumber.trim().toUpperCase()}`;
          const effDate = rt.rtDate || rt.backloadRmDate || rt.loadingNoteDate || rt.lNoteDate || (rtl as any).rtDate || (rtl as any).dateIn || (rtl as any).Date_In || (rtl as any).returnDate || '';
          rtLinesByTicket.set(key, {
            rtNumber: rt.rtNumber,
            rtDate: effDate,
            used: Boolean(rtl.used),
            condition: rtl.condition,
          });
          const normJob = normalizeJobKey(rt.jobId || rt.jobNumber || '');
          if (normJob) {
            rtLinesByTicket.set(`${lineSerial}_JOB_${normJob}`, {
              rtNumber: rt.rtNumber,
              rtDate: effDate,
              used: Boolean(rtl.used),
              condition: rtl.condition,
            });
          }
        }
      });
    });

    const rows: JobToolReconRow[] = [];

    // Find all DTs that included this tool (or all tools if empty)
    dtBatches.forEach((dt) => {
      const lines = dt.toolLines || [];
      lines.forEach((line, idx) => {
        const lineSerial = (line.serial || line.assetNo || '').trim().toUpperCase();
        if (target && lineSerial !== target) return;

        const jobKey = (dt.jobId || dt.jobNumber || '').trim().toUpperCase();
        const normJob = normalizeJobKey(jobKey);
        const linkedJob = jobsMap.get(jobKey) || jobsMap.get(normJob);

        let retNum = '';
        let retDate = '';
        let remark: 'Used' | 'Not Used' | 'On Rig' = 'On Rig';

        const matchedByJob = rtLinesByTicket.get(`${lineSerial}_JOB_${normJob}`);
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
          partNum: line.serial || line.assetNo || (target || '—'),
          partDescription: line.desc || line.shortDesc || (target === lineSerial && currentTool?.desc) || 'Drilling Tool',
          returnTicketNum: retNum,
          returnDate: retDate,
          remark,
          rigNum: linkedJob?.rig || dt.rig || '—',
          wellNumber: linkedJob?.well || dt.well || '—',
          toolType: line.shortDesc,
          size: line.size,
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
      PartNum: r.partNum,
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
                  setSelectedSerial('');
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
              Select Tool (PartNum / Serial):
            </label>

            <div className="flex items-center gap-1.5 flex-1 max-w-xl">
              <select
                value={selectedSerial}
                onChange={(e) => setSelectedSerial(e.target.value)}
                className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-900 cursor-pointer"
              >
                <option value="">-- All Tools (Show All Fleet Movements) --</option>
                {sortedInventory.map((t) => {
                  const s = (t.serial || t.assetNo || '').trim().toUpperCase();
                  const count = toolDeploymentCounts.get(s) || 0;
                  return (
                    <option key={t.id || t.serial} value={t.serial}>
                      {t.serial} — {t.shortDesc} ({t.size || '—'}) [{count} Runs]
                    </option>
                  );
                })}
              </select>

              {/* Clear button to reset back to All Tools */}
              {selectedSerial && (
                <button
                  type="button"
                  onClick={() => setSelectedSerial('')}
                  title="Clear selected tool (Show all tools)"
                  className="px-2 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-300 text-xs font-bold transition cursor-pointer shrink-0 flex items-center gap-1"
                >
                  <span>✕</span>
                  <span className="hidden sm:inline">All Tools</span>
                </button>
              )}
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
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">SERIAL / PARTNUM</span>
                  <span className="font-mono font-bold text-amber-300 text-sm">{selectedSerial}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">TOOL DESCRIPTION</span>
                  <span className="font-semibold text-slate-100">{currentTool.shortDesc || 'Downhole Tool'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">SIZE & OWNERSHIP</span>
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
              ? `Chronological audit for tool ${selectedSerial}`
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
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500">
                    <div className="max-w-md mx-auto space-y-2">
                      <div className="text-sm font-bold text-slate-700">
                        No movement records found for this selection.
                      </div>
                      <div className="text-xs text-slate-500">
                        {selectedSerial
                          ? `Tool ${selectedSerial} has not been dispatched on any Delivery Tickets yet.`
                          : 'Try clearing the search or status filters.'}
                      </div>
                      {selectedSerial && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => setSelectedSerial('')}
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
