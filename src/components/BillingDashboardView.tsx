import React, { useState, useMemo } from 'react';
import { DrillingJob, JobLifecycleStatus, DTBatch, RTBatch, NavModule, User } from '../types';
import { formatDateDDMMYYYY } from '../utils';
import { isLegalInvoiceNumber } from '../jobLifecycle';
import { resolveJobClient } from '../services/api';
import {
  ShieldCheck,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  Layers,
  FileText,
  DollarSign,
  Calendar,
  Building,
  Check,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { InvoiceConfirmationModal } from './InvoiceConfirmationModal';

interface BillingDashboardViewProps {
  user?: User | null;
  jobs: DrillingJob[];
  dtBatches: DTBatch[];
  rtBatches: RTBatch[];
  onNavigate: (mod: NavModule, jobId?: string) => void;
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
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [search, setSearch] = useState<string>('');

  const renderBillingStatusBadge = (status: string, legalInvoiceNumber?: string) => {
    if (isLegalInvoiceNumber(legalInvoiceNumber)) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-300">
          Completed / Invoiced
        </span>
      );
    }
    const sLower = (status || '').toLowerCase().trim();
    switch (sLower) {
      case 'final invoiced':
      case 'closed':
      case 'completed':
      case 'job completed':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-300">
            Completed / Invoiced
          </span>
        );
      case 'under ses approval':
      case 'under ses':
      case 'ses submitted':
      case 'under approval':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-800 border border-purple-200">
            Under SES Approval
          </span>
        );
      case 'draft invoiced':
      case 'draft invoice':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-800 border border-blue-200">
            Draft Invoiced
          </span>
        );
      case 'tickets submitted to billing team':
      case 'submitted to billing team':
      case 'submitted to billing':
      case 'in billing':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-900 border border-amber-200">
            Submitted to Billing
          </span>
        );
      case 'job completed and waiting signed docs':
      case 'waiting on signed docs':
      case 'waiting signed docs':
      case 'waiting docs':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-800 border border-rose-200">
            Waiting Signed Docs
          </span>
        );
      case 'ongoing':
      case 'active':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
            Ongoing Operations
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
            {status}
          </span>
        );
    }
  };

  // Transition Modal State
  const [activeJobForAction, setActiveJobForAction] = useState<DrillingJob | null>(null);
  const [actionType, setActionType] = useState<
    'submit_billing' | 'draft_invoice' | 'ses_approval' | 'final_invoice' | null
  >(null);
  const [inputNumber, setInputNumber] = useState('');
  const [inputAmount, setInputAmount] = useState<number | string>('');
  const [inputDate, setInputDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Option 1: Two-Step Interactive Confirmation Modal State
  const [option1Modal, setOption1Modal] = useState<{
    isOpen: boolean;
    job: DrillingJob | null;
    actionType: 'draft' | 'final';
  }>({
    isOpen: false,
    job: null,
    actionType: 'draft',
  });

  const handleOpenOption1Draft = (job: DrillingJob) => {
    setOption1Modal({
      isOpen: true,
      job,
      actionType: 'draft',
    });
  };

  const handleOpenOption1Final = (job: DrillingJob) => {
    setOption1Modal({
      isOpen: true,
      job,
      actionType: 'final',
    });
  };

  const handleConfirmOption1Draft = (data: {
    invoiceNumber: string;
    invoiceDate: string;
    notes?: string;
  }) => {
    if (!option1Modal.job) return;
    const updated: DrillingJob = {
      ...option1Modal.job,
      status: 'Draft invoiced',
      draftInvoiceNumber: data.invoiceNumber,
      draftInvoicedDate: data.invoiceDate,
      notes: data.notes
        ? (option1Modal.job.notes ? `${option1Modal.job.notes}\n${data.notes}` : data.notes)
        : option1Modal.job.notes,
    };
    onUpdateJob(updated);
    setOption1Modal({ isOpen: false, job: null, actionType: 'draft' });
  };

  const handleConfirmOption1Final = (data: {
    legalInvoiceNumber: string;
    sesNumber?: string;
    invoiceDate: string;
    notes?: string;
  }) => {
    if (!option1Modal.job) return;
    const updated: DrillingJob = {
      ...option1Modal.job,
      status: 'Final invoiced',
      draftInvoiceNumber: option1Modal.job.draftInvoiceNumber || `DFT-${option1Modal.job.id}`,
      legalInvoiceNumber: data.legalInvoiceNumber,
      sesNumber: data.sesNumber || option1Modal.job.sesNumber,
      finalInvoicedDate: data.invoiceDate,
      completedDate: data.invoiceDate,
      notes: data.notes
        ? (option1Modal.job.notes ? `${option1Modal.job.notes}\n${data.notes}` : data.notes)
        : option1Modal.job.notes,
    };
    onUpdateJob(updated);
    setOption1Modal({ isOpen: false, job: null, actionType: 'draft' });
  };

  // 0. Clean & Normalize Jobs with resolved client names
  const normalizedJobs = useMemo(() => {
    return jobs.map((j) => {
      const client = resolveJobClient(j.client, j.contract, undefined, j.rig);
      return {
        ...j,
        client: client || j.client || 'ADNOC DRILLING',
      };
    });
  }, [jobs]);

  // 1. Pipeline Counts
  const completedJobs = useMemo(
    () =>
      normalizedJobs.filter((j) => {
        const s = (j.status || '').toLowerCase().trim();
        return (
          isLegalInvoiceNumber(j.legalInvoiceNumber) ||
          isLegalInvoiceNumber(j.invoiceNumber) ||
          s === 'final invoiced' ||
          s === 'closed' ||
          s === 'completed' ||
          s === 'job completed' ||
          s === 'job completed and waiting signed docs' ||
          s === 'tickets submitted to billing team' ||
          s === 'draft invoiced' ||
          s === 'under ses approval' ||
          s === 'under ses' ||
          s === 'ses submitted'
        );
      }),
    [normalizedJobs]
  );

  const waitingSignedDocs = useMemo(
    () =>
      normalizedJobs.filter((j) => {
        const s = (j.status || '').toLowerCase().trim();
        return (
          !isLegalInvoiceNumber(j.legalInvoiceNumber) &&
          (s === 'job completed and waiting signed docs' ||
            s === 'waiting on signed docs' ||
            s === 'waiting signed docs' ||
            s === 'waiting docs')
        );
      }),
    [normalizedJobs]
  );

  const submittedToBilling = useMemo(
    () =>
      normalizedJobs.filter((j) => {
        const s = (j.status || '').toLowerCase().trim();
        return (
          !isLegalInvoiceNumber(j.legalInvoiceNumber) &&
          (s === 'tickets submitted to billing team' ||
            s === 'submitted to billing team' ||
            s === 'submitted to billing' ||
            s === 'in billing')
        );
      }),
    [normalizedJobs]
  );

  const draftInvoiced = useMemo(
    () =>
      normalizedJobs.filter((j) => {
        const s = (j.status || '').toLowerCase().trim();
        return (
          !isLegalInvoiceNumber(j.legalInvoiceNumber) &&
          (s === 'draft invoiced' || s === 'draft invoice')
        );
      }),
    [normalizedJobs]
  );

  const underSes = useMemo(
    () =>
      normalizedJobs.filter((j) => {
        const s = (j.status || '').toLowerCase().trim();
        return (
          !isLegalInvoiceNumber(j.legalInvoiceNumber) &&
          (s === 'under ses approval' ||
            s === 'under ses' ||
            s === 'ses submitted' ||
            s === 'under approval')
        );
      }),
    [normalizedJobs]
  );

  const finalInvoiced = useMemo(
    () =>
      normalizedJobs.filter((j) => {
        const s = (j.status || '').toLowerCase().trim();
        return (
          isLegalInvoiceNumber(j.legalInvoiceNumber) ||
          isLegalInvoiceNumber(j.invoiceNumber) ||
          s === 'final invoiced' ||
          s === 'closed' ||
          s === 'completed' ||
          s === 'job completed'
        );
      }),
    [normalizedJobs]
  );

  const totalBilledValue = useMemo(() => {
    return finalInvoiced.reduce((acc, j) => {
      const val = j.invoiceAmount || (typeof j.cost === 'number' ? j.cost : parseFloat(String(j.cost || '').replace(/[^0-9.-]/g, '')) || 0);
      return acc + (typeof val === 'number' && !isNaN(val) ? val : 0);
    }, 0);
  }, [finalInvoiced]);

  // Sorting state for predictable alignment (default Ascending JOB-00001, JOB-00002, JOB-00003)
  const [sortField, setSortField] = useState<'id' | 'client' | 'rig' | 'status' | 'po'>('id');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

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
    let list = [...normalizedJobs];
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
        comparison = (a.id || '').localeCompare(b.id || '', undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortField === 'client') {
        comparison = (a.client || '').localeCompare(b.client || '');
      } else if (sortField === 'rig') {
        comparison = (a.rig || '').localeCompare(b.rig || '');
      } else if (sortField === 'status') {
        comparison = (a.status || '').localeCompare(b.status || '');
      } else if (sortField === 'po') {
        comparison = (a.poNumber || '').localeCompare(b.poNumber || '');
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [
    normalizedJobs,
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
    if (type === 'draft_invoice') {
      handleOpenOption1Draft(job);
      return;
    }
    if (type === 'final_invoice') {
      handleOpenOption1Final(job);
      return;
    }

    setActiveJobForAction(job);
    setActionType(type);
    setInputDate(new Date().toISOString().split('T')[0]);
    setNotes('');

    if (type === 'ses_approval') {
      setInputNumber(`SES-${Math.floor(100000 + Math.random() * 900000)}`);
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
      {/* Top Header - Compact & Clean */}
      <div className="bg-white border border-[#b8c9db] rounded p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-bold text-[#1a3055]">
            Commercial Billing &amp; Invoicing Dashboard
          </h1>
          <span className="text-[11px] text-slate-500 hidden md:inline">
            &bull; Automated 6-stage lifecycle from first DT to SES approval &amp; legal invoice
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onNavigate('contract-dash')}
            className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-2xs transition cursor-pointer flex items-center gap-1.5"
            title="Open Contracts Dashboard (Ceiling vs Invoiced Revenue)"
          >
            <span>📊</span>
            <span>Contracts Dashboard &rarr;</span>
          </button>
          <button
            onClick={() => onNavigate('invoicing')}
            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-2xs transition cursor-pointer flex items-center gap-1.5"
            title="Open Invoicing Screen (Audit, Verification & Invoices)"
          >
            <span>📄</span>
            <span>Invoicing Screen &rarr;</span>
          </button>
          <button
            onClick={() => onNavigate('jobs')}
            className="px-3 py-1.5 rounded bg-[#1a3055] text-white font-bold text-xs hover:bg-[#24426d] shadow-2xs transition cursor-pointer"
          >
            Drilling Jobs &rarr;
          </button>
          <button
            onClick={() => onNavigate('utilization')}
            className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-2xs transition cursor-pointer"
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

      {/* Interactive Job Invoicing & Document Status Registry */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center space-x-2.5">
            <h3 className="text-xs font-bold text-[#1a3055] uppercase tracking-wide">
              Job Invoicing &amp; Document Registry
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-[#1a3055] text-white">
              {displayedJobs.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* View Mode Switcher */}
            <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-white shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-[#1a3055] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Cards View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-[#1a3055] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Table View
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Search job ID, client, rig, invoice #..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border border-slate-300 rounded px-2.5 py-1 text-xs bg-white w-64 focus:ring-1 focus:ring-[#1a3055] outline-none"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* View content: Cards or Table */}
        {viewMode === 'cards' ? (
          <div className="p-4 bg-slate-50/60 min-h-[300px]">
            {displayedJobs.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-medium bg-white rounded-xl border border-slate-200">
                No jobs matching current filter.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {displayedJobs.map((j) => {
                  return (
                    <div
                      key={j.id}
                      className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 hover:shadow-md p-4 transition flex flex-col justify-between"
                    >
                      <div>
                        {/* Header Row */}
                        <div className="flex items-start justify-between gap-2 mb-2.5">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-slate-900 text-sm">
                                {j.id}
                              </span>
                              {j.poNumber && (
                                <span className="text-[11px] font-mono text-slate-500">
                                  PO: {j.poNumber}
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-bold text-[#1a3055] mt-0.5">{j.client}</div>
                          </div>
                          <div>{renderBillingStatusBadge(j.status, j.legalInvoiceNumber)}</div>
                        </div>

                        {/* Rig & Well */}
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs mb-3">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
                              Rig &amp; Well
                            </span>
                            <div>
                              <strong className="font-bold text-slate-900">{j.rig}</strong>
                              <span className="text-slate-400 mx-1.5">/</span>
                              <span className="font-normal text-slate-600">{j.well}</span>
                            </div>
                          </div>
                        </div>

                        {/* Invoicing Section */}
                        <div className="space-y-1.5 mb-3 text-xs">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">
                            Billing Documents &amp; Invoices
                          </span>

                          {j.legalInvoiceNumber ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-slate-500 text-xs">Legal Inv:</span>
                              {j.legalInvoiceNumber
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean)
                                .map((inv) => (
                                  <span
                                    key={inv}
                                    className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-xs shadow-2xs"
                                  >
                                    {inv}
                                  </span>
                                ))}
                              {(() => {
                                const invVal = j.invoiceAmount || (typeof j.cost === 'number' ? j.cost : parseFloat(String(j.cost || '').replace(/[^0-9.-]/g, '')) || 0);
                                if (typeof invVal === 'number' && !isNaN(invVal) && invVal !== 0) {
                                  const isNeg = invVal < 0;
                                  return (
                                    <span className={`font-mono font-bold text-xs ml-auto ${isNeg ? 'text-rose-600' : 'text-slate-900'}`}>
                                      {isNeg
                                        ? `-$${Math.abs(invVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        : `$${invVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          ) : (
                            <div className="text-slate-400 text-xs italic">
                              {j.draftInvoiceNumber ? `Draft Inv: ${j.draftInvoiceNumber}` : 'Pending Legal Invoice #'}
                            </div>
                          )}

                          {j.sesNumber && (
                            <div className="text-xs text-slate-600">
                              SES Approval Ref:{' '}
                              <span className="font-mono font-medium text-slate-900">{j.sesNumber}</span>
                            </div>
                          )}
                        </div>

                        {/* Key Milestone Dates */}
                        <div className="flex flex-wrap gap-1.5 text-[11px] font-mono text-slate-500 mb-2">
                          {j.firstDtDate && (
                            <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              1st DT: {formatDateDDMMYYYY(j.firstDtDate)}
                            </span>
                          )}
                          {j.lastRtDate && (
                            <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              Last RT: {formatDateDDMMYYYY(j.lastRtDate)}
                            </span>
                          )}
                          {j.finalInvoicedDate && (
                            <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-semibold text-slate-800">
                              Invoiced: {formatDateDDMMYYYY(j.finalInvoicedDate)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Action Footer */}
                      <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 mt-2">
                        <div className="flex items-center space-x-1.5 flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => onNavigate('invoicing', j.id)}
                            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition border border-slate-300 inline-flex items-center gap-1 cursor-pointer"
                            title="Generate/View Invoices & Rental Calculation Ticket"
                          >
                            <span>Invoicing Screen</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenOption1Draft(j)}
                            className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-2xs cursor-pointer transition inline-flex items-center gap-1"
                            title="Open confirmation modal to review summary and record Draft Invoice"
                          >
                            <span>Save Draft Inv</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenOption1Final(j)}
                            className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs cursor-pointer transition inline-flex items-center gap-1"
                            title="Open confirmation modal to review summary, SES approval, and mark Final Invoiced"
                          >
                            <span>Mark Final Inv</span>
                          </button>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          {j.status === 'Job completed and waiting signed docs' && (
                            <button
                              type="button"
                              onClick={() => handleOpenAction(j, 'submit_billing')}
                              className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-xs shadow-2xs cursor-pointer transition"
                            >
                              Submit to Billing &rarr;
                            </button>
                          )}
                          {j.status === 'Draft invoiced' && (
                            <button
                              type="button"
                              onClick={() => handleOpenAction(j, 'ses_approval')}
                              className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-2xs cursor-pointer transition"
                            >
                              Submit for SES &rarr;
                            </button>
                          )}
                          {(j.status === 'Final invoiced' || j.status === 'Closed') && (
                            <span className="px-2.5 py-1 rounded text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300 inline-flex items-center gap-1">
                              <span>✓</span> Invoiced &amp; Closed
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-[#1a3055] border-b border-slate-200 font-bold select-none whitespace-nowrap">
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
                    Status {sortField === 'status' ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                  </th>
                  <th className="px-3 py-2 whitespace-nowrap">Milestone Date</th>
                  <th className="px-3 py-2 whitespace-nowrap">Invoicing References</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Amount (USD)</th>
                  <th className="px-3 py-2 text-center whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayedJobs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400">
                      No jobs matching current filter.
                    </td>
                  </tr>
                ) : (
                  displayedJobs.map((j) => {
                    const rawDate = j.finalInvoicedDate || j.draftInvoicedDate || j.lastRtDate || j.firstDtDate;
                    const formattedDate = formatDateDDMMYYYY(rawDate);
                    const invValue = j.invoiceAmount || (typeof j.cost === 'number' ? j.cost : parseFloat(String(j.cost || '').replace(/[^0-9.-]/g, '')) || 0);

                    return (
                      <tr key={j.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-3 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">{j.id}</td>
                        <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">{j.client}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <strong className="font-semibold text-slate-900">{j.rig}</strong>{' '}
                          <span className="text-slate-400">/</span>{' '}
                          <span className="text-slate-600">{j.well}</span>
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{j.poNumber || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {renderBillingStatusBadge(j.status, j.legalInvoiceNumber)}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap text-xs">
                          {formattedDate || '—'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs">
                          <div className="flex items-center gap-1.5 whitespace-nowrap font-mono text-xs">
                            {j.draftInvoiceNumber ? (
                              <span className="text-slate-700">
                                Draft: <strong className="text-slate-900">{j.draftInvoiceNumber}</strong>
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Draft: —</span>
                            )}

                            <span className="text-slate-300">•</span>

                            {j.legalInvoiceNumber ? (
                              <span className="text-slate-700">
                                Final: <strong className="text-slate-900">{j.legalInvoiceNumber}</strong>
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Final: Pending</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-xs whitespace-nowrap">
                          {(() => {
                            if (typeof invValue === 'number' && !isNaN(invValue) && invValue !== 0) {
                              const isNeg = invValue < 0;
                              return (
                                <span className={isNeg ? 'text-rose-600 font-bold' : 'text-slate-900 font-medium'}>
                                  {isNeg
                                    ? `-$${Math.abs(invValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : `$${invValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                </span>
                              );
                            }
                            return <span className="text-slate-300 font-normal">—</span>;
                          })()}
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => onNavigate('invoicing', j.id)}
                              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-300 shadow-2xs cursor-pointer transition inline-flex items-center gap-1"
                              title="Generate/View Invoices & Rental Calculation Ticket"
                            >
                              <span>📄 Invoicing</span>
                            </button>
                            {j.status !== 'Final invoiced' && j.status !== 'Closed' && (
                              <>
                                {!j.draftInvoiceNumber && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenOption1Draft(j)}
                                    className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-2xs cursor-pointer transition"
                                    title="Open confirmation modal to review summary and record Draft Invoice"
                                  >
                                    Draft
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleOpenOption1Final(j)}
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-2xs cursor-pointer transition"
                                  title="Open confirmation modal to review summary, SES approval, and mark Final Invoiced"
                                >
                                  Final
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
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

      {/* Option 1: Two-Step Interactive Confirmation Modal */}
      {option1Modal.isOpen && option1Modal.job && (
        <InvoiceConfirmationModal
          isOpen={option1Modal.isOpen}
          onClose={() => setOption1Modal({ isOpen: false, job: null, actionType: 'draft' })}
          job={option1Modal.job}
          actionType={option1Modal.actionType}
          onConfirmDraft={handleConfirmOption1Draft}
          onConfirmFinal={handleConfirmOption1Final}
        />
      )}
    </div>
  );
};
