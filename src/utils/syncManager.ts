/**
 * Sync Manager - keeps the IndexedDB readings cache in step with Firestore.
 *
 * Cursor (data-1): the delta sync is keyed on a SERVER-time watermark, the
 * newest `timestamp` actually received from Firestore, never on the browser
 * clock. Each delta re-queries OVERLAP_MS behind the watermark, so a write
 * that became visible late is still fetched. IndexedDB put() is an
 * idempotent upsert, so the overlap only re-writes rows.
 *
 * Single flight (perf-2): concurrent callers share one in-flight sync.
 *
 * Query shapes (project index rule): the full fetch
 * `orderBy('timestamp', 'desc')` and the delta `where('timestamp', '>', ...)`.
 * Never a greater-or-equal range, and never a query that needs another
 * composite index.
 */

import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
  type Query,
} from 'firebase/firestore';
import { db as firebaseDb } from '@/config/firebase';
import * as localDb from '@/utils/db';
import { normalizeReading } from '@/lib/readings';
import type { NoiseReading } from '@/types/NoiseReading';

/** Each delta re-queries this far behind the watermark (idempotent re-puts). */
export const OVERLAP_MS = 10 * 60_000;

/**
 * A capture `timestamp` more than this far ahead of the browser clock (a phone
 * with a wrong clock) never moves the watermark, so one bad doc cannot stall
 * the delta. The cap can only make the next delta re-read more, never less.
 */
export const MAX_FUTURE_SKEW_MS = 24 * 3_600_000;

/**
 * Bounded staleness (priv-1, and the data-1 residual): at most this long after
 * the last full replace, the next sync re-downloads the whole collection and
 * swaps it in. That evicts readings deleted or rewritten in the app (Clear
 * History, account deletion, email propagation) and picks up offline uploads
 * back-dated past the delta's overlap.
 */
export const FULL_REPLACE_INTERVAL_MS = 24 * 3_600_000;

/** bug-4: while an account is signed in, the ReadingsProvider runs a delta sync this often. */
export const AUTO_SYNC_INTERVAL_MS = 3_600_000;

/** bug-4: when the tab becomes visible again, sync if the last sync (any tab) is older than this. */
export const RESYNC_ON_VISIBLE_AFTER_MS = 5 * 60_000;

/** sync_metadata key: newest server `timestamp` in the cache (epoch ms). */
const WATERMARK_KEY = 'maxTimestampMs';
/** sync_metadata key: wall-clock time of the last successful sync (epoch ms). Display only. */
const LAST_SYNC_AT_KEY = 'lastSyncAt';
/** sync_metadata key: wall-clock time of the last full replace (epoch ms). Missing means one is due. */
const LAST_FULL_SYNC_AT_KEY = 'lastFullSyncAt';
/** Every sync_metadata key this module writes; clearSyncData() resets them all. */
const SYNC_METADATA_KEYS = [WATERMARK_KEY, LAST_SYNC_AT_KEY, LAST_FULL_SYNC_AT_KEY];

export interface SyncResult {
  /** 'full': the whole collection was fetched. 'delta': only `timestamp >` (watermark - OVERLAP_MS). */
  mode: 'full' | 'delta';
  /** Docs the query returned and that were written to IndexedDB (a delta includes overlap re-writes). */
  newCount: number;
  /** Rows in the cache after the sync. */
  totalReadings: number;
  /** Wall-clock time the sync finished. Display only; never a query cursor. */
  lastSync: Date;
}

