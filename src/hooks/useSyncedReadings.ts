import { useContext } from 'react';
import { ReadingsContext, type ReadingsContextValue } from '@/contexts/ReadingsContext';

/**
 * useSyncedReadings - the shared, IndexedDB-cached noise readings.
 *
 * Every consumer reads the ONE ReadingsProvider (src/contexts/ReadingsContext.tsx),
 * which loads IndexedDB once and runs a single Firestore sync for the whole
 * app (perf-2). The name and import path are unchanged, so call sites stay
 * the same.
 *
 * Usage:
 * ```typescript
 * const { readings, loading, syncing, error, lastSync, refresh } = useSyncedReadings();
 * ```
 */
export function useSyncedReadings(): ReadingsContextValue {
  const context = useContext(ReadingsContext);
  if (context === null) {
    throw new Error('useSyncedReadings must be used within a ReadingsProvider');
  }
  return context;
}

export default useSyncedReadings;
