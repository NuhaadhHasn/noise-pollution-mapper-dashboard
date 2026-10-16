import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDocs, orderBy, Timestamp, where } from 'firebase/firestore';
import * as localDb from '@/utils/db';
import * as syncManager from '@/utils/syncManager';

// Tests never touch Firebase or a real IndexedDB (master playbook §2.15): the
// Firestore entry points and the app's firebase config are mocked, and
// '@/utils/db' is a Map-backed fake. '@/lib/readings' (cluster 04) is real.

const fakeDb = vi.hoisted(() => ({
  rows: new Map<string, { id: string }>(),
  meta: new Map<string, unknown>(),
}));

vi.mock('@/config/firebase', () => ({ db: {}, auth: {} }));

vi.mock('firebase/firestore', () => {
  // Just enough of Timestamp for the sync code and normalizeReading().
  class Timestamp {
    seconds: number;
    nanoseconds: number;
    constructor(seconds: number, nanoseconds: number) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }
    static fromMillis(ms: number): Timestamp {
      return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1_000_000);
    }
    static fromDate(date: Date): Timestamp {
      return Timestamp.fromMillis(date.getTime());
    }
    toMillis(): number {
      return this.seconds * 1000 + Math.floor(this.nanoseconds / 1_000_000);
    }
    toDate(): Date {
      return new Date(this.toMillis());
    }
  }
  return {
    Timestamp,
    collection: vi.fn((_db: unknown, path: string) => ({ path })),
    query: vi.fn((source: unknown, ...constraints: unknown[]) => ({ source, constraints })),
    where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
    orderBy: vi.fn((field: string, direction?: string) => ({ field, direction })),
    getDocs: vi.fn(),
  };
});

vi.mock('@/utils/db', () => ({
  getAllReadings: vi.fn(async () => Array.from(fakeDb.rows.values())),
  setManyReadings: vi.fn(async (readings: Array<{ id: string }>) => {
    for (const reading of readings) {
      fakeDb.rows.set(reading.id, reading);
    }
  }),
  replaceAllReadings: vi.fn(async (readings: Array<{ id: string }>) => {
    fakeDb.rows.clear();
    for (const reading of readings) {
      fakeDb.rows.set(reading.id, reading);
    }
  }),
  clearAllReadings: vi.fn(async () => {
    fakeDb.rows.clear();
  }),
  getReadingsCount: vi.fn(async () => fakeDb.rows.size),
  getSyncMetadata: vi.fn(async (key: string) => fakeDb.meta.get(key) ?? null),
  setSyncMetadata: vi.fn(async (key: string, value: unknown) => {
    fakeDb.meta.set(key, value);
  }),
}));

const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const MINUTE = 60_000;

interface FakeDoc {
  id: string;
  data: () => Record<string, unknown>;
}

/**
 * A production-shaped noise_readings doc (unclassified, like 79.5% of
 * production). Pass `syncedAtMs` for a doc a current app build uploaded
 * (data-1); without it the doc is from an older build, with no syncedAt.
 */
function fakeDoc(id: string, timestampMs: number, syncedAtMs?: number): FakeDoc {
  return {
    id,
    data: () => ({
      userId: 'user-a',
      userEmail: 'us***@example.com',
      decibelLevel: 62.5,
      latitude: 6.9271,
      longitude: 79.8612,
      locationName: 'Colombo',
      timestamp: Timestamp.fromMillis(timestampMs),
      createdAt: Timestamp.fromMillis(timestampMs),
      deviceInfo: 'Mobile Device',
      ...(syncedAtMs === undefined ? {} : { syncedAt: Timestamp.fromMillis(syncedAtMs) }),
    }),
  };
}

function fakeSnapshot(docs: FakeDoc[]) {
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (callback: (doc: FakeDoc) => void) => docs.forEach(callback),
  };
}

/** The mocked query(): its source and constraints, as the firebase/firestore mock builds them. */
interface FakeQuery {
  constraints: Array<{ field: string; op?: string }>;
}

type QueryRoute = 'full' | 'timestamp' | 'syncedAt';

/** Which of the three sync queries `q` is: the full fetch, or the delta on that field. */
function routeOf(q: unknown): QueryRoute {
  const range = (q as FakeQuery).constraints.find((constraint) => constraint.op === '>');
  if (range === undefined) {
    return 'full';
  }
  if (range.field === 'timestamp' || range.field === 'syncedAt') {
    return range.field;
  }
  throw new Error(`unexpected range query on ${range.field}`);
}

