import React, { useState, useMemo } from 'react';
import { DrillingJob, JobLifecycleStatus, DTBatch, RTBatch, NavModule, User } from '../types';

interface BillingDashboardViewProps {
  user?: User | null;
  jobs: DrillingJob[];
  dtBatches: DTBatch[];
  rtBatches: RTBatch[];
  onNavigate: (mod: NavModule) => void;
  onUpdateJob: (updatedJob: DrillingJob) => void;
}

export const BillingDashboardView: React.FC<BillingDashboardViewProps> = ({
  user,
  jobs,
  dtBatches,
  rtBatches,
  onNavigate,
  onUpdateJob,
}) => {
  const [filterStage, setFilterStage] = useState<string>('all');
  const [search, setSearch] = useState<string>('');

  // Transition Modal State
  const [activeJobForAction, setActiveJobForAction] = useState<DrillingJob | null>(null);
  const [actionType, setActionType] = useState<
    'submit_billing' | 'draft_invoice' | 'ses_approval' | 'final_invoice' | null
  >(null);
  const [inputNumber, setInputNumber] = useState('');
  const [inputAmount, setInputAmount] = useState<number | string>('');
  const [inputDate, setInputDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // 1. Pipeline Counts
  const completedJobs = useMemo(
    () =>
      jobs.filter((j) =>
        [
          'Job completed and waiting signed docs',
          'Job completed',
          'Tickets submitted to billing team',
          'Draft invoiced',
          'Under SES approval',
          'Final invoiced',
          'Closed',
        ].includes(j.status)
      ),
    [jobs]
  );

  const waitingSignedDocs = useMemo(
    () => jobs.filter((j) => j.status === 'Job completed and waiting signed docs'),
    [jobs]
  );

  const submittedToBilling = useMemo(
    () => jobs.filter((j) => j.status === 'Tickets submitted to billing team'),
    [jobs]
  );

  const draftInvoiced = useMemo(
    () => jobs.filter((j) => j.status === 'Draft invoiced'),
    [jobs]
  );

  const underSes = useMemo(
    () => jobs.filter((j) => j.status === 'Under SES approval'),
    [jobs]
  );

  const finalInvoiced = useMemo(
    () => jobs.filter((j) => j.status === 'Final invoiced' || j.status === 'Closed'),
    [jobs]
  );

  const totalBilledValue = useMemo(() => {
    return finalInvoiced.reduce((acc, j) => acc + (j.invoiceAmount || 0), 0);
  }, [finalInvoiced]);

  // Sorting state for predictable alignment (default Ascending JOB-00001, JOB-00002, JOB-00003)
  const [sortField, setSortField] = useState<'id' | 'client' | 'rig' | 'status' | 'po'>('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const extractSeq = (idStr: string) => {
    const m = idStr.match(/\d+$/);
    return m ? parseInt(m[0], 10) : 0;
  };

  const handleSortToggle = (field: 'id' | 'client' | 'rig' | 'status' | 'po') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Filtered and Sorted jobs list
  const displayedJobs = useMemo(() => {
    let list = [...jobs];
    if (filterStage === 'waiting_docs') list = [...waitingSignedDocs];
    else if (filterStage === 'submitted_billing') list = [...submittedToBilling];
    else if (filterStage === 'draft_invoiced') list = [...draftInvoiced];
    else if (filterStage === 'under_ses') list = [...underSes];
    else if (filterStage === 'final_invoiced') list = [...finalInvoiced];
    else if (filterStage === 'completed') list = [...completedJobs];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((j) =>
        `${j.id} ${j.client} ${j.rig} ${j.well} ${j.poNumber || ''} ${j.status} ${j.legalInvoiceNumber || ''} ${j.draftInvoiceNumber || ''} ${j.sesNumber || ''}`
          .toLowerCase()
          .includes(q)
      );
    }

    return list.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'id') {
        comparison = extractSeq(a.id) - extractSeq(b.id);
      } else if (sortField === 'client') {
        comparison = a.client.localeCompare(b.client);
      } else if (sortField === 'rig') {
        comparison = a.rig.localeCompare(b.rig);
      } else if (sortField === 'status') {
        comparison = a.status.localeCompare(b.status);
      } else if (sortField === 'po') {
        comparison = (a.poNumber || '').localeCompare(b.poNumber || '');
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [
    jobs,
    filterStage,
    search,
    sortField,
    sortOrder,
    waitingSignedDocs,
    submittedToBilling,
    draftInvoiced,
    underSes,
    finalInvoiced,
    completedJobs,
  ]);

  // Handle Lifecycle Action Transitions
  const handleOpenAction = (
    job: DrillingJob,
    type: 'submit_billing' | 'draft_invoice' | 'ses_approval' | 'final_invoice'
  ) => {
    setActiveJobForAction(job);
    setActionType(type);
    setInputDate(new Date().toISOString().split('T')[0]);
    setNotes('');

    if (type === 'draft_invoice') {
      const curYr = new Date().getFullYear().toString().slice(-2);
      setInputNumber(`DFT-${curYr}-${Math.floor(1000 + Math.random() * 9000)}`);
      setInputAmount(job.invoiceAmount || 45000);
    } else if (type === 'ses_approval') {
      setInputNumber(`SES-${Math.floor(100000 + Math.random() * 900000)}`);
      setInputAmount(job.invoiceAmount || 45000);
    } else if (type === 'final_invoice') {
      const curYr = new Date().getFullYear().toString().slice(-2);
      setInputNumber(`INV-${curYr}-${Math.floor(10000 + Math.random() * 90000)}`);
      setInputAmount(job.invoiceAmount || 45000);
    }
  };

  const handleConfirmAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeJobForAction || !actionType) return;

    let updated: DrillingJob = { ...activeJobForAction };

    if (actionType === 'submit_billing') {
      updated = {
        ...updated,
        status: 'Tickets submitted to billing team',
        submittedToBillingDate: inputDate,
        notes: notes ? `${updated.notes || ''}\nSubmitted: ${notes}` : updated.notes,
      };
    } else if (actionType === 'draft_invoice') {
      updated = {
        ...updated,
        status: 'Draft invoiced',
        draftInvoicedDate: inputDate,
        draftInvoiceNumber: inputNumber.trim(),
        invoiceAmount: Number(inputAmount) || null,
        notes: notes ? `${updated.notes || ''}\nDraft Invoice: ${notes}` : updated.notes,
      };
    } else if (actionType === 'ses_approval') {
      updated = {
        ...updated,
        status: 'Under SES approval',
        sesSubmittedDate: inputDate,
        sesNumber: inputNumber.trim(),
        invoiceAmount: Number(inputAmount) || updated.invoiceAmount || null,
        notes: notes ? `${updated.notes || ''}\nSES: ${notes}` : updated.notes,
      };
    } else if (actionType === 'final_invoice') {
      const existingInvoices = (updated.legalInvoiceNumber || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const newInv = inputNumber.trim();
      if (newInv && !existingInvoices.includes(newInv)) {
        existingInvoices.push(newInv);
      }
      const combinedInvoices = existingInvoices.length > 0 ? existingInvoices.join(', ') : newInv;

      updated = {
        ...updated,
        status: 'Final invoiced',
        finalInvoicedDate: inputDate,
        legalInvoiceNumber: combinedInvoices,
        invoiceAmount: Number(inputAmount) || updated.invoiceAmount || null,
        notes: notes ? `${updated.notes || ''}\nFinal Legal Invoice: ${notes}` : updated.notes,
      };
    }

    onUpdateJob(updated);
    setActiveJobForAction(null);
    setActionType(null);
  };

  return (
    <div className="space-y-4">
      {/* Ribbon Header */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div>
          <div className="text-[11px] text-slate-500 font-medium">
            Commercial Billing &amp; Invoicing Operations
          </div>
          <h1 className="text-base font-bold text-[#1a3055]">
            Commercial Billing &amp; Invoicing Stage Dashboard
          </h1>
          <div className="text-xs text-slate-600 mt-0.5">
            Automated date recording for 7-step transition stages from first DT to SES approval and legal invoicing.
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigate('jobs')}
            className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-bold text-xs hover:bg-[#24426d] shadow-sm transition cursor-pointer"
          >
            Drilling Jobs &rarr;
          </button>
          <button
            onClick={() => onNavigate('utilization')}
            className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-sm transition cursor-pointer"
          >
            Fleet Utilization &rarr;
          </button>
        </div>
      </div>

      {/* 6 Stage KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Card 1: Total Completed Jobs */}
        <div
          onClick={() => setFilterStage('completed')}
          className={`bg-white border rounded p-3 shadow-sm cursor-pointer transition border-t-[3px] border-t-slate-700 ${
            filterStage === 'completed' ? 'ring-2 ring-slate-700 bg-slate-50' : 'border-[#b8c9db] hover:bg-slate-50'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Total Jobs Completed
          </div>
          <div className="mt-1 text-2xl font-extrabold font-mono text-slate-800">
            {completedJobs.length}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Finished Operations
          </div>
        </div>

        {/* Card 2: Waiting for Signed Docs */}
        <div
          onClick={() => setFilterStage('waiting_docs')}
          className={`bg-white border rounded p-3 shadow-sm cursor-pointer transition border-t-[3px] border-t-rose-500 ${
            filterStage === 'waiting_docs' ? 'ring-2 ring-rose-500 bg-rose-50/20' : 'border-[#b8c9db] hover:bg-slate-50'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Waiting Signed Docs
          </div>
          <div className="mt-1 text-2xl font-extrabold font-mono text-rose-700">
            {waitingSignedDocs.length}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            RT Done, Awaiting Scans
          </div>
        </div>

        {/* Card 3: Tickets Submitted to Billing */}
        <div
          onClick={() => setFilterStage('submitted_billing')}
          className={`bg-white border rounded p-3 shadow-sm cursor-pointer transition border-t-[3px] border-t-amber-500 ${
            filterStage === 'submitted_billing' ? 'ring-2 ring-amber-500 bg-amber-50/20' : 'border-[#b8c9db] hover:bg-slate-50'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Submitted to Billing
          </div>
          <div className="mt-1 text-2xl font-extrabold font-mono text-amber-700">
            {submittedToBilling.length}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Ready for Draft Invoice
          </div>
        </div>

        {/* Card 4: Draft Invoiced */}
        <div
          onClick={() => setFilterStage('draft_invoiced')}
          className={`bg-white border rounded p-3 shadow-sm cursor-pointer transition border-t-[3px] border-t-blue-500 ${
            filterStage === 'draft_invoiced' ? 'ring-2 ring-blue-500 bg-blue-50/20' : 'border-[#b8c9db] hover:bg-slate-50'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Draft Invoiced
          </div>
          <div className="mt-1 text-2xl font-extrabold font-mono text-blue-700">
            {draftInvoiced.length}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Draft Sent to Client
          </div>
        </div>

        {/* Card 5: Under SES Approval */}
        <div
          onClick={() => setFilterStage('under_ses')}
          className={`bg-white border rounded p-3 shadow-sm cursor-pointer transition border-t-[3px] border-t-purple-600 ${
            filterStage === 'under_ses' ? 'ring-2 ring-purple-600 bg-purple-50/20' : 'border-[#b8c9db] hover:bg-slate-50'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Under SES Approval
          </div>
          <div className="mt-1 text-2xl font-extrabold font-mono text-purple-700">
            {underSes.length}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Service Entry Sheet
          </div>
        </div>

        {/* Card 6: Final Invoiced */}
        <div
          onClick={() => setFilterStage('final_invoiced')}
          className={`bg-white border rounded p-3 shadow-sm cursor-pointer transition border-t-[3px] border-t-emerald-600 ${
            filterStage === 'final_invoiced' ? 'ring-2 ring-emerald-600 bg-emerald-50/20' : 'border-[#b8c9db] hover:bg-slate-50'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Final Invoiced
          </div>
          <div className="mt-1 text-2xl font-extrabold font-mono text-emerald-700">
            {finalInvoiced.length}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            ${totalBilledValue.toLocaleString()} Billed
          </div>
        </div>
      </div>

      {/* 7-Step Invoicing Workflow Pipeline */}
      <div className="bg-white border border-[#b8c9db] rounded p-4 shadow-sm space-y-2">
        <div className="text-xs font-bold text-[#1a3055] uppercase tracking-wider">
          Invoicing Workflow Stages:
        </div>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2 text-center text-xs">
          <div className="p-2 rounded bg-slate-100 border border-slate-300">
            <div className="font-bold text-slate-800">1. Open</div>
            <div className="text-[10px] text-slate-500">Job Created</div>
          </div>
          <div className="p-2 rounded bg-blue-50 border border-blue-200">
            <div className="font-bold text-blue-950">2. Ongoing</div>
            <div className="text-[10px] text-blue-700">1st DT Released</div>
          </div>
          <div className="p-2 rounded bg-rose-50 border border-rose-200">
            <div className="font-bold text-rose-950">3. Waiting Docs</div>
            <div className="text-[10px] text-rose-700">Last RT Prepared</div>
          </div>
          <div className="p-2 rounded bg-amber-50 border border-amber-200">
            <div className="font-bold text-amber-950">4. Submitted</div>
            <div className="text-[10px] text-amber-700">Sent to Billing</div>
          </div>
          <div className="p-2 rounded bg-indigo-50 border border-indigo-200">
            <div className="font-bold text-indigo-950">5. Draft Invoice</div>
            <div className="text-[10px] text-indigo-700">Draft Number</div>
          </div>
          <div className="p-2 rounded bg-purple-50 border border-purple-200">
            <div className="font-bold text-purple-950">6. Under SES</div>
            <div className="text-[10px] text-purple-700">Client Approval</div>
          </div>
          <div className="p-2 rounded bg-emerald-50 border border-emerald-300">
            <div className="font-bold text-emerald-950">7. Final Invoiced</div>
            <div className="text-[10px] text-emerald-700">Legal Invoice #</div>
          </div>
        </div>
      </div>

      {/* Interactive Job Invoicing & Document Status Registry Table */}
      <div className="bg-white border border-[#b8c9db] rounded overflow-hidden shadow-sm">
        <div className="px-4 py-2.5 bg-[#dbe6f1] border-b border-[#b8c9db] flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center space-x-2">
            <h3 className="text-xs font-bold text-[#1a3055] uppercase tracking-wide">
              Job Invoicing &amp; Document Status Registry
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#1a3055] text-white">
              {displayedJobs.length}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Search job ID, client, rig, invoice #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-[#b8c9db] rounded px-2.5 py-1 text-xs bg-white w-64 focus:ring-1 focus:ring-[#1a3055] outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-[#24476b] border-b border-[#b8c9db] font-bold select-none">
              <tr>
                <th
                  onClick={() => handleSortToggle('id')}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-100"
                >
                  Job ID {sortField === 'id' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('client')}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-100"
                >
                  Client / Operator {sortField === 'client' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('rig')}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-100"
                >
                  Rig &amp; Well {sortField === 'rig' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('po')}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-100"
                >
                  PO Ref {sortField === 'po' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th
                  onClick={() => handleSortToggle('status')}
                  className="px-3 py-2 cursor-pointer hover:bg-slate-100"
                >
                  Current Status {sortField === 'status' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                </th>
                <th className="px-3 py-2">Milestone Dates Recorded</th>
                <th className="px-3 py-2">Invoicing Numbers</th>
                <th className="px-3 py-2 text-center">Billing Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0]">
              {displayedJobs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    No jobs matching current filter.
                  </td>
                </tr>
              ) : (
                displayedJobs.map((j) => {
                  const jobDts = dtBatches.filter((b) => b.jobId === j.id);
                  const jobRts = rtBatches.filter((b) => b.jobId === j.id);
                  const allDtsSigned = jobDts.length > 0 && jobDts.every((b) => b.isSigned);
                  const allRtsSigned = jobRts.length > 0 && jobRts.every((b) => b.isSigned);

                  return (
                    <tr key={j.id} className="hover:bg-[#e4eef8] transition">
                      <td className="px-3 py-2 font-mono font-bold text-amber-900">{j.id}</td>
                      <td className="px-3 py-2 font-bold text-[#1a3055]">{j.client}</td>
                      <td className="px-3 py-2">
                        <span className="font-semibold">{j.rig}</span>{' '}
                        <span className="text-slate-400">|</span>{' '}
                        <span className="text-slate-600">{j.well}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-600">{j.poNumber || '—'}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            j.status === 'Final invoiced'
                              ? 'bg-emerald-100 text-emerald-800'
                              : j.status === 'Under SES approval'
                              ? 'bg-purple-100 text-purple-800'
                              : j.status === 'Draft invoiced'
                              ? 'bg-blue-100 text-blue-800'
                              : j.status === 'Tickets submitted to billing team'
                              ? 'bg-amber-100 text-amber-800'
                              : j.status === 'Job completed and waiting signed docs'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {j.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 space-y-0.5 text-[11px] font-mono text-slate-600">
                        {j.firstDtDate && (
                          <div>
                            1st DT: <strong>{j.firstDtDate}</strong>
                          </div>
                        )}
                        {j.lastRtDate && (
                          <div>
                            Last RT: <strong>{j.lastRtDate}</strong>
                          </div>
                        )}
                        {j.draftInvoicedDate && (
                          <div className="text-blue-700">
                            Draft: <strong>{j.draftInvoicedDate}</strong>
                          </div>
                        )}
                        {j.finalInvoicedDate && (
                          <div className="text-emerald-700 font-bold">
                            Final: <strong>{j.finalInvoicedDate}</strong>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 space-y-1 text-[11px]">
                        {j.draftInvoiceNumber && (
                          <div className="font-mono text-blue-800">
                            Draft: <strong>{j.draftInvoiceNumber}</strong>
                          </div>
                        )}
                        {j.sesNumber && (
                          <div className="font-mono text-purple-800">
                            SES: <strong>{j.sesNumber}</strong>
                          </div>
                        )}
                        {j.legalInvoiceNumber ? (
                          <div className="space-y-1">
                            {j.legalInvoiceNumber
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .map((inv) => (
                                <div
                                  key={inv}
                                  className="font-mono font-bold text-emerald-900 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-300 text-[10px] w-fit flex items-center gap-1 shadow-2xs"
                                >
                                  <span>🧾</span> {inv}
                                </div>
                              ))}
                            {j.invoiceAmount && (
                              <div className="text-[10px] font-bold text-emerald-800 font-mono">
                                Total: ${j.invoiceAmount.toLocaleString()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Pending Legal #</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {j.status === 'Job completed and waiting signed docs' && (
                          <button
                            onClick={() => handleOpenAction(j, 'submit_billing')}
                            className="px-2 py-1 rounded bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-[10px] shadow-xs cursor-pointer"
                          >
                            Submit to Billing &rarr;
                          </button>
                        )}
                        {j.status === 'Tickets submitted to billing team' && (
                          <button
                            onClick={() => handleOpenAction(j, 'draft_invoice')}
                            className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] shadow-xs cursor-pointer"
                          >
                            Create Draft Inv &rarr;
                          </button>
                        )}
                        {j.status === 'Draft invoiced' && (
                          <button
                            onClick={() => handleOpenAction(j, 'ses_approval')}
                            className="px-2 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white font-bold text-[10px] shadow-xs cursor-pointer"
                          >
                            Submit for SES &rarr;
                          </button>
                        )}
                        {j.status === 'Under SES approval' && (
                          <button
                            onClick={() => handleOpenAction(j, 'final_invoice')}
                            className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] shadow-xs cursor-pointer"
                          >
                            Enter Legal Inv # &rarr;
                          </button>
                        )}
                        {j.status === 'Final invoiced' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                            <span>✓</span> Invoiced
                          </span>
                        )}
                        {j.status === 'Ongoing' && (
                          <span className="text-slate-400 text-[10px] italic">
                            Operations Active
                          </span>
                        )}
                        {j.status === 'Open' && (
                          <span className="text-slate-400 text-[10px] italic">
                            Awaiting Dispatch
                          </span>
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

      {/* Modal for Lifecycle Transitions */}
      {activeJobForAction && actionType && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveJobForAction(null);
          }}
        >
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 bg-[#1a3055] text-white flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm">
                  {actionType === 'submit_billing' && 'Submit Tickets to Billing Team'}
                  {actionType === 'draft_invoice' && 'Generate & Record Draft Invoice'}
                  {actionType === 'ses_approval' && 'Submit for SES (Service Entry Sheet) Approval'}
                  {actionType === 'final_invoice' && 'Issue Final Legal Invoice'}
                </h3>
                <div className="text-[11px] text-slate-300">
                  {activeJobForAction.id} &bull; {activeJobForAction.client} ({activeJobForAction.rig})
                </div>
              </div>
              <button
                onClick={() => setActiveJobForAction(null)}
                className="text-white/80 hover:text-white font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleConfirmAction} className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1 text-slate-700">
                  Effective Action Date *
                </label>
                <input
                  type="date"
                  required
                  value={inputDate}
                  onChange={(e) => setInputDate(e.target.value)}
                  className="w-full border rounded px-2.5 py-1.5 font-mono"
                />
              </div>

              {actionType !== 'submit_billing' && (
                <div>
                  <label className="block font-bold mb-1 text-slate-700">
                    {actionType === 'draft_invoice' && 'Draft Invoice Number *'}
                    {actionType === 'ses_approval' && 'SES Reference / Approval Number *'}
                    {actionType === 'final_invoice' && 'Official Legal Invoice Number *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={inputNumber}
                    onChange={(e) => setInputNumber(e.target.value)}
                    placeholder={
                      actionType === 'final_invoice'
                        ? 'e.g. INV-26-00451'
                        : actionType === 'ses_approval'
                        ? 'e.g. SES-892144'
                        : 'e.g. DFT-26-0012'
                    }
                    className="w-full border rounded px-2.5 py-1.5 font-mono font-bold text-slate-900"
                  />
                </div>
              )}

              {(actionType === 'draft_invoice' || actionType === 'final_invoice') && (
                <div>
                  <label className="block font-bold mb-1 text-slate-700">
                    Invoice Amount ({activeJobForAction.currency || 'USD'})
                  </label>
                  <input
                    type="number"
                    value={inputAmount}
                    onChange={(e) => setInputAmount(e.target.value)}
                    placeholder="e.g. 45000"
                    className="w-full border rounded px-2.5 py-1.5 font-mono font-bold"
                  />
                </div>
              )}

              <div>
                <label className="block font-bold mb-1 text-slate-700">Remarks / Audit Note</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional remarks regarding this billing stage..."
                  className="w-full border rounded px-2.5 py-1.5"
                />
              </div>

              <div className="pt-2 border-t flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setActiveJobForAction(null)}
                  className="px-3.5 py-1.5 rounded bg-slate-200 text-slate-700 font-bold hover:bg-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-[#1a3055] hover:bg-[#24426d] text-white font-bold shadow-sm cursor-pointer"
                >
                  Confirm &amp; Record Date &rarr;
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
