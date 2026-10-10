import React, { useState, useMemo, useEffect } from 'react';
import {
  User,
  DrillingJob,
  DTBatch,
  RTBatch,
  ContractRecord,
  DraftInvoicePackageData,
  CalculationTicketLine,
} from '../types';
import {
  generateInvoicePackageForJob,
  USD_TO_AED_EXCHANGE_RATE,
  UAE_VAT_PERCENTAGE,
  convertAmountToWords,
  CONTRACT_444558_RATES,
} from '../services/billingPackageService';
import { EmdadLogo } from '../constants/branding';
import {
  FileText,
  Printer,
  CheckCircle,
  Clock,
  DollarSign,
  Calendar,
  Building,
  Shield,
  Layers,
  Save,
  Check,
  Search,
  X,
  AlertCircle,
  FileCheck,
  Send,
  Edit3,
  Paperclip,
  CheckSquare,
  Square,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { normalizeJobKey } from '../services/api';

interface InvoicingViewProps {
  user: User;
  jobs: DrillingJob[];
  dtBatches: DTBatch[];
  rtBatches: RTBatch[];
  contracts: ContractRecord[];
  initialJobId?: string | null;
  onUpdateJob?: (job: DrillingJob) => void;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  onNavigate?: (view: any, param?: string) => void;
  onRefresh?: () => void;
}

export const InvoicingView: React.FC<InvoicingViewProps> = ({
  user,
  jobs,
  dtBatches,
  rtBatches,
  contracts,
  initialJobId,
  onUpdateJob,
  onShowToast,
  onNavigate,
  onRefresh,
}) => {
  // Filter stage
  const [stageFilter, setStageFilter] = useState<
    'all_ready' | 'submitted' | 'draft_invoiced' | 'ses_approval' | 'final_invoiced' | 'all'
  >('all_ready');

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // Selected Job ID
  const [selectedJobId, setSelectedJobId] = useState<string>(() => {
    if (initialJobId && jobs.some((j) => j.id === initialJobId)) return initialJobId;
    const readyJob = jobs.find(
      (j) =>
        j.status === 'Submitted to Billing Team' ||
        j.status === 'Tickets submitted to billing team' ||
        j.status === 'Draft invoiced' ||
        j.status === 'Under SES approval' ||
        j.status === 'SES Submitted'
    );
    return readyJob ? readyJob.id : (jobs[0]?.id || '');
  });

  // Active Document Tab for Preview / Print: 'draft' | 'calc' | 'final'
  const [activeDocTab, setActiveDocTab] = useState<'draft' | 'calc' | 'final'>('draft');

  // Final Legal Invoice (Epicor) Modal state
  const [isEpicorModalOpen, setIsEpicorModalOpen] = useState(false);
  const [epicorLegalInvoiceNo, setEpicorLegalInvoiceNo] = useState('');
  const [legalInvoiceDate, setLegalInvoiceDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Supporting documents checklist state per job
  const [checkedDocs, setCheckedDocs] = useState<{ [key: string]: boolean }>({
    signed_dt: true,
    cargo_manifest: true,
    rig_log: true,
    signed_rt: true,
    client_approval: false,
  });

  const toggleDocCheck = (key: string) => {
    setCheckedDocs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Filter jobs eligible for invoicing
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      // Stage filter
      if (stageFilter === 'submitted') {
        const isSub =
          job.status === 'Submitted to Billing Team' ||
          job.status === 'Tickets submitted to billing team' ||
          job.status === 'Job completed and waiting signed docs' ||
          job.status === 'Completed';
        if (!isSub) return false;
      } else if (stageFilter === 'draft_invoiced') {
        if (job.status !== 'Draft invoiced') return false;
      } else if (stageFilter === 'ses_approval') {
        if (job.status !== 'Under SES approval' && job.status !== 'SES Submitted') return false;
      } else if (stageFilter === 'final_invoiced') {
        if (job.status !== 'Final invoiced' && job.status !== 'Closed') return false;
      } else if (stageFilter === 'all_ready') {
        // Any job that is submitted, draft invoiced, under SES, or completed
        const isReady =
          job.status === 'Submitted to Billing Team' ||
          job.status === 'Tickets submitted to billing team' ||
          job.status === 'Draft invoiced' ||
          job.status === 'Under SES approval' ||
          job.status === 'SES Submitted' ||
          job.status === 'Final invoiced' ||
          job.status === 'Job completed and waiting signed docs' ||
          job.status === 'Completed';
        if (!isReady) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const match =
          (job.id && job.id.toLowerCase().includes(term)) ||
          (job.jobNumber && job.jobNumber.toLowerCase().includes(term)) ||
          (job.rig && job.rig.toLowerCase().includes(term)) ||
          (job.well && job.well.toLowerCase().includes(term)) ||
          (job.client && job.client.toLowerCase().includes(term)) ||
          (job.poNumber && job.poNumber.toLowerCase().includes(term)) ||
          (job.draftInvoiceNumber && job.draftInvoiceNumber.toLowerCase().includes(term)) ||
          (job.legalInvoiceNumber && job.legalInvoiceNumber.toLowerCase().includes(term));
        if (!match) return false;
      }

      return true;
    });
  }, [jobs, stageFilter, searchTerm]);

  // Selected Job Object
  const currentJob = useMemo(() => {
    return jobs.find((j) => j.id === selectedJobId) || filteredJobs[0] || jobs[0];
  }, [jobs, selectedJobId, filteredJobs]);

  // Sync selectedJobId if currentJob changes or initialJobId provided
  useEffect(() => {
    if (initialJobId && jobs.some((j) => j.id === initialJobId)) {
      setSelectedJobId(initialJobId);
    }
  }, [initialJobId, jobs]);

  // Find Contract for Selected Job
  const currentContract = useMemo(() => {
    if (!currentJob) return null;
    return (
      contracts.find(
        (c) =>
          c.contractNo === currentJob.contract ||
          c.contractRef === currentJob.contract ||
          c.name === currentJob.contract ||
          c.client === currentJob.client
      ) || contracts[0]
    );
  }, [contracts, currentJob]);

  // Compute Continuation Draft Invoice Number based on Job Number & Year:
  // e.g. Job "Job-026-01388" + Year 26 -> "FSH-026-95" or "026-01388-26"
  const defaultDraftNumber = useMemo(() => {
    if (!currentJob) return 'DFT-26-001';
    if (currentJob.draftInvoiceNumber) return currentJob.draftInvoiceNumber;
    const cleanNum = (currentJob.id || currentJob.jobNumber || '').replace(/^[A-Za-z_-]+/, '');
    const curYear = new Date().getFullYear().toString().slice(-2);
    return `DFT-${cleanNum}-${curYear}`;
  }, [currentJob]);

  // Draft invoice number state (editable)
  const [draftNumber, setDraftNumber] = useState(defaultDraftNumber);

  useEffect(() => {
    setDraftNumber(defaultDraftNumber);
    if (currentJob?.legalInvoiceNumber) {
      setEpicorLegalInvoiceNo(currentJob.legalInvoiceNumber);
    } else {
      setEpicorLegalInvoiceNo('');
    }
  }, [defaultDraftNumber, currentJob]);

  // Generate the baseline invoice package
  const packageData: DraftInvoicePackageData = useMemo(() => {
    if (!currentJob) {
      return generateInvoicePackageForJob(
        { id: 'JOB-SAMPLE', client: 'ADNOC OFFSHORE', contract: '444558', status: 'Ongoing' } as DrillingJob,
        dtBatches,
        rtBatches,
        currentContract
      );
    }
    return generateInvoicePackageForJob(currentJob, dtBatches, rtBatches, currentContract, {
      invoiceNo: currentJob.legalInvoiceNumber || draftNumber,
      invoiceDate: currentJob.finalInvoicedDate || currentJob.draftInvoicedDate || undefined,
    });
  }, [currentJob, dtBatches, rtBatches, currentContract, draftNumber]);

  // Editable lines for commercial rate/day adjustments in calculation ticket
  const [editableLines, setEditableLines] = useState<CalculationTicketLine[]>(packageData.lines);

  useEffect(() => {
    setEditableLines(packageData.lines);
  }, [packageData.lines]);

  // Calculate live grand totals from editable lines
  const financialTotals = useMemo(() => {
    let operTotal = 0;
    let standbyTotal = 0;
    let redressTotal = 0;

    editableLines.forEach((l) => {
      operTotal += l.operTotalUSD || 0;
      standbyTotal += l.standbyTotalUSD || 0;
      redressTotal += (l as any).redressTotalUSD || 0;
    });

    const subtotalUSD = Math.round((operTotal + standbyTotal + redressTotal) * 100) / 100;
    const vatUSD = Math.round(subtotalUSD * 0.05 * 100) / 100;
    const grandTotalUSD = Math.round((subtotalUSD + vatUSD) * 100) / 100;

    const subtotalAED = Math.round(subtotalUSD * USD_TO_AED_EXCHANGE_RATE * 100) / 100;
    const vatAED = Math.round(vatUSD * USD_TO_AED_EXCHANGE_RATE * 100) / 100;
    const grandTotalAED = Math.round((subtotalAED + vatAED) * 100) / 100;

    const words = convertAmountToWords(grandTotalUSD);

    return {
      operTotal,
      standbyTotal,
      redressTotal,
      subtotalUSD,
      vatUSD,
      grandTotalUSD,
      subtotalAED,
      vatAED,
      grandTotalAED,
      words,
    };
  }, [editableLines]);

  // Handle line day/rate adjustments
  const handleUpdateLine = (index: number, field: keyof CalculationTicketLine, value: number) => {
    setEditableLines((prev) => {
      const next = [...prev];
      const target = { ...next[index], [field]: value };

      if (field === 'operDays' || field === 'operRateUSD') {
        target.operTotalUSD = Math.round((target.operDays || 0) * (target.operRateUSD || 0) * 100) / 100;
      }
      if (field === 'standbyDays' || field === 'standbyRateUSD') {
        target.standbyTotalUSD = Math.round((target.standbyDays || 0) * (target.standbyRateUSD || 0) * 100) / 100;
      }

      target.totalChargesUSD =
        Math.round(((target.operTotalUSD || 0) + (target.standbyTotalUSD || 0) + ((target as any).redressTotalUSD || 0)) * 100) / 100;

      next[index] = target;
      return next;
    });
  };

  // Turnaround Metrics Calculations across all jobs
  const auditMetrics = useMemo(() => {
    let submittedCount = 0;
    let draftCount = 0;
    let sesCount = 0;
    let finalCount = 0;

    let totalDemobToSubDays = 0;
    let demobToSubSamples = 0;

    let totalSubToDraftDays = 0;
    let subToDraftSamples = 0;

    let totalDraftToFinalDays = 0;
    let draftToFinalSamples = 0;

    jobs.forEach((j) => {
      if (
        j.status === 'Submitted to Billing Team' ||
        j.status === 'Tickets submitted to billing team' ||
        j.status === 'Job completed and waiting signed docs'
      ) {
        submittedCount++;
      }
      if (j.status === 'Draft invoiced') draftCount++;
      if (j.status === 'Under SES approval' || j.status === 'SES Submitted') sesCount++;
      if (j.status === 'Final invoiced' || j.status === 'Closed') finalCount++;

      // Metric 1: Demob -> Submitted
      if (j.demobDate && j.submittedToBillingDate) {
        const d1 = new Date(j.demobDate).getTime();
        const d2 = new Date(j.submittedToBillingDate).getTime();
        const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff < 365) {
          totalDemobToSubDays += diff;
          demobToSubSamples++;
        }
      }

      // Metric 2: Submitted -> Draft
      if (j.submittedToBillingDate && j.draftInvoicedDate) {
        const d1 = new Date(j.submittedToBillingDate).getTime();
        const d2 = new Date(j.draftInvoicedDate).getTime();
        const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff < 365) {
          totalSubToDraftDays += diff;
          subToDraftSamples++;
        }
      }

      // Metric 3: Draft -> Final
      if (j.draftInvoicedDate && j.finalInvoicedDate) {
        const d1 = new Date(j.draftInvoicedDate).getTime();
        const d2 = new Date(j.finalInvoicedDate).getTime();
        const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
        if (diff >= 0 && diff < 365) {
          totalDraftToFinalDays += diff;
          draftToFinalSamples++;
        }
      }
    });

    return {
      submittedCount,
      draftCount,
      sesCount,
      finalCount,
      readyCount: submittedCount + draftCount + sesCount,
      avgDemobToSub: demobToSubSamples > 0 ? (totalDemobToSubDays / demobToSubSamples).toFixed(1) : '1.4',
      avgSubToDraft: subToDraftSamples > 0 ? (totalSubToDraftDays / subToDraftSamples).toFixed(1) : '2.1',
      avgDraftToFinal: draftToFinalSamples > 0 ? (totalDraftToFinalDays / draftToFinalSamples).toFixed(1) : '8.5',
    };
  }, [jobs]);

  // Selected Job Audit Lifecycle
  const jobAuditTrail = useMemo(() => {
    if (!currentJob) return null;
    const mob = currentJob.mobDate || packageData.dateOfSupply || '—';
    const demob = currentJob.demobDate || '—';
    const submitted = currentJob.submittedToBillingDate || '—';
    const draftDate = currentJob.draftInvoicedDate || '—';
    const finalDate = currentJob.finalInvoicedDate || '—';

    return { mob, demob, submitted, draftDate, finalDate };
  }, [currentJob, packageData]);

  // Action: Generate Draft Invoice
  const handleGenerateDraftInvoice = () => {
    if (!currentJob || !onUpdateJob) return;
    const today = new Date().toISOString().split('T')[0];
    const draftNo = draftNumber.trim() || defaultDraftNumber;

    const updated: DrillingJob = {
      ...currentJob,
      status: 'Draft invoiced',
      draftInvoiceNumber: draftNo,
      draftInvoicedDate: today,
      invoiceAmount: financialTotals.grandTotalUSD,
      currency: 'USD',
    };

    onUpdateJob(updated);
    setActiveDocTab('draft');
    if (onShowToast) {
      onShowToast(
        `Draft Invoice #${draftNo} ($${financialTotals.grandTotalUSD.toLocaleString()} USD) successfully created.`,
        'success'
      );
    }
  };

  // Action: Open Epicor Final Legal Invoice Modal
  const handleOpenFinalInvoiceModal = () => {
    setEpicorLegalInvoiceNo(currentJob?.legalInvoiceNumber || '');
    setLegalInvoiceDate(new Date().toISOString().split('T')[0]);
    setIsEpicorModalOpen(true);
  };

  // Action: Submit Final Legal Invoice (Typed from Epicor)
  const handleConfirmFinalInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentJob || !onUpdateJob) return;

    const legalNo = epicorLegalInvoiceNo.trim();
    if (!legalNo) {
      if (onShowToast) onShowToast('Please enter the Legal Tax Invoice Number generated from Epicor.', 'error');
      return;
    }

    const updated: DrillingJob = {
      ...currentJob,
      status: 'Final invoiced',
      legalInvoiceNumber: legalNo,
      draftInvoiceNumber: currentJob.draftInvoiceNumber || draftNumber,
      finalInvoicedDate: legalInvoiceDate,
      invoiceAmount: financialTotals.grandTotalUSD,
      currency: 'USD',
      completedDate: legalInvoiceDate,
    };

    onUpdateJob(updated);
    setIsEpicorModalOpen(false);
    setActiveDocTab('final');
    if (onShowToast) {
      onShowToast(
        `Tax Invoice #${legalNo} (from Epicor) successfully confirmed and marked Final Invoiced.`,
        'success'
      );
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Signatures
  const preparedByName = user?.name || 'RAMYA';
  const verifiedByName = 'Ravi Kumar Parapu';

  return (
    <div className="space-y-6 pb-24 text-slate-800">
      {/* 1. Header & Stage Filters */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="p-2 bg-blue-50 text-blue-700 rounded-lg">
                <FileText className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">Invoicing & Commercial Verification</h1>
                <p className="text-xs text-slate-500">
                  Separation of duties: Review operations handover, verify rental calculation ticket, and issue Draft &amp; Final Tax Invoices.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center flex-wrap gap-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                title="Refresh Invoicing Records from Azure SQL / Database"
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <span>🔄</span>
                <span>Refresh</span>
              </button>
            )}
            <button
              onClick={handleGenerateDraftInvoice}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Generate Draft Invoice</span>
            </button>

            <button
              onClick={handleOpenFinalInvoiceModal}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <FileCheck className="w-3.5 h-3.5" />
              <span>Issue Final Tax Invoice (Epicor)</span>
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer print:hidden"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Dossier</span>
            </button>
          </div>
        </div>

        {/* Audit & Turnaround KPI Ribbon */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100">
          <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200/70">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Awaiting Draft Invoicing</div>
            <div className="text-xl font-bold text-blue-700 mt-0.5">{auditMetrics.submittedCount} Jobs</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Submitted by Operations</div>
          </div>
          <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200/70">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Demob ➔ Billing Handover</div>
            <div className="text-xl font-bold text-slate-800 mt-0.5">{auditMetrics.avgDemobToSub} Days</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Operations turnaround speed</div>
          </div>
          <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200/70">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Submission ➔ Draft Invoice</div>
            <div className="text-xl font-bold text-amber-700 mt-0.5">{auditMetrics.avgSubToDraft} Days</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Commercial team cycle time</div>
          </div>
          <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200/70">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Draft ➔ Final Legal (SES)</div>
            <div className="text-xl font-bold text-emerald-700 mt-0.5">{auditMetrics.avgDraftToFinal} Days</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Client approval &amp; Epicor issuance</div>
          </div>
        </div>

        {/* Stage Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-3 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-2">Filter Stage:</span>
          {[
            { id: 'all_ready', label: 'All Ready for Invoicing', count: auditMetrics.readyCount },
            { id: 'submitted', label: 'Submitted by Ops (Queue)', count: auditMetrics.submittedCount },
            { id: 'draft_invoiced', label: 'Draft Invoiced', count: auditMetrics.draftCount },
            { id: 'ses_approval', label: 'Under SES Approval', count: auditMetrics.sesCount },
            { id: 'final_invoiced', label: 'Final Legal Invoiced', count: auditMetrics.finalCount },
            { id: 'all', label: 'All Jobs', count: jobs.length },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStageFilter(f.id as any)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer flex items-center space-x-1.5 ${
                stageFilter === f.id
                  ? 'bg-blue-600 text-white font-semibold shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{f.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  stageFilter === f.id ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Job Search, Selector & Audit Timeline */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Job Dropdown Selector */}
          <div className="flex-1 w-full flex items-center space-x-2">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0">Selected Job:</span>
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="flex-1 bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
            >
              {filteredJobs.length === 0 ? (
                <option value="">No jobs match filter criteria</option>
              ) : (
                filteredJobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.id} | {j.client} | Rig: {j.rig} | Well: {j.well} | Status: [{j.status}]
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Search Box with Clear */}
          <div className="w-full md:w-72 relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search Job, Rig, Well, PO, Inv..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-500 focus:bg-white"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Selected Job Audit Lifecycle Timeline */}
        {currentJob && jobAuditTrail && (
          <div className="bg-blue-50/50 rounded-lg border border-blue-100/80 p-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-blue-900">Job Lifecycle &amp; Audit Trail:</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  {currentJob.status}
                </span>
                {currentJob.legalInvoiceNumber && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono">
                    Epicor Tax Inv: {currentJob.legalInvoiceNumber}
                  </span>
                )}
                {currentJob.draftInvoiceNumber && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 font-mono">
                    Draft Inv: {currentJob.draftInvoiceNumber}
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-4 text-[11px] text-slate-600">
                <span>
                  Mob: <strong>{jobAuditTrail.mob}</strong>
                </span>
                <span>➔</span>
                <span>
                  Demob: <strong>{jobAuditTrail.demob}</strong>
                </span>
                <span>➔</span>
                <span>
                  Ops Submitted: <strong>{jobAuditTrail.submitted}</strong>
                </span>
                <span>➔</span>
                <span>
                  Draft Invoiced: <strong>{jobAuditTrail.draftDate}</strong>
                </span>
                <span>➔</span>
                <span>
                  Final Invoiced: <strong>{jobAuditTrail.finalDate}</strong>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Supporting Documents Checklist (Separately emailed by Invoicing team) */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Paperclip className="w-4 h-4 text-slate-500" />
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Supporting Field Attachments Checklist (For Email Package)
            </h2>
          </div>
          <span className="text-[11px] text-slate-500 italic">
            Physical stamped scans will be attached separately in email by the invoicing team
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mt-3 pt-3 border-t border-slate-100">
          {[
            { id: 'signed_dt', label: 'Signed DT (Rig Stamped)', key: 'signed_dt' },
            { id: 'cargo_manifest', label: 'Marine / Cargo Manifest', key: 'cargo_manifest' },
            { id: 'rig_log', label: 'Signed Utilization / Run Log', key: 'rig_log' },
            { id: 'signed_rt', label: 'Signed RT (Base Stamped)', key: 'signed_rt' },
            { id: 'client_approval', label: 'Client SES / Email Approval', key: 'client_approval' },
          ].map((item) => {
            const isChecked = checkedDocs[item.key];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleDocCheck(item.key)}
                className={`p-2.5 rounded-lg border text-left flex items-start space-x-2 transition-colors cursor-pointer ${
                  isChecked
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {isChecked ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-xs font-semibold leading-tight">{item.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {isChecked ? 'Ready to attach' : 'Pending copy'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Commercial Verification & Calculation Ticket Ledger */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <span>Tool &amp; Personnel Rental Calculation Ledger</span>
              <span className="text-xs font-normal text-slate-500">(Services &amp; Tools Rental Calculation Ticket)</span>
            </h2>
            <p className="text-xs text-slate-500">
              Contract No: <strong>{packageData.contractNo}</strong> | Customer: <strong>{packageData.customerName}</strong> | Rig: <strong>{packageData.rig}</strong> | Well: <strong>{packageData.well}</strong>
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-500">Draft Number Ref:</span>
            <input
              type="text"
              value={draftNumber}
              onChange={(e) => setDraftNumber(e.target.value)}
              className="px-2.5 py-1 text-xs font-mono font-bold bg-slate-50 border border-slate-300 rounded focus:bg-white focus:border-blue-500 outline-none w-40"
              title="Continuation draft invoice number based on Job Number & Year"
            />
          </div>
        </div>

        {/* Interactive Verification Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs border-collapse font-sans">
            <thead>
              <tr className="bg-slate-100/90 text-slate-700 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3">Serial / Asset No</th>
                <th className="py-2.5 px-3">Description</th>
                <th className="py-2.5 px-2 text-center w-12">Qty</th>
                <th className="py-2.5 px-2">Delivery Ticket</th>
                <th className="py-2.5 px-2">Return Ticket</th>
                <th className="py-2.5 px-2 text-center">Ref</th>
                <th className="py-2.5 px-2 text-center">Rental Days</th>
                <th className="py-2.5 px-2 text-center bg-blue-50/60 text-blue-950">Oper Days</th>
                <th className="py-2.5 px-2 text-right bg-blue-50/60 text-blue-950">Oper Rate ($)</th>
                <th className="py-2.5 px-2 text-center bg-amber-50/60 text-amber-950">Standby Days</th>
                <th className="py-2.5 px-2 text-right bg-amber-50/60 text-amber-950">Standby Rate ($)</th>
                <th className="py-2.5 px-3 text-right">Total ($ USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {editableLines.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-6 text-center text-slate-400">
                    No tools or services found for this job.
                  </td>
                </tr>
              ) : (
                editableLines.map((line, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">{line.itemNo || idx + 1}</td>
                    <td className="py-2 px-3 font-mono font-semibold text-slate-900">{line.serialNumber}</td>
                    <td className="py-2 px-3 text-slate-800 max-w-xs truncate" title={line.toolDescription}>
                      {line.toolDescription}
                    </td>
                    <td className="py-2 px-2 text-center text-slate-600">{line.qty || 1}</td>
                    <td className="py-2 px-2 text-slate-600 font-mono text-[11px]">{line.deliveryDate || '—'}</td>
                    <td className="py-2 px-2 text-slate-600 font-mono text-[11px]">{line.returnDate || '—'}</td>
                    <td className="py-2 px-2 text-center text-slate-500 font-mono text-[11px]">{line.contractRefOper || 'A-4.1'}</td>
                    <td className="py-2 px-2 text-center font-semibold text-slate-700">{line.rentalDays || 10}</td>

                    {/* Oper Days (Editable) */}
                    <td className="py-2 px-2 text-center bg-blue-50/30">
                      <input
                        type="number"
                        min="0"
                        value={line.operDays || 0}
                        onChange={(e) => handleUpdateLine(idx, 'operDays', parseInt(e.target.value, 10) || 0)}
                        className="w-14 text-center py-0.5 text-xs font-semibold bg-white border border-blue-200 rounded outline-none focus:border-blue-500"
                      />
                    </td>

                    {/* Oper Rate (Editable) */}
                    <td className="py-2 px-2 text-right bg-blue-50/30">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.operRateUSD || 0}
                        onChange={(e) => handleUpdateLine(idx, 'operRateUSD', parseFloat(e.target.value) || 0)}
                        className="w-16 text-right py-0.5 text-xs font-mono font-semibold bg-white border border-blue-200 rounded outline-none focus:border-blue-500"
                      />
                    </td>

                    {/* Standby Days (Editable) */}
                    <td className="py-2 px-2 text-center bg-amber-50/30">
                      <input
                        type="number"
                        min="0"
                        value={line.standbyDays || 0}
                        onChange={(e) => handleUpdateLine(idx, 'standbyDays', parseInt(e.target.value, 10) || 0)}
                        className="w-14 text-center py-0.5 text-xs font-semibold bg-white border border-amber-200 rounded outline-none focus:border-amber-500"
                      />
                    </td>

                    {/* Standby Rate (Editable) */}
                    <td className="py-2 px-2 text-right bg-amber-50/30">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.standbyRateUSD || 0}
                        onChange={(e) => handleUpdateLine(idx, 'standbyRateUSD', parseFloat(e.target.value) || 0)}
                        className="w-16 text-right py-0.5 text-xs font-mono font-semibold bg-white border border-amber-200 rounded outline-none focus:border-amber-500"
                      />
                    </td>

                    {/* Total */}
                    <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                      ${(line.totalChargesUSD || 0).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Commercial Totals Summary (USD & Pegged AED) */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div className="space-y-1 text-xs text-slate-600">
              <div>
                <strong>Amount in Words (USD):</strong>
              </div>
              <div className="font-mono text-blue-900 bg-white p-2 rounded border border-slate-200 uppercase font-semibold">
                {financialTotals.words}
              </div>
              <div className="text-[11px] text-slate-400 pt-1">
                Fixed UAE Central Bank Peg: 1 USD = 3.6725 AED | UAE VAT: 5.0%
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between py-0.5 border-b border-slate-200">
                <span className="text-slate-600">Operational Rental Charges:</span>
                <span className="font-mono font-semibold">${financialTotals.operTotal.toFixed(2)} USD</span>
              </div>
              <div className="flex justify-between py-0.5 border-b border-slate-200">
                <span className="text-slate-600">Standby Rental Charges:</span>
                <span className="font-mono font-semibold">${financialTotals.standbyTotal.toFixed(2)} USD</span>
              </div>
              <div className="flex justify-between py-0.5 border-b border-slate-200">
                <span className="text-slate-600">Subtotal / Net Taxable:</span>
                <span className="font-mono font-bold text-slate-900">${financialTotals.subtotalUSD.toFixed(2)} USD</span>
              </div>
              <div className="flex justify-between py-0.5 border-b border-slate-200 text-blue-900">
                <span>UAE VAT (5%):</span>
                <span className="font-mono font-semibold">${financialTotals.vatUSD.toFixed(2)} USD</span>
              </div>
              <div className="flex justify-between py-1 bg-blue-100/60 px-2 rounded font-bold text-slate-900 text-sm">
                <span>Grand Total (USD):</span>
                <span className="font-mono">${financialTotals.grandTotalUSD.toFixed(2)} USD</span>
              </div>
              <div className="flex justify-between py-1 bg-emerald-50 px-2 rounded font-bold text-emerald-900 text-xs">
                <span>Grand Total (AED @ 3.6725):</span>
                <span className="font-mono">{financialTotals.grandTotalAED.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AED</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Document Preview & Print Tabs (Draft Invoice, Final Tax Invoice, Calculation Ticket) */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Preview Document:</span>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setActiveDocTab('final')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                  activeDocTab === 'final' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                1. Tax Invoice (Final Legal)
              </button>
              <button
                type="button"
                onClick={() => setActiveDocTab('draft')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                  activeDocTab === 'draft' ? 'bg-white text-blue-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                2. Draft Invoice (SES Approval)
              </button>
              <button
                type="button"
                onClick={() => setActiveDocTab('calc')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition cursor-pointer ${
                  activeDocTab === 'calc' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                3. Services &amp; Rental Calculation Ticket
              </button>
            </div>
          </div>

          <button
            onClick={handlePrint}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print {activeDocTab === 'final' ? 'Tax Invoice' : activeDocTab === 'draft' ? 'Draft Invoice' : 'Calculation Ticket'}</span>
          </button>
        </div>

        {/* PRINTABLE LEGAL DOCUMENT CONTAINER */}
        <div className="bg-white p-6 max-w-4xl mx-auto border border-slate-300 rounded-lg shadow-sm text-slate-900 font-sans print:border-none print:shadow-none print:p-0">
          
          {/* TAB 1: FINAL LEGAL TAX INVOICE OR TAB 2: DRAFT INVOICE */}
          {(activeDocTab === 'final' || activeDocTab === 'draft') && (
            <div className="space-y-4">
              {/* Header: Company & Banner */}
              <div className="flex justify-between items-start border-b-2 border-slate-800 pb-3">
                <div className="flex items-start gap-3">
                  <div className="bg-white p-1 rounded border border-slate-200 shadow-xs flex items-center justify-center shrink-0">
                    <EmdadLogo className="h-8 w-auto object-contain" />
                  </div>
                  <div>
                    <div className="text-xl font-black tracking-wider text-slate-900 flex items-center space-x-1">
                      <span className="text-emerald-700">EMDAD</span>
                      <span className="text-xs font-semibold text-slate-500 tracking-normal">L.L.C</span>
                    </div>
                    <div className="text-[10px] text-slate-600 leading-tight mt-0.5">
                      P.O. Box. 4118<br />
                      29th Floor, Etihad Towers, Abu Dhabi, UAE<br />
                      <strong className="text-slate-800">TRN - 100260782600003</strong>
                    </div>
                  </div>
                </div>

                <div className="text-right text-[10px] text-slate-600">
                  <div>Tel: 02-5507074</div>
                  <div>Fax: 02-5506815</div>
                  <div className="text-blue-700 font-semibold">www.emdad.ae</div>
                </div>
              </div>

              {/* Department Title */}
              <div className="text-center font-bold text-xs uppercase tracking-widest text-slate-800">
                WELL INTERVENTION - FISHING &amp; WHIPSTOCK SERVICES
              </div>

              {/* Legal Title Box */}
              <div
                className={`py-1 text-center font-black text-sm uppercase tracking-wider rounded ${
                  activeDocTab === 'final' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-800'
                }`}
              >
                {activeDocTab === 'final' ? 'TAX INVOICE' : 'DRAFT INVOICE'}
              </div>

              {/* Customer & Invoice Meta Grid */}
              <div className="grid grid-cols-2 border border-slate-400 text-xs">
                {/* Left: Customer */}
                <div className="p-2 border-r border-slate-400 space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-semibold text-slate-500">Customer:</span>
                    <span className="font-mono font-bold text-slate-800">{packageData.customerCode}</span>
                  </div>
                  <div className="font-black text-xs text-slate-900">{packageData.customerName}</div>
                  <div className="text-[11px] text-slate-600 leading-tight">{packageData.customerAddress}</div>
                  <div className="text-[11px] font-bold text-slate-800 pt-1">
                    TRN - {packageData.customerTrn}
                  </div>
                </div>

                {/* Right: Invoice Reference Meta */}
                <div className="divide-y divide-slate-300 text-[11px]">
                  <div className="flex justify-between p-1 px-2">
                    <span className="text-slate-500 font-medium">Invoice No.</span>
                    <span className="font-mono font-black text-slate-900">
                      {activeDocTab === 'final'
                        ? (currentJob?.legalInvoiceNumber || epicorLegalInvoiceNo || 'FSH-04518')
                        : (draftNumber || defaultDraftNumber)}
                    </span>
                  </div>
                  <div className="flex justify-between p-1 px-2">
                    <span className="text-slate-500 font-medium">Date</span>
                    <span className="font-mono font-semibold">
                      {activeDocTab === 'final' ? legalInvoiceDate : new Date().toISOString().split('T')[0]}
                    </span>
                  </div>
                  <div className="flex justify-between p-1 px-2">
                    <span className="text-slate-500 font-medium">Date of Supply (Goods/Services)</span>
                    <span className="font-mono font-semibold">{packageData.dateOfSupply}</span>
                  </div>
                  <div className="flex justify-between p-1 px-2">
                    <span className="text-slate-500 font-medium">Contract No.</span>
                    <span className="font-mono font-semibold">{packageData.contractNo}</span>
                  </div>
                  <div className="flex justify-between p-1 px-2">
                    <span className="text-slate-500 font-medium">Service Order / PO No.</span>
                    <span className="font-mono font-semibold">{packageData.poNo}</span>
                  </div>
                  <div className="flex justify-between p-1 px-2">
                    <span className="text-slate-500 font-medium">Rig / Well</span>
                    <span className="font-semibold text-slate-800">
                      {packageData.rig} / {packageData.well}
                    </span>
                  </div>
                </div>
              </div>

              {/* Delivery & Return Ref Boxes */}
              <div className="grid grid-cols-2 border-x border-b border-slate-400 text-[11px]">
                <div className="p-1 px-2 border-r border-slate-400">
                  <span className="text-slate-500">Delivery Ticket Ref. No.(s): </span>
                  <strong className="text-slate-800 font-mono">{packageData.deliveryTicketRefs}</strong>
                </div>
                <div className="p-1 px-2">
                  <span className="text-slate-500">Return Loading Note No.: </span>
                  <strong className="text-slate-800 font-mono">{packageData.returnLoadingNoteNo || '—'}</strong>
                </div>
              </div>

              {/* Line Items Summary Table */}
              <table className="w-full border border-slate-400 text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-400 text-slate-800 font-bold text-[11px]">
                    <th className="p-1.5 border-r border-slate-400 text-center w-12">Item No.</th>
                    <th className="p-1.5 border-r border-slate-400 text-left">Description</th>
                    <th className="p-1.5 border-r border-slate-400 text-center w-14">Quantity</th>
                    <th className="p-1.5 border-r border-slate-400 text-right w-24">Unit Price US$</th>
                    <th className="p-1.5 text-right w-28">Amount US$</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 text-xs">
                  <tr>
                    <td colSpan={5} className="p-1 px-2 bg-slate-50 text-[10px] font-bold text-slate-600 uppercase">
                      CHARGES FOR THE FOLLOWING AS PER ATTACHED CALCULATION TICKET
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="p-1 px-2 font-bold text-slate-800 text-[11px]">
                      RENTAL TOOLS
                    </td>
                  </tr>
                  <tr>
                    <td className="p-1.5 border-r border-slate-400 text-center">1</td>
                    <td className="p-1.5 border-r border-slate-400">Tools Operational Rental Charge</td>
                    <td className="p-1.5 border-r border-slate-400 text-center">1</td>
                    <td className="p-1.5 border-r border-slate-400 text-right font-mono">
                      {financialTotals.operTotal > 0 ? financialTotals.operTotal.toFixed(2) : '—'}
                    </td>
                    <td className="p-1.5 text-right font-mono font-semibold">
                      {financialTotals.operTotal > 0 ? financialTotals.operTotal.toFixed(2) : '—'}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-1.5 border-r border-slate-400 text-center">2</td>
                    <td className="p-1.5 border-r border-slate-400">Tools Standby Rental Charge</td>
                    <td className="p-1.5 border-r border-slate-400 text-center">1</td>
                    <td className="p-1.5 border-r border-slate-400 text-right font-mono">
                      {financialTotals.standbyTotal.toFixed(2)}
                    </td>
                    <td className="p-1.5 text-right font-mono font-semibold">
                      {financialTotals.standbyTotal.toFixed(2)}
                    </td>
                  </tr>
                  <tr>
                    <td className="p-1.5 border-r border-slate-400 text-center">3</td>
                    <td className="p-1.5 border-r border-slate-400">Tools Redress Charge</td>
                    <td className="p-1.5 border-r border-slate-400 text-center">1</td>
                    <td className="p-1.5 border-r border-slate-400 text-right font-mono">
                      {financialTotals.redressTotal > 0 ? financialTotals.redressTotal.toFixed(2) : '—'}
                    </td>
                    <td className="p-1.5 text-right font-mono font-semibold">
                      {financialTotals.redressTotal > 0 ? financialTotals.redressTotal.toFixed(2) : '—'}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="p-1 px-2 italic text-[11px] text-slate-600 bg-slate-50">
                      Rentals from {packageData.dateOfSupply} TO {(packageData as any).verificationPackage?.manifest?.releaseDate || '09-03-2026'}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* AS PER APPROVED DRAFT BANNER (For Final Legal Tax Invoice) */}
              {activeDocTab === 'final' && (
                <div className="bg-amber-200 border border-amber-400 text-amber-950 font-black text-xs py-1 px-3 text-center uppercase tracking-wider">
                  AS PER APPROVED DRAFT {currentJob?.draftInvoiceNumber || draftNumber}
                </div>
              )}

              {/* VAT Breakdown Table (AED Mandated by UAE FTA) */}
              <div className="border border-slate-400 text-[11px]">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-400 text-slate-800 font-bold">
                      <th className="p-1 border-r border-slate-400 text-center w-14">Line#</th>
                      <th className="p-1 border-r border-slate-400 text-left">Description</th>
                      <th className="p-1 border-r border-slate-400 text-right">Taxable Amount (AED)</th>
                      <th className="p-1 border-r border-slate-400 text-center w-20">Tax %</th>
                      <th className="p-1 text-right">Tax Amount (AED)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    <tr>
                      <td className="p-1 border-r border-slate-400 text-center">1</td>
                      <td className="p-1 border-r border-slate-400">VAT 5% (Operational)</td>
                      <td className="p-1 border-r border-slate-400 text-right font-mono">
                        {financialTotals.operTotal > 0
                          ? (financialTotals.operTotal * USD_TO_AED_EXCHANGE_RATE).toFixed(2)
                          : '—'}
                      </td>
                      <td className="p-1 border-r border-slate-400 text-center">5%</td>
                      <td className="p-1 text-right font-mono">
                        {financialTotals.operTotal > 0
                          ? (financialTotals.operTotal * USD_TO_AED_EXCHANGE_RATE * 0.05).toFixed(2)
                          : '—'}
                      </td>
                    </tr>
                    <tr>
                      <td className="p-1 border-r border-slate-400 text-center">2</td>
                      <td className="p-1 border-r border-slate-400">VAT 5% (Standby)</td>
                      <td className="p-1 border-r border-slate-400 text-right font-mono">
                        {(financialTotals.standbyTotal * USD_TO_AED_EXCHANGE_RATE).toFixed(2)}
                      </td>
                      <td className="p-1 border-r border-slate-400 text-center">5%</td>
                      <td className="p-1 text-right font-mono">
                        {(financialTotals.standbyTotal * USD_TO_AED_EXCHANGE_RATE * 0.05).toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td className="p-1 border-r border-slate-400 text-center">3</td>
                      <td className="p-1 border-r border-slate-400">VAT 5% (Redress)</td>
                      <td className="p-1 border-r border-slate-400 text-right font-mono">—</td>
                      <td className="p-1 border-r border-slate-400 text-center">5%</td>
                      <td className="p-1 text-right font-mono">—</td>
                    </tr>
                    <tr className="bg-slate-100 font-bold border-t border-slate-400">
                      <td colSpan={2} className="p-1 border-r border-slate-400 text-right">Taxable Amount Total:</td>
                      <td className="p-1 border-r border-slate-400 text-right font-mono">
                        AED {financialTotals.subtotalAED.toFixed(2)}
                      </td>
                      <td className="p-1 border-r border-slate-400 text-center">VAT Total:</td>
                      <td className="p-1 text-right font-mono">
                        AED {financialTotals.vatAED.toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Remittance & Total Box */}
              <div className="border border-slate-400 text-xs">
                <div className="grid grid-cols-2">
                  <div className="p-2 border-r border-slate-400 space-y-1 text-[10px]">
                    <div><strong>Exchange Rate:</strong> 1 USD = 3.6725 AED</div>
                    <div>
                      <strong>Remit to:</strong> FIRST ABU DHABI BANK, P.O. BOX 4, ABU DHABI, UAE
                    </div>
                    <div>
                      <strong>USD IBAN:</strong> <span className="font-mono font-bold">AE45 0354 0212 0314 1283 035</span>
                    </div>
                    <div>
                      <strong>SWIFT:</strong> <span className="font-mono font-bold">NBADAEAA</span>
                    </div>
                    <div className="pt-2 text-[10px] font-bold text-slate-800">
                      {financialTotals.words}
                    </div>
                  </div>

                  <div className="p-2 divide-y divide-slate-300 text-xs">
                    <div className="flex justify-between py-1">
                      <span className="text-slate-600">Line Total (USD):</span>
                      <span className="font-mono font-bold">${financialTotals.subtotalUSD.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-600">Tax Total (5% USD):</span>
                      <span className="font-mono font-semibold">${financialTotals.vatUSD.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-1 font-bold text-slate-900 bg-slate-50 px-1">
                      <span>Net Payable Amount (USD):</span>
                      <span className="font-mono">${financialTotals.grandTotalUSD.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-1 font-black text-slate-900 bg-emerald-50 px-1">
                      <span>Grand Total AED:</span>
                      <span className="font-mono">AED {financialTotals.grandTotalAED.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Legal Note */}
              <div className="text-[10px] text-slate-500 italic">
                Note: Only Tools Rental Charged. Repair, Replacement(as per Contract), DBR/LIH Charges (if any) will be Invoiced separately.
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-2 pt-6 pb-2 text-xs">
                <div className="space-y-4">
                  <div className="text-slate-500 font-medium">Prepared by:</div>
                  <div className="font-bold text-slate-900 uppercase font-mono tracking-wider">
                    {preparedByName}
                  </div>
                  <div className="border-t border-slate-300 w-44 pt-1 text-[10px] text-slate-400">
                    Commercial / Billing Specialist
                  </div>
                </div>

                <div className="space-y-4 text-right">
                  <div className="text-slate-500 font-medium">Verified By:</div>
                  <div className="font-bold text-slate-900 uppercase tracking-wider font-mono">
                    {verifiedByName}
                  </div>
                  <div className="border-t border-slate-300 w-44 ml-auto pt-1 text-[10px] text-slate-400">
                    Operations &amp; Commercial Manager
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-slate-300 pt-2 flex justify-between text-[9px] text-slate-400">
                <div>Form No.: DSF-055 | Rev.: 01</div>
                <div>Emdad L.L.C.</div>
                <div>Page 1 of 1</div>
              </div>
            </div>
          )}

          {/* TAB 3: SERVICES & TOOLS RENTAL CALCULATION TICKET */}
          {activeDocTab === 'calc' && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-300 pb-2">
                <div className="flex items-start gap-2.5">
                  <div className="bg-white p-1 rounded border border-slate-200 shadow-xs flex items-center justify-center shrink-0">
                    <EmdadLogo className="h-7 w-auto object-contain" />
                  </div>
                  <div>
                    <div className="text-base font-black tracking-wider text-slate-900">
                      <span className="text-emerald-700">EMDAD</span> L.L.C.
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Drilling Services | Fishing Department
                    </div>
                  </div>
                </div>
                <div className="text-center font-bold text-xs uppercase text-slate-800">
                  Services &amp; Tools Rental Calculation Ticket
                </div>
                <div className="text-right text-[10px] text-slate-500">
                  <div>Tel: 02-5507074</div>
                  <div>Fax: 02-5506815</div>
                </div>
              </div>

              {/* Meta Grid */}
              <div className="grid grid-cols-2 border border-slate-400 text-[10px] leading-tight">
                <div className="p-1.5 border-r border-slate-400 space-y-0.5">
                  <div><strong>CUSTOMER:</strong> {packageData.customerName}</div>
                  <div><strong>ADDRESS:</strong> {packageData.customerAddress}</div>
                  <div><strong>CONTRACT NO:</strong> {packageData.contractNo}</div>
                  <div><strong>SERVICE ORDER NO:</strong> {packageData.poNo}</div>
                </div>
                <div className="p-1.5 space-y-0.5">
                  <div><strong>RIG:</strong> {packageData.rig}</div>
                  <div><strong>WELL:</strong> {packageData.well}</div>
                  <div>
                    <strong>INVOICE REF:</strong>{' '}
                    <span className="font-mono font-bold">
                      {currentJob?.legalInvoiceNumber || draftNumber}
                    </span>
                  </div>
                  <div><strong>DATE:</strong> {packageData.invoiceDate}</div>
                </div>
              </div>

              {/* Detailed Tool Rows */}
              <table className="w-full border border-slate-400 text-[9px] border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-400">
                    <th className="p-1 border-r border-slate-400 text-center w-6">#</th>
                    <th className="p-1 border-r border-slate-400 text-left">Serial No.</th>
                    <th className="p-1 border-r border-slate-400 text-left">Tool Description</th>
                    <th className="p-1 border-r border-slate-400 text-center w-6">Qty</th>
                    <th className="p-1 border-r border-slate-400 text-center">Delivery</th>
                    <th className="p-1 border-r border-slate-400 text-center">Return</th>
                    <th className="p-1 border-r border-slate-400 text-center">Days</th>
                    <th className="p-1 border-r border-slate-400 text-center">Ref</th>
                    <th className="p-1 border-r border-slate-400 text-center">Oper Days</th>
                    <th className="p-1 border-r border-slate-400 text-right">Oper Rate</th>
                    <th className="p-1 border-r border-slate-400 text-center">S/by Days</th>
                    <th className="p-1 border-r border-slate-400 text-right">S/by Rate</th>
                    <th className="p-1 text-right">Standby US$</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300">
                  {editableLines.map((l, i) => (
                    <tr key={i}>
                      <td className="p-1 border-r border-slate-400 text-center">{l.itemNo || i + 1}</td>
                      <td className="p-1 border-r border-slate-400 font-mono font-semibold">{l.serialNumber}</td>
                      <td className="p-1 border-r border-slate-400 truncate max-w-xs">{l.toolDescription}</td>
                      <td className="p-1 border-r border-slate-400 text-center">{l.qty || 1}</td>
                      <td className="p-1 border-r border-slate-400 text-center font-mono">{l.deliveryDate}</td>
                      <td className="p-1 border-r border-slate-400 text-center font-mono">{l.returnDate}</td>
                      <td className="p-1 border-r border-slate-400 text-center font-bold">{l.rentalDays}</td>
                      <td className="p-1 border-r border-slate-400 text-center font-mono">{l.contractRefOper || 'A-4.1'}</td>
                      <td className="p-1 border-r border-slate-400 text-center">{l.operDays || 0}</td>
                      <td className="p-1 border-r border-slate-400 text-right font-mono">${(l.operRateUSD || 0).toFixed(2)}</td>
                      <td className="p-1 border-r border-slate-400 text-center font-semibold">{l.standbyDays}</td>
                      <td className="p-1 border-r border-slate-400 text-right font-mono">${(l.standbyRateUSD || 0).toFixed(2)}</td>
                      <td className="p-1 text-right font-mono font-bold">${(l.standbyTotalUSD || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-[10px]">
                    <td colSpan={12} className="p-1.5 text-right border-r border-slate-400">TOTAL US$:</td>
                    <td className="p-1.5 text-right font-mono">${financialTotals.subtotalUSD.toFixed(2)}</td>
                  </tr>
                  <tr className="bg-slate-100 font-bold text-[10px]">
                    <td colSpan={12} className="p-1.5 text-right border-r border-slate-400">VAT 5%:</td>
                    <td className="p-1.5 text-right font-mono">${financialTotals.vatUSD.toFixed(2)}</td>
                  </tr>
                  <tr className="bg-blue-100/60 font-bold text-[11px] text-blue-950">
                    <td colSpan={12} className="p-1.5 text-right border-r border-slate-400">GRAND TOTAL USD:</td>
                    <td className="p-1.5 text-right font-mono">${financialTotals.grandTotalUSD.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>

              {/* Signatures */}
              <div className="flex justify-between pt-4 text-xs">
                <div>
                  <span className="text-slate-500">Prepared by: </span>
                  <strong className="text-slate-900 uppercase font-mono">{preparedByName}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Verified by: </span>
                  <strong className="text-slate-900 uppercase font-mono">{verifiedByName}</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 6. MODAL: ISSUE FINAL LEGAL TAX INVOICE (MANUALLY TYPED FROM EPICOR) */}
      {isEpicorModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="px-5 py-4 bg-emerald-600 text-white flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <FileCheck className="w-5 h-5" />
                <h3 className="font-bold text-sm">Issue Final Legal Tax Invoice</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEpicorModalOpen(false)}
                className="text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmFinalInvoice} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100 text-emerald-900 space-y-1">
                <div className="font-bold">Epicor Legal Invoice Number Entry</div>
                <p className="text-[11px] text-emerald-800">
                  The final legal tax invoice number is generated from Epicor ERP. Please enter the official Epicor number below to record and generate the legal tax invoice.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Epicor Tax Invoice No. *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. FSH-04518"
                  value={epicorLegalInvoiceNo}
                  onChange={(e) => setEpicorLegalInvoiceNo(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold text-sm text-slate-900 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none uppercase"
                  autoFocus
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Example from sample: FSH-04518
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Approved Draft Reference
                </label>
                <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg font-mono font-semibold text-slate-700">
                  AS PER APPROVED DRAFT {currentJob?.draftInvoiceNumber || draftNumber}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Invoice Date
                </label>
                <input
                  type="date"
                  value={legalInvoiceDate}
                  onChange={(e) => setLegalInvoiceDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEpicorModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-xs cursor-pointer flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirm &amp; Issue Tax Invoice</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
