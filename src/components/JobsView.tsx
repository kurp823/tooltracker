import React, { useState, useMemo } from 'react';
import { DrillingJob, Callout, DTBatch, RTBatch, User } from '../types';

interface JobsViewProps {
  user?: User | null;
  jobs: DrillingJob[];
  callouts: Callout[];
  dtBatches: DTBatch[];
  rtBatches?: RTBatch[];
  onSaveJob: (job: DrillingJob) => void;
  onDispatchJob: (jobId: string) => void;
  onReceiveJob?: (jobId: string) => void;
  isNewJobModalOpen: boolean;
  onCloseNewJobModal: () => void;
  onOpenNewJobModal: () => void;
  selectedCalloutForNewJob?: Callout | null;
}

export const JobsView: React.FC<JobsViewProps> = ({
  user,
  jobs,
  callouts,
  dtBatches,
  rtBatches = [],
  onSaveJob,
  onDispatchJob,
  onReceiveJob,
  isNewJobModalOpen,
  onCloseNewJobModal,
  onOpenNewJobModal,
  selectedCalloutForNewJob,
}) => {
  const [tab, setTab] = useState<'all' | 'active' | 'completed' | 'invoiced' | 'closed'>('all');
  const [search, setSearch] = useState('');
  const [selectedJobDetail, setSelectedJobDetail] = useState<DrillingJob | null>(null);

  // Sorting State - default Ascending for predictable numeric sequence (00001, 00002, 00003)
  const [sortField, setSortField] = useState<'id' | 'client' | 'rig' | 'mobDate' | 'toolsOnRig'>('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Status Edit Modal State inside Job Detail & Table
  const [editingJobStatus, setEditingJobStatus] = useState<DrillingJob | null>(null);
  const [newStatusValue, setNewStatusValue] = useState<string>('Ongoing');
  const [statusDate, setStatusDate] = useState(new Date().toISOString().split('T')[0]);
  const [statusNotes, setStatusNotes] = useState('');
  const [statusInvoiceNo, setStatusInvoiceNo] = useState('');

  // New Job Form States
  const [selectedCalloutId, setSelectedCalloutId] = useState<string>(
    selectedCalloutForNewJob ? selectedCalloutForNewJob.id : ''
  );
  const [newRig, setNewRig] = useState(selectedCalloutForNewJob ? selectedCalloutForNewJob.rig : '');
  const [newWell, setNewWell] = useState(selectedCalloutForNewJob ? selectedCalloutForNewJob.well : '');
  const [newClient, setNewClient] = useState(selectedCalloutForNewJob ? selectedCalloutForNewJob.client : '');
  const [newContract, setNewContract] = useState(
    selectedCalloutForNewJob ? selectedCalloutForNewJob.contract || '' : 'ADNOC Onshore'
  );
  const [newPoNumber, setNewPoNumber] = useState(
    selectedCalloutForNewJob ? selectedCalloutForNewJob.poRef || '' : ''
  );
  const [newClientRef, setNewClientRef] = useState('');
  const [newHoleSection, setNewHoleSection] = useState('12-1/4"');
  const [newServiceType, setNewServiceType] = useState('Downhole Rental');
  const [newInvoicingType, setNewInvoicingType] = useState<'PerJob' | 'Monthly'>('PerJob');
  const [newCurrency, setNewCurrency] = useState('USD');
  const [newMobDate, setNewMobDate] = useState(new Date().toISOString().split('T')[0]);

  const handleCalloutChange = (calId: string) => {
    setSelectedCalloutId(calId);
    if (!calId) return;
    const found = callouts.find((c) => c.id === calId);
    if (found) {
      setNewRig(found.rig);
      setNewWell(found.well);
      setNewClient(found.client);
      if (found.contract) setNewContract(found.contract);
      if (found.poRef) setNewPoNumber(found.poRef);
    }
  };

  const handleCreateJobSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRig || !newWell || !newClient) {
      alert('Please fill in Rig, Well, and Client.');
      return;
    }

    const curYr = new Date().getFullYear().toString().slice(-2);
    const jobNums = jobs
      .map((j) => {
        const m = j.id.match(/\d+$/);
        return m ? parseInt(m[0], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const nextSeq = jobNums.length > 0 ? Math.max(...jobNums) + 1 : 1;
    const newJobId = `JOB-${curYr}-${String(nextSeq).padStart(5, '0')}`;

    const newJob: DrillingJob = {
      id: newJobId,
      calloutId: selectedCalloutId || null,
      rig: newRig.trim(),
      well: newWell.trim(),
      client: newClient.trim(),
      contract: newContract.trim(),
      poNumber: newPoNumber.trim(),
      clientRef: newClientRef.trim(),
      holeSection: newHoleSection,
      serviceType: newServiceType,
      invoicingType: newInvoicingType,
      currency: newCurrency,
      mobDate: newMobDate,
      status: 'Open',
      createdDate: new Date().toISOString().split('T')[0],
      createdBy: user?.name || 'Operations',
    };

    onSaveJob(newJob);
    onCloseNewJobModal();
  };

  // Helper to extract numeric sequence for clean sorting
  const extractSeq = (idStr: string) => {
    const m = idStr.match(/\d+$/);
    return m ? parseInt(m[0], 10) : 0;
  };

  const handleSortToggle = (field: 'id' | 'client' | 'rig' | 'mobDate' | 'toolsOnRig') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Filtered and Sorted Jobs
  const filteredAndSortedJobs = useMemo(() => {
    const list = jobs.filter((j) => {
      const isActive = ['Open', 'Ongoing', 'Active'].includes(j.status);
      const isCompleted = ['Completed', 'Job completed', 'Job completed and waiting signed docs'].includes(j.status);
      const isInvoiced =
        ['Final invoiced', 'Draft invoiced', 'Under SES approval', 'Tickets submitted to billing team'].includes(j.status) ||
        Boolean(j.legalInvoiceNumber);
      const isClosed = j.status === 'Closed';

      if (tab === 'active' && !isActive) return false;
      if (tab === 'completed' && !isCompleted) return false;
      if (tab === 'invoiced' && !isInvoiced) return false;
      if (tab === 'closed' && !isClosed) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const full = `${j.id} ${j.calloutId || ''} ${j.rig} ${j.well} ${j.client} ${j.contract || ''} ${
          j.poNumber || ''
        } ${j.legalInvoiceNumber || ''}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'id') {
        comparison = extractSeq(a.id) - extractSeq(b.id);
      } else if (sortField === 'client') {
        comparison = a.client.localeCompare(b.client);
      } else if (sortField === 'rig') {
        comparison = a.rig.localeCompare(b.rig);
      } else if (sortField === 'mobDate') {
        comparison = (a.mobDate || '').localeCompare(b.mobDate || '');
      } else if (sortField === 'toolsOnRig') {
        const aDTs = dtBatches.filter((x) => x.jobId === a.id).reduce((s, x) => s + x.toolLines.length, 0);
        const aRTs = rtBatches.filter((x) => x.jobId === a.id).reduce((s, x) => s + x.toolLines.length, 0);
        const bDTs = dtBatches.filter((x) => x.jobId === b.id).reduce((s, x) => s + x.toolLines.length, 0);
        const bRTs = rtBatches.filter((x) => x.jobId === b.id).reduce((s, x) => s + x.toolLines.length, 0);
        comparison = (aDTs - aRTs) - (bDTs - bRTs);
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [jobs, tab, search, sortField, sortOrder, dtBatches, rtBatches]);

  const handleUpdateStatusSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingJobStatus) return;

    const updated: DrillingJob = {
      ...editingJobStatus,
      status: newStatusValue as any,
    };

    if (statusInvoiceNo.trim()) {
      updated.legalInvoiceNumber = statusInvoiceNo.trim();
    }

    if (newStatusValue === 'Final invoiced' && !updated.legalInvoiceNumber && statusInvoiceNo.trim()) {
      updated.legalInvoiceNumber = statusInvoiceNo.trim();
    }

    if (newStatusValue === 'Completed') {
      updated.demobDate = statusDate;
    }

    if (statusNotes) {
      updated.notes = updated.notes
        ? `${updated.notes}\n[${statusDate}]: ${statusNotes}`
        : `[${statusDate}]: ${statusNotes}`;
    }

    onSaveJob(updated);
    if (selectedJobDetail?.id === updated.id) {
      setSelectedJobDetail(updated);
    }
    setEditingJobStatus(null);
  };

  const getJobStatusBadge = (status: string) => {
    if (status === 'Open' || status === 'Active') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          ⚡ Open
        </span>
      );
    }
    if (status === 'Ongoing') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
          🔄 Ongoing
        </span>
      );
    }
    if (status === 'Final invoiced') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-400 inline-flex items-center gap-1 shadow-2xs">
          <span>🧾</span> Final Invoiced
        </span>
      );
    }
    if (status === 'Draft invoiced') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-400 inline-flex items-center gap-1">
          <span>📝</span> Draft Invoiced
        </span>
      );
    }
    if (status === 'Under SES approval') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-400 inline-flex items-center gap-1">
          <span>⏳</span> Under SES
        </span>
      );
    }
    if (status === 'Tickets submitted to billing team') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-400 inline-flex items-center gap-1">
          <span>📤</span> In Billing
        </span>
      );
    }
    if (['Completed', 'Job completed', 'Job completed and waiting signed docs'].includes(status)) {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
          🏁 Completed
        </span>
      );
    }
    if (status === 'Closed') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700 border border-slate-300">
          📁 Closed
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700">
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-4 w-full">
      {/* Ribbon */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="text-[11px] text-slate-500 font-semibold tracking-wide uppercase">
            Operations &amp; Rig Dispatch Control
          </div>
          <h1 className="text-lg font-extrabold text-[#1a3055] tracking-tight">
            Drilling Jobs Management
          </h1>
          <div className="text-xs text-slate-600 mt-0.5">
            Active rig operations, downhole tool balance on rigs (DT vs RT), and work order tracking.
          </div>
        </div>
        {user?.role !== 'Viewer' && (
          <button
            onClick={onOpenNewJobModal}
            className="px-3.5 py-1.5 rounded bg-[#1a3055] text-white font-bold text-xs hover:bg-[#24426d] shadow-sm transition cursor-pointer flex items-center gap-1.5"
          >
            <span>+</span> New Drilling Job
          </button>
        )}
      </div>

      {/* Operational Filter Tabs & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex bg-white rounded border border-[#b8c9db] p-0.5 overflow-x-auto shadow-2xs">
          <button
            onClick={() => setTab('all')}
            className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              tab === 'all' ? 'bg-[#1a3055] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Jobs ({jobs.length})
          </button>
          <button
            onClick={() => setTab('active')}
            className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              tab === 'active' ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ⚡ Open / Ongoing ({jobs.filter((j) => ['Open', 'Ongoing', 'Active'].includes(j.status)).length})
          </button>
          <button
            onClick={() => setTab('completed')}
            className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              tab === 'completed' ? 'bg-amber-600 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🏁 Completed ({jobs.filter((j) => ['Completed', 'Job completed', 'Job completed and waiting signed docs'].includes(j.status)).length})
          </button>
          <button
            onClick={() => setTab('invoiced')}
            className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              tab === 'invoiced' ? 'bg-emerald-800 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🧾 Invoiced ({jobs.filter((j) => ['Final invoiced', 'Draft invoiced', 'Under SES approval', 'Tickets submitted to billing team'].includes(j.status) || Boolean(j.legalInvoiceNumber)).length})
          </button>
          <button
            onClick={() => setTab('closed')}
            className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              tab === 'closed' ? 'bg-slate-700 text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📁 Closed ({jobs.filter((j) => j.status === 'Closed').length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job #, rig, well, client, PO, inv..."
            className="bg-white border border-[#b8c9db] rounded px-3 py-1 text-xs w-64 outline-none font-medium focus:ring-1 focus:ring-amber-400"
          />
        </div>
      </div>

      {/* Main Jobs Table - Full Screen Width, Properly Sorted */}
      <div className="bg-white border border-[#b8c9db] rounded shadow-sm overflow-hidden w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-[#24476b] border-b border-[#b8c9db] font-bold select-none">
              <tr>
                <th
                  onClick={() => handleSortToggle('id')}
                  className="px-3.5 py-2.5 cursor-pointer hover:bg-slate-100"
                >
                  Job # {sortField === 'id' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="px-3.5 py-2.5">Callout Ref</th>
                <th
                  onClick={() => handleSortToggle('client')}
                  className="px-3.5 py-2.5 cursor-pointer hover:bg-slate-100"
                >
                  Contract / Client {sortField === 'client' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('rig')}
                  className="px-3.5 py-2.5 cursor-pointer hover:bg-slate-100"
                >
                  Rig / Well {sortField === 'rig' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="px-3.5 py-2.5">PO Number</th>
                <th
                  onClick={() => handleSortToggle('mobDate')}
                  className="px-3.5 py-2.5 cursor-pointer hover:bg-slate-100"
                >
                  Mob Date {sortField === 'mobDate' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="px-3 py-2.5 text-center bg-blue-50/50">DT Tools</th>
                <th className="px-3 py-2.5 text-center bg-emerald-50/50">RT Tools</th>
                <th
                  onClick={() => handleSortToggle('toolsOnRig')}
                  className="px-3.5 py-2.5 text-center bg-amber-50/50 cursor-pointer hover:bg-amber-100"
                >
                  Tools on Rig {sortField === 'toolsOnRig' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="px-3.5 py-2.5">Job Status</th>
                <th className="px-3.5 py-2.5">Legal Invoice NO</th>
                <th className="px-3.5 py-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {filteredAndSortedJobs.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-12 text-center text-slate-500 font-medium">
                    No drilling jobs match the filter criteria.
                  </td>
                </tr>
              ) : (
                filteredAndSortedJobs.map((job) => {
                  const jobDTs = dtBatches.filter((b) => b.jobId === job.id);
                  const jobRTs = rtBatches.filter((b) => b.jobId === job.id);
                  const dtToolsCount = jobDTs.reduce((s, b) => s + b.toolLines.length, 0);
                  const rtToolsCount = jobRTs.reduce((s, b) => s + b.toolLines.length, 0);
                  const toolsOnRig = Math.max(0, dtToolsCount - rtToolsCount);

                  return (
                    <tr key={job.id} className="hover:bg-[#e4eef8] transition">
                      <td className="px-3.5 py-2.5 font-mono font-bold text-amber-900 text-[12px]">
                        {job.id}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-[11px] text-slate-500">
                        {job.calloutId || '—'}
                      </td>
                      <td className="px-3.5 py-2.5 font-bold text-[#1a3055]">
                        {job.contract || job.client}
                      </td>
                      <td className="px-3.5 py-2.5 font-medium">
                        <span className="font-bold text-slate-900">{job.rig}</span>{' '}
                        <span className="text-slate-400">|</span>{' '}
                        <span className="text-slate-600">{job.well}</span>
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-slate-600 text-[11px]">
                        {job.poNumber || '—'}
                      </td>
                      <td className="px-3.5 py-2.5 font-mono text-slate-700">{job.mobDate || '—'}</td>
                      
                      {/* DT Tools Count */}
                      <td className="px-3 py-2.5 font-mono font-bold text-blue-700 text-center bg-blue-50/20">
                        {dtToolsCount}
                      </td>

                      {/* RT Tools Count */}
                      <td className="px-3 py-2.5 font-mono font-bold text-emerald-700 text-center bg-emerald-50/20">
                        {rtToolsCount}
                      </td>

                      {/* Highlighted Tools on Rig */}
                      <td className="px-3.5 py-2.5 text-center bg-amber-50/30">
                        <span
                          className={`px-2 py-0.5 rounded font-mono font-extrabold text-xs inline-block ${
                            toolsOnRig > 0
                              ? 'bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {toolsOnRig}
                        </span>
                      </td>

                      {/* Renamed Job Status */}
                      <td className="px-3.5 py-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingJobStatus(job);
                            setNewStatusValue(job.status);
                            setStatusInvoiceNo(job.legalInvoiceNumber || '');
                            setStatusDate(new Date().toISOString().split('T')[0]);
                            setStatusNotes('');
                          }}
                          className="hover:opacity-85 transition cursor-pointer text-left focus:outline-none"
                          title="Click to update job status"
                        >
                          {getJobStatusBadge(job.status)}
                        </button>
                      </td>

                      {/* Renamed Legal Invoice NO */}
                      <td className="px-3.5 py-2.5 font-mono text-[11px]">
                        {job.legalInvoiceNumber ? (
                          <div className="flex flex-col gap-1">
                            {job.legalInvoiceNumber
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .map((inv) => (
                                <span
                                  key={inv}
                                  className="font-bold text-emerald-900 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-300 text-[10px] w-fit inline-flex items-center gap-1 shadow-2xs"
                                >
                                  <span>🧾</span> {inv}
                                </span>
                              ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Operational Actions */}
                      <td className="px-3.5 py-2.5 text-center space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => setSelectedJobDetail(job)}
                          className="text-blue-700 hover:underline font-bold text-[11px] cursor-pointer"
                        >
                          View Details
                        </button>
                        {['Open', 'Ongoing', 'Active'].includes(job.status) && user?.role !== 'Viewer' && (
                          <button
                            onClick={() => onDispatchJob(job.id)}
                            className="px-2 py-0.5 rounded bg-emerald-600 text-white font-bold text-[10px] hover:bg-emerald-700 cursor-pointer shadow-2xs"
                            title="Dispatch Delivery Ticket"
                          >
                            + Dispatch DT
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Job Modal */}
      {isNewJobModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) onCloseNewJobModal();
          }}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <h3 className="font-bold text-sm">Create New Drilling Job</h3>
              <button
                onClick={onCloseNewJobModal}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateJobSubmit} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Link to Rig Callout (Auto-populates details)</label>
                <select
                  value={selectedCalloutId}
                  onChange={(e) => handleCalloutChange(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5 font-medium"
                >
                  <option value="">— No linked callout (Manual entry) —</option>
                  {callouts
                    .filter((c) => c.status !== 'Closed')
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} — {c.rig} / {c.well} ({c.client})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Rig *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ND-11"
                    value={newRig}
                    onChange={(e) => setNewRig(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Well *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BU-324"
                    value={newWell}
                    onChange={(e) => setNewWell(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Client *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ADNOC Onshore"
                    value={newClient}
                    onChange={(e) => setNewClient(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Master Contract</label>
                  <select
                    value={newContract}
                    onChange={(e) => setNewContract(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-bold"
                  >
                    <option value="ADNOC Onshore">ADNOC Onshore</option>
                    <option value="ADNOC Drilling">ADNOC Drilling</option>
                    <option value="ADNOC Offshore">ADNOC Offshore</option>
                    <option value="Turnwell">Turnwell</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1">Client PO / Work Order #</label>
                  <input
                    type="text"
                    placeholder="e.g. 4500998124"
                    value={newPoNumber}
                    onChange={(e) => setNewPoNumber(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Hole Section</label>
                  <input
                    type="text"
                    placeholder='e.g. 12-1/4"'
                    value={newHoleSection}
                    onChange={(e) => setNewHoleSection(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold mb-1">Service Type</label>
                  <select
                    value={newServiceType}
                    onChange={(e) => setNewServiceType(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5"
                  >
                    <option value="Downhole Rental">Downhole Rental</option>
                    <option value="Fishing">Fishing Operations</option>
                    <option value="Whipstock">Whipstock / Sidetrack</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">Invoicing Method</label>
                  <select
                    value={newInvoicingType}
                    onChange={(e) => setNewInvoicingType(e.target.value as 'PerJob' | 'Monthly')}
                    className="w-full border rounded px-2.5 py-1.5 font-bold"
                  >
                    <option value="PerJob">Per Job</option>
                    <option value="Monthly">Monthly Billing</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">Mob Date</label>
                  <input
                    type="date"
                    value={newMobDate}
                    onChange={(e) => setNewMobDate(e.target.value)}
                    className="w-full border rounded px-2.5 py-1.5 font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={onCloseNewJobModal}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-amber-400 text-[#1a3055] font-bold hover:bg-amber-500 shadow-sm cursor-pointer"
                >
                  Create Job &rarr;
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Operational Job Detail Modal */}
      {selectedJobDetail && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedJobDetail(null);
          }}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-sm">Job: {selectedJobDetail.id}</h3>
                  {getJobStatusBadge(selectedJobDetail.status)}
                </div>
                <div className="text-[11px] text-slate-300">
                  {selectedJobDetail.rig} / {selectedJobDetail.well} &bull; {selectedJobDetail.client}
                </div>
              </div>
              <button
                onClick={() => setSelectedJobDetail(null)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <div className="p-4 space-y-4 text-xs">
              {/* Parameter Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded border border-slate-200">
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Client:</span>
                  <span className="font-bold text-[#1a3055]">{selectedJobDetail.client}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Contract:</span>
                  <span>{selectedJobDetail.contract || '—'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">PO Number:</span>
                  <span className="font-mono">{selectedJobDetail.poNumber || '—'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Mob Date:</span>
                  <span className="font-mono">{selectedJobDetail.mobDate || '—'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Hole Section:</span>
                  <span className="font-mono">{selectedJobDetail.holeSection || '12-1/4"'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Service Type:</span>
                  <span>{selectedJobDetail.serviceType || 'Downhole Rental'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Invoicing Type:</span>
                  <span>{selectedJobDetail.invoicingType || 'PerJob'}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 block text-[10px]">Legal Invoice NO:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {selectedJobDetail.legalInvoiceNumber || 'Pending'}
                  </span>
                </div>
              </div>

              {/* Status Update Quick Bar */}
              {user?.role !== 'Viewer' && (
                <div className="p-3 bg-slate-50 rounded border border-slate-200 flex items-center justify-between">
                  <div className="text-xs">
                    <span className="font-bold text-slate-700">Update Operational Status:</span>
                    <span className="ml-2 font-semibold text-slate-600">
                      Currently {selectedJobDetail.status}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setEditingJobStatus(selectedJobDetail);
                      setNewStatusValue(selectedJobDetail.status);
                      setStatusInvoiceNo(selectedJobDetail.legalInvoiceNumber || '');
                      setStatusDate(new Date().toISOString().split('T')[0]);
                      setStatusNotes('');
                    }}
                    className="px-2.5 py-1 rounded bg-[#1a3055] text-white hover:bg-[#24426d] font-bold text-[11px] cursor-pointer"
                  >
                    Change Status &rarr;
                  </button>
                </div>
              )}

              {/* Delivery Tickets Linked */}
              <div>
                <h4 className="font-bold text-slate-700 mb-1.5">
                  Dispatched Delivery Tickets (DTs)
                </h4>
                {dtBatches.filter((b) => b.jobId === selectedJobDetail.id).length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded border border-slate-200 text-center text-slate-400">
                    No delivery tickets dispatched for this job yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dtBatches
                      .filter((b) => b.jobId === selectedJobDetail.id)
                      .map((b) => (
                        <div key={b.id} className="border border-slate-200 rounded p-2.5 bg-slate-50">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-mono font-bold text-amber-900">{b.dtNumber}</span>
                            <span className="text-slate-500 text-[10px]">
                              Date: <strong>{b.rmDate}</strong> &bull; Total Tools:{' '}
                              <strong>{b.toolLines.length}</strong>
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 font-mono">
                            {b.toolLines.map((t) => `${t.serial} (${t.shortDesc})`).join(', ')}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Backloaded Receiving Tickets Linked */}
              <div>
                <h4 className="font-bold text-slate-700 mb-1.5">
                  Backloaded Receiving Tickets (RTs)
                </h4>
                {rtBatches.filter((b) => b.jobId === selectedJobDetail.id).length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded border border-slate-200 text-center text-slate-400">
                    No tools backloaded via Receiving Tickets yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {rtBatches
                      .filter((b) => b.jobId === selectedJobDetail.id)
                      .map((b) => (
                        <div key={b.id} className="border border-slate-200 rounded p-2.5 bg-emerald-50/40">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-mono font-bold text-emerald-900">{b.rtNumber}</span>
                            <span className="text-slate-500 text-[10px]">
                              Received: <strong>{b.rtDate}</strong> &bull; Returned Tools:{' '}
                              <strong>{b.toolLines.length}</strong>
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 font-mono">
                            {b.toolLines.map((t) => `${t.serial} (${t.shortDesc})`).join(', ')}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-[#b8c9db] flex justify-end space-x-2 flex-shrink-0 text-xs">
              <button
                onClick={() => setSelectedJobDetail(null)}
                className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Operational Status Edit Modal */}
      {editingJobStatus && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingJobStatus(null);
          }}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden border border-slate-300">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm">Update Job Operational &amp; Billing Status</h3>
                <div className="text-[11px] text-blue-200 font-mono">
                  {editingJobStatus.id} &bull; {editingJobStatus.client} &bull; {editingJobStatus.rig}
                </div>
              </div>
              <button
                onClick={() => setEditingJobStatus(null)}
                className="text-white/80 hover:text-amber-300 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleUpdateStatusSubmit} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Status Classification *</label>
                <select
                  value={newStatusValue}
                  onChange={(e) => setNewStatusValue(e.target.value)}
                  className="w-full border rounded px-3 py-2 font-bold bg-white text-slate-800"
                >
                  <optgroup label="1. Operational Stages">
                    <option value="Open">⚡ Open (Awaiting Mobilization)</option>
                    <option value="Ongoing">🔄 Ongoing Operations</option>
                    <option value="Completed">🏁 Completed (Finished Operations)</option>
                  </optgroup>
                  <optgroup label="2. Commercial Invoicing &amp; Billing Stages">
                    <option value="Job completed and waiting signed docs">⏳ Waiting Signed Docs (Signed DT/RT)</option>
                    <option value="Tickets submitted to billing team">📤 Tickets Submitted to Billing Team</option>
                    <option value="Draft invoiced">📝 Draft Invoiced</option>
                    <option value="Under SES approval">🔍 Under SES Approval</option>
                    <option value="Final invoiced">🧾 Final Invoiced (Commercial)</option>
                  </optgroup>
                  <optgroup label="3. Archival">
                    <option value="Closed">📁 Closed / Archived</option>
                  </optgroup>
                </select>
              </div>

              {/* Legal Invoice Number(s) */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Legal Invoice NO (Separate multiple with comma)
                </label>
                <input
                  type="text"
                  value={statusInvoiceNo}
                  onChange={(e) => setStatusInvoiceNo(e.target.value)}
                  placeholder="e.g. INV-202608-JOB00003, INV-202609-JOB00003"
                  className="w-full border rounded px-3 py-1.5 font-mono text-emerald-800 font-bold placeholder:text-slate-400 placeholder:font-normal"
                />
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Synced across Operations and Commercial Billing views.
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Effective Date</label>
                <input
                  type="date"
                  value={statusDate}
                  onChange={(e) => setStatusDate(e.target.value)}
                  className="w-full border rounded px-3 py-1.5 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Operations / Billing Remarks</label>
                <textarea
                  rows={2}
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  placeholder="e.g. August and September invoices reconciled and submitted to client."
                  className="w-full border rounded px-3 py-1.5 text-xs"
                />
              </div>

              <div className="pt-3 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingJobStatus(null)}
                  className="px-3 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#1a3055] text-white font-bold hover:bg-[#24426d] shadow cursor-pointer"
                >
                  Save Status &rarr;
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
