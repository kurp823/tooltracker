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
} from '../services/billingPackageService';
import {
  FileText,
  Printer,
  Download,
  CheckCircle,
  Clock,
  ArrowLeft,
  DollarSign,
  Calendar,
  Building,
  Shield,
  Layers,
  ChevronRight,
  Send,
  Save,
  Info,
  Check,
  Tag,
  Paperclip,
  ExternalLink,
  AlertTriangle,
  X,
  ShieldCheck,
} from 'lucide-react';
import { JobSearchSelect } from './JobSearchSelect';
import { InvoiceVerificationDocuments } from './InvoiceVerificationDocuments';
import { InvoiceConfirmationModal } from './InvoiceConfirmationModal';

interface InvoicePackageViewProps {
  user: User;
  jobs: DrillingJob[];
  dtBatches: DTBatch[];
  rtBatches: RTBatch[];
  contracts: ContractRecord[];
  initialJobId?: string | null;
  onBackToBilling?: () => void;
  onUpdateJob?: (job: DrillingJob) => void;
  onUpdateDTBatch?: (batch: DTBatch) => void;
  onUpdateRTBatch?: (batch: RTBatch) => void;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const InvoicePackageView: React.FC<InvoicePackageViewProps> = ({
  user,
  jobs,
  dtBatches,
  rtBatches,
  contracts,
  initialJobId,
  onBackToBilling,
  onUpdateJob,
  onUpdateDTBatch,
  onUpdateRTBatch,
  onShowToast,
}) => {
  // Current job selection
  const [selectedJobId, setSelectedJobId] = useState<string>(() => {
    if (initialJobId && jobs.some((j) => j.id === initialJobId)) return initialJobId;
    // Prefer Job-025-01160 if exists, or first job
    const sample = jobs.find((j) => j.id === 'Job-025-01160');
    return sample ? sample.id : (jobs[0]?.id || 'JOB-26-00001');
  });

  const currentJob = useMemo(() => {
    return jobs.find((j) => j.id === selectedJobId) || jobs[0];
  }, [jobs, selectedJobId]);

  const currentContract = useMemo(() => {
    if (!currentJob) return null;
    return contracts.find(
      (c) =>
        c.contractNo === currentJob.contract ||
        c.contractRef === currentJob.contract ||
        c.name === currentJob.contract ||
        c.client === currentJob.client
    ) || contracts[0];
  }, [contracts, currentJob]);

  // Editable parameters for submission
  const [invoiceNumber, setInvoiceNumber] = useState<string>(() => {
    const j = jobs.find((x) => x.id === (initialJobId || 'Job-025-01160')) || jobs[0];
    return j?.legalInvoiceNumber || j?.draftInvoiceNumber || (j?.id ? `INV-${j.id.replace(/^JOB[-_]?/i, '')}` : '216205');
  });
  const [invoiceDate, setInvoiceDate] = useState<string>(() => {
    const j = jobs.find((x) => x.id === (initialJobId || 'Job-025-01160')) || jobs[0];
    return j?.finalInvoicedDate || j?.draftInvoicedDate || j?.invoiceDate || '16-01-2026';
  });
  const [dateOfSupply, setDateOfSupply] = useState<string>(() => {
    const j = jobs.find((x) => x.id === (initialJobId || 'Job-025-01160')) || jobs[0];
    return j?.mobDate || '25/10/2025';
  });
  const [poNumber, setPoNumber] = useState<string>(() => {
    const j = jobs.find((x) => x.id === (initialJobId || 'Job-025-01160')) || jobs[0];
    return (j?.poNumber && j.poNumber !== '0') ? j.poNumber : '4200237257';
  });
  const [exchangeRate, setExchangeRate] = useState<number>(USD_TO_AED_EXCHANGE_RATE);
  // Package document filter (defaults to 'all' for complete unified dossier)
  const [docFilter, setDocFilter] = useState<'all' | 'invoice' | 'calc' | 'attachments'>('all');

  const handleJumpTo = (id: string) => {
    if (docFilter !== 'all') {
      setDocFilter('all');
      setTimeout(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    } else {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // When job changes, sync invoice parameters immediately
  const handleJobChange = (jobId: string) => {
    setSelectedJobId(jobId);
    const j = jobs.find((x) => x.id === jobId);
    if (j) {
      const invNo = j.legalInvoiceNumber || j.draftInvoiceNumber || (j.id ? `INV-${j.id.replace(/^JOB[-_]?/i, '')}` : '216205');
      setInvoiceNumber(invNo);
      setPoNumber((j.poNumber && j.poNumber !== '0') ? j.poNumber : (currentContract?.poNumber || '4200237257'));
      if (j.mobDate) {
        setDateOfSupply(j.mobDate);
      }
      if (j.finalInvoicedDate || j.draftInvoicedDate || j.invoiceDate) {
        setInvoiceDate(j.finalInvoicedDate || j.draftInvoicedDate || j.invoiceDate || '16-01-2026');
      }
    }
  };

  // Sync when initialJobId prop changes from parent navigation
  useEffect(() => {
    if (initialJobId && initialJobId !== selectedJobId && jobs.some((j) => j.id === initialJobId)) {
      handleJobChange(initialJobId);
    }
  }, [initialJobId]);

  // Generate the full invoice package dataset
  const packageData: DraftInvoicePackageData = useMemo(() => {
    if (!currentJob) {
      return generateInvoicePackageForJob(
        { id: 'JOB-SAMPLE', client: 'ADNOC OFFSHORE', contract: '444558', status: 'Ongoing' } as DrillingJob,
        dtBatches,
        rtBatches,
        currentContract,
        { invoiceNo: invoiceNumber, invoiceDate, dateOfSupply, poNo: poNumber }
      );
    }
    return generateInvoicePackageForJob(currentJob, dtBatches, rtBatches, currentContract, {
      invoiceNo: invoiceNumber,
      invoiceDate,
      dateOfSupply,
      poNo: poNumber,
    });
  }, [currentJob, dtBatches, rtBatches, currentContract, invoiceNumber, invoiceDate, dateOfSupply, poNumber]);

  // Two-step confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    actionType: 'draft' | 'final';
  }>({
    isOpen: false,
    actionType: 'draft',
  });

  // Open confirmation modal for Draft Invoiced (Option 1)
  const handleOpenDraftConfirm = () => {
    if (!currentJob) return;
    setConfirmModal({
      isOpen: true,
      actionType: 'draft',
    });
  };

  // Open confirmation modal for Final Invoiced (Option 1)
  const handleOpenFinalConfirm = () => {
    if (!currentJob) return;
    setConfirmModal({
      isOpen: true,
      actionType: 'final',
    });
  };

  const handleCloseConfirmModal = () => {
    setConfirmModal({
      isOpen: false,
      actionType: 'draft',
    });
  };

  // Execute Confirmed Draft Invoiced from Option 1 Modal
  const handleConfirmDraftInvoice = (data: {
    invoiceNumber: string;
    invoiceDate: string;
    notes?: string;
  }) => {
    if (!currentJob || !onUpdateJob) return;
    const invNo = data.invoiceNumber || invoiceNumber;
    const invDate = data.invoiceDate || invoiceDate || new Date().toISOString().split('T')[0];
    const updated: DrillingJob = {
      ...currentJob,
      status: 'Draft invoiced',
      draftInvoiceNumber: invNo,
      invoiceAmount: packageData.grandTotalUSD,
      currency: 'USD',
      draftInvoicedDate: invDate,
      notes: data.notes
        ? (currentJob.notes ? `${currentJob.notes}\n${data.notes}` : data.notes)
        : currentJob.notes,
    };
    onUpdateJob(updated);
    handleCloseConfirmModal();
    if (onShowToast) {
      onShowToast(
        `Draft Invoice #${invNo} ($${packageData.grandTotalUSD.toLocaleString()} USD) successfully recorded for Job ${currentJob.id}.`,
        'success'
      );
    }
  };

  // Execute Confirmed Final Invoiced from Option 1 Modal
  const handleConfirmFinalInvoice = (data: {
    legalInvoiceNumber: string;
    sesNumber?: string;
    invoiceDate: string;
    notes?: string;
  }) => {
    if (!currentJob || !onUpdateJob) return;
    const legalNumber = data.legalInvoiceNumber.trim() || `INV-${invoiceNumber}`;
    const invDate = data.invoiceDate || new Date().toISOString().split('T')[0];
    const updated: DrillingJob = {
      ...currentJob,
      status: 'Final invoiced',
      draftInvoiceNumber: invoiceNumber,
      legalInvoiceNumber: legalNumber,
      sesNumber: data.sesNumber || currentJob.sesNumber,
      invoiceAmount: packageData.grandTotalUSD,
      currency: 'USD',
      finalInvoicedDate: invDate,
      completedDate: invDate,
      notes: data.notes
        ? (currentJob.notes ? `${currentJob.notes}\n${data.notes}` : data.notes)
        : currentJob.notes,
    };
    onUpdateJob(updated);
    handleCloseConfirmModal();
    if (onShowToast) {
      onShowToast(
        `Job ${currentJob.id} confirmed Final Invoiced with Official Legal Tax Invoice #${updated.legalInvoiceNumber}.`,
        'success'
      );
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Top Header Bar - Clean & Compact Professional Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs space-y-3">
        {/* Row 1: Title, Status, and Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Title & Back */}
          <div className="flex items-center space-x-2.5 min-w-0">
            {onBackToBilling && (
              <button
                onClick={onBackToBilling}
                className="p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shrink-0"
                title="Back to Billing Dashboard"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="flex items-center flex-wrap gap-2">
              <span className="p-1 rounded bg-blue-50 text-blue-700 border border-blue-200">
                <FileText className="w-4 h-4" />
              </span>
              <h1 className="text-base font-bold text-slate-900 whitespace-nowrap">
                Draft Invoice & Verification Package
              </h1>
              {currentJob?.status === 'Final invoiced' || currentJob?.legalInvoiceNumber ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Final Invoiced: {currentJob?.legalInvoiceNumber || currentJob?.invoiceNumber}
                </span>
              ) : currentJob?.status === 'Draft invoiced' ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
                  Draft Invoiced (#{invoiceNumber})
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                  Pending Invoice Package
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center flex-wrap gap-2 shrink-0">
            <button
              onClick={handleOpenDraftConfirm}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              title="Review financial summary and save Draft Invoiced"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Draft Invoiced</span>
            </button>

            <button
              onClick={handleOpenFinalConfirm}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              title="Review summary, SES approval, and mark Final Invoiced"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Mark Final Invoiced</span>
            </button>

            <button
              onClick={handlePrint}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-md text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
          </div>
        </div>

        {/* Row 2: Job Selector & Operational Parameters */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider shrink-0">
              Select Job:
            </span>
            <div className="min-w-[280px]">
              <JobSearchSelect
                jobs={jobs}
                selectedJobId={selectedJobId}
                onSelectJob={handleJobChange}
              />
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2 text-xs text-slate-600">
            <span className="px-2 py-1 bg-slate-100 rounded border border-slate-200">
              Rig: <strong className="text-slate-800">{packageData.rig}</strong>
            </span>
            <span className="px-2 py-1 bg-slate-100 rounded border border-slate-200">
              Well: <strong className="text-slate-800">{packageData.well}</strong>
            </span>
            <span className="px-2 py-1 bg-slate-100 rounded border border-slate-200 font-mono">
              PO: <strong className="text-slate-800">{poNumber}</strong>
            </span>
            <span className="px-2 py-1 bg-blue-50 text-blue-900 rounded border border-blue-200 font-semibold font-mono">
              Total: ${packageData.grandTotalUSD.toLocaleString()} USD
            </span>
          </div>
        </div>
      </div>

      {/* Document Index & Section Jump Bar - Clean & Compact Single-Row Navigation */}
      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center flex-wrap gap-1.5 text-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">
            Jump to Section:
          </span>
          <button
            type="button"
            onClick={() => handleJumpTo('doc-1-invoice')}
            className="px-2.5 py-1 rounded bg-slate-50 hover:bg-slate-100 text-slate-800 font-semibold border border-slate-200 text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs"
          >
            <span className="text-blue-700 font-mono font-bold text-[10px]">1</span>
            <span>Tax Invoice</span>
          </button>
          <button
            type="button"
            onClick={() => handleJumpTo('doc-2-calc')}
            className="px-2.5 py-1 rounded bg-slate-50 hover:bg-slate-100 text-slate-800 font-semibold border border-slate-200 text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs"
          >
            <span className="text-blue-700 font-mono font-bold text-[10px]">2</span>
            <span>Rental Calc Ticket</span>
          </button>
          <button
            type="button"
            onClick={() => handleJumpTo('doc-3-attachments')}
            className="px-2.5 py-1 rounded bg-slate-50 hover:bg-slate-100 text-slate-800 font-semibold border border-slate-200 text-xs transition cursor-pointer flex items-center gap-1 shadow-2xs"
          >
            <span className="text-blue-700 font-mono font-bold text-[10px]">3</span>
            <span>Attached Verification Documents ({packageData.attachedDocuments?.length || 0})</span>
          </button>

          {/* Direct link pills to each attached exhibit */}
          {packageData.attachedDocuments && packageData.attachedDocuments.length > 0 && (
            <div className="hidden lg:flex items-center gap-1 border-l border-slate-200 pl-1.5 ml-1">
              {packageData.attachedDocuments.map((doc, idx) => (
                <button
                  key={doc.id || idx}
                  type="button"
                  onClick={() => handleJumpTo(`exhibit-${doc.id}`)}
                  className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50/70 hover:bg-blue-100 text-blue-900 border border-blue-200/60 truncate max-w-[140px] cursor-pointer"
                  title={`${doc.category}: ${doc.name}`}
                >
                  Ex {idx + 1}: {doc.sourceRef}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* View Filter (Defaults to Complete Package) */}
        <div className="flex items-center gap-2 text-xs">
          <label htmlFor="package-view-filter" className="text-[11px] font-medium text-slate-500 whitespace-nowrap">
            View Scope:
          </label>
          <select
            id="package-view-filter"
            value={docFilter}
            onChange={(e) => setDocFilter(e.target.value as any)}
            className="border border-slate-300 rounded px-2.5 py-1 text-xs font-semibold bg-white text-slate-800 outline-none cursor-pointer hover:border-slate-400"
          >
            <option value="all">Complete Billing Package (Invoice + Calc + All Attached Exhibits)</option>
            <option value="invoice">Formal Tax Invoice Only (Document 1)</option>
            <option value="calc">Services &amp; Rental Calc Ticket Only (Document 2)</option>
            <option value="attachments">Attached Field Verification Exhibits Only ({packageData.attachedDocuments?.length || 0} Docs)</option>
          </select>
        </div>
      </div>

      {/* DOCUMENT 1: DRAFT TAX INVOICE */}
      {(docFilter === 'all' || docFilter === 'invoice') && (
        <div id="doc-1-invoice" className="bg-white text-slate-900 rounded-lg shadow-2xs border border-slate-200 p-6 max-w-5xl mx-auto font-sans print:p-0 print:border-none print:shadow-none">
          {docFilter === 'all' && (
            <div className="mb-3 pb-2 border-b border-slate-200 flex justify-between items-center text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span>Document 1 — Formal Tax Invoice</span>
              <span className="text-blue-700 font-mono">Invoice Dossier</span>
            </div>
          )}
          {/* Header */}
          <div className="border-b-2 border-slate-800 pb-4 mb-5">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center space-x-2">
                  <div className="w-9 h-9 bg-[#0f1f38] text-amber-400 font-black text-xl flex items-center justify-center rounded">
                    E
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-[#0f1f38] tracking-wide">EMDAD L.L.C.</h2>
                    <p className="text-[11px] text-slate-600 font-medium">EMDAD LLC - UPSTREAM SERVICES</p>
                  </div>
                </div>
                <div className="mt-1.5 text-[11px] text-slate-600 leading-tight">
                  <p>M-44, Musaffah Industrial Area, P.O. Box 418, Abu Dhabi, UAE</p>
                  <p>TRN: <span className="font-bold text-slate-900">100236056500003</span></p>
                </div>
              </div>

              <div className="text-right">
                <div className="inline-block bg-slate-900 text-white px-3 py-1 rounded text-xs font-bold tracking-wider mb-1.5">
                  DRAFT TAX INVOICE
                </div>
                <div className="text-xs text-slate-700 space-y-0.5">
                  <p><span className="font-bold">Invoice No:</span> <span className="text-slate-900 font-semibold">{packageData.invoiceNumber}</span></p>
                  <p><span className="font-bold">Invoice Date:</span> {packageData.invoiceDate}</p>
                  <p><span className="font-bold">Date of Supply:</span> {packageData.dateOfSupply}</p>
                  <p><span className="font-bold">Payment Terms:</span> 60 DAYS FROM RECEIPT OF INVOICE</p>
                </div>
              </div>
            </div>
          </div>

          {/* Customer & Job Info Box */}
          <div className="grid grid-cols-2 gap-4 text-xs mb-6 border border-slate-300 rounded-lg p-4 bg-slate-50/50">
            <div>
              <h4 className="font-bold text-slate-900 uppercase text-[11px] border-b border-slate-300 pb-1 mb-2">
                CUSTOMER DETAILS
              </h4>
              <p className="font-bold text-slate-900">{packageData.customerName}</p>
              <p className="text-slate-700">{packageData.customerAddress}</p>
              <p className="mt-2"><span className="font-semibold text-slate-800">Customer TRN:</span> {packageData.customerTrn}</p>
              <p><span className="font-semibold text-slate-800">Customer Code:</span> {packageData.customerCode}</p>
            </div>

            <div className="space-y-1">
              <h4 className="font-bold text-slate-900 uppercase text-[11px] border-b border-slate-300 pb-1 mb-2">
                PROJECT & CONTRACT REFERENCE
              </h4>
              <p><span className="font-semibold text-slate-700">Contract No:</span> <span className="font-bold text-slate-900">{packageData.contractNo}</span></p>
              <p><span className="font-semibold text-slate-700">Purchase Order:</span> <span className="font-bold text-slate-900">{packageData.poNo}</span></p>
              <p><span className="font-semibold text-slate-700">Rig / Location:</span> <span className="font-bold text-slate-900">{packageData.rig}</span></p>
              <p><span className="font-semibold text-slate-700">Well Name:</span> <span className="font-bold text-slate-900">{packageData.well}</span></p>
              <p><span className="font-semibold text-slate-700">Service Order / Job:</span> <span className="font-bold text-slate-900">{packageData.serviceOrderNo}</span></p>
              <p><span className="font-semibold text-slate-700">Delivery Ticket Refs:</span> {packageData.deliveryTicketRefs}</p>
              <p><span className="font-semibold text-slate-700">Return Note (RT/RGT):</span> {packageData.returnLoadingNoteNo}</p>
            </div>
          </div>

          {/* Line Items Table (Draft Tax Invoice Page 1 summary lines) */}
          <div className="overflow-x-auto mb-6">
            <table className="w-full text-xs border border-slate-300 text-left">
              <thead>
                <tr className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                  <th className="py-2 px-3 border-r border-slate-300">SL</th>
                  <th className="py-2 px-3 border-r border-slate-300">DESCRIPTION</th>
                  <th className="py-2 px-3 border-r border-slate-300 text-right">QTY</th>
                  <th className="py-2 px-3 border-r border-slate-300 text-right">UNIT RATE (USD)</th>
                  <th className="py-2 px-3 border-r border-slate-300 text-right">NET (USD)</th>
                  <th className="py-2 px-3 border-r border-slate-300 text-right">EXCH. RATE</th>
                  <th className="py-2 px-3 text-right">NET AMOUNT (AED)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {/* 1. Crew charges */}
                {packageData.crewChargeUSD > 0 && (
                  <tr>
                    <td className="py-2.5 px-3 border-r border-slate-200 text-center font-medium">1</td>
                    <td className="py-2.5 px-3 border-r border-slate-200">
                      <p className="font-bold text-slate-900">FISHING CREW CHARGES (ENGINEER)</p>
                      <p className="text-[11px] text-slate-500">{packageData.operNotes}</p>
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 text-right">{packageData.crewDays.toFixed(2)}</td>
                    <td className="py-2.5 px-3 border-r border-slate-200 text-right">{packageData.crewDailyRateUSD.toFixed(2)}</td>
                    <td className="py-2.5 px-3 border-r border-slate-200 text-right font-semibold">
                      {packageData.crewChargeUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 text-right">{packageData.exchangeRateUSDToAED}</td>
                    <td className="py-2.5 px-3 text-right font-semibold">
                      {packageData.crewChargeAED.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                {/* 2. Operational Charges */}
                {packageData.operationalChargeUSD > 0 && (
                  <tr>
                    <td className="py-2.5 px-3 border-r border-slate-200 text-center font-medium">{packageData.crewChargeUSD > 0 ? '2' : '1'}</td>
                    <td className="py-2.5 px-3 border-r border-slate-200">
                      <p className="font-bold text-slate-900">OPERATIONAL CHARGES - FISHING TOOLS</p>
                      <p className="text-[11px] text-slate-500">{packageData.operDaysSummary}</p>
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 text-right">1.00</td>
                    <td className="py-2.5 px-3 border-r border-slate-200 text-right">
                      {packageData.operationalChargeUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 text-right font-semibold">
                      {packageData.operationalChargeUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 text-right">{packageData.exchangeRateUSDToAED}</td>
                    <td className="py-2.5 px-3 text-right font-semibold">
                      {packageData.operationalChargeAED.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                )}

                {/* 3. Standby Charges */}
                <tr>
                  <td className="py-2.5 px-3 border-r border-slate-200 text-center font-medium">
                    {packageData.crewChargeUSD > 0 ? (packageData.operationalChargeUSD > 0 ? '3' : '2') : (packageData.operationalChargeUSD > 0 ? '2' : '1')}
                  </td>
                  <td className="py-2.5 px-3 border-r border-slate-200">
                    <p className="font-bold text-slate-900">STANDBY CHARGES - FISHING TOOLS RENTAL</p>
                    <p className="text-[11px] text-slate-500">{packageData.standbyNotes}</p>
                  </td>
                  <td className="py-2.5 px-3 border-r border-slate-200 text-right">1.00</td>
                  <td className="py-2.5 px-3 border-r border-slate-200 text-right">
                    {packageData.standbyChargeUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-3 border-r border-slate-200 text-right font-semibold">
                    {packageData.standbyChargeUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2.5 px-3 border-r border-slate-200 text-right">{packageData.exchangeRateUSDToAED}</td>
                  <td className="py-2.5 px-3 text-right font-semibold">
                    {packageData.standbyChargeAED.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Subtotal & VAT Breakdown (Dual Currency: USD & AED) */}
          <div className="flex flex-col lg:flex-row justify-between gap-6 mb-6">
            <div className="w-full lg:w-1/2 text-xs space-y-2 border border-slate-300 rounded p-3 bg-slate-50">
              <h5 className="font-bold text-slate-900 text-[11px] uppercase border-b border-slate-200 pb-1">
                Amount In Words
              </h5>
              <p className="font-bold text-slate-800 italic">{packageData.amountInWords}</p>
              
              <div className="pt-2 border-t border-slate-200 mt-2">
                <p className="font-bold text-slate-900 text-[11px]">BANK WIRE REMITTANCE DETAILS:</p>
                <p className="text-[11px] text-slate-700">Bank: {packageData.bankDetails.remitTo}</p>
                <p className="text-[11px] text-slate-700">USD IBAN: <span className="font-mono font-bold text-slate-900">{packageData.bankDetails.usdIban}</span></p>
                <p className="text-[11px] text-slate-700">SWIFT Code: <span className="font-mono font-bold text-slate-900">{packageData.bankDetails.swift}</span></p>
              </div>
            </div>

            <div className="w-full lg:w-1/2 text-xs">
              <table className="w-full border border-slate-300 text-right">
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="py-1.5 px-3 text-left font-semibold text-slate-700">Total Taxable Value (USD):</td>
                    <td className="py-1.5 px-3 font-semibold text-slate-900 font-mono">
                      ${packageData.grossValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-1.5 px-3 font-semibold text-slate-900 font-mono bg-slate-50">
                      AED {packageData.taxableAmountTotalAED.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="py-1.5 px-3 text-left font-semibold text-slate-700">VAT (5.000%):</td>
                    <td className="py-1.5 px-3 font-semibold text-slate-900 font-mono">
                      ${packageData.vatAmountUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-1.5 px-3 font-semibold text-slate-900 font-mono bg-slate-50">
                      AED {packageData.vatTotalAED.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr className="bg-amber-50 font-bold border-t-2 border-slate-900 text-sm">
                    <td className="py-2 px-3 text-left text-slate-900">Grand Total with VAT:</td>
                    <td className="py-2 px-3 text-slate-900 font-mono">
                      ${packageData.grandTotalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-3 text-amber-900 font-mono bg-amber-100">
                      AED {packageData.grandTotalAED.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer Signatures */}
          <div className="border-t border-slate-300 pt-6 mt-6 grid grid-cols-2 gap-8 text-xs">
            <div>
              <p className="font-bold text-slate-800 mb-8">PREPARED BY:</p>
              <div className="border-b border-slate-400 w-48 mb-1"></div>
              <p className="font-bold text-slate-900">EMDAD OPERATIONS & BILLING</p>
              <p className="text-slate-500 text-[10px]">Date: {packageData.invoiceDate}</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-800 mb-8">AUTHORIZED SIGNATORY:</p>
              <div className="border-b border-slate-400 w-48 ml-auto mb-1"></div>
              <p className="font-bold text-slate-900">EMDAD L.L.C.</p>
              <p className="text-slate-500 text-[10px]">Abu Dhabi, United Arab Emirates</p>
            </div>
          </div>
        </div>
      )}

      {/* DOCUMENT 2: SERVICES & TOOL RENTAL CALCULATION TICKET */}
      {(docFilter === 'all' || docFilter === 'calc') && (
        <div id="doc-2-calc" className="bg-white text-slate-900 rounded-lg shadow-2xs border border-slate-200 p-4 max-w-7xl mx-auto font-sans print:p-0 print:border-none print:shadow-none">
          {docFilter === 'all' && (
            <div className="mb-3 pb-2 border-b border-slate-200 flex justify-between items-center text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span>Document 2 — Services &amp; Tool Rental Calculation Ticket</span>
              <span className="text-blue-700 font-mono">Daily Rate Reconciliation</span>
            </div>
          )}
          {/* Ticket Header */}
          <div className="border-b-2 border-slate-800 pb-3 mb-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-black text-[#0f1f38] uppercase">
                  SERVICES & TOOLS RENTAL CALCULATION TICKET
                </h2>
                <p className="text-[11px] text-slate-600">
                  Detailed Operational & Standby Daily Rate Reconciliation based on Schedule of Rates (Contract #{packageData.contractNo})
                </p>
              </div>
              <div className="text-right text-xs">
                <span className="bg-slate-900 text-amber-400 font-bold px-2.5 py-0.5 rounded text-[11px]">
                  Document 2: Itemized Rate Ticket
                </span>
              </div>
            </div>

            {/* Quick Metadata Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded p-3 text-xs mt-3">
              <div>
                <span className="text-slate-500 block">Client:</span>
                <span className="font-bold text-slate-900">{packageData.customerName}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Rig / Well:</span>
                <span className="font-bold text-slate-900">{packageData.rig} / {packageData.well}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Delivery Tickets:</span>
                <span className="font-bold text-slate-900">{packageData.deliveryTicketRefs}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Return Ticket / Note:</span>
                <span className="font-bold text-slate-900">{packageData.returnLoadingNoteNo}</span>
              </div>
            </div>
          </div>

          {/* 44 Lines Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border border-slate-300 text-left">
              <thead>
                <tr className="bg-slate-800 text-white font-bold">
                  <th className="p-1.5 border-r border-slate-700 text-center">ITEM</th>
                  <th className="p-1.5 border-r border-slate-700">SERIAL #</th>
                  <th className="p-1.5 border-r border-slate-700">DESCRIPTION</th>
                  <th className="p-1.5 border-r border-slate-700 text-center">QTY</th>
                  <th className="p-1.5 border-r border-slate-700">DT #</th>
                  <th className="p-1.5 border-r border-slate-700">DELIV. DATE</th>
                  <th className="p-1.5 border-r border-slate-700">RET. DATE</th>
                  <th className="p-1.5 border-r border-slate-700 text-center">DAYS</th>
                  <th className="p-1.5 border-r border-slate-700">RGT/RT #</th>
                  <th className="p-1.5 border-r border-slate-700 text-center">SCHED. REF</th>
                  <th className="p-1.5 border-r border-slate-700 text-center">OPER DAYS</th>
                  <th className="p-1.5 border-r border-slate-700 text-right">OPER RATE</th>
                  <th className="p-1.5 border-r border-slate-700 text-center">S/BY DAYS</th>
                  <th className="p-1.5 border-r border-slate-700 text-right">S/BY RATE</th>
                  <th className="p-1.5 border-r border-slate-700 text-right">OPER TOTAL</th>
                  <th className="p-1.5 border-r border-slate-700 text-right">S/BY TOTAL</th>
                  <th className="p-1.5 text-right bg-slate-900">TOTAL (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {packageData.lines.map((line) => (
                  <tr
                    key={line.itemNo}
                    className={`hover:bg-amber-50/40 transition-colors ${
                      line.operDays > 0 ? 'bg-blue-50/40 font-medium' : ''
                    }`}
                  >
                    <td className="p-1.5 border-r border-slate-200 text-center font-bold text-slate-700">{line.itemNo}</td>
                    <td className="p-1.5 border-r border-slate-200 font-mono font-semibold text-slate-900">{line.serialNumber}</td>
                    <td className="p-1.5 border-r border-slate-200 text-slate-800">{line.toolDescription}</td>
                    <td className="p-1.5 border-r border-slate-200 text-center">{line.qty}</td>
                    <td className="p-1.5 border-r border-slate-200 font-mono text-slate-600">{line.deliveryTicketNo || '-'}</td>
                    <td className="p-1.5 border-r border-slate-200 text-slate-600 whitespace-nowrap">{line.deliveryDate}</td>
                    <td className="p-1.5 border-r border-slate-200 text-slate-600 whitespace-nowrap">{line.returnDate}</td>
                    <td className="p-1.5 border-r border-slate-200 text-center font-semibold">{line.rentalDays}</td>
                    <td className="p-1.5 border-r border-slate-200 font-mono text-slate-600">{line.rgtNo || '-'}</td>
                    <td className="p-1.5 border-r border-slate-200 text-center font-mono text-[10px] text-slate-600">{line.contractRefStandby}</td>
                    <td className="p-1.5 border-r border-slate-200 text-center font-bold text-blue-700">{line.operDays || '-'}</td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono">{line.operRateUSD > 0 ? line.operRateUSD.toFixed(2) : '-'}</td>
                    <td className="p-1.5 border-r border-slate-200 text-center font-semibold">{line.standbyDays}</td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono">{line.standbyRateUSD.toFixed(2)}</td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono text-blue-800">{line.operTotalUSD > 0 ? line.operTotalUSD.toFixed(2) : '-'}</td>
                    <td className="p-1.5 border-r border-slate-200 text-right font-mono">{line.standbyTotalUSD.toFixed(2)}</td>
                    <td className="p-1.5 text-right font-bold font-mono text-slate-900 bg-slate-50">{line.totalChargesUSD.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold border-t-2 border-slate-800 text-xs">
                  <td colSpan={14} className="p-2 text-right uppercase text-slate-700">Subtotal Gross Charges (USD):</td>
                  <td className="p-2 text-right font-mono text-blue-900">
                    ${(packageData.crewChargeUSD + packageData.operationalChargeUSD).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-2 text-right font-mono text-slate-900">
                    ${packageData.standbyChargeUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-2 text-right font-mono text-slate-900 bg-amber-100 text-sm">
                    ${packageData.grossValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className="bg-amber-50 font-bold text-xs">
                  <td colSpan={16} className="p-2 text-right uppercase text-slate-800">UAE VAT (5%):</td>
                  <td className="p-2 text-right font-mono text-amber-950">
                    ${packageData.vatAmountUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
                <tr className="bg-slate-900 text-white font-bold text-xs">
                  <td colSpan={16} className="p-2.5 text-right uppercase tracking-wider text-amber-400">Total Invoice Package Value (USD):</td>
                  <td className="p-2.5 text-right font-mono text-amber-400 text-sm">
                    ${packageData.grandTotalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* DOCUMENT 3: ATTACHED FIELD VERIFICATION EXHIBITS */}
      {(docFilter === 'all' || docFilter === 'attachments') && (
        <div id="doc-3-attachments" className="max-w-5xl mx-auto space-y-4">
          {docFilter === 'all' && (
            <div className="my-5 pt-3 pb-2 border-b-2 border-slate-300 flex justify-between items-center text-xs font-bold text-slate-600 uppercase tracking-wider">
              <span>Field Verification Dossier ({packageData.attachedDocuments?.length || 0} Attached Physical Exhibits)</span>
              <span className="text-blue-700 font-mono">Document 3</span>
            </div>
          )}
          <InvoiceVerificationDocuments
            packageData={packageData}
            currentJob={currentJob}
            dtBatches={dtBatches}
            rtBatches={rtBatches}
            onUpdateJob={onUpdateJob}
            onUpdateDTBatch={onUpdateDTBatch}
            onUpdateRTBatch={onUpdateRTBatch}
            onShowToast={onShowToast}
          />
        </div>
      )}

      {/* Option 1: Two-Step Interactive Confirmation Modal */}
      {confirmModal.isOpen && currentJob && (
        <InvoiceConfirmationModal
          isOpen={confirmModal.isOpen}
          onClose={handleCloseConfirmModal}
          job={currentJob}
          actionType={confirmModal.actionType}
          packageData={packageData}
          onConfirmDraft={handleConfirmDraftInvoice}
          onConfirmFinal={handleConfirmFinalInvoice}
        />
      )}
    </div>
  );
};
