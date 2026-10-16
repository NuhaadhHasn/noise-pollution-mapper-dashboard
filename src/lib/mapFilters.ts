/**
 * Pure filtering for the map (cluster 09). MapPage calls filterReadings() once
 * and hands the SAME array to the markers, the heatmap and the marker badge, so
 * the three can never disagree (bug-2, bug-9).
 *
 * No React and no Firebase, so it is unit-tested directly (master playbook
 * convention 2.15). Dates go through getReadingDate() (convention 2.10).
 */
import { getCoordinates, getReadingDate } from '@/lib/readings';
import type { CoordinateFields, DateFields } from '@/lib/readings';
import { categoryOf } from '@/lib/categories';

/** An inclusive window between two real instants. */
export interface DateRange {
  start: Date;
  end: Date;
}

/** The reading fields the map filter looks at. NoiseReading satisfies it structurally. */
export interface FilterableReading extends CoordinateFields, DateFields {
  userId?: string;
  decibelLevel?: unknown;
  soundClass?: string | null;
}

export interface ReadingFilters {
  /** The signed-in user's uid. Only consulted while showAllUsers is false. */
  userId: string;
  showAllUsers: boolean;
  /** Inclusive date window; null means all time. */
  range: DateRange | null;
  /** Optional inclusive dB window. No UI sets it yet (ux-6). */
  dbRange?: { min: number; max: number };
  /** Optional canonical category names (categories.ts). No UI sets it yet (ux-6). */
  categories?: readonly string[];
}

/**
 * The readings the map should draw: a usable position and dB first, then the
 * optional dB and category windows, then the date window, then the user
 * filter. Returns a new array; the input is never mutated.
 */
export function filterReadings<T extends FilterableReading>(
  readings: readonly T[],
  filters: ReadingFilters,
): T[] {
  const { userId, showAllUsers, range, dbRange, categories } = filters;
  const wanted = categories && categories.length > 0 ? categories : null;
  const startMs = range ? range.start.getTime() : null;
  const endMs = range ? range.end.getTime() : null;

  return readings.filter((reading) => {
    if (!getCoordinates(reading)) return false;

    const db = reading.decibelLevel;
    if (typeof db !== 'number' || !Number.isFinite(db)) return false;
    if (dbRange && (db < dbRange.min || db > dbRange.max)) return false;

    if (wanted && !wanted.includes(categoryOf(reading))) return false;

    if (startMs !== null && endMs !== null) {
      const date = getReadingDate(reading);
      if (!date) return false;
      const ms = date.getTime();
      if (ms < startMs || ms > endMs) return false;
    }

    if (!showAllUsers && reading.userId !== userId) return false;
    return true;
  });
}
