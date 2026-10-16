/**
 * Sync Manager - Handles delta sync between Firebase and IndexedDB
 * 
 * Features:
 * - Track last sync timestamp
 * - Fetch only new/updated readings (delta sync)
 * - Merge cached + new data
 * - Sync status tracking
 */

import { collection, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import type { Query } from 'firebase/firestore';
import { db as firebaseDb } from '@/config/firebase';
import * as localDb from '@/utils/db';
import type { NoiseReading } from '@/types/NoiseReading';
import { normalizeReading } from '@/lib/readings';

const LAST_SYNC_KEY = 'lastSyncTime';
const FIRST_SYNC_DONE_KEY = 'firstSyncDone';

/**
 * Maximum readings to fetch on first sync
 * Set to 0 to fetch ALL readings (no limit)
 * Set to any number > 0 to limit (e.g., 500)
 */
const MAX_INITIAL_READINGS = 0; // 0 = fetch ALL, >0 = limit to this number

/**
 * Run a noise_readings query and normalize every doc into the plain
 * NoiseReading DTO that IndexedDB stores (bug-1, sec-1). A doc no app
 * version writes is dropped here, so it is never cached and never reaches a
 * chart, table, popup or export. Only the count of dropped docs is logged,
 * never their content (convention 2.13).
 *
 * The callers' query shapes are unchanged: the full fetch is
 * orderBy('timestamp', 'desc') and the delta is where('timestamp', '>', ...).
 */
export async function fetchReadings(q: Query): Promise<NoiseReading[]> {
  const snapshot = await getDocs(q);
  const readings: NoiseReading[] = [];
  let dropped = 0;
  for (const doc of snapshot.docs) {
    const reading = normalizeReading(doc.id, doc.data());
    if (reading) {
      readings.push(reading);
    } else {
      dropped++;
    }
  }
  if (dropped > 0) {
    console.warn(`[Sync] Skipped ${dropped} malformed reading(s) of ${snapshot.size}`);
  }
  return readings;
}

/**
 * Get last sync time from IndexedDB
 */
export async function getLastSyncTime(): Promise<Date | null> {
  const lastSync = await localDb.getSyncMetadata(LAST_SYNC_KEY);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return lastSync ? new Date(lastSync as any) : null;
}

/**
 * Set last sync time in IndexedDB
 */
export async function setLastSyncTime(time: Date): Promise<void> {
  await localDb.setSyncMetadata(LAST_SYNC_KEY, time.getTime());
}

/**
 * Check if first sync has been done
 */
export async function isFirstSyncDone(): Promise<boolean> {
  const done = await localDb.getSyncMetadata(FIRST_SYNC_DONE_KEY);
  return !!done;
}

/**
 * Mark first sync as done
 */
export async function setFirstSyncDone(): Promise<void> {
  await localDb.setSyncMetadata(FIRST_SYNC_DONE_KEY, true);
}

/**
 * Perform delta sync - fetch only new/updated readings since last sync
 *
 * Returns:
 * - newCount: Number of new readings fetched
 * - updatedCount: Number of updated readings (always 0 for now)
 * - lastSync: Timestamp of this sync
 * - totalReadings: Total readings in cache
 */
export async function syncNewReadings(): Promise<{
  newCount: number;
  updatedCount: number;
  lastSync: Date;
  totalReadings: number;
}> {
  try {
    const lastSync = await getLastSyncTime();
    const firstSyncDone = await isFirstSyncDone();
    const cacheDownloaded = await localDb.getSyncMetadata('cacheDownloaded');
    
    let newReadings: NoiseReading[] = [];
    
    // If cache was downloaded, skip first sync limit
    if (cacheDownloaded) {
      // Cache exists - syncing only new readings
      if (lastSync) {
        // Delta sync - fetch only readings newer than last sync
        const q = query(
          collection(firebaseDb, 'noise_readings'),
          where('timestamp', '>', Timestamp.fromDate(lastSync))
        );
        
        newReadings = await fetchReadings(q);
        
        // Update IndexedDB with new readings
        if (newReadings.length > 0) {
          await localDb.updateManyReadings(newReadings);
        }
      }
    } else if (!firstSyncDone) {
      // First ever sync - fetch ALL or limited readings based on MAX_INITIAL_READINGS
      let q;
      if (MAX_INITIAL_READINGS > 0) {
        // Limited fetch (for testing/cost control)
        q = query(
          collection(firebaseDb, 'noise_readings'),
          orderBy('timestamp', 'desc'),
          limit(MAX_INITIAL_READINGS)
        );
      } else {
        // Fetch ALL readings (no limit)
        q = query(
          collection(firebaseDb, 'noise_readings'),
          orderBy('timestamp', 'desc')
        );
      }
      
      newReadings = await fetchReadings(q);
      
      console.log(`[Sync] First sync: Fetched ${newReadings.length} readings (MAX_INITIAL_READINGS: ${MAX_INITIAL_READINGS})`);
      
      // Save to IndexedDB
      await localDb.setManyReadings(newReadings);
      await setFirstSyncDone();
      
    } else if (lastSync) {
      // Delta sync - fetch only readings newer than last sync
      const q = query(
        collection(firebaseDb, 'noise_readings'),
        where('timestamp', '>', Timestamp.fromDate(lastSync))
      );
      
      newReadings = await fetchReadings(q);
      
      // Update IndexedDB with new readings
      if (newReadings.length > 0) {
        await localDb.updateManyReadings(newReadings);
      }
    }
    
    // Update last sync time
    const now = new Date();
    await setLastSyncTime(now);
    
    // Get total count
    const totalReadings = await localDb.getReadingsCount();
    
    return {
      newCount: newReadings.length,
      updatedCount: 0,
      lastSync: now,
      totalReadings,
    };
  } catch (error) {
    console.error('[Sync] Error during sync:', error);
    throw error;
  }
}

/**
 * Get sync status
 */
export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error';

export async function getSyncStatus(): Promise<{
  status: SyncStatus;
  lastSync: Date | null;
  totalReadings: number;
}> {
  const lastSync = await getLastSyncTime();
  const totalReadings = await localDb.getReadingsCount();
  
  // If never synced or last sync was > 1 hour ago, mark as pending
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const isPending = !lastSync || lastSync < oneHourAgo;
  
  return {
    status: isPending ? 'pending' : 'synced',
    lastSync,
    totalReadings,
  };
}

/**
 * Format time ago for display
 */
export function formatTimeAgo(date: Date | null): string {
  if (!date) return 'Never';
  
  const now = Date.now();
  const diff = now - date.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString();
}

/**
 * Clear all sync data (for debugging/reset)
 */
export async function clearSyncData(): Promise<void> {
  await localDb.clearAllReadings();
  await localDb.setSyncMetadata(LAST_SYNC_KEY, null);
  await localDb.setSyncMetadata(FIRST_SYNC_DONE_KEY, null);
}

/**
 * Force full sync - clear cache and fetch ALL readings
 * Use this when cache was synced with limit and needs to be refreshed
 */
export async function forceFullSync(): Promise<{
  newCount: number;
  totalReadings: number;
}> {
  try {
    // Clear existing cache
    await clearSyncData();

    // Fetch ALL readings (no limit)
    const q = query(
      collection(firebaseDb, 'noise_readings'),
      orderBy('timestamp', 'desc')
    );

    const newReadings = await fetchReadings(q);

    // Save to IndexedDB
    await localDb.setManyReadings(newReadings);
    await setFirstSyncDone();
    await setLastSyncTime(new Date());

    console.log(`[Sync] Force full sync: Fetched ${newReadings.length} readings`);

    return {
      newCount: newReadings.length,
      totalReadings: newReadings.length,
    };
  } catch (error) {
    console.error('[Sync] Force full sync failed:', error);
    throw error;
  }
}
