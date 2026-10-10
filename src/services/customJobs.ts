import { DrillingJob } from '../types';
import { loadDatasetFromCache, saveDatasetToCache } from './dbCache';
import { normalizeJobKey, resolveJobClient, cleanDateValue } from './api';

const CUSTOM_JOBS_KEY = 'emdad_custom_jobs';

export function cleanJobRecord(j: DrillingJob): DrillingJob {
  const resolvedClient = resolveJobClient(j.client, j.contract, undefined, j.rig);
  return {
    ...j,
    client: resolvedClient || j.client || 'ADNOC DRILLING COMPANY P.J.S.C.',
    mobDate: cleanDateValue(j.mobDate),
    demobDate: cleanDateValue(j.demobDate),
    firstDtDate: cleanDateValue(j.firstDtDate),
    lastRtDate: cleanDateValue(j.lastRtDate),
    docsSignedDate: cleanDateValue(j.docsSignedDate),
    submittedToBillingDate: cleanDateValue(j.submittedToBillingDate) || null,
    draftInvoicedDate: cleanDateValue(j.draftInvoicedDate) || null,
    sesSubmittedDate: cleanDateValue(j.sesSubmittedDate) || null,
    finalInvoicedDate: cleanDateValue(j.finalInvoicedDate) || null,
    invoiceDate: cleanDateValue(j.invoiceDate),
    createdDate: cleanDateValue(j.createdDate),
  };
}

/**
 * Safely loads custom / user-updated / imported jobs from localStorage.
 */
export function loadCustomJobs(): DrillingJob[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_JOBS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((j) => j && (j.id || j.jobNumber))
        .map((j) => cleanJobRecord(j));
    }
    return [];
  } catch (err) {
    console.warn('[CustomJobs] Failed to parse custom jobs from localStorage:', err);
    return [];
  }
}

/**
 * Safely saves the entire custom jobs list to localStorage.
 */
export function saveAllCustomJobs(jobsList: DrillingJob[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Only keep jobs that have been customized or created
    localStorage.setItem(CUSTOM_JOBS_KEY, JSON.stringify(jobsList));
  } catch (err) {
    console.warn('[CustomJobs] Failed to save custom jobs to localStorage:', err);
  }
}

/**
 * Adds or updates a single custom job in persistent storage.
 */
export function saveCustomJob(job: DrillingJob): DrillingJob[] {
  const list = loadCustomJobs();
  const targetId = String(job.id || (job as any).jobNumber || '').trim().toUpperCase();
  const targetNorm = normalizeJobKey(job.id || (job as any).jobNumber);

  const existingIdx = list.findIndex((j) => {
    const k = String(j.id || (j as any).jobNumber || '').trim().toUpperCase();
    const n = normalizeJobKey(j.id || (j as any).jobNumber);
    return (targetId && k === targetId) || (targetNorm && n === targetNorm);
  });

  let updatedList: DrillingJob[];
  if (existingIdx >= 0) {
    updatedList = [...list];
    updatedList[existingIdx] = { ...list[existingIdx], ...job };
  } else {
    updatedList = [job, ...list];
  }

  saveAllCustomJobs(updatedList);
  return updatedList;
}

/**
 * Adds or updates multiple custom jobs in persistent storage.
 */
export function saveCustomJobs(jobsToSave: DrillingJob[]): DrillingJob[] {
  if (!jobsToSave || jobsToSave.length === 0) return loadCustomJobs();
  const list = loadCustomJobs();
  const map = new Map<string, DrillingJob>();

  list.forEach((j) => {
    const k = String(j.id || (j as any).jobNumber || '').trim().toUpperCase();
    if (k) map.set(k, j);
    const n = normalizeJobKey(j.id || (j as any).jobNumber);
    if (n) map.set(`NORM_${n}`, j);
  });

  jobsToSave.forEach((j) => {
    const k = String(j.id || (j as any).jobNumber || '').trim().toUpperCase();
    const n = normalizeJobKey(j.id || (j as any).jobNumber);
    const existing = (k && map.get(k)) || (n && map.get(`NORM_${n}`));
    const merged = existing ? { ...existing, ...j } : j;
    if (k) map.set(k, merged);
    if (n) map.set(`NORM_${n}`, merged);
  });

  const unique = Array.from(new Set(map.values()));
  saveAllCustomJobs(unique);
  return unique;
}

/**
 * Merges base jobs (e.g. from Azure SQL, IndexedDB, or MASTER_JOBS)
 * with the persistent user-added/modified jobs.
 */
export function mergeJobsWithCustomJobs(
  baseJobs: DrillingJob[] = [],
  customJobs?: DrillingJob[]
): DrillingJob[] {
  const custom = customJobs || loadCustomJobs();
  if (!custom || custom.length === 0) {
    return Array.isArray(baseJobs) ? baseJobs : [];
  }

  if (!baseJobs || baseJobs.length === 0) {
    return [...custom];
  }

  const customMap = new Map<string, DrillingJob>();
  custom.forEach((j) => {
    const k = String(j.id || (j as any).jobNumber || '').trim().toUpperCase();
    if (k) customMap.set(k, j);
    const n = normalizeJobKey(j.id || (j as any).jobNumber);
    if (n) customMap.set(`NORM_${n}`, j);
  });

  const seenCustom = new Set<DrillingJob>();

  // Overlay custom edits on existing base jobs
  const mergedBase = baseJobs.map((item) => {
    const kId = String(item.id || (item as any).jobNumber || '').trim().toUpperCase();
    const nId = normalizeJobKey(item.id || (item as any).jobNumber);
    const match = (kId && customMap.get(kId)) || (nId && customMap.get(`NORM_${nId}`));
    if (match) {
      seenCustom.add(match);
      return { ...item, ...match };
    }
    return item;
  });

  // Collect brand new custom jobs that did not exist in base
  const brandNew: DrillingJob[] = [];
  custom.forEach((j) => {
    if (!seenCustom.has(j)) {
      brandNew.push(j);
    }
  });

  return [...brandNew, ...mergedBase].map((j) => cleanJobRecord(j));
}

/**
 * Sync custom jobs to IndexedDB cache
 */
export async function syncCustomJobsToIndexedDB(currentJobs: DrillingJob[]): Promise<void> {
  try {
    const cached = await loadDatasetFromCache();
    if (cached) {
      await saveDatasetToCache({
        ...cached,
        jobs: currentJobs,
      });
    }
  } catch (err) {
    console.warn('[CustomJobs] syncToIndexedDB notice:', err);
  }
}
