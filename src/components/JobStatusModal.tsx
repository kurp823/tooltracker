import React, { useState } from 'react';
import {
  DrillingJob,
  DTBatch,
  RTBatch,
  User,
  JobStatusTransition,
} from '../types';
import {
  JobStageKey,
  STAGE_DEFINITIONS,
  ALL_STAGE_KEYS,
  resolveJobStage,
  calculateJobLifecycleMetrics,
  validateStageRequirements,
  diffDays,
} from '../jobLifecycle';
import {
  CheckCircle2,
  Clock,
  FileCheck,
  Send,
  Receipt,
  AlertTriangle,
  Calendar,
  X,
  ShieldCheck,
  Hash,
} from 'lucide-react';

interface JobStatusModalProps {
  job: DrillingJob;
  user?: User | null;
  dtBatches: DTBatch[];
  rtBatches: RTBatch[];
  onSave: (updatedJob: DrillingJob) => void;
  onClose: () => void;
}

export const JobStatusModal: React.FC<JobStatusModalProps> = ({
  job,
  user,
  dtBatches,
  rtBatches,
  onSave,
  onClose,
}) => {
  const currentStage = resolveJobStage(job, dtBatches.length, rtBatches.length);
  const currentMetrics = calculateJobLifecycleMetrics(job, currentStage, dtBatches, rtBatches);

  const [targetStage, setTargetStage] = useState<JobStageKey>(currentStage);
  const [transitionDate, setTransitionDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState<string>('');

  // Mandatory fields for Stage 3
  const [demobDate, setDemobDate] = useState<string>(
    job.demobDate || new Date().toISOString().split('T')[0]
  );

  // Mandatory fields for Stage 4 (Submitted to Billing Team)
  const [submittedToBillingDate, setSubmittedToBillingDate] = useState<string>(
    job.submittedToBillingDate || new Date().toISOString().split('T')[0]
  );
  const [signedDtAttached, setSignedDtAttached] = useState<boolean>(
    job.signedDtAttached ?? true
  );
  const [signedRtAttached, setSignedRtAttached] = useState<boolean>(
    job.signedRtAttached ?? true
  );
  const [signedUtilizationAttached, setSignedUtilizationAttached] = useState<boolean>(
    job.signedUtilizationAttached ?? true
  );
  const [billingTransmittalRef, setBillingTransmittalRef] = useState<string>(
    job.billingTransmittalRef || `TRX-${job.id.replace('JOB-', '')}`
  );

  // Mandatory fields for Stage 5 (SES Submitted)
  const [draftInvoiceNumber, setDraftInvoiceNumber] = useState<string>(
    job.draftInvoiceNumber || ''
  );
  const [sesNumber, setSesNumber] = useState<string>(job.sesNumber || '');
  const [sesSubmittedDate, setSesSubmittedDate] = useState<string>(
    job.sesSubmittedDate || new Date().toISOString().split('T')[0]
  );

  // Mandatory fields for Stage 6 (Completed)
  const [legalInvoiceNumber, setLegalInvoiceNumber] = useState<string>(
    job.legalInvoiceNumber || ''
  );
  const [completedDate, setCompletedDate] = useState<string>(
    job.completedDate || job.finalInvoicedDate || new Date().toISOString().split('T')[0]
  );
  const [invoiceAmount, setInvoiceAmount] = useState<string>(
    job.invoiceAmount !== undefined && job.invoiceAmount !== null
      ? String(job.invoiceAmount)
      : ''
  );

  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Calculate preview of days in current stage that will be recorded
  const previousEffectiveDate =
    currentStage === '1_open'
      ? currentMetrics.milestones.openDate
      : currentStage === '2_ongoing'
      ? currentMetrics.milestones.ongoingDate || currentMetrics.milestones.openDate
      : currentStage === '3_waiting_signed_docs'
      ? currentMetrics.milestones.waitingDocsDate || currentMetrics.milestones.openDate
      : currentStage === '4_submitted_billing'
      ? currentMetrics.milestones.billingDate || currentMetrics.milestones.openDate
      : currentStage === '5_ses_submitted'
      ? currentMetrics.milestones.sesDate || currentMetrics.milestones.openDate
      : currentMetrics.milestones.completedDate || currentMetrics.milestones.openDate;

  const previewDaysInStage = diffDays(previousEffectiveDate, transitionDate);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate mandatory criteria for stage
    const validation = validateStageRequirements(targetStage, {
      demobDate,
      submittedToBillingDate,
      signedDtAttached,
      signedRtAttached,
      signedUtilizationAttached,
      billingTransmittalRef,
      draftInvoiceNumber,
      sesNumber,
      sesSubmittedDate,
      legalInvoiceNumber,
      completedDate,
    });

    if (!validation.valid) {
      setValidationErrors(validation.errors);
      return;
    }

    setValidationErrors([]);

    const currentDef = STAGE_DEFINITIONS[currentStage];
    const targetDef = STAGE_DEFINITIONS[targetStage];

    // Reference document for this transition
    let docRef = '';
    if (targetStage === '4_submitted_billing') {
      docRef = `Ref: ${billingTransmittalRef} (DT/RT/Util Verified)`;
    } else if (targetStage === '5_ses_submitted') {
      docRef = `Draft: ${draftInvoiceNumber || sesNumber}`;
    } else if (targetStage === '6_completed') {
      docRef = `Legal Inv: ${legalInvoiceNumber}`;
    }

    // New transition record
    const transitionRecord: JobStatusTransition = {
      id: `TR-${Date.now()}`,
      fromStatus: currentDef.label,
      toStatus: targetDef.label,
      date: transitionDate,
      daysInStage: previewDaysInStage,
      changedBy: user?.name || 'Operations',
      notes: notes.trim() || undefined,
      docRef: docRef || undefined,
      signedDocsConfirmed: targetStage === '4_submitted_billing' ? true : undefined,
    };

    // Standard status text mapping for DrillingJob.status
    const statusMap: Record<JobStageKey, string> = {
      '1_open': 'Open',
      '2_ongoing': 'Ongoing',
      '3_waiting_signed_docs': 'Waiting on Signed Docs',
      '4_submitted_billing': 'Submitted to Billing Team',
      '5_ses_submitted': 'SES Submitted',
      '6_completed': 'Completed',
    };

    const updatedJob: DrillingJob = {
      ...job,
      status: statusMap[targetStage] as any,
      statusHistory: [transitionRecord, ...(job.statusHistory || [])],
    };

    // Apply stage-specific milestone updates
    if (targetStage === '1_open') {
      updatedJob.openedDate = transitionDate;
    } else if (targetStage === '2_ongoing') {
      updatedJob.ongoingDate = transitionDate;
    } else if (targetStage === '3_waiting_signed_docs') {
      updatedJob.demobDate = demobDate;
      updatedJob.waitingSignedDocsDate = transitionDate;
    } else if (targetStage === '4_submitted_billing') {
      updatedJob.submittedToBillingDate = submittedToBillingDate;
      updatedJob.signedDtAttached = signedDtAttached;
      updatedJob.signedRtAttached = signedRtAttached;
      updatedJob.signedUtilizationAttached = signedUtilizationAttached;
      updatedJob.billingTransmittalRef = billingTransmittalRef;
    } else if (targetStage === '5_ses_submitted') {
      if (draftInvoiceNumber.trim()) updatedJob.draftInvoiceNumber = draftInvoiceNumber.trim();
      if (sesNumber.trim()) updatedJob.sesNumber = sesNumber.trim();
      updatedJob.sesSubmittedDate = sesSubmittedDate;
      updatedJob.draftInvoicedDate = sesSubmittedDate;
    } else if (targetStage === '6_completed') {
      updatedJob.legalInvoiceNumber = legalInvoiceNumber.trim();
      updatedJob.completedDate = completedDate;
      updatedJob.finalInvoicedDate = completedDate;
      if (invoiceAmount.trim()) {
        const amt = parseFloat(invoiceAmount.replace(/,/g, ''));
        if (!isNaN(amt)) updatedJob.invoiceAmount = amt;
      }
    }

    if (notes.trim()) {
      updatedJob.notes = updatedJob.notes
        ? `${updatedJob.notes}\n[${transitionDate} - Stage: ${targetDef.shortLabel}]: ${notes.trim()}`
        : `[${transitionDate} - Stage: ${targetDef.shortLabel}]: ${notes.trim()}`;
    }

    onSave(updatedJob);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4 no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-3.5 bg-[#1a3055] text-white flex justify-between items-center flex-shrink-0">
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono font-bold text-amber-300 text-sm">{job.id}</span>
              <span className="text-white/40">&bull;</span>
              <span className="font-semibold text-xs text-white">Stage Progression &amp; Lifecycle Tracking</span>
            </div>
            <div className="text-[11px] text-slate-300">
              Rig: <strong>{job.rig}</strong> &bull; Well: <strong>{job.well}</strong> &bull; {job.client}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded hover:bg-white/10 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Current Stage Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Current Operational Stage
              </span>
              <div className="flex items-center space-x-2 mt-0.5">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${STAGE_DEFINITIONS[currentStage].badgeBg} ${STAGE_DEFINITIONS[currentStage].badgeText} ${STAGE_DEFINITIONS[currentStage].badgeBorder}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${STAGE_DEFINITIONS[currentStage].dotColor}`} />
                  {STAGE_DEFINITIONS[currentStage].label}
                </span>
                <span className="text-slate-500 text-[11px]">
                  (Active for <strong className="text-slate-800 font-mono">{currentMetrics.currentStageDays} days</strong>)
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Operational Cycle
              </span>
              <span className="font-mono font-bold text-[#1a3055] text-sm">
                {currentMetrics.totalCycleDays} days
              </span>
            </div>
          </div>

          {/* Target Stage Selector */}
          <div>
            <label className="block font-bold text-slate-800 mb-1.5">
              Select Target Stage *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_STAGE_KEYS.map((sKey) => {
                const def = STAGE_DEFINITIONS[sKey];
                const isSelected = targetStage === sKey;
                const isCurrent = currentStage === sKey;

                return (
                  <button
                    key={sKey}
                    type="button"
                    onClick={() => {
                      setTargetStage(sKey);
                      setValidationErrors([]);
                    }}
                    className={`text-left p-2.5 rounded-lg border transition-all cursor-pointer flex items-start space-x-2.5 ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/70 ring-2 ring-amber-400/40 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5 ${
                        isSelected
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {def.stepNumber}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-[11px]">
                          {def.shortLabel}
                        </span>
                        {isCurrent && (
                          <span className="text-[9px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.2 rounded">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">
                        {def.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Transition Date & Recorded Duration Preview */}
          <div className="grid grid-cols-2 gap-3 bg-blue-50/50 p-3 rounded-lg border border-blue-200/70">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Effective Transition Date *
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={transitionDate}
                  onChange={(e) => setTransitionDate(e.target.value)}
                  className="w-full border border-slate-300 rounded px-2.5 py-1.5 font-mono text-xs bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
            <div>
              <span className="block font-bold text-slate-700 mb-1">
                Recorded Duration in Prev. Stage
              </span>
              <div className="px-2.5 py-1.5 rounded bg-white border border-blue-200 font-mono font-bold text-blue-900 text-xs flex items-center justify-between">
                <span>{STAGE_DEFINITIONS[currentStage].shortLabel}:</span>
                <span className="text-amber-700">{previewDaysInStage} days recorded</span>
              </div>
            </div>
          </div>

          {/* Mandatory Stage Requirements Sections */}
          {targetStage === '3_waiting_signed_docs' && (
            <div className="p-3.5 rounded-lg border border-amber-300 bg-amber-50/60 space-y-2.5">
              <div className="flex items-center space-x-1.5 text-amber-900 font-bold text-xs">
                <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>Stage 3 Mandatory: Demob / Tools Return Date</span>
              </div>
              <p className="text-[11px] text-amber-800">
                Drilling operations finished and all tools returned from site (RT generated). Record tool return date to begin signature tracking.
              </p>
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Demobilization / Return Date *
                </label>
                <input
                  type="date"
                  value={demobDate}
                  onChange={(e) => setDemobDate(e.target.value)}
                  required
                  className="w-full border rounded px-2.5 py-1.5 bg-white font-mono text-xs"
                />
              </div>
            </div>
          )}

          {targetStage === '4_submitted_billing' && (
            <div className="p-3.5 rounded-lg border border-purple-300 bg-purple-50/60 space-y-3">
              <div className="flex items-center space-x-1.5 text-purple-900 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-purple-600 flex-shrink-0" />
                <span>Stage 4 Mandatory: Signed Documents Verification Checklist</span>
              </div>
              <p className="text-[11px] text-purple-800">
                To submit to the Billing team, all signed tickets across Delivery Tickets, Receiving Tickets, and Rig Utilization must be verified:
              </p>

              <div className="space-y-2 bg-white p-3 rounded border border-purple-200">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={signedDtAttached}
                    onChange={(e) => setSignedDtAttached(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                  />
                  <span className="font-semibold text-slate-800">
                    Signed tickets attached against all Delivery Tickets (DTs) *
                  </span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={signedRtAttached}
                    onChange={(e) => setSignedRtAttached(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                  />
                  <span className="font-semibold text-slate-800">
                    Signed tickets attached against all Receiving Tickets (RTs) *
                  </span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={signedUtilizationAttached}
                    onChange={(e) => setSignedUtilizationAttached(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                  />
                  <span className="font-semibold text-slate-800">
                    Rig Utilization sheet signed by Company Man &amp; attached *
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Submitted to Billing Date *
                  </label>
                  <input
                    type="date"
                    value={submittedToBillingDate}
                    onChange={(e) => setSubmittedToBillingDate(e.target.value)}
                    required
                    className="w-full border rounded px-2.5 py-1.5 bg-white font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Billing Transmittal Ref *
                  </label>
                  <input
                    type="text"
                    value={billingTransmittalRef}
                    onChange={(e) => setBillingTransmittalRef(e.target.value)}
                    placeholder="e.g. TRX-2026-0819"
                    required
                    className="w-full border rounded px-2.5 py-1.5 bg-white font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {targetStage === '5_ses_submitted' && (
            <div className="p-3.5 rounded-lg border border-indigo-300 bg-indigo-50/60 space-y-3">
              <div className="flex items-center space-x-1.5 text-indigo-900 font-bold text-xs">
                <FileCheck className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <span>Stage 5 Mandatory: Billing Team Draft Invoice / SES</span>
              </div>
              <p className="text-[11px] text-indigo-800">
                Billing team generated the draft invoice and submitted the Service Entry Sheet (SES) for client approval.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Draft Invoice Number *
                  </label>
                  <input
                    type="text"
                    value={draftInvoiceNumber}
                    onChange={(e) => setDraftInvoiceNumber(e.target.value)}
                    placeholder="e.g. DRF-2026-0044"
                    className="w-full border rounded px-2.5 py-1.5 bg-white font-mono text-xs text-indigo-900 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    SES Reference Number (Optional if Draft Inv set)
                  </label>
                  <input
                    type="text"
                    value={sesNumber}
                    onChange={(e) => setSesNumber(e.target.value)}
                    placeholder="e.g. SES-4700018368"
                    className="w-full border rounded px-2.5 py-1.5 bg-white font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  SES / Draft Submission Date *
                </label>
                <input
                  type="date"
                  value={sesSubmittedDate}
                  onChange={(e) => setSesSubmittedDate(e.target.value)}
                  required
                  className="w-full border rounded px-2.5 py-1.5 bg-white font-mono text-xs"
                />
              </div>
            </div>
          )}

          {targetStage === '6_completed' && (
            <div className="p-3.5 rounded-lg border border-emerald-300 bg-emerald-50/60 space-y-3">
              <div className="flex items-center space-x-1.5 text-emerald-900 font-bold text-xs">
                <Receipt className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>Stage 6 Mandatory: Legal Invoice Number &amp; Final Completion</span>
              </div>
              <p className="text-[11px] text-emerald-800">
                Rule: If legal invoice is mentioned, the job is completed. Commercial settlement finalized.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Legal Invoice Number *
                  </label>
                  <input
                    type="text"
                    value={legalInvoiceNumber}
                    onChange={(e) => setLegalInvoiceNumber(e.target.value)}
                    placeholder="e.g. 4700018368, FSH-02620"
                    required
                    className="w-full border rounded px-2.5 py-1.5 bg-white font-mono text-xs text-emerald-900 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Final Invoiced Amount ($)
                  </label>
                  <input
                    type="text"
                    value={invoiceAmount}
                    onChange={(e) => setInvoiceAmount(e.target.value)}
                    placeholder="e.g. 42500"
                    className="w-full border rounded px-2.5 py-1.5 bg-white font-mono text-xs text-slate-900 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Legal Invoice Issue / Job Completion Date *
                </label>
                <input
                  type="date"
                  value={completedDate}
                  onChange={(e) => setCompletedDate(e.target.value)}
                  required
                  className="w-full border rounded px-2.5 py-1.5 bg-white font-mono text-xs"
                />
              </div>
            </div>
          )}

          {/* Validation Errors Box */}
          {validationErrors.length > 0 && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-xs space-y-1">
              <div className="flex items-center space-x-1.5 font-bold text-rose-900">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600" />
                <span>Mandatory Requirements Missing</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                {validationErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Operations Remarks / Notes */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Status Transition Remarks / Handover Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. All tickets verified with Rig Superintendent and passed to billing coordinator."
              className="w-full border rounded px-3 py-1.5 text-xs text-slate-800"
            />
          </div>
        </form>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center flex-shrink-0 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-100 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-1.5 rounded-lg bg-[#1a3055] text-white font-bold hover:bg-[#24426d] shadow-sm flex items-center space-x-1.5 cursor-pointer"
          >
            <span>Confirm &amp; Record Status Change</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
