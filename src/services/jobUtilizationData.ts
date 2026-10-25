import jobUtilizationIndex from '../data/jobUtilizationIndex.json';
import { EpicorLineItem } from '../components/UtilizationView';

export interface ToolUtilizationRecord {
  serial: string;
  desc: string;
  dt: string;
  delDate: string;
  retDate: string;
  operDays: number;
  sbDays: number;
  operRate: number;
  sbRate: number;
}

/**
 * Returns historical/invoiced tool utilization lines for a given Job ID
 */
export function getJobUtilizationRecords(jobId?: string | null): ToolUtilizationRecord[] {
  if (!jobId) return [];
  const rawKey = jobId.trim().toUpperCase();
  const index = jobUtilizationIndex as Record<string, ToolUtilizationRecord[]>;

  if (index[rawKey]) return index[rawKey];

  // Try matching with normalized formats e.g. Job-023-00002 or JOB-23-00002
  const cleanedTarget = rawKey.replace(/[^A-Z0-9]/g, '');
  for (const k of Object.keys(index)) {
    const cleanedK = k.replace(/[^A-Z0-9]/g, '');
    if (cleanedK === cleanedTarget || cleanedK.endsWith(cleanedTarget) || cleanedTarget.endsWith(cleanedK)) {
      return index[k];
    }
  }

  return [];
}

/**
 * Generates daily cells ('1' for Operating, 'S' for Standby) from delivery date onwards
 */
export function generateDailyCellsForJob(
  jobId: string,
  lineItems: EpicorLineItem[]
): {
  cells: Record<string, string>;
  earliestYM: string | null;
  earliestYear: number;
  earliestMonthIdx: number;
} {
  const records = getJobUtilizationRecords(jobId);
  const cells: Record<string, string> = {};
  let earliestDate: string | null = null;

  // Build lookup of tool records by serial
  const recordMap = new Map<string, ToolUtilizationRecord>();
  records.forEach((r) => {
    if (r.serial) {
      recordMap.set(r.serial.trim().toUpperCase(), r);
    }
  });

  lineItems.forEach((item) => {
    const sKey = (item.assetNumber || item.id).trim().toUpperCase();
    const rec = recordMap.get(sKey);

    const delDate = item.deliveryDate || rec?.delDate || '2026-09-01';
    const operDays = rec ? rec.operDays : 0;
    const sbDays = rec ? rec.sbDays : 0;

    if (delDate) {
      if (!earliestDate || delDate < earliestDate) {
        earliestDate = delDate;
      }

      try {
        const cur = new Date(delDate);
        if (!isNaN(cur.getTime())) {
          // 1. Fill Operating Days ('1')
          for (let i = 0; i < operDays; i++) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            cells[`${item.id}|${y}-${m}-${d}`] = '1';
            cur.setDate(cur.getDate() + 1);
          }

          // 2. Fill Standby Days ('S')
          for (let i = 0; i < sbDays; i++) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            cells[`${item.id}|${y}-${m}-${d}`] = 'S';
            cur.setDate(cur.getDate() + 1);
          }
        }
      } catch {}
    }
  });

  let earliestYear = 2026;
  let earliestMonthIdx = 8; // September (0-indexed)

  if (earliestDate) {
    const parts = earliestDate.split('-');
    if (parts.length >= 2) {
      const parsedY = parseInt(parts[0], 10);
      const parsedM = parseInt(parts[1], 10) - 1;
      if (!isNaN(parsedY) && !isNaN(parsedM) && parsedM >= 0 && parsedM <= 11) {
        earliestYear = parsedY;
        earliestMonthIdx = parsedM;
      }
    }
  }

  const earliestYM = earliestDate ? earliestDate.slice(0, 7) : `${earliestYear}-${String(earliestMonthIdx + 1).padStart(2, '0')}`;

  return {
    cells,
    earliestYM,
    earliestYear,
    earliestMonthIdx,
  };
}
