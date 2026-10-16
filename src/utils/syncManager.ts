/**
 * Sync Manager - keeps the IndexedDB readings cache in step with Firestore.
 *
 * Cursors (data-1): the delta sync is keyed on SERVER-time watermarks taken
 * from the docs actually received from Firestore, never on the browser clock.
 * A delta runs two queries side by side and merges them by doc id:
 * - `timestamp >` the newest capture `timestamp` in the cache. `timestamp` is
 *   the CAPTURE time, so an offline upload arrives back-dated and can fall
 *   behind this cursor;
 * - `syncedAt >` the newest `syncedAt` in the cache. Current app builds stamp
 *   `syncedAt` with serverTimestamp() on every upload (the rules allow no
 *   other value), so a back-dated upload still lands past this cursor.
 * The timestamp delta stays because older app builds never write `syncedAt`.
 * Each delta re-queries OVERLAP_MS behind its watermark, so a write that
 * became visible late is still fetched. IndexedDB put() is an idempotent
 * upsert, so the overlap only re-writes rows. The periodic full replace stays
 * the backstop for everything a delta cannot see (deletes, label rewrites,
 * back-dated uploads from older builds).
 *
 * Single flight (perf-2): concurrent callers share one in-flight sync.
 *
 * Query shapes (project index rule): the full fetch
 * `orderBy('timestamp', 'desc')`, the delta `where('timestamp', '>', ...)`,
 * and the delta `where('syncedAt', '>', ...)` + `orderBy('syncedAt')`. Each
 * delta is a single-field range served by the automatic index. Never a
 * greater-or-equal range, and never a query that needs another composite
 * index.
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
/** sync_metadata key: newest server `syncedAt` (upload time) in the cache (epoch ms, data-1). */
const SYNCED_WATERMARK_KEY = 'maxSyncedAtMs';
/** sync_metadata key: wall-clock time of the last successful sync (epoch ms). Display only. */
const LAST_SYNC_AT_KEY = 'lastSyncAt';
/** sync_metadata key: wall-clock time of the last full replace (epoch ms). Missing means one is due. */
const LAST_FULL_SYNC_AT_KEY = 'lastFullSyncAt';
/** sync_metadata key: uid of the account the cache was written for (priv-4). */
const CACHE_OWNER_UID_KEY = 'cacheOwnerUid';
/** Every sync_metadata key this module writes; clearSyncData() resets them all. */
const SYNC_METADATA_KEYS = [
  WATERMARK_KEY,
  SYNCED_WATERMARK_KEY,
  LAST_SYNC_AT_KEY,
  LAST_FULL_SYNC_AT_KEY,
  CACHE_OWNER_UID_KEY,
];