/**
 * Serve getDocs by query shape, not call order: a delta runs the timestamp
 * and syncedAt queries side by side. A route set to an Error rejects; a route
 * left out returns no docs.
 */
function serveQueries(routes: Partial<Record<QueryRoute, FakeDoc[] | Error>>): void {
  vi.mocked(getDocs).mockImplementation((async (q: unknown) => {
    const docs = routes[routeOf(q)] ?? [];
    if (docs instanceof Error) {
      throw docs;
    }
    return fakeSnapshot(docs);
  }) as never);
}

/** The where() call on `field`: [field, op, value], or undefined. */
function whereOn(field: string) {
  return vi.mocked(where).mock.calls.find(([f]) => f === field);
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}

/** Puts the cache in the "already synced" state a delta starts from. */
function seedSyncedCache(watermarkMs: number): void {
  fakeDb.meta.set('maxTimestampMs', watermarkMs);
  // A recent full replace, so the next sync is a delta (step 2).
  fakeDb.meta.set('lastFullSyncAt', NOW - 60 * MINUTE);
}

beforeEach(() => {
  fakeDb.rows.clear();
  fakeDb.meta.clear();
  vi.clearAllMocks();
  vi.mocked(getDocs).mockReset();
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('syncNewReadings: server-time watermark (data-1)', () => {
  it('runs the full orderBy fetch first and takes the watermark from the docs, not the browser clock', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(
      fakeSnapshot([
        fakeDoc('a', NOW - 30 * MINUTE),
        fakeDoc('b', NOW - 5 * MINUTE),
        fakeDoc('c', NOW - 20 * MINUTE),
      ]) as never,
    );

    const result = await syncManager.syncNewReadings();

    expect(result.mode).toBe('full');
    expect(orderBy).toHaveBeenCalledWith('timestamp', 'desc');
    expect(where).not.toHaveBeenCalled();
    expect(fakeDb.rows.size).toBe(3);
    expect(fakeDb.meta.get('maxTimestampMs')).toBe(NOW - 5 * MINUTE);
    // The wall clock is stored separately, for display only.
    expect(fakeDb.meta.get('lastSyncAt')).toBe(NOW);
    expect(result.lastSync.getTime()).toBe(NOW);
  });

  it("queries timestamp '>' (watermark - OVERLAP_MS) and advances to the newest fetched doc", async () => {
    const watermark = NOW - 60 * MINUTE;
    seedSyncedCache(watermark);
    serveQueries({
      timestamp: [fakeDoc('overlap', watermark - 5 * MINUTE), fakeDoc('new', NOW - 2 * MINUTE)],
    });

    const result = await syncManager.syncNewReadings();

    expect(result.mode).toBe('delta');
    const [, op, value] = whereOn('timestamp') ?? [];
    expect(op).toBe('>');
    expect((value as Timestamp).toMillis()).toBe(watermark - syncManager.OVERLAP_MS);
    expect(fakeDb.meta.get('maxTimestampMs')).toBe(NOW - 2 * MINUTE);
    expect(fakeDb.rows.has('overlap')).toBe(true);
  });

  it('never moves the watermark backwards on overlap-only or empty deltas', async () => {
    const watermark = NOW - 60 * MINUTE;
    seedSyncedCache(watermark);
    serveQueries({ timestamp: [fakeDoc('overlap', watermark - 3 * MINUTE)] });

    await syncManager.syncNewReadings();
    expect(fakeDb.meta.get('maxTimestampMs')).toBe(watermark);

    serveQueries({});
    await syncManager.syncNewReadings();
    expect(fakeDb.meta.get('maxTimestampMs')).toBe(watermark);
  });

  it('stores a reading with a far-future capture time but does not let it move the watermark', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce(
      fakeSnapshot([
        fakeDoc('bad-clock', NOW + 2 * syncManager.MAX_FUTURE_SKEW_MS),
        fakeDoc('ok', NOW - MINUTE),
      ]) as never,
    );

    await syncManager.syncNewReadings();

    expect(fakeDb.rows.has('bad-clock')).toBe(true);
    expect(fakeDb.meta.get('maxTimestampMs')).toBe(NOW - MINUTE);
  });
});

