import React from 'react';
import { DrillingJob, DTBatch, RTBatch } from '../types';
import {
  JobStageKey,
  STAGE_DEFINITIONS,
  ALL_STAGE_KEYS,
  resolveJobStage,
  calculateJobLifecycleMetrics,
} from '../jobLifecycle';
import {
  CheckCircle2,
  Clock,
  ArrowRight,
  ShieldCheck,
  FileCheck,
  Receipt,
  FileText,
  Calendar,
  Layers,
  History,
} from 'lucide-react';
import { formatJobDate } from './JobsView';

interface JobLifecycleStepperProps {
  job: DrillingJob;
  dtBatches: DTBatch[];
  rtBatches: RTBatch[];
  onOpenStatusModal: () => void;
  canEdit?: boolean;
}

export const JobLifecycleStepper: React.FC<JobLifecycleStepperProps> = ({
  job,
  dtBatches,
  rtBatches,
  onOpenStatusModal,
  canEdit = true,
}) => {
  const currentStage = resolveJobStage(job, dtBatches.length, rtBatches.length);
  const metrics = calculateJobLifecycleMetrics(job, currentStage, dtBatches, rtBatches);
  const currentStepNum = STAGE_DEFINITIONS[currentStage].stepNumber;

  const stageDurations: Record<JobStageKey, number> = {
    '1_open': metrics.openDays,
    '2_ongoing': metrics.ongoingDays,
    '3_waiting_signed_docs': metrics.waitingDocsDays,
    '4_submitted_billing': metrics.billingDays,
    '5_ses_submitted': metrics.sesDays,
    '6_completed': metrics.totalCycleDays,
  };

  const stageMilestoneDates: Record<JobStageKey, string | undefined> = {
    '1_open': metrics.milestones.openDate,
    '2_ongoing': metrics.milestones.ongoingDate,
    '3_waiting_signed_docs': metrics.milestones.waitingDocsDate,
    '4_submitted_billing': metrics.milestones.billingDate,
    '5_ses_submitted': metrics.milestones.sesDate,
    '6_completed': metrics.milestones.completedDate,
  };

  return (
    <div className="space-y-4">
      {/* 6-Stage Visual Stepper */}
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-800 text-xs flex items-center space-x-1.5">
              <Layers className="w-4 h-4 text-[#1a3055]" />
              <span>Job Operational &amp; Commercial Lifecycle Pipeline</span>
            </span>
            <span
              className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${STAGE_DEFINITIONS[currentStage].badgeBg} ${STAGE_DEFINITIONS[currentStage].badgeText} ${STAGE_DEFINITIONS[currentStage].badgeBorder}`}
            >
              Stage {currentStepNum} of 6: {STAGE_DEFINITIONS[currentStage].shortLabel}
            </span>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={onOpenStatusModal}
              className="px-2.5 py-1 rounded bg-[#1a3055] text-white hover:bg-[#24426d] font-bold text-[11px] shadow-xs flex items-center space-x-1 cursor-pointer"
            >
              <span>Update Lifecycle Stage</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Pipeline Step Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {ALL_STAGE_KEYS.map((sKey) => {
            const def = STAGE_DEFINITIONS[sKey];
            const isCompleted = def.stepNumber < currentStepNum;
            const isCurrent = def.stepNumber === currentStepNum;
            const isUpcoming = def.stepNumber > currentStepNum;
            const duration = stageDurations[sKey];
            const mDate = stageMilestoneDates[sKey];

            return (
              <div
                key={sKey}
                className={`p-2.5 rounded-lg border flex flex-col justify-between transition-all ${
                  isCurrent
                    ? 'border-amber-400 bg-amber-50/60 ring-2 ring-amber-300/50 shadow-xs'
                    : isCompleted
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-slate-200 bg-white opacity-70'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                        isCurrent
                          ? 'bg-amber-500 text-white animate-pulse'
                          : isCompleted
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : def.stepNumber}
                    </span>
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider ${
                        isCurrent
                          ? 'text-amber-700'
                          : isCompleted
                          ? 'text-emerald-700'
                          : 'text-slate-400'
                      }`}
                    >
                      {isCurrent ? 'Active' : isCompleted ? 'Passed' : 'Pending'}
                    </span>
                  </div>

                  <div className="font-bold text-slate-800 text-[11px] leading-tight">
                    {def.shortLabel}
                  </div>
                </div>

                <div className="mt-2 pt-1.5 border-t border-slate-200/70 text-[10px] flex items-center justify-between">
                  <span className="text-slate-500">
                    {mDate ? formatJobDate(mDate) : '—'}
                  </span>
                  <span
                    className={`font-mono font-bold ${
                      isCurrent
                        ? 'text-amber-900 bg-amber-200/70 px-1 rounded'
                        : isCompleted
                        ? 'text-emerald-900'
                        : 'text-slate-400'
                    }`}
                  >
                    {duration > 0 || isCompleted || isCurrent ? `${duration}d` : '—'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Days Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-blue-50/60 rounded-lg border border-blue-200 text-center">
          <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
            Days on Site (Ongoing)
          </div>
          <div className="text-lg font-extrabold text-blue-900 font-mono mt-0.5">
            {metrics.ongoingDays} days
          </div>
          <div className="text-[10px] text-blue-600">Mob to Return</div>
        </div>

        <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-200 text-center">
          <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
            Waiting Signed Docs
          </div>
          <div className="text-lg font-extrabold text-amber-900 font-mono mt-0.5">
            {metrics.waitingDocsDays} days
          </div>
          <div className="text-[10px] text-amber-600">Return to Billing</div>
        </div>

        <div className="p-3 bg-purple-50/60 rounded-lg border border-purple-200 text-center">
          <div className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
            In Billing &amp; SES
          </div>
          <div className="text-lg font-extrabold text-purple-900 font-mono mt-0.5">
            {metrics.billingDays + metrics.sesDays} days
          </div>
          <div className="text-[10px] text-purple-600">Billing to Legal Inv</div>
        </div>

        <div className="p-3 bg-emerald-50/60 rounded-lg border border-emerald-200 text-center">
          <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
            Total Operational Cycle
          </div>
          <div className="text-lg font-extrabold text-emerald-900 font-mono mt-0.5">
            {metrics.totalCycleDays} days
          </div>
          <div className="text-[10px] text-emerald-600">Open to Completion</div>
        </div>
      </div>

      {/* Document & Commercial Checklist Card */}
      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
        <h4 className="font-bold text-slate-800 text-xs mb-2 flex items-center space-x-1.5">
          <ShieldCheck className="w-4 h-4 text-[#1a3055]" />
          <span>Stage Documentation &amp; Billing Verification Status</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="bg-white p-2.5 rounded border border-slate-200 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-700 block text-[11px]">Signed DTs:</span>
              <span className="text-[10px] text-slate-500">Delivery Tickets</span>
            </div>
            <span
              className={`font-bold text-[10px] px-2 py-0.5 rounded ${
                job.signedDtAttached ?? currentStepNum >= 4
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {job.signedDtAttached ?? currentStepNum >= 4 ? 'Verified & Attached' : 'Pending Signature'}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded border border-slate-200 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-700 block text-[11px]">Signed RTs:</span>
              <span className="text-[10px] text-slate-500">Receiving Tickets</span>
            </div>
            <span
              className={`font-bold text-[10px] px-2 py-0.5 rounded ${
                job.signedRtAttached ?? currentStepNum >= 4
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {job.signedRtAttached ?? currentStepNum >= 4 ? 'Verified & Attached' : 'Pending Signature'}
            </span>
          </div>

          <div className="bg-white p-2.5 rounded border border-slate-200 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-700 block text-[11px]">Utilization Sheet:</span>
              <span className="text-[10px] text-slate-500">Rig Time Summary</span>
            </div>
            <span
              className={`font-bold text-[10px] px-2 py-0.5 rounded ${
                job.signedUtilizationAttached ?? currentStepNum >= 4
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {job.signedUtilizationAttached ?? currentStepNum >= 4 ? 'Attached' : 'Pending'}
            </span>
          </div>
        </div>
      </div>

      {/* Stage Transition History Log */}
      {job.statusHistory && job.statusHistory.length > 0 && (
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
          <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800">
            <History className="w-4 h-4 text-blue-700" />
            <span>Recorded Stage Changes &amp; Duration Log</span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-[11px] text-left">
              <thead className="bg-slate-100/70 border-b text-slate-600 font-bold">
                <tr>
                  <th className="p-2">Date</th>
                  <th className="p-2">Stage Transition</th>
                  <th className="p-2">Duration Recorded</th>
                  <th className="p-2">Updated By</th>
                  <th className="p-2">Reference / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {job.statusHistory.map((tr) => (
                  <tr key={tr.id} className="hover:bg-slate-50">
                    <td className="p-2 font-mono text-slate-700">{formatJobDate(tr.date)}</td>
                    <td className="p-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-medium text-slate-600">{tr.fromStatus}</span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="font-bold text-slate-900">{tr.toStatus}</span>
                      </div>
                    </td>
                    <td className="p-2 font-mono font-bold text-amber-800">
                      {tr.daysInStage} days
                    </td>
                    <td className="p-2 text-slate-600">{tr.changedBy}</td>
                    <td className="p-2 text-slate-600">
                      {tr.docRef && <span className="font-mono font-semibold block">{tr.docRef}</span>}
                      {tr.notes && <span className="text-[10px] text-slate-500">{tr.notes}</span>}
                      {!tr.docRef && !tr.notes && '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
