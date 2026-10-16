import { describe, expect, it } from 'vitest';
import {
  buildHeatPoints,
  filterReadings,
  heatIntensity,
  presetRange,
  presetSummary,
} from '@/lib/mapFilters';
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

const ALL: ReadingFilters = { userId: 'u1', showAllUsers: true, preset: 'all' };

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

// Friday 16 Oct 2026, 15:30 local time.
const NOW = new Date(2026, 9, 16, 15, 30);

describe('presetRange', () => {
  it('is null for all time and for an unknown id', () => {
    expect(presetRange('all', NOW)).toBeNull();
    expect(presetRange('bogus' as never, NOW)).toBeNull();
  });

  it('runs from the start of the day N days ago to the end of today (bug-8)', () => {
    const range = presetRange('7d', NOW);
    expect(range?.start.getTime()).toBe(new Date(2026, 9, 9, 0, 0, 0, 0).getTime());
    expect(range?.end.getTime()).toBe(new Date(2026, 9, 16, 23, 59, 59, 999).getTime());
  });

  it('covers 30 and 90 days back', () => {
    expect(presetRange('30d', NOW)?.start.getTime()).toBe(new Date(2026, 8, 16).getTime());
    expect(presetRange('90d', NOW)?.start.getTime()).toBe(new Date(2026, 6, 18).getTime());
  });
});

describe('filterReadings with a date preset', () => {
  const preset = { ...ALL, preset: '7d' as const };

  it('keeps the whole oldest day and drops the day before it', () => {
    const list = [
      reading({ id: 'first-ms', timestamp: new Date(2026, 9, 9, 0, 0, 0, 0).getTime() }),
      reading({ id: 'too-old', timestamp: new Date(2026, 9, 8, 23, 59, 59, 999).getTime() }),
    ];
    expect(ids(filterReadings(list, preset, NOW))).toEqual(['first-ms']);
  });

  it('does not hide a reading that arrives later today (end of today, not click time)', () => {
    const later = reading({ id: 'later', timestamp: new Date(2026, 9, 16, 23, 0).getTime() });
    const tomorrow = reading({ id: 'tomorrow', timestamp: new Date(2026, 9, 17, 0, 0).getTime() });
    expect(ids(filterReadings([later, tomorrow], preset, NOW))).toEqual(['later']);
  });

  it('recomputes the window from the clock it is given, so a later run sees newer readings', () => {
    const newest = reading({ id: 'newest', timestamp: new Date(2026, 9, 20, 9, 0).getTime() });
    expect(filterReadings([newest], preset, NOW)).toEqual([]);
    expect(ids(filterReadings([newest], preset, new Date(2026, 9, 20, 10, 0)))).toEqual(['newest']);
  });

  it('lets the server timestamp decide over the client-clock createdAt (bug-8, part 1 kept)', () => {
    const inWindow = new Date(2026, 9, 12, 12, 0).getTime();
    const outOfWindow = new Date(2026, 8, 1, 12, 0).getTime();
    const list = [
      reading({ id: 'server-in', timestamp: inWindow, createdAt: outOfWindow }),
      reading({ id: 'server-out', timestamp: outOfWindow, createdAt: inWindow }),
      reading({ id: 'fallback', timestamp: null, createdAt: inWindow }),
      reading({ id: 'undated', timestamp: null }),
    ];
    expect(ids(filterReadings(list, preset, NOW))).toEqual(['server-in', 'fallback']);
  });

  it('keeps undated readings for all time', () => {
    const list = [reading({ id: 'undated', timestamp: null })];
    expect(ids(filterReadings(list, ALL, NOW))).toEqual(['undated']);
  });
});

describe('presetSummary', () => {
  it('says all dates for all time', () => {
    expect(presetSummary('all', NOW)).toBe('Showing all dates');
  });

  it('names the window in local dates', () => {
    expect(presetSummary('7d', NOW)).toBe(
      `From ${new Date(2026, 9, 9).toLocaleDateString()} to ${new Date(2026, 9, 16, 23, 59, 59, 999).toLocaleDateString()}`,
    );
  });
});

describe('heatIntensity', () => {
  it('uses the app scale: clamp(dB / 120)', () => {
    expect(heatIntensity(60)).toBe(0.5);
    expect(heatIntensity(120)).toBe(1);
    expect(heatIntensity(150)).toBe(1);
    expect(heatIntensity(-5)).toBe(0);
  });

  it('treats 0 dB as a real reading, not as a default (bug-7)', () => {
    expect(heatIntensity(0)).toBe(0);
  });

  it('returns null for anything that is not a finite number', () => {
    expect(heatIntensity(Number.NaN)).toBeNull();
    expect(heatIntensity(Infinity)).toBeNull();
    expect(heatIntensity('60')).toBeNull();
    expect(heatIntensity(undefined)).toBeNull();
  });
});

describe('buildHeatPoints', () => {
  it('keeps a 0 dB reading at intensity 0', () => {
    expect(buildHeatPoints([reading({ decibelLevel: 0 })])).toEqual([[6.9, 79.86, 0]]);
  });

  it('merges readings at one site into a single point with the mean intensity', () => {
    const points = buildHeatPoints([
      reading({ id: 'a', decibelLevel: 30 }),
      reading({ id: 'b', decibelLevel: 90 }),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0][2]).toBeCloseTo(0.5, 6);
  });

  it('does not let repeat quiet recordings add up: 20 readings of 30 dB stay at 0.25', () => {
    const quiet = Array.from({ length: 20 }, (_, i) => reading({ id: `q${i}`, decibelLevel: 30 }));
    const points = buildHeatPoints(quiet);
    expect(points).toHaveLength(1);
    expect(points[0][2]).toBeCloseTo(0.25, 6);
  });

  it('keeps sites that differ at the 4th decimal apart', () => {
    const points = buildHeatPoints([
      reading({ id: 'a', latitude: 6.9 }),
      reading({ id: 'b', latitude: 6.9005 }),
    ]);
    expect(points).toHaveLength(2);
  });

  it('places a merged point at the mean position of its readings', () => {
    const points = buildHeatPoints([
      reading({ id: 'a', latitude: 6.90001 }),
      reading({ id: 'b', latitude: 6.90003 }),
    ]);
    expect(points).toHaveLength(1);
    expect(points[0][0]).toBeCloseTo(6.90002, 6);
  });

  it('skips readings without a position or a finite dB', () => {
    const points = buildHeatPoints([
      reading({ id: 'a', latitude: undefined }),
      reading({ id: 'b', decibelLevel: Number.NaN }),
      reading({ id: 'c', decibelLevel: 'x' }),
    ]);
    expect(points).toEqual([]);
  });
});