describe('syncNewReadings: syncedAt upload-time cursor (data-1)', () => {
  const DAY = 24 * 60 * MINUTE;

  /** A delta-ready cache: both watermarks set, a recent full replace. */
  function seedBothWatermarks(timestampMs: number, syncedAtMs: number): void {
    seedSyncedCache(timestampMs);
    fakeDb.meta.set('maxSyncedAtMs', syncedAtMs);
  }

  it("finds a back-dated offline upload through syncedAt '>' that the timestamp delta misses", async () => {
    const watermark = NOW - 60 * MINUTE;
    seedBothWatermarks(watermark, watermark);
    // Captured offline three days ago, uploaded two minutes ago: its capture
    // timestamp is far behind the timestamp delta, so only syncedAt finds it.
    serveQueries({ syncedAt: [fakeDoc('offline', NOW - 3 * DAY, NOW - 2 * MINUTE)] });

    const result = await syncManager.syncNewReadings();

    expect(result.mode).toBe('delta');
    const [, op, value] = whereOn('syncedAt') ?? [];
    expect(op).toBe('>');
    expect((value as Timestamp).toMillis()).toBe(watermark - syncManager.OVERLAP_MS);
    // A range plus orderBy on the same field: the automatic index, no composite index.
    expect(orderBy).toHaveBeenCalledWith('syncedAt');
    expect(orderBy).not.toHaveBeenCalledWith('timestamp', 'desc');
    expect(fakeDb.rows.get('offline')).toMatchObject({ timestamp: NOW - 3 * DAY, syncedAt: NOW - 2 * MINUTE });
    expect(result.newCount).toBe(1);
    // The back-dated capture time never drags the timestamp watermark back.
    expect(fakeDb.meta.get('maxTimestampMs')).toBe(watermark);
    expect(fakeDb.meta.get('maxSyncedAtMs')).toBe(NOW - 2 * MINUTE);
  });

  it('stores and counts a doc both deltas return once', async () => {
    seedBothWatermarks(NOW - 60 * MINUTE, NOW - 60 * MINUTE);
    const both = fakeDoc('both', NOW - 2 * MINUTE, NOW - 2 * MINUTE);
    serveQueries({
      timestamp: [both, fakeDoc('older-build', NOW - 3 * MINUTE)],
      syncedAt: [fakeDoc('back-dated', NOW - DAY, NOW - 4 * MINUTE), both],
    });

    const result = await syncManager.syncNewReadings();

    expect(localDb.setManyReadings).toHaveBeenCalledTimes(1);
    const stored = vi.mocked(localDb.setManyReadings).mock.calls[0][0];
    expect(stored.map((reading) => reading.id).sort()).toEqual(['back-dated', 'both', 'older-build']);
    expect(result.newCount).toBe(3);
    expect(fakeDb.rows.size).toBe(3);
  });

  it('mergeById keeps one copy per id, preferring the newer syncedAt', () => {
    const reading = (id: string, syncedAt?: number, userEmail = 'old') => ({
      id,
      userId: 'user-a',
      userEmail,
      decibelLevel: 60,
      latitude: 6.9,
      longitude: 79.8,
      timestamp: NOW,
      ...(syncedAt === undefined ? {} : { syncedAt }),
    });

    const merged = syncManager.mergeById(
      [reading('a', NOW), reading('b'), reading('c', NOW, 'newer list')],
      [reading('a', NOW - MINUTE, 'stale copy'), reading('b', NOW), reading('c', NOW, 'later list')],
    );

    expect(merged.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(merged.find((r) => r.id === 'a')?.userEmail).toBe('old');
    expect(merged.find((r) => r.id === 'b')?.syncedAt).toBe(NOW);
    expect(merged.find((r) => r.id === 'c')?.userEmail).toBe('later list');
  });

  it('persists maxSyncedAtMs from a full fetch and queries from it on the next delta', async () => {
    serveQueries({
      full: [
        fakeDoc('older-build', NOW - 30 * MINUTE),
        fakeDoc('uploaded', NOW - 2 * DAY, NOW - 20 * MINUTE),
        fakeDoc('online', NOW - 25 * MINUTE, NOW - 25 * MINUTE),
      ],
    });

    await syncManager.syncNewReadings();

    expect(fakeDb.meta.get('maxSyncedAtMs')).toBe(NOW - 20 * MINUTE);
    expect(fakeDb.meta.get('maxTimestampMs')).toBe(NOW - 25 * MINUTE);

    serveQueries({});
    await syncManager.syncNewReadings();

    const [, , value] = whereOn('syncedAt') ?? [];
    expect((value as Timestamp).toMillis()).toBe(NOW - 20 * MINUTE - syncManager.OVERLAP_MS);
    // An empty delta never moves it backwards.
    expect(fakeDb.meta.get('maxSyncedAtMs')).toBe(NOW - 20 * MINUTE);
  });

  it('never moves maxSyncedAtMs backwards on an overlap-only delta', async () => {
    const syncedWatermark = NOW - 10 * MINUTE;
    seedBothWatermarks(NOW - 60 * MINUTE, syncedWatermark);
    serveQueries({ syncedAt: [fakeDoc('overlap', NOW - DAY, syncedWatermark - 5 * MINUTE)] });

    await syncManager.syncNewReadings();

    expect(fakeDb.rows.has('overlap')).toBe(true);
    expect(fakeDb.meta.get('maxSyncedAtMs')).toBe(syncedWatermark);
  });

  it('with no syncedAt watermark yet, asks for every stamped doc', async () => {
    // A cache built before data-1, or one where no doc carries syncedAt yet.
    seedSyncedCache(NOW - 60 * MINUTE);
    serveQueries({});

    await syncManager.syncNewReadings();

    const [, op, value] = whereOn('syncedAt') ?? [];
    expect(op).toBe('>');
    expect((value as Timestamp).toMillis()).toBe(0);
    expect(fakeDb.meta.has('maxSyncedAtMs')).toBe(false);
  });

  it('a failed syncedAt query stores nothing and keeps every cursor', async () => {
    seedBothWatermarks(NOW - 60 * MINUTE, NOW - 60 * MINUTE);
    const metaBefore = new Map(fakeDb.meta);
    serveQueries({ timestamp: [fakeDoc('new', NOW - MINUTE)], syncedAt: new Error('unavailable') });

    await expect(syncManager.syncNewReadings()).rejects.toThrow('unavailable');

    expect(fakeDb.rows.size).toBe(0);
    expect(fakeDb.meta).toEqual(metaBefore);
  });

  it('clearing the cache resets maxSyncedAtMs too', async () => {
    seedBothWatermarks(NOW - 60 * MINUTE, NOW - 60 * MINUTE);

    await syncManager.clearSyncData();

    expect(fakeDb.meta.get('maxSyncedAtMs')).toBeNull();
  });
});

describe('syncNewReadings: single flight (perf-2)', () => {
  it('shares one sync between concurrent callers: one query each, not one per caller', async () => {
    seedSyncedCache(NOW - 60 * MINUTE);
    const pending = deferred<ReturnType<typeof fakeSnapshot>>();
    vi.mocked(getDocs).mockReturnValue(pending.promise as never);

    const first = syncManager.syncNewReadings();
    const second = syncManager.syncNewReadings();
    expect(second).toBe(first);

    // The delta's two queries (timestamp and syncedAt), once.
    await vi.waitFor(() => expect(getDocs).toHaveBeenCalledTimes(2));
    pending.resolve(fakeSnapshot([fakeDoc('n', NOW - MINUTE, NOW - MINUTE)]));
    await Promise.all([first, second]);
    expect(getDocs).toHaveBeenCalledTimes(2);

    // Once settled, the next call starts a new sync.
    serveQueries({});
    await syncManager.syncNewReadings();
    expect(getDocs).toHaveBeenCalledTimes(4);
  });
});

describe('periodic full replace (priv-1, bug-5)', () => {
  it('isFullReplaceDue: missing, stale or future-dated lastFullSyncAt means due', () => {
    const interval = syncManager.FULL_REPLACE_INTERVAL_MS;
    expect(syncManager.isFullReplaceDue(null, NOW)).toBe(true);
    expect(syncManager.isFullReplaceDue(NOW - 60 * MINUTE, NOW)).toBe(false);
    expect(syncManager.isFullReplaceDue(NOW - interval, NOW)).toBe(true);
    expect(syncManager.isFullReplaceDue(NOW + 60 * MINUTE, NOW)).toBe(true);
  });

  it('replaces the whole cache when a full replace is due, evicting rows deleted in the app', async () => {
    fakeDb.meta.set('maxTimestampMs', NOW - 60 * MINUTE);
    fakeDb.meta.set('lastFullSyncAt', NOW - syncManager.FULL_REPLACE_INTERVAL_MS - MINUTE);
    fakeDb.rows.set('deleted-in-app', { id: 'deleted-in-app' });
    vi.mocked(getDocs).mockResolvedValueOnce(fakeSnapshot([fakeDoc('kept', NOW - 90 * MINUTE)]) as never);

    const result = await syncManager.syncNewReadings();

    expect(result.mode).toBe('full');
    expect(where).not.toHaveBeenCalled();
    expect(localDb.replaceAllReadings).toHaveBeenCalledTimes(1);
    expect(Array.from(fakeDb.rows.keys())).toEqual(['kept']);
    expect(fakeDb.meta.get('lastFullSyncAt')).toBe(NOW);
    // A full replace recomputes the watermark from the docs actually present.
    expect(fakeDb.meta.get('maxTimestampMs')).toBe(NOW - 90 * MINUTE);
  });

  it('runs a delta, not a replace, while the last full replace is recent', async () => {
    seedSyncedCache(NOW - 60 * MINUTE);
    serveQueries({});

    const result = await syncManager.syncNewReadings();

    expect(result.mode).toBe('delta');
    expect(localDb.replaceAllReadings).not.toHaveBeenCalled();
  });

  it('forceFullSync keeps the cache and every cursor when the fetch fails', async () => {
    seedSyncedCache(NOW - 60 * MINUTE);
    fakeDb.rows.set('cached', { id: 'cached' });
    const metaBefore = new Map(fakeDb.meta);
    vi.mocked(getDocs).mockRejectedValueOnce(new Error('unavailable'));

    await expect(syncManager.forceFullSync()).rejects.toThrow('unavailable');

    expect(Array.from(fakeDb.rows.keys())).toEqual(['cached']);
    expect(fakeDb.meta).toEqual(metaBefore);
    expect(localDb.clearAllReadings).not.toHaveBeenCalled();
    expect(localDb.replaceAllReadings).not.toHaveBeenCalled();
  });

  it('forceFullSync swaps the cache in one replace after a successful fetch', async () => {
    seedSyncedCache(NOW - 60 * MINUTE);
    fakeDb.rows.set('stale', { id: 'stale' });
    vi.mocked(getDocs).mockResolvedValueOnce(fakeSnapshot([fakeDoc('fresh', NOW - MINUTE)]) as never);

    const result = await syncManager.forceFullSync();

    expect(result.mode).toBe('full');
    expect(localDb.replaceAllReadings).toHaveBeenCalledTimes(1);
    expect(localDb.clearAllReadings).not.toHaveBeenCalled();
    expect(Array.from(fakeDb.rows.keys())).toEqual(['fresh']);
  });
});

describe('cache ownership and clearing (priv-4)', () => {
  it('claimCacheFor keeps the cache for the account that wrote it', async () => {
    fakeDb.meta.set('cacheOwnerUid', 'user-a');
    fakeDb.rows.set('r1', { id: 'r1' });

    await syncManager.claimCacheFor('user-a');

    expect(fakeDb.rows.size).toBe(1);
    expect(localDb.clearAllReadings).not.toHaveBeenCalled();
  });

  it('claimCacheFor purges a cache written for another or an unknown account', async () => {
    seedSyncedCache(NOW - 60 * MINUTE);
    fakeDb.meta.set('cacheOwnerUid', 'user-a');
    fakeDb.rows.set('r1', { id: 'r1' });

    await syncManager.claimCacheFor('user-b');

    expect(fakeDb.rows.size).toBe(0);
    expect(fakeDb.meta.get('maxTimestampMs')).toBeNull();
    expect(fakeDb.meta.get('lastFullSyncAt')).toBeNull();
    expect(fakeDb.meta.get('cacheOwnerUid')).toBe('user-b');

    fakeDb.meta.delete('cacheOwnerUid');
    fakeDb.rows.set('r2', { id: 'r2' });
    await syncManager.claimCacheFor('user-b');
    expect(fakeDb.rows.size).toBe(0);
    expect(fakeDb.meta.get('cacheOwnerUid')).toBe('user-b');
  });

  it('a sync that was running when the cache was cleared writes nothing back', async () => {
    const pending = deferred<ReturnType<typeof fakeSnapshot>>();
    vi.mocked(getDocs).mockReturnValueOnce(pending.promise as never);

    const sync = syncManager.syncNewReadings();
    await vi.waitFor(() => expect(getDocs).toHaveBeenCalledTimes(1));
    await syncManager.clearSyncData();
    pending.resolve(fakeSnapshot([fakeDoc('late', NOW - MINUTE)]));

    await expect(sync).rejects.toThrow('cancelled');
    expect(fakeDb.rows.size).toBe(0);
    expect(fakeDb.meta.get('maxTimestampMs')).toBeNull();
    expect(fakeDb.meta.get('lastFullSyncAt')).toBeNull();
  });
});
