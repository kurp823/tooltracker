import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { DrillingJob, DTBatch, RTBatch, ToolItem } from '../types';
import { normalizeJobKey } from '../services/api';
import { formatDateDDMMYYYY } from '../utils';

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
  // Map of Job ID / normalized key to job object for fast metadata lookups
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

  // Precompute tool counts per job
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

  // Sort jobs: jobs with tools first (highest count descending), then alphabetical (exclude test jobs)
  const sortedJobs = useMemo(() => {
    const valid = jobs.filter((j) => j && j.id && !j.id.toUpperCase().includes('TEST') && !j.id.toUpperCase().includes('DUMMY'));
    return [...valid].sort((a, b) => {
      const aRaw = a.id.trim().toUpperCase();
      const bRaw = b.id.trim().toUpperCase();
      const countA = jobToolCounts.get(aRaw) || jobToolCounts.get(normalizeJobKey(a.id)) || 0;
      const countB = jobToolCounts.get(bRaw) || jobToolCounts.get(normalizeJobKey(b.id)) || 0;
      if (countB !== countA) return countB - countA;
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [jobs, jobToolCounts]);

  // Selected job: defaults to preSelectedJobId or empty ("-- All Jobs --")
  const [selectedJobId, setSelectedJobId] = useState<string>(preSelectedJobId || '');

  // Table filters & pagination
  const [tableSearchFilter, setTableSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'On Rig' | 'Returned' | 'Used' | 'Not Used'>('All');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Action menu state (3-vertical-dots)
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

  // Update selected job if preSelectedJobId changes externally
  useEffect(() => {
    if (preSelectedJobId) {
      setSelectedJobId(preSelectedJobId);
      setCurrentPage(1);
    }
  }, [preSelectedJobId]);

  // Reset page when job or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedJobId, tableSearchFilter, statusFilter]);

  // Currently selected job object (null if "All Jobs" is selected)
  const currentJob = useMemo(() => {
    if (!selectedJobId) return null;
    const norm = normalizeJobKey(selectedJobId);
    const raw = selectedJobId.trim().toUpperCase();
    return jobs.find((j) => j.id.trim().toUpperCase() === raw || normalizeJobKey(j.id) === norm) || null;
  }, [selectedJobId, jobs]);

  // Reconciled tool rows: if a job is selected, show that job's tools; if empty, show all dispatched tools
  const reconRows = useMemo(() => {
    const norm = selectedJobId ? normalizeJobKey(selectedJobId) : '';
    const raw = selectedJobId ? selectedJobId.trim().toUpperCase() : '';

    // Filter DTs & RTs
    const targetDTs = selectedJobId
      ? dtBatches.filter((dt) => {
          const dtJobRaw = (dt.jobId || dt.jobNumber || '').trim().toUpperCase();
          const dtJobNorm = normalizeJobKey(dt.jobId || dt.jobNumber || '');
          return dtJobRaw === raw || (dtJobNorm && dtJobNorm === norm);
        })
      : dtBatches;

    const targetRTs = selectedJobId
      ? rtBatches.filter((rt) => {
          const rtJobRaw = (rt.jobId || rt.jobNumber || '').trim().toUpperCase();
          const rtJobNorm = normalizeJobKey(rt.jobId || rt.jobNumber || '');
          return rtJobRaw === raw || (rtJobNorm && rtJobNorm === norm);
        })
      : rtBatches;

    // Map RT lines by serial and ticket number for rapid matching
    const rtLineLookups: {
      serial: string;
      assetNo: string;
      rtNumber: string;
      rtDate: string;
      used: boolean;
      condition?: string;
      jobKey: string;
      normJobKey: string;
    }[] = [];

    targetRTs.forEach((rt) => {
      const rtJob = (rt.jobId || rt.jobNumber || '').trim().toUpperCase();
      const rtNormJob = normalizeJobKey(rt.jobId || rt.jobNumber || '');
      (rt.toolLines || []).forEach((rtl) => {
        rtLineLookups.push({
          serial: (rtl.serial || '').trim().toUpperCase(),
          assetNo: (rtl.assetNo || '').trim().toUpperCase(),
          rtNumber: rt.rtNumber || (rt as any).rgtNo || 'RT-GEN',
          rtDate: rt.rtDate || rt.backloadRmDate || (rtl as any).rtDate || (rtl as any).dateIn || '',
          used: Boolean(rtl.used || rtl.condition === 'USED'),
          condition: rtl.condition,
          jobKey: rtJob,
          normJobKey: rtNormJob,
        });
      });
    });

    const rows: JobToolReconRow[] = [];

    targetDTs.forEach((dt) => {
      const dtJobKey = (dt.jobId || dt.jobNumber || '').trim().toUpperCase();
      const normJob = normalizeJobKey(dtJobKey);
      const linkedJob = jobsMap.get(dtJobKey) || jobsMap.get(normJob);

      const lines = dt.toolLines || [];
      lines.forEach((line, idx) => {
        const lineSerial = (line.serial || '').trim().toUpperCase();
        const lineAsset = (line.assetNo || '').trim().toUpperCase();

        // Match return ticket by serial or assetNo
        const matchedRT = rtLineLookups.find((r) => {
          const serialMatch = lineSerial && (r.serial === lineSerial || r.assetNo === lineSerial);
          const assetMatch = lineAsset && (r.serial === lineAsset || r.assetNo === lineAsset);
          const jobMatches = !selectedJobId || r.jobKey === dtJobKey || (r.normJobKey && r.normJobKey === normJob);
          return (serialMatch || assetMatch) && jobMatches;
        });

        let remark: 'Used' | 'Not Used' | 'On Rig' = 'On Rig';
        let retNum = '';
        let retDate = '';

        if (matchedRT) {
          retNum = matchedRT.rtNumber;
          retDate = matchedRT.rtDate;
          remark = matchedRT.used ? 'Used' : 'Not Used';
        } else if (line.status === 'Returned' || line.rtBatchId) {
          const directRt = rtBatches.find(
            (b) =>
              b.id === line.rtBatchId ||
              b.rtNumber === line.rtBatchId ||
              (b as any).rgtNo === line.rtBatchId ||
              (b.jobId && normalizeJobKey(b.jobId) === normJob)
          );
          retNum = directRt?.rtNumber || (directRt as any)?.rgtNo || line.rtBatchId || 'Returned';
          retDate = directRt?.rtDate || directRt?.backloadRmDate || (line as any).rtDate || (line as any).returnDate || (line as any).dateIn || (linkedJob?.demobDate || '');
          remark = line.used ? 'Used' : 'Not Used';
        }

        rows.push({
          jobNum: linkedJob?.id || dt.jobId || dt.jobNumber || '—',
          deliveryTicketNum: dt.dtNumber,
          deliveryDate: dt.deliveryDate || dt.rmDate || dt.dispatchDate || '',
          sNo: idx + 1,
          partNum: line.serial || line.assetNo || '—',
          partDescription: line.desc || line.shortDesc || 'Drilling Tool',
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

    return rows;
  }, [selectedJobId, dtBatches, rtBatches, jobsMap]);

  // Filtered rows based on status chip and search bar
  const filteredRows = useMemo(() => {
    return reconRows.filter((r) => {
      if (statusFilter === 'On Rig' && r.remark !== 'On Rig') return false;
      if (statusFilter === 'Returned' && r.remark === 'On Rig') return false;
      if (statusFilter === 'Used' && r.remark !== 'Used') return false;
      if (statusFilter === 'Not Used' && r.remark !== 'Not Used') return false;

      if (!tableSearchFilter.trim()) return true;
      const q = tableSearchFilter.toLowerCase();
      return (
        r.jobNum.toLowerCase().includes(q) ||
        r.partNum.toLowerCase().includes(q) ||
        r.partDescription.toLowerCase().includes(q) ||
        r.deliveryTicketNum.toLowerCase().includes(q) ||
        r.returnTicketNum.toLowerCase().includes(q) ||
        r.rigNum.toLowerCase().includes(q) ||
        r.wellNumber.toLowerCase().includes(q)
      );
    });
  }, [reconRows, statusFilter, tableSearchFilter]);

  // Paged rows for performance
  const totalPages = Math.ceil(filteredRows.length / pageSize) || 1;
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Summary Metrics
  const totalDispatched = reconRows.length;
  const returnedUsed = reconRows.filter((r) => r.remark === 'Used').length;
  const returnedNotUsed = reconRows.filter((r) => r.remark === 'Not Used').length;
  const activeOnRig = reconRows.filter((r) => r.remark === 'On Rig').length;

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      if (showToast) showToast('No tool records available to export.', 'info');
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
    XLSX.utils.book_append_sheet(wb, ws, 'Job_ToolsList');

    const fileName = currentJob?.id
      ? `${currentJob.id.replace(/[^a-zA-Z0-9_-]/g, '_')}_ToolsList.xlsx`
      : 'AllJobs_ToolsList.xlsx';

    XLSX.writeFile(wb, fileName);

    if (showToast) {
      showToast(`Exported ${filteredRows.length} tools to ${fileName}`, 'success');
    }
    setIsActionMenuOpen(false);
  };

  // Copy data to clipboard
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
      .slice(0, 500)
      .map((r) =>
        [
          r.jobNum,
          r.deliveryTicketNum,
          formatDateDDMMYYYY(r.deliveryDate) || r.deliveryDate,
          r.sNo,
          r.partNum,
          r.partDescription,
          r.returnTicketNum || '—',
          formatDateDDMMYYYY(r.returnDate) || r.returnDate || '—',
          r.remark,
          r.rigNum,
          r.wellNumber,
        ].join('\t')
      )
      .join('\n');

    navigator.clipboard.writeText(`${header}\n${body}`);
    if (showToast) showToast('Copied up to 500 records to clipboard.', 'success');
    setIsActionMenuOpen(false);
  };

  return (
    <div className="space-y-3.5 w-full animate-fade-in text-slate-800">
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
                  setSelectedJobId('');
                  setStatusFilter('All');
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

      {/* Control Panel: Job Selector & Search */}
      <div className="bg-white rounded-lg border border-slate-200/90 p-3 shadow-xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Job Dropdown Selector with clear button */}
          <div className="flex items-center gap-2 flex-1 min-w-[320px]">
            <label className="text-xs font-bold text-slate-700 shrink-0">
              Select Job:
            </label>

            <div className="flex items-center gap-1.5 flex-1 max-w-xl">
              <select
                value={selectedJobId}
                onChange={(e) => setSelectedJobId(e.target.value)}
                className="w-full text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-900 cursor-pointer"
              >
                <option value="">-- All Jobs (Show All Dispatched Tools) --</option>
                {sortedJobs.map((j) => {
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

              {/* Clear button to reset back to All Jobs */}
              {selectedJobId && (
                <button
                  type="button"
                  onClick={() => setSelectedJobId('')}
                  title="Clear selected job (Show all jobs)"
                  className="px-2 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-300 text-xs font-bold transition cursor-pointer shrink-0 flex items-center gap-1"
                >
                  <span>✕</span>
                  <span className="hidden sm:inline">All Jobs</span>
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
        <div className="bg-[#0b192c] rounded-lg p-3 text-white text-xs flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {currentJob ? (
              <>
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
              </>
            ) : (
              <div>
                <span className="text-[10px] text-slate-400 block uppercase font-bold">VIEW SCOPE</span>
                <span className="font-mono font-bold text-amber-300 text-sm">ALL DRILLING JOBS</span>
              </div>
            )}
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
      </div>

      {/* Main Reconciliation Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="font-bold text-slate-700">
            Reconciliation Tools ({filteredRows.length.toLocaleString()} tools)
          </div>
          <div className="text-slate-500 font-mono text-[11px]">
            {currentJob ? `Showing tools deployed on ${currentJob.id}` : 'Showing tools across all jobs'}
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
                        No tools found for this selection.
                      </div>
                      <div className="text-xs text-slate-500">
                        {selectedJobId
                          ? `Job ${selectedJobId} has no Delivery Tickets issued yet.`
                          : 'Try clearing the search or status filters.'}
                      </div>
                      {selectedJobId && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => setSelectedJobId('')}
                            className="px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs cursor-pointer transition"
                          >
                            Show All Jobs (All Dispatched Tools)
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pagedRows.map((r, idx) => (
                  <tr key={`${r.jobNum}-${r.deliveryTicketNum}-${r.sNo}-${idx}`} className="hover:bg-slate-50/80 transition">
                    <td className="px-3 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {r.jobNum}
                    </td>
                    <td className="px-3 py-2 font-mono text-blue-700 font-semibold whitespace-nowrap">
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
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredRows.length)} of {filteredRows.length.toLocaleString()} tools
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
