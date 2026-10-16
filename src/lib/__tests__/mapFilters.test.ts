import { describe, expect, it } from 'vitest';
import { filterReadings } from '@/lib/mapFilters';
import type { FilterableReading, ReadingFilters } from '@/lib/mapFilters';

interface TestReading extends FilterableReading {
  id: string;
}

function reading(overrides: Partial<TestReading> = {}): TestReading {
  return {
    id: 'r1',
    userId: 'u1',
    decibelLevel: 60,
    latitude: 6.9,
    longitude: 79.86,
    timestamp: new Date(2026, 9, 15, 12, 0).getTime(),
    ...overrides,
  };
}

const ALL: ReadingFilters = { userId: 'u1', showAllUsers: true, range: null };

function ids(list: TestReading[]): string[] {
  return list.map((item) => item.id);
}

describe('filterReadings', () => {
  it('keeps readings that have a position and a finite dB', () => {
    const list = [reading({ id: 'a' }), reading({ id: 'b', decibelLevel: 0 })];
    expect(ids(filterReadings(list, ALL))).toEqual(['a', 'b']);
  });

  it('drops a reading with no usable position', () => {
    const list = [
      reading({ id: 'ok' }),
      reading({ id: 'none', latitude: undefined }),
      reading({ id: 'range', latitude: 95 }),
    ];
    expect(ids(filterReadings(list, ALL))).toEqual(['ok']);
  });

  it('drops a reading whose dB is not a finite number', () => {
    const list = [
      reading({ id: 'ok' }),
      reading({ id: 'text', decibelLevel: 'loud' }),
      reading({ id: 'nan', decibelLevel: Number.NaN }),
      reading({ id: 'missing', decibelLevel: undefined }),
    ];
    expect(ids(filterReadings(list, ALL))).toEqual(['ok']);
  });

  it('keeps only the caller\'s readings while showAllUsers is false', () => {
    const list = [reading({ id: 'mine' }), reading({ id: 'theirs', userId: 'u2' })];
    expect(ids(filterReadings(list, { ...ALL, showAllUsers: false }))).toEqual(['mine']);
    expect(ids(filterReadings(list, ALL))).toEqual(['mine', 'theirs']);
  });

  it('matches nothing for an empty userId while showAllUsers is false', () => {
    const list = [reading({ id: 'mine' })];
    expect(filterReadings(list, { ...ALL, userId: '', showAllUsers: false })).toEqual([]);
  });

  it('applies an inclusive dB window', () => {
    const list = [
      reading({ id: 'low', decibelLevel: 39.9 }),
      reading({ id: 'min', decibelLevel: 40 }),
      reading({ id: 'max', decibelLevel: 70 }),
      reading({ id: 'high', decibelLevel: 70.1 }),
    ];
    expect(ids(filterReadings(list, { ...ALL, dbRange: { min: 40, max: 70 } }))).toEqual(['min', 'max']);
  });

  it('compares canonical categories, so Speech-Pollution matches Speech and Quiet is its own category', () => {
    const list = [
      reading({ id: 'speech', soundClass: 'Speech-Pollution' }),
      reading({ id: 'quiet', soundClass: 'Quiet' }),
      reading({ id: 'none' }),
    ];
    expect(ids(filterReadings(list, { ...ALL, categories: ['Speech'] }))).toEqual(['speech']);
    expect(ids(filterReadings(list, { ...ALL, categories: ['Quiet'] }))).toEqual(['quiet']);
    expect(ids(filterReadings(list, { ...ALL, categories: [] }))).toEqual(['speech', 'quiet', 'none']);
  });

  it('returns a new array and leaves the input untouched', () => {
    const list = [reading({ id: 'a' }), reading({ id: 'b', userId: 'u2' })];
    const copy = [...list];
    const result = filterReadings(list, { ...ALL, showAllUsers: false });
    expect(result).not.toBe(list);
    expect(list).toEqual(copy);
  });
});

describe('filterReadings date range', () => {
  const range = { start: new Date(2026, 9, 10), end: new Date(2026, 9, 16, 23, 59, 59, 999) };
  const inRange = new Date(2026, 9, 12, 12, 0).getTime();
  const outOfRange = new Date(2026, 8, 1, 12, 0).getTime();

  it('lets the server timestamp decide, not the client-clock createdAt (bug-8)', () => {
    const list = [
      reading({ id: 'server-in', timestamp: inRange, createdAt: outOfRange }),
      reading({ id: 'server-out', timestamp: outOfRange, createdAt: inRange }),
    ];
    expect(ids(filterReadings(list, { ...ALL, range }))).toEqual(['server-in']);
  });

  it('falls back to createdAt only when the timestamp is missing', () => {
    const list = [
      reading({ id: 'fallback', timestamp: null, createdAt: inRange }),
      reading({ id: 'nothing', timestamp: null }),
    ];
    expect(ids(filterReadings(list, { ...ALL, range }))).toEqual(['fallback']);
  });

  it('drops a reading with no date once a range is set, and keeps it for all time', () => {
    const list = [reading({ id: 'undated', timestamp: null })];
    expect(filterReadings(list, { ...ALL, range })).toEqual([]);
    expect(ids(filterReadings(list, ALL))).toEqual(['undated']);
  });

  it('includes both bounds', () => {
    const list = [
      reading({ id: 'start', timestamp: range.start.getTime() }),
      reading({ id: 'end', timestamp: range.end.getTime() }),
      reading({ id: 'before', timestamp: range.start.getTime() - 1 }),
      reading({ id: 'after', timestamp: range.end.getTime() + 1 }),
    ];
    expect(ids(filterReadings(list, { ...ALL, range }))).toEqual(['start', 'end']);
  });
});
