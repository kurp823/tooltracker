import { Callout } from '../types';
import { normalizeJobKey } from './api';

const CUSTOM_CALLOUTS_KEY = 'emdad_custom_callouts';

/**
 * Safely loads custom / user-updated callouts from localStorage.
 */
export function loadCustomCallouts(): Callout[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_CALLOUTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((c) => c && (c.id || c.calloutNumber || c.jobId));
    }
    return [];
  } catch (err) {
    console.warn('[CustomCallouts] Failed to parse custom callouts from localStorage:', err);
    return [];
  }
}

/**
 * Safely saves the entire custom callouts list to localStorage.
 */
export function saveAllCustomCallouts(calloutsList: Callout[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CUSTOM_CALLOUTS_KEY, JSON.stringify(calloutsList));
  } catch (err) {
    console.warn('[CustomCallouts] Failed to save custom callouts to localStorage:', err);
  }
}

/**
 * Adds or updates a single callout in persistent storage.
 */
export function saveCustomCallout(callout: Callout): Callout[] {
  const list = loadCustomCallouts();
  const targetId = String(callout.id || (callout as any).calloutNumber || '').trim().toUpperCase();
  const targetJobId = String(callout.jobId || (callout as any).jobNumber || '').trim().toUpperCase();
  const targetJobNorm = normalizeJobKey(callout.jobId || (callout as any).jobNumber);

  const existingIdx = list.findIndex((c) => {
    const cId = String(c.id || (c as any).calloutNumber || '').trim().toUpperCase();
    const cJobId = String(c.jobId || (c as any).jobNumber || '').trim().toUpperCase();
    const cJobNorm = normalizeJobKey(c.jobId || (c as any).jobNumber);
    if (targetId && cId === targetId) return true;
    if (targetJobId && cJobId === targetJobId) return true;
    if (targetJobNorm && cJobNorm === targetJobNorm) return true;
    return false;
  });

  let updatedList: Callout[];
  if (existingIdx >= 0) {
    updatedList = [...list];
    updatedList[existingIdx] = { ...list[existingIdx], ...callout };
  } else {
    updatedList = [callout, ...list];
  }

  saveAllCustomCallouts(updatedList);
  return updatedList;
}

/**
 * Merges base server callouts with local custom/user-updated callouts.
 * Ensures user deletions, edits, and additions are never overwritten by periodic background polling.
 */
export function mergeCalloutsWithCustom(baseCallouts: Callout[], customCallouts?: Callout[]): Callout[] {
  const custom = customCallouts || loadCustomCallouts();
  if (!custom || custom.length === 0) return baseCallouts;

  const customById = new Map<string, Callout>();
  const customByJob = new Map<string, Callout>();

  custom.forEach((c) => {
    const cId = String(c.id || (c as any).calloutNumber || '').trim().toUpperCase();
    if (cId) customById.set(cId, c);
    const cJob = String(c.jobId || (c as any).jobNumber || '').trim().toUpperCase();
    if (cJob) customByJob.set(cJob, c);
    const cNorm = normalizeJobKey(c.jobId || (c as any).jobNumber);
    if (cNorm) customByJob.set(`NORM_${cNorm}`, c);
  });

  const seenCustom = new Set<Callout>();

  const mergedBase = (Array.isArray(baseCallouts) ? baseCallouts : []).map((c) => {
    if (!c) return c;
    const cId = String(c.id || (c as any).calloutNumber || '').trim().toUpperCase();
    const cJob = String(c.jobId || (c as any).jobNumber || '').trim().toUpperCase();
    const cNorm = normalizeJobKey(c.jobId || (c as any).jobNumber);

    const match =
      (cId ? customById.get(cId) : null) ||
      (cJob ? customByJob.get(cJob) : null) ||
      (cNorm ? customByJob.get(`NORM_${cNorm}`) : null);

    if (match) {
      seenCustom.add(match);
      return { ...c, ...match };
    }
    return c;
  });

  const brandNew: Callout[] = [];
  custom.forEach((c) => {
    if (!seenCustom.has(c)) {
      brandNew.push(c);
    }
  });

  return [...brandNew, ...mergedBase];
}
