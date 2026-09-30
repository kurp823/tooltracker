import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { DrillingJob, DTBatch, RTBatch, ToolItem } from '../types';
import { normalizeJobKey } from '../services/api';

interface JobToolsListViewProps {
  jobs: DrillingJob[];
  dtBatches: DTBatch[];
  rtBatches: RTBatch[];
  inventory?: ToolItem[];
  preSelectedJobId?: string | null;
  onNavigate?: (view: any, param?: string) => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export interface JobToolReconRow {
  jobNum: string;
  deliveryTicketNum: string;
  deliveryDate: string;
  sNo: number;
  partNum: string;
  partDescription: string;
  returnTicketNum: string;
  returnDate: string;
  remark: 'Used' | 'Not Used' | 'On Rig' | string;
  rigNum: string;
  wellNumber: string;
  toolType?: string;
  size?: string;
}

export const JobToolsListView: React.FC<JobToolsListViewProps> = ({
  jobs,
  dtBatches,
  rtBatches,
  preSelectedJobId,
  showToast,
}) => {
  // Precompute total tool dispatch counts per job key
  const jobToolCounts = useMemo(() => {
    const counts = new Map<string, number>();
    dtBatches.forEach((dt) => {
      const raw = (dt.jobId || dt.jobNumber || '').trim().toUpperCase();
      const norm = normalizeJobKey(raw);
      const linesCount = (dt.toolLines || []).length;
      if (raw) counts.set(raw, (counts.get(raw) || 0) + linesCount);
      if (norm) counts.set(norm, (counts.get(norm) || 0) + linesCount);
    });
    return counts;
  }, [dtBatches]);

  // Sort jobs: Jobs with dispatched tools first (highest count descending), then alphabetical
  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const aRaw = a.id.trim().toUpperCase();
      const bRaw = b.id.trim().toUpperCase();
      const countA = jobToolCounts.get(aRaw) || jobToolCounts.get(normalizeJobKey(a.id)) || 0;
      const countB = jobToolCounts.get(bRaw) || jobToolCounts.get(normalizeJobKey(b.id)) || 0;
      if (countB !== countA) return countB - countA;
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [jobs, jobToolCounts]);

  // Default selection: preSelectedJobId, or first job with tools, or sortedJobs[0]
  const [selectedJobId, setSelectedJobId] = useState<string>(() => {
    if (preSelectedJobId) return preSelectedJobId;
    const firstWithTools = sortedJobs.find((j) => {
      const count =
        jobToolCounts.get(j.id.trim().toUpperCase()) ||
        jobToolCounts.get(normalizeJobKey(j.id)) ||
        0;
      return count > 0;
    });
    return firstWithTools?.id || sortedJobs[0]?.id || '';
  });

