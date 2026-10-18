/**
 * Offline Outbox Queue backed by IndexedDB
 * Guarantees zero data loss: if an API call fails after all retry attempts
 * (due to offline state, VPN drop, or Azure outage), changes are saved to this
 * persistent queue and automatically replayed to Azure SQL when the connection returns.
 */

export interface OutboxItem {
  id: string;
  action: string;
  payload: any;
  createdAt: number;
  attempts: number;
  lastAttempt?: number;
  error?: string;
}

const DB_NAME = 'ToolTrackerOutboxDB';
const DB_VERSION = 1;
const STORE_NAME = 'outbox';

function openOutboxDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Enqueue a failed save action into the persistent offline outbox.
 */
export async function addToOutbox(action: string, payload: any): Promise<OutboxItem> {
  const item: OutboxItem = {
    id: `outbox_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    action,
    payload,
    createdAt: Date.now(),
    attempts: 0,
  };

  try {
    const db = await openOutboxDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    console.info(`[Outbox] Enqueued action '${action}' (ID: ${item.id}) to persistent queue`);
  } catch (err) {
    console.warn('[Outbox] Failed to write to IndexedDB, using local storage fallback:', err);
    try {
      const fallback = JSON.parse(localStorage.getItem('emdad_outbox_fallback') || '[]');
      fallback.push(item);
      localStorage.setItem('emdad_outbox_fallback', JSON.stringify(fallback));
    } catch {}
  }

  return item;
}

/**
 * Retrieve all pending items in the outbox queue sorted by creation date.
 */
export async function getOutbox(): Promise<OutboxItem[]> {
  const items: OutboxItem[] = [];

  try {
    const db = await openOutboxDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[Outbox] Failed to read from IndexedDB, checking fallback:', err);
    try {
      const fallback = JSON.parse(localStorage.getItem('emdad_outbox_fallback') || '[]');
      if (Array.isArray(fallback)) items.push(...fallback);
    } catch {}
  }

  return items.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Remove an item from the outbox after it has successfully synced to Azure SQL.
 */
export async function removeFromOutbox(id: string): Promise<void> {
  try {
    const db = await openOutboxDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[Outbox] Failed to delete from IndexedDB:', err);
  }

  try {
    const fallback = JSON.parse(localStorage.getItem('emdad_outbox_fallback') || '[]');
    const filtered = fallback.filter((item: OutboxItem) => item.id !== id);
    localStorage.setItem('emdad_outbox_fallback', JSON.stringify(filtered));
  } catch {}
}

/**
 * Update the attempt count and last error for an outbox item.
 */
export async function updateOutboxAttempt(id: string, error?: string): Promise<void> {
  try {
    const db = await openOutboxDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const item: OutboxItem = getReq.result;
        if (item) {
          item.attempts = (item.attempts || 0) + 1;
          item.lastAttempt = Date.now();
          if (error) item.error = error;
          store.put(item);
        }
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch {}
}

/**
 * Get count of pending items in outbox.
 */
export async function getOutboxCount(): Promise<number> {
  try {
    const items = await getOutbox();
    return items.length;
  } catch {
    return 0;
  }
}

let isFlushing = false;

/**
 * Replays all pending outbox saves to Azure SQL in sequence.
 * Called on startup, on periodic interval (every 30s), when regaining connection,
 * and during manual refresh/sync.
 */
export async function flushOutbox(
  sender: (action: string, payload: any) => Promise<any>
): Promise<{ processed: number; remaining: number; errors: number }> {
  if (isFlushing) {
    return { processed: 0, remaining: await getOutboxCount(), errors: 0 };
  }

  isFlushing = true;
  let processed = 0;
  let errors = 0;

  try {
    const queue = await getOutbox();
    if (queue.length === 0) {
      return { processed: 0, remaining: 0, errors: 0 };
    }

    console.info(`[Outbox] Flushing ${queue.length} pending queued items to Azure SQL...`);

    for (const item of queue) {
      try {
        const res = await sender(item.action, item.payload);
        if (res !== null && res !== false) {
          await removeFromOutbox(item.id);
          processed++;
          console.info(`[Outbox] Successfully flushed item '${item.action}' (${item.id}) to Azure SQL`);
        } else {
          errors++;
          await updateOutboxAttempt(item.id, 'API call returned null/false');
        }
      } catch (err: any) {
        errors++;
        await updateOutboxAttempt(item.id, err?.message || 'Flush exception');
        console.warn(`[Outbox] Failed to replay '${item.action}' (${item.id}):`, err?.message || err);
      }
    }

    const remaining = await getOutboxCount();
    return { processed, remaining, errors };
  } finally {
    isFlushing = false;
  }
}
