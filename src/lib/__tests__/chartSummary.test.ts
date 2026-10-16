import { describe, expect, it } from 'vitest';
import {
  describeCategoryChart,
  describeTrendChart,
  describeTypeChart,
  formatDb,
  summarizeLevels,
} from '../chartSummary';

describe('formatDb', () => {
  it('rounds to one decimal and pads', () => {
    expect(formatDb(58.24)).toBe('58.2 dB');
    expect(formatDb(96)).toBe('96.0 dB');
  });
});

describe('summarizeLevels', () => {
  it('returns null when there is nothing usable', () => {
    expect(summarizeLevels([])).toBeNull();
    expect(summarizeLevels([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
  });

  it('summarises the finite values and skips the rest', () => {
    expect(summarizeLevels([40, 60, Number.NaN, 80])).toEqual({
      count: 3,
      average: 60,
      min: 40,
      max: 80,
    });
  });

  it('copes with very large inputs (no argument spreading)', () => {
    const levels = Array.from({ length: 200_000 }, (_, i) => i % 100);
    const summary = summarizeLevels(levels);
    expect(summary?.count).toBe(200_000);
    expect(summary?.max).toBe(99);
    expect(summary?.min).toBe(0);
  });
});

describe('describeTrendChart', () => {
  it('states the range, the count and the three levels', () => {
    const text = describeTrendChart({
      granularity: 'day',
      levels: [50, 60, 70],
      periods: 2,
      firstPeriod: 'Feb 14',
      lastPeriod: 'Feb 15',
    });
    expect(text).toContain('Line chart of noise level by day, from Feb 14 to Feb 15');
    expect(text).toContain('3 readings in 2 days');
    expect(text).toContain('average 60.0 dB');
    expect(text).toContain('lowest 50.0 dB');
    expect(text).toContain('peak 70.0 dB');
    expect(text).toContain('maximum (long dashes)');
  });

  it('uses singular nouns for one reading in one period', () => {
    const text = describeTrendChart({
      granularity: 'hour',
      levels: [42],
      periods: 1,
      firstPeriod: 'Feb 14, 9 AM',
      lastPeriod: 'Feb 14, 9 AM',
    });
    expect(text).toContain('1 reading in 1 hour');
  });

  it('says so when there are no readings', () => {
    const text = describeTrendChart({
      granularity: 'day',
      levels: [],
      periods: 0,
      firstPeriod: '',
      lastPeriod: '',
    });
    expect(text).toContain('no readings');
  });
});

describe('describeCategoryChart', () => {
  it('lists every category with its average and count', () => {
    const text = describeCategoryChart([
      { category: 'Traffic', avgDb: 78.2, count: 25 },
      { category: 'Quiet', avgDb: 31, count: 1 },
    ]);
    expect(text).toContain('2 categories');
    expect(text).toContain('Traffic 78.2 dB (25 readings)');
    expect(text).toContain('Quiet 31.0 dB (1 reading)');
  });

  it('handles an empty list', () => {
    expect(describeCategoryChart([])).toContain('no categories');
  });
});

describe('describeTypeChart', () => {
  it('lists each type with its share and count', () => {
    const text = describeTypeChart([
      { type: 'Ambient', count: 595, percentage: 86 },
      { type: 'Pollution', count: 96, percentage: 14 },
    ]);
    expect(text).toBe(
      'Pie chart of sound types: Ambient 86% (595 readings); Pollution 14% (96 readings).'
    );
  });
});
