import React, { useState, useMemo } from 'react';
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
  onNavigate,
  showToast,
}) => {
  // Sort inventory tools for the selector dropdown
  const sortedInventory = useMemo(() => {
    return [...inventory].sort((a, b) => (a.serial || '').localeCompare(b.serial || ''));
  }, [inventory]);

  const [selectedSerial, setSelectedSerial] = useState<string>(() => {
    if (preSelectedSerial) return preSelectedSerial;
    return sortedInventory[0]?.serial || '';
  });

  const [searchFilter, setSearchFilter] = useState('');
  const [remarkFilter, setRemarkFilter] = useState<'All' | 'Used' | 'Not Used' | 'On Rig'>('All');

  // Currently selected tool object
  const currentTool = useMemo(() => {
    if (!selectedSerial) return null;
    const s = selectedSerial.trim().toUpperCase();
    return inventory.find((t) => (t.serial || '').trim().toUpperCase() === s || (t.id || '').trim().toUpperCase() === s) || null;
  }, [selectedSerial, inventory]);

  // Find all historical movements for this specific tool across all DTs and RTs
  const toolHistoryRows = useMemo(() => {
    if (!selectedSerial.trim()) return [];

    const targetSerial = selectedSerial.trim().toUpperCase();

    // Map jobs for fast metadata lookup
    const jobMap = new Map<string, DrillingJob>();
    jobs.forEach((j) => {
      const raw = (j.id || '').trim().toUpperCase();
      const norm = normalizeJobKey(j.id);
      if (raw) jobMap.set(raw, j);
      if (norm) jobMap.set(norm, j);
    });

    // Flatten all RT lines matching this tool serial
    const rtLineLookups: {
      rtNumber: string;
      rtDate: string;
      jobId: string;
      used: boolean;
      condition?: string;
    }[] = [];

    rtBatches.forEach((rt) => {
      (rt.toolLines || []).forEach((rtl) => {
        if ((rtl.serial || '').trim().toUpperCase() === targetSerial) {
          rtLineLookups.push({
            rtNumber: rt.rtNumber,
            rtDate: rt.rtDate || '',
            jobId: (rt.jobId || rt.jobNumber || '').trim().toUpperCase(),
            used: Boolean(rtl.used),
            condition: rtl.condition,
          });
        }
      });
    });

    const rows: JobToolReconRow[] = [];

    // Search through all DT batches for this tool
    dtBatches.forEach((dt) => {
      const dtJobKey = (dt.jobId || dt.jobNumber || '').trim().toUpperCase();
      const dtJob = jobMap.get(dtJobKey) || jobMap.get(normalizeJobKey(dtJobKey));

      (dt.toolLines || []).forEach((line, idx) => {
        if ((line.serial || '').trim().toUpperCase() === targetSerial) {
          // Look up matching RT for this job deployment
          const matchedRT = rtLineLookups.find((r) => r.jobId === dtJobKey || (dtJob && r.jobId === dtJob.id.toUpperCase()));

          let remark: 'Used' | 'Not Used' | 'On Rig' = 'On Rig';
          let retNum = '';
          let retDate = '';

          if (matchedRT) {
            retNum = matchedRT.rtNumber;
            retDate = matchedRT.rtDate;
            remark = matchedRT.used ? 'Used' : 'Not Used';
          } else if (line.status === 'Returned' || line.rtBatchId) {
            retNum = line.rtBatchId || 'Returned';
            remark = line.used ? 'Used' : 'Not Used';
          }

          rows.push({
            jobNum: dt.jobId || dt.jobNumber || dtJob?.id || '—',
            deliveryTicketNum: dt.dtNumber,
            deliveryDate: dt.deliveryDate || dt.rmDate || '',
            sNo: idx + 1,
            partNum: line.serial || line.assetNo || targetSerial,
            partDescription: line.desc || line.shortDesc || currentTool?.desc || currentTool?.shortDesc || 'Drilling Tool',
            returnTicketNum: retNum,
            returnDate: retDate,
            remark,
            rigNum: dt.rig || dtJob?.rig || '—',
            wellNumber: dt.well || dtJob?.well || '—',
            toolType: line.shortDesc || currentTool?.shortDesc,
            size: line.size || currentTool?.size,
          });
        }
      });
    });

    // Sort by most recent delivery date descending
    return rows.sort((a, b) => (b.deliveryDate || '').localeCompare(a.deliveryDate || ''));
  }, [selectedSerial, dtBatches, rtBatches, jobs, currentTool]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return toolHistoryRows.filter((r) => {
      if (remarkFilter !== 'All' && r.remark !== remarkFilter) return false;

      if (!searchFilter.trim()) return true;
      const q = searchFilter.toLowerCase();
      return (
        r.jobNum.toLowerCase().includes(q) ||
        r.deliveryTicketNum.toLowerCase().includes(q) ||
        r.returnTicketNum.toLowerCase().includes(q) ||
        r.rigNum.toLowerCase().includes(q) ||
        r.wellNumber.toLowerCase().includes(q) ||
        r.partDescription.toLowerCase().includes(q)
      );
    });
  }, [toolHistoryRows, remarkFilter, searchFilter]);

  // Statistics for this tool
  const toolStats = useMemo(() => {
    const totalRuns = toolHistoryRows.length;
    const usedCount = toolHistoryRows.filter((r) => r.remark === 'Used').length;
    const notUsedCount = toolHistoryRows.filter((r) => r.remark === 'Not Used').length;
    const onRigCount = toolHistoryRows.filter((r) => r.remark === 'On Rig').length;
    const uniqueRigs = new Set(toolHistoryRows.map((r) => r.rigNum).filter((r) => r && r !== '—')).size;
    return { totalRuns, usedCount, notUsedCount, onRigCount, uniqueRigs };
  }, [toolHistoryRows]);

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      if (showToast) showToast('No records to export.', 'info');
      return;
    }

    const exportData = filteredRows.map((r) => ({
      JobNum: r.jobNum,
      DeliveryTicketNum: r.deliveryTicketNum,
      DeliveryDate: r.deliveryDate,
      'S.No': r.sNo,
      PartNum: r.partNum,
      PartDescription: r.partDescription,
      ReturnTicketNum: r.returnTicketNum || '',
      ReturnDate: r.returnDate || '',
      Remark: r.remark,
      RigNum: r.rigNum,
      'Well number': r.wellNumber,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tool_History');
    const safeSerial = (currentTool?.serial || selectedSerial || 'TOOL').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `Tool_History_${safeSerial}.xlsx`);

    if (showToast) showToast(`Exported ${exportData.length} movement records to Excel.`, 'success');
  };

  return (
    <div className="space-y-4 w-full">
      {/* Top Header matching ERP Kinetic Banner */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
            Operations &bull; Asset Lifecycle &amp; Rig Tour Ledger
          </div>
          <h1 className="text-lg font-extrabold text-[#1a3055] tracking-tight flex items-center gap-2">
            <span>⏱️</span> Tool Movement History (BAQ: PartNum)
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Complete multi-job deployment audit trail for any downhole tool. Every rig visited, delivery ticket, return backload, and downhole usage.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded border border-emerald-800 flex items-center gap-1.5 shadow-xs cursor-pointer transition"
            title="Export Tool History to Excel (.xlsx)"
          >
            <span>📥</span> Export to Excel
          </button>
        </div>
      </div>

      {/* Parameter Selection Ribbon */}
      <div className="bg-slate-50 border border-slate-300 rounded p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
              Select Tool (PartNum / Serial):
            </label>
            <select
              value={selectedSerial}
              onChange={(e) => setSelectedSerial(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-bold text-[#1a3055] font-mono shadow-2xs focus:outline-none focus:border-[#1a3055] max-w-[340px]"
            >
              {sortedInventory.map((t) => (
                <option key={t.id || t.serial} value={t.serial}>
                  {t.serial} {t.assetNo ? `[${t.assetNo}]` : ''} — {t.shortDesc || 'Tool'} ({t.size || 'Size N/A'})
                </option>
              ))}
            </select>
          </div>

          {/* Quick Search inside Table */}
          <div className="relative min-w-[200px]">
            <input
              type="text"
              placeholder="Search job, rig, ticket..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1a3055]"
            />
            {searchFilter && (
              <button
                onClick={() => setSearchFilter('')}
                className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600 text-xs"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded p-1">
          {(['All', 'Used', 'Not Used', 'On Rig'] as const).map((rm) => (
            <button
              key={rm}
              onClick={() => setRemarkFilter(rm)}
              className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition ${
                remarkFilter === rm
                  ? 'bg-[#1a3055] text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {rm}
            </button>
          ))}
        </div>
      </div>

      {/* Selected Tool Asset Summary Card */}
      {currentTool && (
        <div className="bg-[#1a3055] text-white rounded p-3 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 text-xs shadow-sm">
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-semibold block">Serial / PartNum</span>
            <span className="font-mono font-bold text-amber-300 text-sm">{currentTool.serial}</span>
          </div>
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-semibold block">Tool Description</span>
            <span className="font-bold text-white text-xs truncate block" title={currentTool.desc || currentTool.shortDesc}>
              {currentTool.shortDesc || currentTool.desc || 'Drilling Tool'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-semibold block">Size &amp; Ownership</span>
            <span className="text-slate-200 text-xs">{currentTool.size || '—'} &bull; {currentTool.ownership || 'EMDAD'}</span>
          </div>
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-semibold block">Current Location</span>
            <span className="text-amber-200 font-semibold text-xs block">{currentTool.location}</span>
          </div>
          <div className="text-center sm:text-left">
            <span className="text-slate-400 text-[10px] uppercase font-semibold block">Total Deployments</span>
            <span className="font-mono font-bold text-white text-sm">{toolStats.totalRuns}</span>
          </div>
          <div className="text-center sm:text-left">
            <span className="text-slate-400 text-[10px] uppercase font-semibold block">Downhole Runs</span>
            <span className="font-mono font-bold text-emerald-300 text-sm">
              {toolStats.usedCount} <span className="text-[10px] font-normal text-slate-300">used / {toolStats.notUsedCount} standby</span>
            </span>
          </div>
          <div className="text-center sm:text-left">
            <span className="text-slate-400 text-[10px] uppercase font-semibold block">Unique Rigs</span>
            <span className="font-mono font-bold text-sky-300 text-sm">{toolStats.uniqueRigs}</span>
          </div>
        </div>
      )}

      {/* Main Reconciliation Table Matching Epicor Kinetic Screenshot */}
      <div className="bg-white border border-[#b8c9db] rounded shadow-sm overflow-hidden">
        <div className="bg-[#b8d0e8] px-3 py-1.5 border-b border-[#9bb8d4] flex items-center justify-between">
          <span className="font-bold text-xs text-[#1a3055] tracking-wide flex items-center gap-1.5">
            <span>^</span> Job_ToolsList — Historical Trail for {selectedSerial || 'selected tool'} ({filteredRows.length} deployments)
          </span>
          <span className="text-[11px] text-slate-600 font-medium">
            Chronological audit across all jobs and delivery tickets
          </span>
        </div>

        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#cfe0f2] text-[#1a3055] font-bold border-b border-[#9bb8d4] sticky top-0 z-10 text-[11px]">
              <tr>
                <th className="p-2 border-r border-[#b8c9db] whitespace-nowrap">JobNum</th>
                <th className="p-2 border-r border-[#b8c9db] whitespace-nowrap">DeliveryTicketNum</th>
                <th className="p-2 border-r border-[#b8c9db] whitespace-nowrap">DeliveryDate</th>
                <th className="p-2 border-r border-[#b8c9db] text-center w-12 whitespace-nowrap">S.No</th>
                <th className="p-2 border-r border-[#b8c9db] whitespace-nowrap">PartNum</th>
                <th className="p-2 border-r border-[#b8c9db] min-w-[240px]">PartDescription</th>
                <th className="p-2 border-r border-[#b8c9db] whitespace-nowrap">ReturnTicketNum</th>
                <th className="p-2 border-r border-[#b8c9db] whitespace-nowrap">ReturnDate</th>
                <th className="p-2 border-r border-[#b8c9db] text-center whitespace-nowrap">Remark</th>
                <th className="p-2 border-r border-[#b8c9db] whitespace-nowrap">RigNum</th>
                <th className="p-2 whitespace-nowrap">Well number</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-10 text-center text-slate-400 bg-slate-50 font-medium">
                    No movement records found for tool serial <span className="font-mono font-bold text-slate-700">{selectedSerial}</span>.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r, i) => (
                  <tr key={`${r.jobNum}-${r.deliveryTicketNum}-${r.partNum}-${i}`} className="hover:bg-sky-50/70 transition">
                    <td className="p-2 border-r border-slate-200 font-mono font-bold text-[#1a3055] whitespace-nowrap">
                      {r.jobNum}
                    </td>
                    <td className="p-2 border-r border-slate-200 font-mono text-slate-700 whitespace-nowrap">
                      {r.deliveryTicketNum}
                    </td>
                    <td className="p-2 border-r border-slate-200 font-mono text-slate-600 whitespace-nowrap">
                      {r.deliveryDate || '—'}
                    </td>
                    <td className="p-2 border-r border-slate-200 text-center font-mono text-slate-500">
                      {r.sNo}
                    </td>
                    <td className="p-2 border-r border-slate-200 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {r.partNum}
                    </td>
                    <td className="p-2 border-r border-slate-200 text-slate-700 font-medium text-[11px]">
                      {r.partDescription}
                    </td>
                    <td className="p-2 border-r border-slate-200 font-mono whitespace-nowrap">
                      {r.returnTicketNum ? (
                        <span className="text-slate-800 font-semibold">{r.returnTicketNum}</span>
                      ) : (
                        <span className="text-slate-400 font-normal italic">—</span>
                      )}
                    </td>
                    <td className="p-2 border-r border-slate-200 font-mono text-slate-600 whitespace-nowrap">
                      {r.returnDate || '—'}
                    </td>
                    <td className="p-2 border-r border-slate-200 text-center whitespace-nowrap">
                      {r.remark === 'Used' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          Used
                        </span>
                      )}
                      {r.remark === 'Not Used' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
                          Not Used
                        </span>
                      )}
                      {r.remark === 'On Rig' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                          On Rig
                        </span>
                      )}
                    </td>
                    <td className="p-2 border-r border-slate-200 font-semibold text-slate-800 whitespace-nowrap">
                      {r.rigNum}
                    </td>
                    <td className="p-2 font-mono text-slate-600 whitespace-nowrap">
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
