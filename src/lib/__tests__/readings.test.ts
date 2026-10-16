import { describe, expect, it } from 'vitest';
import { getCoordinates, getReadingDate, normalizeReading, toDate, toMillis } from '@/lib/readings';

// Stand-in for the Firestore SDK Timestamp: its data lives in own fields and
// its methods on the prototype. A structured clone (what IndexedDB does on
// put) keeps the fields and drops the methods, which is the bug-1 root
// cause. No Firebase import (convention 2.15).
class FakeTimestamp {
  readonly seconds: number;
  readonly nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  toMillis(): number {
    return this.seconds * 1000 + this.nanoseconds / 1e6;
  }

  toDate(): Date {
    return new Date(this.toMillis());
  }
}

const MS = Date.UTC(2026, 9, 15, 10, 30, 0); // 2026-10-15T10:30:00.000Z
const SECONDS = MS / 1000;

describe('toMillis', () => {
  it('passes finite epoch-ms numbers through', () => {
    expect(toMillis(MS)).toBe(MS);
    expect(toMillis(0)).toBe(0);
  });

  it('reads a live Timestamp', () => {
    expect(toMillis(new FakeTimestamp(SECONDS, 0))).toBe(MS);
  });

  it('reads a Timestamp after an IndexedDB structured clone (bug-1)', () => {
    const cloned: unknown = structuredClone(new FakeTimestamp(SECONDS, 250_000_000));
    expect(cloned).not.toBeInstanceOf(FakeTimestamp);
    expect(toMillis(cloned)).toBe(MS + 250);
  });

  it('reads a plain { seconds, nanoseconds } object', () => {
    expect(toMillis({ seconds: SECONDS, nanoseconds: 999_999 })).toBe(MS);
    expect(toMillis({ seconds: SECONDS })).toBe(MS);
  });

  it('reads Dates and ISO strings', () => {
    expect(toMillis(new Date(MS))).toBe(MS);
    expect(toMillis('2026-10-15T10:30:00.000Z')).toBe(MS);
  });

  it('reads any other object with toMillis() or toDate()', () => {
    expect(toMillis({ toMillis: () => MS })).toBe(MS);
    expect(toMillis({ toDate: () => new Date(MS) })).toBe(MS);
  });

  it('returns null for missing or unparseable values', () => {
    const values: unknown[] = [
      null,
      undefined,
      '',
      '   ',
      'not a date',
      NaN,
      Infinity,
      -Infinity,
      true,
      {},
      [],
      new Date('not a date'),
      { seconds: 'x' },
      { toDate: () => 'x' },
    ];
    for (const value of values) {
      expect(toMillis(value)).toBeNull();
    }
  });

  it('returns null outside the Date range instead of an Invalid Date (sec-1)', () => {
    expect(toMillis({ seconds: 1e15, nanoseconds: 0 })).toBeNull();
    expect(toMillis(9e15)).toBeNull();
  });
});

describe('toDate', () => {
  it('returns a Date for a parseable value', () => {
    expect(toDate(new FakeTimestamp(SECONDS, 0))?.getTime()).toBe(MS);
    expect(toDate(MS)?.toISOString()).toBe('2026-10-15T10:30:00.000Z');
  });

  it('returns null instead of 1 Jan 1970 for a missing value (bug-13)', () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate('garbage')).toBeNull();
  });
});

describe('getReadingDate', () => {
  const CREATED = MS - 60_000;

  it('prefers the server timestamp over the client createdAt (bug-8)', () => {
    expect(getReadingDate({ timestamp: MS, createdAt: CREATED })?.getTime()).toBe(MS);
    expect(
      getReadingDate({
        timestamp: new FakeTimestamp(SECONDS, 0),
        createdAt: new FakeTimestamp(CREATED / 1000, 0),
      })?.getTime(),
    ).toBe(MS);
  });

  it('falls back to createdAt only when timestamp is missing or unparseable', () => {
    expect(getReadingDate({ timestamp: null, createdAt: CREATED })?.getTime()).toBe(CREATED);
    expect(getReadingDate({ createdAt: CREATED })?.getTime()).toBe(CREATED);
    expect(getReadingDate({ timestamp: 'garbage', createdAt: CREATED })?.getTime()).toBe(CREATED);
  });

  it('returns null when neither field is usable', () => {
    expect(getReadingDate({})).toBeNull();
    expect(getReadingDate({ timestamp: null, createdAt: null })).toBeNull();
  });
});

describe('getCoordinates', () => {
  it('returns flat finite latitude/longitude', () => {
    expect(getCoordinates({ latitude: 6.9271, longitude: 79.8612 })).toEqual({ lat: 6.9271, lng: 79.8612 });
    expect(getCoordinates({ latitude: 0, longitude: 0 })).toEqual({ lat: 0, lng: 0 });
  });

  it('rejects missing, non-numeric, non-finite and out-of-range values', () => {
    expect(getCoordinates({})).toBeNull();
    expect(getCoordinates({ latitude: 6.9271 })).toBeNull();
    expect(getCoordinates({ latitude: '6.9271', longitude: 79.8612 })).toBeNull();
    expect(getCoordinates({ latitude: NaN, longitude: 79.8612 })).toBeNull();
    expect(getCoordinates({ latitude: 6.9271, longitude: Infinity })).toBeNull();
    expect(getCoordinates({ latitude: 91, longitude: 79.8612 })).toBeNull();
    expect(getCoordinates({ latitude: 6.9271, longitude: -181 })).toBeNull();
  });
});

