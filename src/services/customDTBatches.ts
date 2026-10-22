/**
 * customDTBatches.ts — local-first persistence for Delivery Ticket batches.
 *
 * Problem solved: when handleFetchLiveSql() replaces dtBatches with the
 * Azure SQL response, any DT that was saved locally but hasn't finished
 * persisting to Azure SQL yet gets wiped from the UI. This is the same
 * race condition that custom jobs / callouts already fix.
 *
 * Pattern matches customJobs.ts / customCallouts.ts:
 *  - saveCustomDTBatch()         — write one DT to localStorage
 *  - loadCustomDTBatches()       — read all from localStorage
 *  - mergeDTBatchesWithCustom()  — merge Azure SQL list + local overrides
 *  - deleteCustomDTBatch()       — remove one when deleted from Azure SQL
 */

import { DTBatch } from '../types';

const CUSTOM_DT_KEY = 'emdad_custom_dt_batches';

// ─── helpers ────────────────────────────────────────────────────────────────

function dtKey(b: DTBatch | any): string {
  return String(b?.dtNumber || b?.id || '').trim().toUpperCase();
}

// ─── public API ─────────────────────────────────────────────────────────────

/** Persist one DT batch to localStorage (upsert by dtNumber). */
export function saveCustomDTBatch(batch: DTBatch): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadCustomDTBatches();
    const k = dtKey(batch);
    const filtered = existing.filter((b) => dtKey(b) !== k);
    const updated = [batch, ...filtered];
    localStorage.setItem(CUSTOM_DT_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('[CustomDTBatches] save failed:', err);
  }
}

/** Remove one DT batch from localStorage (called after confirmed Azure SQL delete). */
export function deleteCustomDTBatch(dtNumber: string): void {
  if (typeof window === 'undefined') return;
  try {
    const k = String(dtNumber || '').trim().toUpperCase();
    const existing = loadCustomDTBatches();
    const filtered = existing.filter((b) => dtKey(b) !== k);
    localStorage.setItem(CUSTOM_DT_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('[CustomDTBatches] delete failed:', err);
  }
}

/** Read all locally-persisted DT batches from localStorage. */
export function loadCustomDTBatches(): DTBatch[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_DT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((b) => b && (b.dtNumber || b.id));
    }
    return [];
  } catch (err) {
    console.warn('[CustomDTBatches] load failed:', err);
    return [];
  }
}

/**
 * Merge the Azure SQL DT list with locally-saved custom DTs.
 *
 * Rules:
 * - If a local DT already exists in the Azure SQL list → keep the local
 *   version (it may have pending edits not yet in SQL).
 * - If a local DT does NOT exist in the Azure SQL list → it hasn't been
 *   persisted yet (race condition window) → add it to the front of the list
 *   so it never disappears from the UI.
 * - Old local DTs that are confirmed in Azure SQL are NOT evicted here — they
 *   will naturally be pruned on the next TTL cleanup below.
 *
 * @param baseBatches  The DT batch list returned by Azure SQL.
 * @param customBatches Optional pre-loaded custom list (loads from localStorage if omitted).
 */
export function mergeDTBatchesWithCustom(
  baseBatches: DTBatch[] = [],
  customBatches?: DTBatch[]
): DTBatch[] {
  const custom = customBatches ?? loadCustomDTBatches();
  if (!custom || custom.length === 0) {
    return Array.isArray(baseBatches) ? baseBatches : [];
  }
  if (!baseBatches || baseBatches.length === 0) {
    return [...custom];
  }

  // Build a lookup of Azure SQL DTs by dtNumber and internal id
  const sqlKeys = new Set<string>();
  baseBatches.forEach((b) => {
    const num = String(b?.dtNumber || '').trim().toUpperCase();
    const id = String(b?.id || '').trim().toUpperCase();
    if (num) sqlKeys.add(num);
    if (id) sqlKeys.add(id);
  });

  // Build custom map for overriding existing entries
  const customMap = new Map<string, DTBatch>();
  custom.forEach((b) => {
    const k = dtKey(b);
    if (k) customMap.set(k, b);
  });

  // Merge: replace SQL entries with local override if present
  const mergedBase = baseBatches.map((b) => {
    const k = dtKey(b);
    return customMap.has(k) ? { ...b, ...customMap.get(k)! } : b;
  });

  // Brand-new local DTs not yet in SQL → add to front so they're always visible
  const brandNew: DTBatch[] = custom.filter((b) => {
    const k = dtKey(b);
    const num = String(b?.dtNumber || '').trim().toUpperCase();
    const id = String(b?.id || '').trim().toUpperCase();
    return k && !sqlKeys.has(num) && !sqlKeys.has(id);
  });

  return [...brandNew, ...mergedBase];
}

/**
 * Prune local DTs older than 48 hours that are confirmed in the Azure SQL list
 * (they are no longer needed in the local cache).
 * Call this periodically to keep localStorage lean.
 */
export function pruneConfirmedDTBatches(sqlBatches: DTBatch[]): void {
  if (typeof window === 'undefined') return;
  try {
    const sqlKeys = new Set<string>();
    sqlBatches.forEach((b) => {
      const num = String(b?.dtNumber || '').trim().toUpperCase();
      const id = String(b?.id || '').trim().toUpperCase();
      if (num) sqlKeys.add(num);
      if (id) sqlKeys.add(id);
    });

    const threshold = Date.now() - 48 * 60 * 60 * 1000; // 48 hours
    const existing = loadCustomDTBatches();
    // Keep if: not yet in SQL (still needed) OR recently created (< 48h)
    const pruned = existing.filter((b) => {
      const k = dtKey(b);
      if (!sqlKeys.has(k)) return true; // not in SQL yet — must keep
      // Parse a timestamp from the internal id "DTB-<timestamp>"
      const ts = parseInt(String(b?.id || '').replace('DTB-', ''), 10);
      return !isNaN(ts) && ts > threshold; // keep if created in last 48h
    });
    localStorage.setItem(CUSTOM_DT_KEY, JSON.stringify(pruned));
  } catch {
    // non-critical
  }
}
