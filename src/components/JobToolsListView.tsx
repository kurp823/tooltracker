import React, { useState, useMemo } from 'react';
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
  onNavigate,
  showToast,
}) => {
  // Sort jobs by most recent / active first
  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => (b.id || '').localeCompare(a.id || ''));
  }, [jobs]);

  const [selectedJobId, setSelectedJobId] = useState<string>(() => {
    if (preSelectedJobId) return preSelectedJobId;
    return sortedJobs[0]?.id || '';
  });

  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'On Rig' | 'Returned' | 'Used' | 'Not Used'>('All');

  // Currently selected job object
  const currentJob = useMemo(() => {
    if (!selectedJobId) return null;
    const norm = normalizeJobKey(selectedJobId);
    return jobs.find((j) => j.id === selectedJobId || normalizeJobKey(j.id) === norm) || null;
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

    // Flatten RT lines with ticket metadata for quick lookup
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
        // Look up return ticket for this serial
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

  // Filtered rows based on user input
  const filteredRows = useMemo(() => {
    return reconRows.filter((r) => {
      if (statusFilter === 'On Rig' && r.remark !== 'On Rig') return false;
      if (statusFilter === 'Returned' && r.remark === 'On Rig') return false;
      if (statusFilter === 'Used' && r.remark !== 'Used') return false;
      if (statusFilter === 'Not Used' && r.remark !== 'Not Used') return false;

      if (!searchFilter.trim()) return true;
      const q = searchFilter.toLowerCase();
      return (
        r.partNum.toLowerCase().includes(q) ||
        r.partDescription.toLowerCase().includes(q) ||
        r.deliveryTicketNum.toLowerCase().includes(q) ||
        r.returnTicketNum.toLowerCase().includes(q) ||
        r.rigNum.toLowerCase().includes(q) ||
        r.wellNumber.toLowerCase().includes(q)
      );
    });
  }, [reconRows, statusFilter, searchFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = reconRows.length;
    const onRig = reconRows.filter((r) => r.remark === 'On Rig').length;
    const returned = total - onRig;
    const used = reconRows.filter((r) => r.remark === 'Used').length;
    const notUsed = reconRows.filter((r) => r.remark === 'Not Used').length;
    return { total, onRig, returned, used, notUsed };
  }, [reconRows]);

  // Export to Excel (.xlsx) matching Epicor Kinetic export
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
    XLSX.utils.book_append_sheet(wb, ws, 'Job_ToolsList');
    const safeJobId = (currentJob?.id || 'JOB').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(wb, `JST_Job_ToolsList_${safeJobId}.xlsx`);

    if (showToast) showToast(`Exported ${exportData.length} records to Excel.`, 'success');
  };

  return (
    <div className="space-y-4 w-full">
      {/* Top Header matching ERP Kinetic Banner */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
            Operations &bull; Job Reconciliation Manifest
          </div>
          <h1 className="text-lg font-extrabold text-[#1a3055] tracking-tight flex items-center gap-2">
            <span>📋</span> JST_Job_ToolsList
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Real-time job-wise equipment reconciliation. Every tool dispatched on Delivery Tickets (DT) vs. received on Backload Tickets (RT).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded border border-emerald-800 flex items-center gap-1.5 shadow-xs cursor-pointer transition"
            title="Export Job Tools List to Excel (.xlsx)"
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
              Select Job (JobNum):
            </label>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-bold text-[#1a3055] font-mono shadow-2xs focus:outline-none focus:border-[#1a3055]"
            >
              {sortedJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.id} — Rig: {j.rig || 'Unassigned'} {j.well ? `(${j.well})` : ''} [{j.client || 'Client'}]
                </option>
              ))}
            </select>
          </div>

          {/* Quick Search inside Table */}
          <div className="relative min-w-[200px]">
            <input
              type="text"
              placeholder="Search serial, part, ticket..."
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
          {(['All', 'On Rig', 'Returned', 'Used', 'Not Used'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition ${
                statusFilter === st
                  ? 'bg-[#1a3055] text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Selected Job Operational Summary Banner */}
      {currentJob && (
        <div className="bg-[#1a3055] text-white rounded p-3 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 text-xs shadow-sm">
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-semibold block">Job Number</span>
            <span className="font-mono font-bold text-amber-300 text-sm">{currentJob.id}</span>
          </div>
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-semibold block">Rig / Assignment</span>
            <span className="font-bold text-white text-xs">{currentJob.rig || 'Unassigned'}</span>
          </div>
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-semibold block">Wellbore</span>
            <span className="text-slate-200 text-xs">{currentJob.well || '—'}</span>
          </div>
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-semibold block">Client Operator</span>
            <span className="text-slate-200 text-xs truncate block">{currentJob.client || '—'}</span>
          </div>
          <div className="text-center sm:text-left">
            <span className="text-slate-400 text-[10px] uppercase font-semibold block">Dispatched (DT)</span>
            <span className="font-mono font-bold text-white text-sm">{stats.total}</span>
          </div>
          <div className="text-center sm:text-left">
            <span className="text-slate-400 text-[10px] uppercase font-semibold block">Returned (RT)</span>
            <span className="font-mono font-bold text-emerald-300 text-sm">
              {stats.returned} <span className="text-[10px] font-normal text-slate-300">({stats.used} used)</span>
            </span>
          </div>
          <div className="text-center sm:text-left">
            <span className="text-slate-400 text-[10px] uppercase font-semibold block">Active On Rig</span>
            <span className={`font-mono font-bold text-sm ${stats.onRig > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-300'}`}>
              {stats.onRig}
            </span>
          </div>
        </div>
      )}

      {/* Main Reconciliation Table Matching Epicor Kinetic Screenshot */}
      <div className="bg-white border border-[#b8c9db] rounded shadow-sm overflow-hidden">
        <div className="bg-[#b8d0e8] px-3 py-1.5 border-b border-[#9bb8d4] flex items-center justify-between">
          <span className="font-bold text-xs text-[#1a3055] tracking-wide flex items-center gap-1.5">
            <span>^</span> Job_ToolsList ({filteredRows.length} tools)
          </span>
          <span className="text-[11px] text-slate-600 font-medium">
            Showing tools deployed on {currentJob?.id || 'selected job'}
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
                    No tools found for this job and filter combination.
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
