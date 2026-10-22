/**
 * IndexedDB Cache for ToolTracker high-volume datasets
 * Allows instant, sub-second application launch by persisting the 30MB+ Azure SQL
 * dataset locally in the client browser's IndexedDB.
 */

const DB_NAME = 'ToolTrackerLocalCache';
const DB_VERSION = 1;
const STORE_NAME = 'datasetStore';

export interface CachedDataset {
  inventory?: any[];
  jobs?: any[];
  dtBatches?: any[];
  rtBatches?: any[];
  contracts?: any[];
  callouts?: any[];
  gatePasses?: any[];
  inspections?: any[];
  maintenance?: any[];
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveDatasetToCache(data: {
  inventory?: any[];
  jobs?: any[];
  dtBatches?: any[];
  rtBatches?: any[];
  contracts?: any[];
  callouts?: any[];
  gatePasses?: any[];
  inspections?: any[];
  maintenance?: any[];
}): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const cleanDtBatches = Array.isArray(data.dtBatches)
      ? data.dtBatches.filter((b: any) => {
          const id = String(b?.id || '').toUpperCase();
          const num = String(b?.dtNumber || '').toUpperCase();
          return (
            !id.startsWith('DT-AUTO') &&
            !id.startsWith('DT-CLS') &&
            !num.startsWith('DT-CLS') &&
            !num.startsWith('DT-AUTO') &&
            !num.includes('10000') &&
            !id.includes('10000') &&
            !num.includes('10001') &&
            !id.includes('10001') &&
            !num.includes('10002') &&
            !id.includes('10002')
          );
        })
      : data.dtBatches;

    const cleanRtBatches = Array.isArray(data.rtBatches)
      ? data.rtBatches.filter((b: any) => {
          const id = String(b?.id || '').toUpperCase();
          const num = String(b?.rtNumber || '').toUpperCase();
          return !id.startsWith('RT-AUTO') && !id.startsWith('RT-CLS') && !num.startsWith('RT-CLS') && !num.startsWith('RT-AUTO');
        })
      : data.rtBatches;

    const payload: CachedDataset = {
      ...data,
      dtBatches: cleanDtBatches,
      rtBatches: cleanRtBatches,
      timestamp: Date.now(),
    };
    store.put(payload, 'latest_full_dataset');
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[Cache] Could not save dataset to IndexedDB:', err);
  }
}

export async function loadDatasetFromCache(): Promise<CachedDataset | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get('latest_full_dataset');
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const result: CachedDataset | null = request.result || null;
        if (result) {
          // Purge any legacy synthetic tickets from previous sessions
          if (Array.isArray(result.dtBatches)) {
            result.dtBatches = result.dtBatches.filter((b: any) => {
              const id = String(b?.id || '').toUpperCase();
              const num = String(b?.dtNumber || '').toUpperCase();
              return (
                !id.startsWith('DT-AUTO') &&
                !id.startsWith('DT-CLS') &&
                !num.startsWith('DT-CLS') &&
                !num.startsWith('DT-AUTO') &&
                !num.includes('10000') &&
                !id.includes('10000') &&
                !num.includes('10001') &&
                !id.includes('10001') &&
                !num.includes('10002') &&
                !id.includes('10002')
              );
            });
          }
          if (Array.isArray(result.rtBatches)) {
            result.rtBatches = result.rtBatches.filter((b: any) => {
              const id = String(b?.id || '').toUpperCase();
              const num = String(b?.rtNumber || '').toUpperCase();
              return !id.startsWith('RT-AUTO') && !id.startsWith('RT-CLS') && !num.startsWith('RT-CLS') && !num.startsWith('RT-AUTO');
            });
          }
          if (Array.isArray(result.inventory)) {
            result.inventory = result.inventory
              .filter((t: any) => {
                const k = String(t?.serial || t?.id || '').trim().toUpperCase();
                return k !== 'EMD-6373' && k !== 'EMD-6374';
              })
              .map((t: any) => {
                const k = String(t?.serial || t?.id || '').trim().toUpperCase();
                if (k === 'DS958-001' || k === 'DS700-001') {
                  return {
                    ...t,
                    ownership: 'CORETRAX',
                    supplier: 'CORETRAX',
                    isEmdad: false,
                  };
                }
                return t;
              });
          }
        }
        resolve(result);
      };
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('[Cache] Could not load dataset from IndexedDB:', err);
    return null;
  }
}

export async function clearCache(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch {}
}
