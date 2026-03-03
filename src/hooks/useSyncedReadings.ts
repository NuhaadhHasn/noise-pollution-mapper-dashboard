import { useEffect, useState } from 'react';
import * as localDb from '@/utils/db';
import * as syncManager from '@/utils/syncManager';
import type { NoiseReading } from '@/types/NoiseReading';

interface UseSyncedReadingsResult {
  readings: NoiseReading[];
  loading: boolean;
  synced: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * useSyncedReadings - Custom hook for loading noise readings with IndexedDB caching
 *
 * Features:
 * - Loads from IndexedDB immediately (0 Firebase reads)
 * - Background sync for new readings (delta sync)
 * - Automatic refresh on mount
 * - Manual refresh function
 * - Loading and error states
 *
 * Usage:
 * ```typescript
 * const { readings, loading, synced, error, refresh } = useSyncedReadings();
 * ```
 */
export function useSyncedReadings(): UseSyncedReadingsResult {
  const [readings, setReadings] = useState<NoiseReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [synced, setSynced] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadData = async () => {
    try {
      // Step 1: Load from IndexedDB cache (instant, 0 Firebase reads)
      const cachedReadings = await localDb.getAllReadings();
      setReadings(cachedReadings);
      setLoading(false);

      // Step 2: Background sync - fetch only NEW readings since last sync
      const syncResult = await syncManager.syncNewReadings();

      // If new readings were fetched, reload from IndexedDB
      if (syncResult.newCount > 0) {
        const updatedReadings = await localDb.getAllReadings();
        setReadings(updatedReadings);
        setSynced(true);
      }
    } catch (err) {
      console.error('[useSyncedReadings] Error loading data:', err);
      setError(err instanceof Error ? err : new Error('Failed to load readings'));
      setLoading(false);
    }
  };

  const refresh = async () => {
    setLoading(true);
    setError(null);
    await loadData();
  };

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      if (!isMounted) return;

      try {
        // Step 1: Load from IndexedDB cache (instant, 0 Firebase reads)
        const cachedReadings = await localDb.getAllReadings();
        if (isMounted) {
          setReadings(cachedReadings);
          setLoading(false);
        }

        // Step 2: Background sync - fetch only NEW readings since last sync
        const syncResult = await syncManager.syncNewReadings();

        // If new readings were fetched, reload from IndexedDB
        if (isMounted && syncResult.newCount > 0) {
          const updatedReadings = await localDb.getAllReadings();
          setReadings(updatedReadings);
          setSynced(true);
        }
      } catch (err) {
        if (isMounted) {
          console.error('[useSyncedReadings] Error loading data:', err);
          setError(err instanceof Error ? err : new Error('Failed to load readings'));
          setLoading(false);
        }
      }
    };

    initialize();

    return () => {
      isMounted = false;
    };
  }, []);

  return { readings, loading, synced, error, refresh };
}

export default useSyncedReadings;
