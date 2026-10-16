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
import { endOfDay, startOfDay, subDays } from 'date-fns';

/** An inclusive window between two real instants. */
export interface DateRange {
  start: Date;
  end: Date;
}

export type DatePresetId = 'all' | '7d' | '30d' | '90d';

export interface DatePreset {
  id: DatePresetId;
  label: string;
  /** Days back from today; null means all time. */
  days: number | null;
}

/** The presets in the order the filter lists them. */
export const DATE_PRESETS: readonly DatePreset[] = [
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '90d', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
];

export const DEFAULT_DATE_PRESET: DatePresetId = 'all';

/**
 * The window a preset means at `now`: from the START of the day `days` days
 * ago to the END of today (browser-local days; bug-12 owns Asia/Colombo).
 * Computed at filter time, never at click time, so readings that arrive
 * after the selection are inside the window (bug-8). Null means all time.
 */
export function presetRange(id: DatePresetId, now: Date): DateRange | null {
  const preset = DATE_PRESETS.find((candidate) => candidate.id === id);
  if (!preset || preset.days === null) return null;
  return { start: startOfDay(subDays(now, preset.days)), end: endOfDay(now) };
}

/** The caption under the date control: the window in plain dates. */
export function presetSummary(id: DatePresetId, now: Date = new Date()): string {
  const range = presetRange(id, now);
  if (!range) return 'Showing all dates';
  return `From ${range.start.toLocaleDateString()} to ${range.end.toLocaleDateString()}`;
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
  /** Preset id; the window is computed from it at filter time (bug-6, bug-8). */
  preset: DatePresetId;
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
  now: Date = new Date(),
): T[] {
  const { userId, showAllUsers, preset, dbRange, categories } = filters;
  const wanted = categories && categories.length > 0 ? categories : null;
  const range = presetRange(preset, now);
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

/** A reading at or above this dB is drawn at full heat. Same 0-120 dB scale as the app (heatmap_point.dart:65-70). */
export const HEAT_MAX_DB = 120;

/**
 * Heat intensity (0..1) for a dB value, or null when it is not a finite
 * number. 0 dB is a real reading and maps to 0, not to a default (bug-7).
 */
export function heatIntensity(db: unknown): number | null {
  if (typeof db !== 'number' || !Number.isFinite(db)) return null;
  return Math.min(1, Math.max(0, db / HEAT_MAX_DB));
}

/**
 * Heat points [lat, lng, intensity] for leaflet.heat. Readings at the same
 * site (positions equal to 4 decimals, about 11 m) become ONE point whose
 * intensity is the mean dB of the site, so twenty repeat recordings of a quiet
 * spot cannot add up to 'very loud' (bug-7). leaflet.heat still sums nearby
 * sites, so the map shows where readings concentrate, tinted by loudness.
 */
export function buildHeatPoints(
  readings: readonly FilterableReading[],
): Array<[number, number, number]> {
  const sites = new Map<string, { lat: number; lng: number; db: number; count: number }>();
  for (const reading of readings) {
    const coords = getCoordinates(reading);
    const db = reading.decibelLevel;
    if (!coords || typeof db !== 'number' || !Number.isFinite(db)) continue;
    const key = `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`;
    const site = sites.get(key);
    if (site) {
      site.lat += coords.lat;
      site.lng += coords.lng;
      site.db += db;
      site.count += 1;
    } else {
      sites.set(key, { lat: coords.lat, lng: coords.lng, db, count: 1 });
    }
  }

  const points: Array<[number, number, number]> = [];
  for (const site of sites.values()) {
    const intensity = heatIntensity(site.db / site.count);
    if (intensity === null) continue;
    points.push([site.lat / site.count, site.lng / site.count, intensity]);
  }
  return points;
}
