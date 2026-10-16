/**
 * IndexedDB Wrapper for Noise Pollution Mapper
 * 
 * Provides local caching for noise readings to reduce Firebase reads
 * Supports 10k+ readings with efficient storage and retrieval
 */

import type { NoiseReading } from '@/types/NoiseReading';

const DB_NAME = 'noise-pollution-db';
const DB_VERSION = 1;
const STORE_NAME = 'noise_readings';
const SYNC_STORE_NAME = 'sync_metadata';

/**
 * Message of the error openDB() rejects with when another open dashboard
 * tab blocks a schema upgrade. It is written for the user and can be shown
 * as-is.
 */
export const DB_BLOCKED_MESSAGE =
  'Close other dashboard tabs to finish the update, then reload this page.';

/** The rejection of openDB() while another tab blocks a schema upgrade. */
export class DbBlockedError extends Error {
  constructor() {
    super(DB_BLOCKED_MESSAGE);
    this.name = 'DbBlockedError';
  }
}

/**
 * One shared connection per page (arch-4). Every helper below awaits
 * openDB(). It used to open a new connection on every call and never close
 * one, so a DB_VERSION bump would hang behind the leaked connections of any
 * other open tab.
 */
let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * True while an upgrade request that reported `blocked` is still pending.
 * IndexedDB queues every later open behind it, so a new request would wait
 * silently instead of reporting `blocked` itself: fail fast instead.
 */
let blockedUpgradePending = false;

/**
 * Drop the cached connection promise if it is still the given one, so the
 * next openDB() call opens a fresh connection.
 */
function forget(promise: Promise<IDBDatabase>): void {
  if (dbPromise === promise) {
    dbPromise = null;
  }
}

/**
 * Open IndexedDB database (one cached connection per page)
 */
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }
  if (blockedUpgradePending) {
    return Promise.reject(new DbBlockedError());
  }

  let blocked = false;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create noise readings store
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('decibelLevel', 'decibelLevel', { unique: false });
      }
      
      // Create sync metadata store
      if (!db.objectStoreNames.contains(SYNC_STORE_NAME)) {
        db.createObjectStore(SYNC_STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        // The caller already got DbBlockedError. The upgrade went through
        // once the other tabs closed; release this late connection so the
        // next openDB() starts clean.
        blockedUpgradePending = false;
        db.close();
        return;
      }
      // Another tab wants to upgrade the schema: release this connection so
      // its upgrade is not blocked. The next call reopens.
      db.onversionchange = () => {
        db.close();
        forget(opening);
      };
      // The browser closed the connection itself (site data cleared, storage
      // error). The next call reopens.
      db.onclose = () => forget(opening);
      resolve(db);
    };
    request.onerror = () => {
      if (blocked) {
        blockedUpgradePending = false;
      }
      reject(request.error);
    };
    request.onblocked = () => {
      // A tab still holds a connection at the old version and did not
      // release it (a build from before this change has no onversionchange
      // handler). Fail visibly instead of leaving every caller waiting.
      blocked = true;
      blockedUpgradePending = true;
      reject(new DbBlockedError());
    };
  });

  dbPromise = opening;
  // Any failure (error, blocked, IndexedDB unavailable) clears the cache, so
  // the next call retries instead of returning the same rejection forever.
  opening.catch(() => forget(opening));
  return opening;
}

/**
 * Get all cached noise readings
 */
export async function getAllReadings(): Promise<NoiseReading[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result as NoiseReading[]);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Error getting all readings:', error);
    return [];
  }
}

/**
 * Bulk insert/update noise readings
 */
export async function setManyReadings(readings: NoiseReading[]): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      readings.forEach(reading => {
        store.put(reading);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('Error setting readings:', error);
    throw error;
  }
}

/**
 * Update existing readings (upsert)
 */
export async function updateManyReadings(readings: NoiseReading[]): Promise<void> {
  return setManyReadings(readings); // put() handles both insert and update
}

/**
 * Get the latest timestamp from cached readings
 */
export async function getLatestTimestamp(): Promise<number> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      
      // Get last item (most recent)
      const request = index.openCursor(null, 'prev');
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const reading = cursor.value as NoiseReading;
          // Handle both Timestamp objects and plain numbers
          const timestamp = reading.timestamp?.toDate?.() || reading.timestamp;
          const timestampNum = timestamp instanceof Date 
            ? timestamp.getTime() 
            : typeof timestamp === 'number' 
              ? timestamp 
              : 0;
          resolve(timestampNum);
        } else {
          resolve(0); // No readings in cache
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error getting latest timestamp:', error);
    return 0;
  }
}

/**
 * Get sync metadata (last sync time, etc.)
 */
export async function getSyncMetadata(key: string): Promise<unknown> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_STORE_NAME, 'readonly');
      const store = transaction.objectStore(SYNC_STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result?.value || null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    // An open that cannot complete (a blocked upgrade, or a newer schema
    // already opened by another tab) must stop the sync before it fetches
    // anything. Returning null here would make syncNewReadings treat the
    // browser as never synced and run a full Firestore fetch it then cannot
    // store.
    if (error instanceof DbBlockedError || (error instanceof DOMException && error.name === 'VersionError')) {
      throw error;
    }
    console.error('Error getting sync metadata:', error);
    return null;
  }
}

/**
 * Set sync metadata
 */
export async function setSyncMetadata(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(SYNC_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(SYNC_STORE_NAME);
      store.put({ key, value });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.error('Error setting sync metadata:', error);
    throw error;
  }
}

/**
 * Clear all cached readings
 */
export async function clearAllReadings(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error clearing readings:', error);
    throw error;
  }
}

/**
 * Get count of cached readings
 */
export async function getReadingsCount(): Promise<number> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error getting count:', error);
    return 0;
  }
}
