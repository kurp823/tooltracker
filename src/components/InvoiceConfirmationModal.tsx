import React, { useState, useEffect } from 'react';
import { DrillingJob, DraftInvoicePackageData } from '../types';
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  X,
  ShieldCheck,
  Calendar,
  Hash,
  FileCheck,
  DollarSign,
  Building,
  Layers,
} from 'lucide-react';

export interface InvoiceConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: DrillingJob;
  actionType: 'draft' | 'final';
  packageData?: DraftInvoicePackageData | null;
  onConfirmDraft: (data: {
    invoiceNumber: string;
    invoiceDate: string;
    notes?: string;
  }) => void;
  onConfirmFinal: (data: {
    legalInvoiceNumber: string;
    sesNumber?: string;
    invoiceDate: string;
    notes?: string;
  }) => void;
}

export const InvoiceConfirmationModal: React.FC<InvoiceConfirmationModalProps> = ({
  isOpen,
  onClose,
  job,
  actionType,
  packageData,
  onConfirmDraft,
  onConfirmFinal,
}) => {
  const isFinal = actionType === 'final';

  // Form states
  const [draftInvNumber, setDraftInvNumber] = useState<string>('');
  const [legalInvNumber, setLegalInvNumber] = useState<string>('');
  const [sesRefNumber, setSesRefNumber] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [verifiedCheck, setVerifiedCheck] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      const curYr = new Date().getFullYear().toString().slice(-2);
      const randomSeq = Math.floor(1000 + Math.random() * 9000);
      
      const defaultDraft =
        job.draftInvoiceNumber ||
        (packageData?.invoiceNumber ? packageData.invoiceNumber : `DFT-${curYr}-${randomSeq}`);
      setDraftInvNumber(defaultDraft);

      const defaultLegal =
        job.legalInvoiceNumber ||
        (job.client.toLowerCase().includes('adnoc')
          ? `FSH-${new Date().getFullYear()}-0${Math.floor(50 + Math.random() * 40)}`
          : `INV-${curYr}-${randomSeq}`);
      setLegalInvNumber(defaultLegal);

      const defaultSes = job.sesNumber || `SES-${Math.floor(100000 + Math.random() * 900000)}`;
      setSesRefNumber(defaultSes);

      setInvoiceDate(new Date().toISOString().split('T')[0]);
      setNotes(job.notes || '');
      setVerifiedCheck(false);
    }
  }, [isOpen, job, packageData]);

  if (!isOpen) return null;

  const totalUSD =
    packageData?.grandTotalUSD ?? job.invoiceAmount ?? 52500;
  const totalAED =
    packageData?.grandTotalAED ?? Math.round(totalUSD * 3.6725);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isFinal) {
      if (!verifiedCheck) return;
      onConfirmFinal({
        legalInvoiceNumber: legalInvNumber.trim() || `INV-${job.id}`,
        sesNumber: sesRefNumber.trim(),
        invoiceDate,
        notes,
      });
    } else {
      onConfirmDraft({
        invoiceNumber: draftInvNumber.trim() || `DFT-${job.id}`,
        invoiceDate,
        notes,
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150 no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-200">
        {/* Header Bar */}
        <div
          className={`px-5 py-3.5 border-b flex items-center justify-between ${
            isFinal
              ? 'bg-gradient-to-r from-emerald-700 to-teal-800 text-white'
              : 'bg-gradient-to-r from-blue-700 to-indigo-800 text-white'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-white/15 backdrop-blur-xs">
              {isFinal ? (
                <ShieldCheck className="w-5 h-5 text-emerald-200" />
              ) : (
                <FileCheck className="w-5 h-5 text-blue-200" />
              )}
            </div>
            <div>
              <span className="text-xs text-white/80 font-medium">
                {isFinal ? 'Official Legal Invoicing Clearance' : 'Draft Invoicing Confirmation'}
              </span>
              <h2 className="text-base font-bold text-white">
                {isFinal
                  ? 'Confirm Final Legal Tax Invoice'
                  : 'Confirm Save Draft Invoice Package'}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit}>
          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Stage Notice Banner - Compact */}
            <div
              className={`px-3 py-2 rounded-md border flex items-center space-x-2 text-xs ${
                isFinal
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
            >
              <AlertTriangle
                className={`w-4 h-4 shrink-0 ${
                  isFinal ? 'text-emerald-700' : 'text-blue-700'
                }`}
              />
              <p className="text-[11px] leading-tight font-medium">
                {isFinal
                  ? 'Review job parameters and verification documents below to confirm and issue the official Final Legal Tax Invoice.'
                  : 'Review job parameters and calculated totals below to save and lock this Draft Invoice package for client review.'}
              </p>
            </div>

            {/* STEP 1: FINANCIAL & OPERATIONAL SUMMARY TABLE */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-800 inline-flex items-center justify-center text-[10px] font-black">
                    1
                  </span>
                  Financial &amp; Operational Audit Summary
                </span>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> 5 Supporting Docs Verified
                </span>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50 shadow-2xs">
                <table className="w-full text-xs text-left">
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <th scope="row" className="px-3.5 py-2 font-semibold text-slate-600 bg-slate-100/70 w-1/3">
                        Job Reference ID
                      </th>
                      <td className="px-3.5 py-2 font-mono font-bold text-slate-900 flex items-center justify-between">
                        <span>{job.id}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-800">
                          Current: {job.status}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <th scope="row" className="px-3.5 py-2 font-semibold text-slate-600 bg-slate-100/70">
                        Client Operator
                      </th>
                      <td className="px-3.5 py-2 font-bold text-slate-800 flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                        <span>{job.client}</span>
                      </td>
                    </tr>
                    <tr>
                      <th scope="row" className="px-3.5 py-2 font-semibold text-slate-600 bg-slate-100/70">
                        Rig / Well Location
                      </th>
                      <td className="px-3.5 py-2 text-slate-800 font-medium">
                        {packageData?.rig || job.rig} &bull; Well: {packageData?.well || job.well}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row" className="px-3.5 py-2 font-semibold text-slate-600 bg-slate-100/70">
                        Contract &amp; Purchase Order (PO)
                      </th>
                      <td className="px-3.5 py-2 font-mono text-slate-700">
                        {packageData?.contractNo || job.contract || 'CTR-2023-FSH-041'}{' '}
                        <span className="text-slate-500 font-normal">
                          (PO: {packageData?.poNo || job.poNumber || 'PO-4500912384'})
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <th scope="row" className="px-3.5 py-2 font-semibold text-slate-600 bg-slate-100/70">
                        Mobilization &amp; Return Dates
                      </th>
                      <td className="px-3.5 py-2 text-slate-700 font-mono text-[11px]">
                        Mob: {packageData?.dateOfSupply || job.firstDtDate || job.mobDate || '2026-03-01'} &rarr; Return: {job.lastRtDate || job.demobDate || '2026-03-06'}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row" className="px-3.5 py-2 font-semibold text-slate-600 bg-slate-100/70">
                        Operational Utilization
                      </th>
                      <td className="px-3.5 py-2 text-slate-800">
                        <span className="font-bold text-emerald-700">
                          {packageData?.operDays || 2} Operational Days
                        </span>
                        <span className="text-slate-500 text-[11px] ml-2">
                          ({packageData?.standbyDays || 0} Standby Days &bull; {packageData?.lines?.length || 4} Itemized Tools)
                        </span>
                      </td>
                    </tr>
                    <tr className="bg-blue-50/40">
                      <th scope="row" className="px-3.5 py-2.5 font-bold text-slate-700 bg-slate-100/80">
                        Total Billing Value
                      </th>
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-baseline space-x-2">
                          <span className="font-mono font-black text-sm text-blue-900">
                            ${totalUSD.toLocaleString()} USD
                          </span>
                          <span className="font-mono text-xs text-slate-600">
                            (AED {totalAED.toLocaleString()})
                          </span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* STEP 2: EDITABLE BILLING FORM CONTROLS */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-800 inline-flex items-center justify-center text-[10px] font-black">
                    2
                  </span>
                  {isFinal
                    ? 'Official Legal Tax Invoicing Parameters'
                    : 'Draft Invoice Parameters & Audit Notes'}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  Editable fields for billing audit
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-3 text-xs">
                {isFinal ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-800 mb-1 flex items-center gap-1">
                          <Hash className="w-3 h-3 text-emerald-700" />
                          Official Legal Tax Invoice # *
                        </label>
                        <input
                          type="text"
                          required
                          value={legalInvNumber}
                          onChange={(e) => setLegalInvNumber(e.target.value)}
                          placeholder="e.g. FSH-2025-088, FR-1044, WHP-502"
                          className="w-full px-2.5 py-1.5 font-mono font-bold text-slate-900 border border-emerald-400 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          Approved ADNOC/Operator billing series.
                        </span>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-800 mb-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                          Client SES Reference # *
                        </label>
                        <input
                          type="text"
                          required
                          value={sesRefNumber}
                          onChange={(e) => setSesRefNumber(e.target.value)}
                          placeholder="e.g. SES-892144"
                          className="w-full px-2.5 py-1.5 font-mono font-bold text-slate-900 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          Operator Service Entry Sheet clearance.
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-800 mb-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          Official Invoice Issue Date *
                        </label>
                        <input
                          type="date"
                          required
                          value={invoiceDate}
                          onChange={(e) => setInvoiceDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 font-mono text-slate-900 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-800 mb-1">
                          Final Target Status
                        </label>
                        <div className="px-2.5 py-1.5 bg-emerald-100 text-emerald-900 rounded-md font-bold border border-emerald-300 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                          <span>Final Invoiced &amp; Closed</span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-800 mb-1 flex items-center gap-1">
                          <Hash className="w-3 h-3 text-blue-700" />
                          Draft Invoice Number *
                        </label>
                        <input
                          type="text"
                          required
                          value={draftInvNumber}
                          onChange={(e) => setDraftInvNumber(e.target.value)}
                          placeholder="e.g. DFT-26-0042"
                          className="w-full px-2.5 py-1.5 font-mono font-bold text-slate-900 border border-blue-400 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          Draft package identifier for client review.
                        </span>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-800 mb-1 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          Draft Billing Date *
                        </label>
                        <input
                          type="date"
                          required
                          value={invoiceDate}
                          onChange={(e) => setInvoiceDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 font-mono text-slate-900 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-[10px] text-slate-500 block mt-0.5">
                          Date recorded on Draft Tax Invoice.
                        </span>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Billing Notes &amp; Audit Remarks (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Enter any billing notes, operator specific comments, or contract cross-references..."
                    className="w-full px-2.5 py-1.5 text-xs text-slate-900 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* For Final Invoicing: Mandatory Verification Checkbox */}
                {isFinal && (
                  <div className="pt-2 border-t border-slate-200">
                    <label className="flex items-start space-x-2.5 p-2 rounded-md bg-emerald-50/70 border border-emerald-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={verifiedCheck}
                        onChange={(e) => setVerifiedCheck(e.target.checked)}
                        className="mt-0.5 w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span className="text-[11px] text-emerald-950 font-medium leading-tight">
                        <strong className="font-bold text-emerald-900">
                          Mandatory Verification Audit Check:
                        </strong>{' '}
                        I confirm that the 5 supporting verification documents (Delivery Tickets, Mob
                        Manifest, Receiving Tickets, Demob Backload, and Dual-Signed Rig Log) along with
                        the client SES approval have been audited and matched against Contract rates.
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Modal Footer Controls */}
          <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition cursor-pointer"
            >
              Cancel / Return
            </button>

            <div className="flex items-center space-x-2">
              {isFinal ? (
                <button
                  type="submit"
                  disabled={!verifiedCheck}
                  className={`px-5 py-2 rounded-md font-bold text-xs shadow-sm flex items-center space-x-1.5 transition cursor-pointer ${
                    verifiedCheck
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  }`}
                  title={
                    verifiedCheck
                      ? 'Confirm and register Final Legal Tax Invoice'
                      : 'Please check the mandatory verification audit checkbox above first'
                  }
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Confirm &amp; Record Final Invoiced</span>
                </button>
              ) : (
                <button
                  type="submit"
                  className="px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center space-x-1.5 transition cursor-pointer"
                >
                  <FileCheck className="w-4 h-4" />
                  <span>Confirm &amp; Save Draft Invoiced</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
