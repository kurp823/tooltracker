import { DrillingJob, DTBatch, RTBatch, JobStatusTransition } from './types';

export type JobStageKey =
  | '1_open'
  | '2_ongoing'
  | '3_waiting_signed_docs'
  | '4_submitted_billing'
  | '5_ses_submitted'
  | '6_completed';

export interface StageDefinition {
  key: JobStageKey;
  stepNumber: number;
  label: string;
  shortLabel: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  dotColor: string;
}

export const STAGE_DEFINITIONS: Record<JobStageKey, StageDefinition> = {
  '1_open': {
    key: '1_open',
    stepNumber: 1,
    label: '1. Open (No DT)',
    shortLabel: 'Open',
    description: 'Job opened, no delivery ticket (DT) generated yet',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800',
    badgeBorder: 'border-slate-300',
    dotColor: 'bg-slate-400',
  },
  '2_ongoing': {
    key: '2_ongoing',
    stepNumber: 2,
    label: '2. Ongoing (On Site)',
    shortLabel: 'Ongoing',
    description: 'Tools dispatched and active on site / rig',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-800',
    badgeBorder: 'border-blue-300',
    dotColor: 'bg-blue-500 animate-pulse',
  },
  '3_waiting_signed_docs': {
    key: '3_waiting_signed_docs',
    stepNumber: 3,
    label: '3. Waiting on Signed Docs',
    shortLabel: 'Waiting Docs',
    description: 'Tools returned from site; awaiting signed DT/RT tickets or utilization sheets',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-900',
    badgeBorder: 'border-amber-300',
    dotColor: 'bg-amber-500',
  },
  '4_submitted_billing': {
    key: '4_submitted_billing',
    stepNumber: 4,
    label: '4. Submitted to Billing Team',
    shortLabel: 'In Billing',
    description: 'All signed tickets (DT, RT, utilization) verified and submitted to billing team',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-900',
    badgeBorder: 'border-purple-300',
    dotColor: 'bg-purple-600',
  },
  '5_ses_submitted': {
    key: '5_ses_submitted',
    stepNumber: 5,
    label: '5. SES Submitted',
    shortLabel: 'SES Submitted',
    description: 'Draft invoice or SES generated and submitted for client approval',
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-900',
    badgeBorder: 'border-indigo-300',
    dotColor: 'bg-indigo-600',
  },
  '6_completed': {
    key: '6_completed',
    stepNumber: 6,
    label: '6. Completed (Invoiced)',
    shortLabel: 'Completed',
    description: 'Legal invoice issued and commercial lifecycle finalized',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-900',
    badgeBorder: 'border-emerald-300',
    dotColor: 'bg-emerald-600',
  },
};

export const ALL_STAGE_KEYS: JobStageKey[] = [
  '1_open',
  '2_ongoing',
  '3_waiting_signed_docs',
  '4_submitted_billing',
  '5_ses_submitted',
  '6_completed',
];

/**
 * Standard classification logic defined by business rules:
 * 1) Open mean job is opened but no delivery ticket generated
 * 2) Ongoing means which tools are on site which means DTs are generated.
 * 3) Job completed means all tools are returned from site which means receiving ticket. When job is completed and any pending signed DTs or RTs are not attached then we need to change waiting on signed docs.
 * 4) If signed ticket of all there against each DT, RT & utilization then the status need to change to submitted to Billing team 
 * 5) If billing team generate the draft invoice then status to be SES submitted
 * 6) if legal invoice mentioned then job is completed.
 */