  // Filters
  const [jobSearchText, setJobSearchText] = useState('');
  const [onlyJobsWithTools, setOnlyJobsWithTools] = useState(true);
  const [tableSearchFilter, setTableSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'On Rig' | 'Returned' | 'Used' | 'Not Used'>('All');
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  // Close 3-dots dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setIsActionMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Update selected job if preSelectedJobId changes externally
  useEffect(() => {
    if (preSelectedJobId) {
      setSelectedJobId(preSelectedJobId);
    }
  }, [preSelectedJobId]);

  // Filtered job choices for the selector dropdown
  const selectableJobs = useMemo(() => {
    return sortedJobs.filter((j) => {
      const count =
        jobToolCounts.get(j.id.trim().toUpperCase()) ||
        jobToolCounts.get(normalizeJobKey(j.id)) ||
        0;

      if (onlyJobsWithTools && count === 0) return false;

      if (!jobSearchText.trim()) return true;
      const q = jobSearchText.toLowerCase();
      return (
        j.id.toLowerCase().includes(q) ||
        (j.rig && j.rig.toLowerCase().includes(q)) ||
        (j.well && j.well.toLowerCase().includes(q)) ||
        (j.client && j.client.toLowerCase().includes(q))
      );
    });
  }, [sortedJobs, jobToolCounts, onlyJobsWithTools, jobSearchText]);

  // Currently selected job object
  const currentJob = useMemo(() => {
    if (!selectedJobId) return null;
    const norm = normalizeJobKey(selectedJobId);
    const raw = selectedJobId.trim().toUpperCase();
    return jobs.find((j) => j.id.trim().toUpperCase() === raw || normalizeJobKey(j.id) === norm) || null;
  }, [selectedJobId, jobs]);

  // Reconciled tool rows for the selected job
  const reconRows = useMemo(() => {
    if (!currentJob) return [];

    const norm = normalizeJobKey(currentJob.id);
    const raw = currentJob.id.trim().toUpperCase();

    // 1. Gather all DTs for this job
    const jobDTs = dtBatches.filter((dt) => {
      const dtJobRaw = (dt.jobId || dt.jobNumber || '').trim().toUpperCase();
      const dtJobNorm = normalizeJobKey(dt.jobId || dt.jobNumber || '');
      return dtJobRaw === raw || (dtJobNorm && dtJobNorm === norm);
    });

    // 2. Gather all RTs for this job
    const jobRTs = rtBatches.filter((rt) => {
      const rtJobRaw = (rt.jobId || rt.jobNumber || '').trim().toUpperCase();
      const rtJobNorm = normalizeJobKey(rt.jobId || rt.jobNumber || '');
      return rtJobRaw === raw || (rtJobNorm && rtJobNorm === norm);
    });

    // Flatten RT lines with ticket metadata for fast serial lookup
    const rtLineLookups: {
      serial: string;
      rtNumber: string;
      rtDate: string;
      used: boolean;
      condition?: string;
    }[] = [];

    jobRTs.forEach((rt) => {
      (rt.toolLines || []).forEach((rtl) => {
        rtLineLookups.push({
          serial: (rtl.serial || '').trim(),
          rtNumber: rt.rtNumber,
          rtDate: rt.rtDate || '',
          used: Boolean(rtl.used),
          condition: rtl.condition,
        });
      });
    });

    const rows: JobToolReconRow[] = [];

    jobDTs.forEach((dt) => {
      const lines = dt.toolLines || [];
      lines.forEach((line, idx) => {
        const lineSerial = (line.serial || '').trim();
        const matchedRT = rtLineLookups.find((r) => r.serial === lineSerial);

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
          jobNum: currentJob.id,
          deliveryTicketNum: dt.dtNumber,
          deliveryDate: dt.deliveryDate || dt.rmDate || '',
          sNo: idx + 1,
          partNum: line.serial || line.assetNo || '—',
          partDescription: line.desc || line.shortDesc || 'Drilling Tool',
          returnTicketNum: retNum,
          returnDate: retDate,
          remark,
          rigNum: currentJob.rig || dt.rig || '—',
          wellNumber: currentJob.well || dt.well || '—',
          toolType: line.shortDesc,
          size: line.size,
        });
      });
    });

    return rows;
  }, [currentJob, dtBatches, rtBatches]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return reconRows.filter((r) => {
      if (statusFilter === 'On Rig' && r.remark !== 'On Rig') return false;
      if (statusFilter === 'Returned' && r.remark === 'On Rig') return false;
      if (statusFilter === 'Used' && r.remark !== 'Used') return false;
      if (statusFilter === 'Not Used' && r.remark !== 'Not Used') return false;

      if (!tableSearchFilter.trim()) return true;
      const q = tableSearchFilter.toLowerCase();
      return (
        r.partNum.toLowerCase().includes(q) ||
        r.partDescription.toLowerCase().includes(q) ||
        r.deliveryTicketNum.toLowerCase().includes(q) ||
        r.returnTicketNum.toLowerCase().includes(q) ||
        r.rigNum.toLowerCase().includes(q) ||
        r.wellNumber.toLowerCase().includes(q)
      );
    });
  }, [reconRows, statusFilter, tableSearchFilter]);

  // KPI counters
  const totalDispatched = reconRows.length;
  const returnedUsed = reconRows.filter((r) => r.remark === 'Used').length;
  const returnedNotUsed = reconRows.filter((r) => r.remark === 'Not Used').length;
  const activeOnRig = reconRows.filter((r) => r.remark === 'On Rig').length;

  // Export to Excel function
  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      if (showToast) showToast('No tool records available to export.', 'info');
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
    XLSX.utils.book_append_sheet(wb, ws, 'Job_ToolsList');

    const jobName = currentJob?.id ? currentJob.id.replace(/[^a-zA-Z0-9_-]/g, '_') : 'Job';
    XLSX.writeFile(wb, `${jobName}_ToolsList.xlsx`);

    if (showToast) {
      showToast(`Exported ${filteredRows.length} tools to ${jobName}_ToolsList.xlsx`, 'success');
    }
    setIsActionMenuOpen(false);
  };

  // Copy table to clipboard
  const handleCopyClipboard = () => {
    if (filteredRows.length === 0) return;
    const header = [
      'JobNum',
      'DeliveryTicketNum',
      'DeliveryDate',
      'S.No',
      'PartNum',
      'PartDescription',
      'ReturnTicketNum',
      'ReturnDate',
      'Remark',
      'RigNum',
      'Well number',
    ].join('\t');

    const body = filteredRows
      .map((r) =>
        [
          r.jobNum,
          r.deliveryTicketNum,
          r.deliveryDate,
          r.sNo,
          r.partNum,
          r.partDescription,
          r.returnTicketNum || '—',
          r.returnDate || '—',
          r.remark,
          r.rigNum,
          r.wellNumber,
        ].join('\t')
      )
      .join('\n');

    navigator.clipboard.writeText(`${header}\n${body}`);
    if (showToast) showToast('Table data copied to clipboard.', 'success');
    setIsActionMenuOpen(false);
  };

  return (
    <div className="space-y-3.5 max-w-[1600px] mx-auto animate-fade-in text-slate-800">
      {/* Sleek, Professional Header Banner */}
      <div className="bg-white rounded-lg border border-slate-200/90 px-4 py-3 shadow-xs flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
            OPERATIONS • EQUIPMENT RECONCILIATION
          </div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight">
            Job Tools List
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
                onClick={handleCopyClipboard}
                className="w-full px-3 py-2 text-left hover:bg-slate-50 font-semibold text-slate-700 flex items-center gap-2 cursor-pointer border-t border-slate-100"
              >
                <span>📋</span>
                <span>Copy Data to Clipboard</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('All');
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

      {/* Parameter Control Panel: Job Selector & Search */}
      <div className="bg-white rounded-lg border border-slate-200/90 p-3 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Job Dropdown Selector with quick search */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
            <label className="text-xs font-bold text-slate-700 shrink-0">
              Select Job:
            </label>

            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="flex-1 min-w-[240px] max-w-xl text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-900 cursor-pointer"
            >
              {selectableJobs.map((j) => {
                const count =
                  jobToolCounts.get(j.id.trim().toUpperCase()) ||
                  jobToolCounts.get(normalizeJobKey(j.id)) ||
                  0;
                return (
                  <option key={j.id} value={j.id}>
                    {j.id} — Rig: {j.rig || '—'} [{count} Tools]
                  </option>
                );
              })}
            </select>

            {/* Quick search input to find any job */}
            <div className="relative">
              <input
                type="text"
                placeholder="Find job/rig..."
                value={jobSearchText}
                onChange={(e) => setJobSearchText(e.target.value)}
                className="w-32 sm:w-40 text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-amber-400 pr-5"
              />
              {jobSearchText && (
                <button
                  type="button"
                  onClick={() => setJobSearchText('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Only jobs with tools toggle */}
            <label className="flex items-center space-x-1.5 text-[11px] text-slate-600 font-medium cursor-pointer ml-1 select-none">
              <input
                type="checkbox"
                checked={onlyJobsWithTools}
                onChange={(e) => setOnlyJobsWithTools(e.target.checked)}
                className="rounded border-slate-300 text-amber-600 focus:ring-0 cursor-pointer"
              />
              <span>With Tools Only</span>
            </label>
          </div>

          {/* Table in-grid search and status filter chips */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search serial, part, ticket..."
                value={tableSearchFilter}
                onChange={(e) => setTableSearchFilter(e.target.value)}
                className="w-44 sm:w-56 text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 pr-5"
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

            {/* Status Filter Chips */}
            <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded border border-slate-200 text-[11px] font-bold">
              {(['All', 'On Rig', 'Returned', 'Used', 'Not Used'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setStatusFilter(mode)}
                  className={`px-2 py-1 rounded transition cursor-pointer ${
                    statusFilter === mode
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

        {/* Selected Job Metadata & KPI Strip */}
        {currentJob && (
          <div className="bg-[#0b192c] rounded-lg p-3 text-white text-xs flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">JOB NUMBER</span>
                <span className="font-mono font-bold text-amber-300 text-sm">{currentJob.id}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">RIG / ASSIGNMENT</span>
                <span className="font-semibold text-slate-100">{currentJob.rig || '—'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">WELLBORE</span>
                <span className="font-semibold text-slate-100">{currentJob.well || '—'}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">CLIENT OPERATOR</span>
                <span className="font-semibold text-slate-100">{currentJob.client || '—'}</span>
              </div>
            </div>

            <div className="flex items-center space-x-4 border-t sm:border-t-0 sm:border-l border-white/15 pt-2 sm:pt-0 sm:pl-4 text-center">
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">DISPATCHED (DT)</span>
                <span className="font-mono font-bold text-white text-sm">{totalDispatched}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">RETURNED (RT)</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  {returnedUsed + returnedNotUsed}{' '}
                  <span className="text-[10px] text-slate-300 font-normal">({returnedUsed} used)</span>
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">ACTIVE ON RIG</span>
                <span className="font-mono font-bold text-amber-400 text-sm">{activeOnRig}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Reconciliation Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="font-bold text-slate-700">
            Reconciliation Tools ({filteredRows.length} tools)
          </div>
          {currentJob && (
            <div className="text-slate-500 font-mono text-[11px]">
              Showing tools deployed on {currentJob.id}
            </div>
          )}
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
                        No tools found for this job and filter combination.
                      </div>
                      <div className="text-xs text-slate-500">
                        {totalDispatched === 0
                          ? `Job ${selectedJobId} has no Delivery Tickets issued yet.`
                          : 'Try clearing the search or status filters.'}
                      </div>
                      {totalDispatched === 0 && selectableJobs.length > 0 && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => setSelectedJobId(selectableJobs[0].id)}
                            className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs cursor-pointer transition"
                          >
                            Switch to Active Job: {selectableJobs[0].id} (
                            {jobToolCounts.get(selectableJobs[0].id.trim().toUpperCase()) ||
                              jobToolCounts.get(normalizeJobKey(selectableJobs[0].id)) ||
                              0}{' '}
                            Tools)
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((r, idx) => (
                  <tr key={`${r.jobNum}-${r.deliveryTicketNum}-${r.sNo}-${idx}`} className="hover:bg-slate-50/80 transition">
                    <td className="px-3 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {r.jobNum}
                    </td>
                    <td className="px-3 py-2 font-mono text-blue-700 font-semibold whitespace-nowrap">
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
