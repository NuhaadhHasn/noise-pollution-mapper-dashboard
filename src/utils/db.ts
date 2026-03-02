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
 * Open IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
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

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
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