export interface SyncResult {
  /**
   * 'full': the whole collection was fetched. 'delta': only `timestamp >` and
   * `syncedAt >`, each from its own watermark - OVERLAP_MS.
   */
  mode: 'full' | 'delta';
  /**
   * Distinct docs the queries returned and that were written to IndexedDB (a
   * delta includes overlap re-writes; a doc both deltas return counts once).
   */
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
 * The upload-time delta cursor (data-1): newest `syncedAt` (epoch ms) in the
 * cache, or null while no cached doc carries one.
 */
export function getSyncedWatermark(): Promise<number | null> {
  return readNumber(SYNCED_WATERMARK_KEY);
}

/** A reading field a watermark is taken from. */
export type WatermarkField = 'timestamp' | 'syncedAt';

/**
 * The watermark after storing `readings`: their newest `field` (`timestamp`
 * by default, or `syncedAt`), never lower than `previous` (pass null after a
 * full fetch). Readings without the field are skipped, and values more than
 * MAX_FUTURE_SKEW_MS ahead of `nowMs` are ignored. Pure, for tests.
 */
export function nextWatermark(
  readings: NoiseReading[],
  previous: number | null,
  nowMs: number,
  field: WatermarkField = 'timestamp',
): number | null {
  const ceiling = nowMs + MAX_FUTURE_SKEW_MS;
  let watermark = previous;
  for (const reading of readings) {
    const ts = reading[field];
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
 * The upload-time delta (data-1). Strictly '>' and ordered on the same field:
 * a single-field range served by the automatic index, no composite index.
 * With no syncedAt watermark yet, it asks for every stamped doc: none exist
 * before current app builds upload, and the first fetch that sees one sets
 * the watermark.
 */
function syncedDeltaQuery(syncedWatermarkMs: number | null): Query {
  const afterMs = syncedWatermarkMs === null ? 0 : syncedWatermarkMs - OVERLAP_MS;
  return query(
    collection(firebaseDb, 'noise_readings'),
    where('syncedAt', '>', Timestamp.fromMillis(afterMs)),
    orderBy('syncedAt'),
  );
}

/**
 * Merge query results by doc id, so a doc two deltas both return is stored
 * and counted once. When the copies differ (a write landed between the two
 * reads), the one with the newer `syncedAt` wins, else the later list's.
 * Pure, for tests.
 */
export function mergeById(...lists: NoiseReading[][]): NoiseReading[] {
  const byId = new Map<string, NoiseReading>();
  for (const list of lists) {
    for (const reading of list) {
      const kept = byId.get(reading.id);
      if (kept === undefined || (kept.syncedAt ?? -Infinity) <= (reading.syncedAt ?? -Infinity)) {
        byId.set(reading.id, reading);
      }
    }
  }
  return Array.from(byId.values());
}

/**
 * Run a noise_readings query and normalize every doc into the plain
 * NoiseReading DTO that IndexedDB stores (bug-1, sec-1). A doc no app
 * version writes is dropped here, so it is never cached and never reaches a
 * chart, table, popup or export. Only the count of dropped docs is logged,
 * never their content (convention 2.13).
 *
 * The callers' query shapes: the full fetch orderBy('timestamp', 'desc'), and
 * the deltas where('timestamp', '>', ...) and where('syncedAt', '>', ...).
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

// Bumped whenever the cache is wiped. A sync that started before the wipe
// drops its result instead of writing it back into the emptied cache (priv-4).
let cacheEpoch = 0;

function assertCacheEpoch(startedEpoch: number): void {
  if (startedEpoch !== cacheEpoch) {
    throw new Error('Sync cancelled: the readings cache was cleared');
  }
}

// clearSyncData() and claimCacheFor() run one at a time, so a purge and a
// claim can never interleave their writes.
let maintenanceQueue: Promise<unknown> = Promise.resolve();

function runExclusively<T>(op: () => Promise<T>): Promise<T> {
  const run = maintenanceQueue.then(op, op);
  maintenanceQueue = run.catch(() => undefined);
  return run;
}

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
  const startedEpoch = cacheEpoch;
  try {
    const watermark = await getWatermark();
    const syncedWatermark = await getSyncedWatermark();
    const lastFullSyncAt = await readNumber(LAST_FULL_SYNC_AT_KEY);
    // A full replace when forced, when the last one is FULL_REPLACE_INTERVAL_MS
    // old (or missing), or when nothing has been fetched yet (no watermark).
    const replaceDue = forceFull || isFullReplaceDue(lastFullSyncAt, Date.now());
    const deltaFrom = replaceDue ? null : watermark;
    const full = deltaFrom === null;

    let readings: NoiseReading[];
    // The docs each watermark is taken from: every doc after a full fetch;
    // in a delta, only the docs that watermark's own query returned.
    let byTimestamp: NoiseReading[];
    let bySyncedAt: NoiseReading[];
    if (deltaFrom === null) {
      // Fetch everything FIRST. The cache is swapped only after the download
      // succeeded, in one IndexedDB transaction (bug-5): a failed fetch leaves
      // the old cache and every cursor untouched.
      readings = await fetchReadings(fullQuery());
      byTimestamp = readings;
      bySyncedAt = readings;
      assertCacheEpoch(startedEpoch);
      await localDb.replaceAllReadings(readings);
    } else {
      // Both deltas must succeed before anything is stored (data-1).
      [byTimestamp, bySyncedAt] = await Promise.all([
        fetchReadings(deltaQuery(deltaFrom)),
        fetchReadings(syncedDeltaQuery(syncedWatermark)),
      ]);
      readings = mergeById(byTimestamp, bySyncedAt);
      assertCacheEpoch(startedEpoch);
      if (readings.length > 0) {
        await localDb.setManyReadings(readings);
      }
    }

    // Cursors are written only after the rows are stored: if anything above
    // failed, the old watermarks stay and the next sync re-reads.
    assertCacheEpoch(startedEpoch);
    const finishedAt = Date.now();
    const next = nextWatermark(byTimestamp, deltaFrom, finishedAt);
    if (next !== null) {
      await localDb.setSyncMetadata(WATERMARK_KEY, next);
    }
    const nextSynced = nextWatermark(bySyncedAt, full ? null : syncedWatermark, finishedAt, 'syncedAt');
    if (nextSynced !== null) {
      await localDb.setSyncMetadata(SYNCED_WATERMARK_KEY, nextSynced);
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

/** Cancel any running sync, then empty the cache and every cursor (including the owner). */
async function wipeCache(): Promise<void> {
  cacheEpoch += 1;
  inflight = null;
  await localDb.clearAllReadings();
  for (const key of SYNC_METADATA_KEYS) {
    await localDb.setSyncMetadata(key, null);
  }
}

/**
 * Empty the readings cache and reset every sync cursor (priv-4: sign-out and
 * account switch). A sync already running is cancelled at call time and
 * writes nothing.
 */
export function clearSyncData(): Promise<void> {
  cacheEpoch += 1;
  inflight = null;
  return runExclusively(wipeCache);
}

/**
 * Make the cache belong to `uid` before anything reads it. A cache written for
 * another account, or for an unknown one (written before this check existed),
 * is purged first (priv-4).
 */
export function claimCacheFor(uid: string): Promise<void> {
  return runExclusively(async () => {
    const owner = await localDb.getSyncMetadata(CACHE_OWNER_UID_KEY);
    if (owner === uid) {
      return;
    }
    await wipeCache();
    await localDb.setSyncMetadata(CACHE_OWNER_UID_KEY, uid);
  });
}