export function resolveJobStage(job: DrillingJob, dtCount: number, rtCount: number): JobStageKey {
  const toolsOnRig = Math.max(0, dtCount - rtCount);
  const sLower = (job.status || '').toLowerCase().trim();

  // Rule 6: If legal invoice mentioned then job is completed
  const hasLegalInvoice = Boolean(
    job.legalInvoiceNumber &&
    job.legalInvoiceNumber.trim() !== '' &&
    job.legalInvoiceNumber.trim() !== '—' &&
    job.legalInvoiceNumber.trim() !== '-'
  );
  if (hasLegalInvoice || sLower === 'final invoiced' || (sLower === 'completed' && hasLegalInvoice)) {
    return '6_completed';
  }

  // Explicit check if already marked completed without legal invoice
  if (sLower === 'completed' && hasLegalInvoice) {
    return '6_completed';
  }

  // Rule 5: If billing team generate draft invoice or SES then status is SES submitted
  const hasDraftOrSes = Boolean(
    (job.draftInvoiceNumber && job.draftInvoiceNumber.trim() !== '' && job.draftInvoiceNumber.trim() !== '—') ||
    (job.sesNumber && job.sesNumber.trim() !== '' && job.sesNumber.trim() !== '—') ||
    job.sesSubmittedDate ||
    job.draftInvoicedDate
  );
  if (
    sLower === 'ses submitted' ||
    sLower === 'under ses approval' ||
    sLower === 'draft invoiced' ||
    hasDraftOrSes
  ) {
    return '5_ses_submitted';
  }

  // Rule 4: If signed tickets of all there against each DT, RT & utilization then submitted to Billing team
  if (
    sLower === 'submitted to billing team' ||
    sLower === 'tickets submitted to billing team' ||
    Boolean(job.submittedToBillingDate)
  ) {
    return '4_submitted_billing';
  }

  // Rule 3: Job completed / all tools returned from site (RT generated or demob recorded), waiting signed docs
  if (
    sLower === 'waiting on signed docs' ||
    sLower === 'job completed and waiting signed docs' ||
    sLower === 'job completed' ||
    sLower === 'completed' ||
    Boolean(job.waitingSignedDocsDate) ||
    (dtCount > 0 && toolsOnRig === 0 && (rtCount > 0 || Boolean(job.demobDate)))
  ) {
    return '3_waiting_signed_docs';
  }

  // Rule 2: Ongoing means tools are on site (DTs generated)
  if (sLower === 'ongoing' || sLower === 'active' || (dtCount > 0 && toolsOnRig > 0)) {
    return '2_ongoing';
  }

  // Rule 1: Open means job is opened but no delivery ticket generated
  return '1_open';
}

/**
 * Calculates days between two date strings (ISO, YYYY-MM-DD)
 */
export function diffDays(dateA?: string | null, dateB?: string | null): number {
  if (!dateA) return 0;
  const parseDate = (val: string): number => {
    // If YYYY-MM-DD
    const isoMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10)).getTime();
    }
    const d = new Date(val).getTime();
    return isNaN(d) ? 0 : d;
  };

  const tA = parseDate(dateA);
  if (tA === 0) return 0;
  const tB = dateB ? parseDate(dateB) : Date.now();
  if (tB === 0) return 0;

  const diffMs = tB - tA;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export interface JobDaysMetrics {
  stage: JobStageKey;
  currentStageDays: number;
  openDays: number;
  ongoingDays: number;
  waitingDocsDays: number;
  billingDays: number;
  sesDays: number;
  totalCycleDays: number;
  pendingSignedDTCount: number;
  pendingSignedRTCount: number;
  milestones: {
    openDate: string;
    ongoingDate?: string;
    waitingDocsDate?: string;
    billingDate?: string;
    sesDate?: string;
    completedDate?: string;
  };
}

/**
 * Computes exact duration in days for every lifecycle stage
 */