async function readNumber(key: string): Promise<number | null> {
  const value = await localDb.getSyncMetadata(key);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The delta cursor: newest server `timestamp` (epoch ms) in the cache, or null before the first fetch. */
export function getWatermark(): Promise<number | null> {
  return readNumber(WATERMARK_KEY);
}

/**
 * The watermark after storing `readings`: their newest `timestamp`, never
 * lower than `previous` (pass null after a full fetch). Timestamps more than
 * MAX_FUTURE_SKEW_MS ahead of `nowMs` are ignored. Pure, for tests.
 */
export function nextWatermark(
  readings: NoiseReading[],
  previous: number | null,
  nowMs: number,
): number | null {
  const ceiling = nowMs + MAX_FUTURE_SKEW_MS;
  let watermark = previous;
  for (const reading of readings) {
    const ts = reading.timestamp;
    if (
      typeof ts === 'number' &&
      Number.isFinite(ts) &&
      ts <= ceiling &&
      (watermark === null || ts > watermark)
    ) {
      watermark = ts;
    }
  }
  return watermark;
}

/**
 * True when the cache needs a full replace: never replaced, replaced
 * FULL_REPLACE_INTERVAL_MS or more ago, or the clock has moved back since.
 * Pure, for tests.
 */
export function isFullReplaceDue(lastFullSyncAt: number | null, nowMs: number): boolean {
  if (lastFullSyncAt === null) {
    return true;
  }
  const elapsed = nowMs - lastFullSyncAt;
  return elapsed < 0 || elapsed >= FULL_REPLACE_INTERVAL_MS;
}

function fullQuery(): Query {
  return query(collection(firebaseDb, 'noise_readings'), orderBy('timestamp', 'desc'));
}

function deltaQuery(watermarkMs: number): Query {
  // Strictly '>' (project index rule): a single-field range served by the
  // automatic index.
  return query(
    collection(firebaseDb, 'noise_readings'),
    where('timestamp', '>', Timestamp.fromMillis(watermarkMs - OVERLAP_MS)),
  );
}

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

// The sync every caller currently shares, if one is running.
let inflight: Promise<SyncResult> | null = null;

/** Start `task` as THE shared sync: callers that arrive while it runs get the same promise. */
function share(task: () => Promise<SyncResult>): Promise<SyncResult> {
  const run: Promise<SyncResult> = task().finally(() => {
    if (inflight === run) {
      inflight = null;
    }
  });
  inflight = run;
  return run;
}

async function performSync(forceFull: boolean): Promise<SyncResult> {
  try {
    const watermark = await getWatermark();
    const lastFullSyncAt = await readNumber(LAST_FULL_SYNC_AT_KEY);
    // A full replace when forced, when the last one is FULL_REPLACE_INTERVAL_MS
    // old (or missing), or when nothing has been fetched yet (no watermark).
    const replaceDue = forceFull || isFullReplaceDue(lastFullSyncAt, Date.now());
    const deltaFrom = replaceDue ? null : watermark;
    const full = deltaFrom === null;

    let readings: NoiseReading[];
    if (deltaFrom === null) {
      // Fetch everything FIRST. The cache is swapped only after the download
      // succeeded, in one IndexedDB transaction (bug-5): a failed fetch leaves
      // the old cache and every cursor untouched.
      readings = await fetchReadings(fullQuery());
      await localDb.replaceAllReadings(readings);
    } else {
      readings = await fetchReadings(deltaQuery(deltaFrom));
      if (readings.length > 0) {
        await localDb.setManyReadings(readings);
      }
    }

    // Cursors are written only after the rows are stored: if anything above
    // failed, the old watermark stays and the next sync re-reads.
    const finishedAt = Date.now();
    const next = nextWatermark(readings, deltaFrom, finishedAt);
    if (next !== null) {
      await localDb.setSyncMetadata(WATERMARK_KEY, next);
    }
    await localDb.setSyncMetadata(LAST_SYNC_AT_KEY, finishedAt);
    if (full) {
      await localDb.setSyncMetadata(LAST_FULL_SYNC_AT_KEY, finishedAt);
    }

    const totalReadings = await localDb.getReadingsCount();
    console.log(`[Sync] ${full ? 'Full' : 'Delta'} sync: ${readings.length} fetched, ${totalReadings} cached`);

    return {
      mode: full ? 'full' : 'delta',
      newCount: readings.length,
      totalReadings,
      lastSync: new Date(finishedAt),
    };
  } catch (error) {
    console.error('[Sync] Sync failed:', error);
    throw error;
  }
}

/**
 * Bring the cache up to date: a full fetch when nothing has been fetched yet,
 * otherwise a delta from the watermark. Every caller that arrives while a sync
 * is running gets that same sync (one getDocs, not one per component).
 */
export function syncNewReadings(): Promise<SyncResult> {
  return inflight ?? share(() => performSync(false));
}

/**
 * "Fetch All Readings": re-download every reading, then swap the cache in one
 * transaction. Nothing is cleared before the download has succeeded (bug-5).
 */
export async function forceFullSync(): Promise<SyncResult> {
  // Let a sync that is already running finish first.
  while (inflight) {
    await inflight.catch(() => undefined);
  }
  return share(() => performSync(true));
}

/**
 * Get sync status
 */
export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error';

/**
 * Last successful sync (wall clock, display only) and the cached row count.
 * 'pending' when the cache has never synced or the last sync is over an hour old.
 */
export async function getSyncStatus(): Promise<{
  status: SyncStatus;
  lastSync: Date | null;
  totalReadings: number;
}> {
  const lastSyncAt = await readNumber(LAST_SYNC_AT_KEY);
  const totalReadings = await localDb.getReadingsCount();
  const isPending = lastSyncAt === null || Date.now() - lastSyncAt > 60 * 60 * 1000;

  return {
    status: isPending ? 'pending' : 'synced',
    lastSync: lastSyncAt === null ? null : new Date(lastSyncAt),
    totalReadings,
  };
}

/**
 * Format time ago for display. Pass `nowMs` to re-render on a timer.
 */
export function formatTimeAgo(date: Date | null, nowMs = Date.now()): string {
  if (!date) return 'Never';

  const diff = nowMs - date.getTime();

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
 * Empty the readings cache and reset every sync cursor.
 */
export async function clearSyncData(): Promise<void> {
  await localDb.clearAllReadings();
  for (const key of SYNC_METADATA_KEYS) {
    await localDb.setSyncMetadata(key, null);
  }
}
