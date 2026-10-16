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

/** A production-shaped noise_readings doc (unclassified, like 79.5% of production). */
function fakeDoc(id: string, timestampMs: number): FakeDoc {
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
    vi.mocked(getDocs).mockResolvedValueOnce(
      fakeSnapshot([fakeDoc('overlap', watermark - 5 * MINUTE), fakeDoc('new', NOW - 2 * MINUTE)]) as never,
    );

    const result = await syncManager.syncNewReadings();

    expect(result.mode).toBe('delta');
    expect(where).toHaveBeenCalledTimes(1);
    const [field, op, value] = vi.mocked(where).mock.calls[0];
    expect(field).toBe('timestamp');
    expect(op).toBe('>');
    expect((value as Timestamp).toMillis()).toBe(watermark - syncManager.OVERLAP_MS);
    expect(fakeDb.meta.get('maxTimestampMs')).toBe(NOW - 2 * MINUTE);
    expect(fakeDb.rows.has('overlap')).toBe(true);
  });

  it('never moves the watermark backwards on overlap-only or empty deltas', async () => {
    const watermark = NOW - 60 * MINUTE;
    seedSyncedCache(watermark);
    vi.mocked(getDocs)
      .mockResolvedValueOnce(fakeSnapshot([fakeDoc('overlap', watermark - 3 * MINUTE)]) as never)
      .mockResolvedValueOnce(fakeSnapshot([]) as never);

    await syncManager.syncNewReadings();
    expect(fakeDb.meta.get('maxTimestampMs')).toBe(watermark);

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

describe('syncNewReadings: single flight (perf-2)', () => {
  it('shares one getDocs between concurrent callers', async () => {
    seedSyncedCache(NOW - 60 * MINUTE);
    const pending = deferred<ReturnType<typeof fakeSnapshot>>();
    vi.mocked(getDocs).mockReturnValueOnce(pending.promise as never);

    const first = syncManager.syncNewReadings();
    const second = syncManager.syncNewReadings();
    expect(second).toBe(first);

    await vi.waitFor(() => expect(getDocs).toHaveBeenCalledTimes(1));
    pending.resolve(fakeSnapshot([fakeDoc('n', NOW - MINUTE)]));
    await Promise.all([first, second]);
    expect(getDocs).toHaveBeenCalledTimes(1);

    // Once settled, the next call starts a new sync.
    vi.mocked(getDocs).mockResolvedValueOnce(fakeSnapshot([]) as never);
    await syncManager.syncNewReadings();
    expect(getDocs).toHaveBeenCalledTimes(2);
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
    vi.mocked(getDocs).mockResolvedValueOnce(fakeSnapshot([]) as never);

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
