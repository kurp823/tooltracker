/**
 * IndexedDB Cache for ToolTracker high-volume datasets
 * Allows instant, sub-second application launch by persisting the 30MB+ Azure SQL
 * dataset locally in the client browser's IndexedDB.
 */

const DB_NAME = 'ToolTrackerLocalCache';
const DB_VERSION = 1;
const STORE_NAME = 'datasetStore';

interface CachedDataset {
  inventory?: any[];
  jobs?: any[];
  dtBatches?: any[];
  rtBatches?: any[];
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
}): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const payload: CachedDataset = {
      ...data,
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
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    console.warn('[Cache] Could not load dataset from IndexedDB:', err);
    return null;
  }
}
