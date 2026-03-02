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
import { db as firebaseDb } from '@/config/firebase';
import * as localDb from '@/utils/db';
import type { NoiseReading } from '@/types/NoiseReading';

const LAST_SYNC_KEY = 'lastSyncTime';
const FIRST_SYNC_DONE_KEY = 'firstSyncDone';
const MAX_INITIAL_READINGS = 500; // Limit first sync to avoid cost

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
    
    let newReadings: NoiseReading[] = [];
    
    if (!firstSyncDone) {
      // First ever sync - fetch limited set (500 most recent)
      console.log('[Sync] First sync - fetching initial 500 readings...');
      const q = query(
        collection(firebaseDb, 'noise_readings'),
        orderBy('timestamp', 'desc'),
        limit(MAX_INITIAL_READINGS)
      );
      
      const snapshot = await getDocs(q);
      newReadings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as NoiseReading[];
      
      console.log(`[Sync] Fetched ${newReadings.length} initial readings`);
      
      // Save to IndexedDB
      await localDb.setManyReadings(newReadings);
      await setFirstSyncDone();
      
    } else if (lastSync) {
      // Delta sync - fetch only readings newer than last sync
      console.log('[Sync] Delta sync since', lastSync);
      
      const q = query(
        collection(firebaseDb, 'noise_readings'),
        where('timestamp', '>', Timestamp.fromDate(lastSync))
      );
      
      const snapshot = await getDocs(q);
      newReadings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as NoiseReading[];
      
      console.log(`[Sync] Fetched ${newReadings.length} new readings`);
      
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