export function calculateJobLifecycleMetrics(
  job: DrillingJob,
  stage: JobStageKey,
  dtBatches: DTBatch[] = [],
  rtBatches: RTBatch[] = []
): JobDaysMetrics {
  const openDate = job.openedDate || job.createdDate || job.mobDate || '2023-01-01';

  // Ongoing dispatch milestone
  const ongoingDate =
    job.ongoingDate ||
    dtBatches[0]?.dispatchDate ||
    dtBatches[0]?.rmDate ||
    (stage !== '1_open' ? job.mobDate : undefined);

  // Return / waiting signed docs milestone
  const waitingDocsDate =
    job.waitingSignedDocsDate ||
    rtBatches[0]?.rtDate ||
    (stage !== '1_open' && stage !== '2_ongoing' ? job.demobDate : undefined);

  // Submitted to billing team milestone
  const billingDate = job.submittedToBillingDate || undefined;

  // SES / Draft Invoice milestone
  const sesDate = job.sesSubmittedDate || job.draftInvoicedDate || undefined;

  // Final legal invoiced / completion milestone
  const completedDate =
    job.completedDate ||
    job.finalInvoicedDate ||
    (stage === '6_completed' ? job.demobDate || job.createdDate : undefined);

  // Durations
  const openDays = ongoingDate ? diffDays(openDate, ongoingDate) : diffDays(openDate, null);
  const ongoingDays =
    ongoingDate && waitingDocsDate
      ? diffDays(ongoingDate, waitingDocsDate)
      : ongoingDate
      ? diffDays(ongoingDate, null)
      : 0;
  const waitingDocsDays =
    waitingDocsDate && billingDate
      ? diffDays(waitingDocsDate, billingDate)
      : waitingDocsDate
      ? diffDays(waitingDocsDate, null)
      : 0;
  const billingDays =
    billingDate && sesDate ? diffDays(billingDate, sesDate) : billingDate ? diffDays(billingDate, null) : 0;
  const sesDays = sesDate && completedDate ? diffDays(sesDate, completedDate) : sesDate ? diffDays(sesDate, null) : 0;

  const totalCycleDays = completedDate ? diffDays(openDate, completedDate) : diffDays(openDate, null);

  // Current stage days (how long it has been sitting in its active status)
  let currentStageDays = 0;
  if (stage === '1_open') {
    currentStageDays = diffDays(openDate, null);
  } else if (stage === '2_ongoing') {
    currentStageDays = diffDays(ongoingDate || openDate, null);
  } else if (stage === '3_waiting_signed_docs') {
    currentStageDays = diffDays(waitingDocsDate || ongoingDate || openDate, null);
  } else if (stage === '4_submitted_billing') {
    currentStageDays = diffDays(billingDate || waitingDocsDate || openDate, null);
  } else if (stage === '5_ses_submitted') {
    currentStageDays = diffDays(sesDate || billingDate || openDate, null);
  } else if (stage === '6_completed') {
    currentStageDays = completedDate ? diffDays(openDate, completedDate) : totalCycleDays;
  }

  const pendingSignedDTCount = dtBatches.filter((b) => !b.signedDocUrl && !b.isSigned && !b.signedDate).length;
  const pendingSignedRTCount = rtBatches.filter((b) => !b.signedDocUrl && !b.isSigned && !b.signedDate).length;

  return {
    stage,
    currentStageDays,
    openDays,
    ongoingDays,
    waitingDocsDays,
    billingDays,
    sesDays,
    totalCycleDays,
    pendingSignedDTCount,
    pendingSignedRTCount,
    milestones: {
      openDate,
      ongoingDate,
      waitingDocsDate,
      billingDate,
      sesDate,
      completedDate,
    },
  };
}

/**
 * Validation for mandatory fields from Stage 3 through Stage 6
 */
export interface StageValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateStageRequirements(
  targetStage: JobStageKey,
  data: {
    demobDate?: string;
    submittedToBillingDate?: string;
    signedDtAttached?: boolean;
    signedRtAttached?: boolean;
    signedUtilizationAttached?: boolean;
    billingTransmittalRef?: string;
    draftInvoiceNumber?: string;
    sesNumber?: string;
    sesSubmittedDate?: string;
    legalInvoiceNumber?: string;
    completedDate?: string;
  }
): StageValidationResult {
  const errors: string[] = [];

  if (targetStage === '3_waiting_signed_docs') {
    if (!data.demobDate || !data.demobDate.trim()) {
      errors.push('Demobilization / Tool Return Date is mandatory for Stage 3 (Waiting on Signed Docs).');
    }
  }

  if (targetStage === '4_submitted_billing') {
    if (!data.submittedToBillingDate || !data.submittedToBillingDate.trim()) {
      errors.push('Billing Team Submission Date is mandatory.');
    }
    if (!data.signedDtAttached) {
      errors.push('Mandatory: Confirm signed tickets against each Delivery Ticket (DT) are attached.');
    }
    if (!data.signedRtAttached) {
      errors.push('Mandatory: Confirm signed tickets against each Receiving Ticket (RT) are attached.');
    }
    if (!data.signedUtilizationAttached) {
      errors.push('Mandatory: Confirm Rig Utilization sheet is verified & attached.');
    }
    if (!data.billingTransmittalRef || !data.billingTransmittalRef.trim()) {
      errors.push('Billing Transmittal / Package Reference number is mandatory.');
    }
  }

  if (targetStage === '5_ses_submitted') {
    const hasDraftOrSes =
      (data.draftInvoiceNumber && data.draftInvoiceNumber.trim()) ||
      (data.sesNumber && data.sesNumber.trim());
    if (!hasDraftOrSes) {
      errors.push('Draft Invoice Number or SES Reference Number is mandatory for Stage 5 (SES Submitted).');
    }
    if (!data.sesSubmittedDate || !data.sesSubmittedDate.trim()) {
      errors.push('SES / Draft Invoice submission date is mandatory.');
    }
  }

  if (targetStage === '6_completed') {
    if (!data.legalInvoiceNumber || !data.legalInvoiceNumber.trim()) {
      errors.push('Legal Invoice Number is mandatory to mark the job as Completed.');
    }
    if (!data.completedDate || !data.completedDate.trim()) {
      errors.push('Legal Invoice / Completion Date is mandatory.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