describe('normalizeReading', () => {
  // A production doc as getDocs() returns it: the 12 known keys.
  function rawDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      userId: 'uid-123',
      userEmail: 'ab***@example.com',
      decibelLevel: 62.5,
      latitude: 6.9271,
      longitude: 79.8612,
      locationName: 'Colombo Fort',
      timestamp: new FakeTimestamp(SECONDS, 0),
      createdAt: new FakeTimestamp(SECONDS - 5, 0),
      deviceInfo: 'Mobile Device',
      soundClass: 'Traffic',
      soundType: 'Pollution',
      confidence: 0.82,
      ...overrides,
    };
  }

  it('maps a full doc onto the plain DTO with epoch-ms dates', () => {
    expect(normalizeReading('r1', rawDoc())).toEqual({
      id: 'r1',
      userId: 'uid-123',
      userEmail: 'ab***@example.com',
      decibelLevel: 62.5,
      latitude: 6.9271,
      longitude: 79.8612,
      locationName: 'Colombo Fort',
      timestamp: MS,
      createdAt: MS - 5000,
      soundClass: 'Traffic',
      soundType: 'Pollution',
      confidence: 0.82,
    });
  });

  it('keeps only declared keys: no deviceInfo, no unknown key, no soundCategory', () => {
    const reading = normalizeReading('r1', rawDoc({ extra: { nested: true }, soundCategory: 'Traffic' }));
    expect(reading).not.toBeNull();
    expect(Object.keys(reading ?? {}).sort()).toEqual([
      'confidence',
      'createdAt',
      'decibelLevel',
      'id',
      'latitude',
      'locationName',
      'longitude',
      'soundClass',
      'soundType',
      'timestamp',
      'userEmail',
      'userId',
    ]);
  });

  it('produces a row that survives an IndexedDB structured clone unchanged (bug-1)', () => {
    const reading = normalizeReading('r1', rawDoc());
    const stored = structuredClone(reading);
    expect(stored).toEqual(reading);
    expect(typeof stored?.timestamp).toBe('number');
  });

  it('accepts a doc whose Timestamps were already structure-cloned', () => {
    expect(normalizeReading('r1', structuredClone(rawDoc()))?.timestamp).toBe(MS);
  });

  it('keeps an unclassified doc and leaves the optional fields absent', () => {
    const doc = rawDoc({ userEmail: null });
    delete doc.soundClass;
    delete doc.soundType;
    delete doc.confidence;
    delete doc.createdAt;
    expect(normalizeReading('r2', doc)).toEqual({
      id: 'r2',
      userId: 'uid-123',
      decibelLevel: 62.5,
      latitude: 6.9271,
      longitude: 79.8612,
      locationName: 'Colombo Fort',
      timestamp: MS,
    });
  });

  it('carries syncedAt as epoch ms, and omits it when missing or unparseable (data-1)', () => {
    const uploadedLater = rawDoc({ syncedAt: new FakeTimestamp(SECONDS + 3600, 0) });
    expect(normalizeReading('r6', uploadedLater)?.syncedAt).toBe(MS + 3_600_000);
    expect(normalizeReading('r6', structuredClone(uploadedLater))?.syncedAt).toBe(MS + 3_600_000);
    expect(normalizeReading('r7', rawDoc())).not.toHaveProperty('syncedAt');
    expect(normalizeReading('r8', rawDoc({ syncedAt: 'not a date' }))).not.toHaveProperty('syncedAt');
    expect(normalizeReading('r9', rawDoc({ syncedAt: null }))).not.toHaveProperty('syncedAt');
  });

  it("drops a soundType other than 'Pollution'/'Ambient' and a non-numeric confidence", () => {
    const reading = normalizeReading('r3', rawDoc({ soundType: 'Both', confidence: '0.9' }));
    expect(reading).not.toBeNull();
    expect(reading?.soundType).toBeUndefined();
    expect(reading?.confidence).toBeUndefined();
  });

  it('keeps a doc with an unparseable timestamp as timestamp: null', () => {
    const doc = rawDoc({ timestamp: 'not a date' });
    delete doc.createdAt;
    expect(normalizeReading('r4', doc)?.timestamp).toBeNull();
  });

  it('drops docs no app version writes (sec-1)', () => {
    const bad: Record<string, unknown>[] = [
      rawDoc({ userId: undefined }),
      rawDoc({ userId: 42 }),
      rawDoc({ decibelLevel: '62.5' }),
      rawDoc({ decibelLevel: NaN }),
      rawDoc({ decibelLevel: Infinity }),
      rawDoc({ latitude: undefined }),
      rawDoc({ latitude: '6.9271' }),
      rawDoc({ longitude: 200 }),
      rawDoc({ soundClass: { x: 1 } }),
      rawDoc({ locationName: 12 }),
      rawDoc({ userEmail: ['ab***@example.com'] }),
    ];
    for (const doc of bad) {
      expect(normalizeReading('bad', doc)).toBeNull();
    }
  });

  it('drops a doc that has only the legacy nested location', () => {
    const doc = rawDoc({ location: { latitude: 6.9271, longitude: 79.8612 } });
    delete doc.latitude;
    delete doc.longitude;
    expect(normalizeReading('r5', doc)).toBeNull();
  });
});
