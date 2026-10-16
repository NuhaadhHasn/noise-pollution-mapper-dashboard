import { describe, expect, it } from 'vitest';
import { computeReadingStats } from '../readingStats';

const r = (userId: string, decibelLevel: unknown) => ({ userId, decibelLevel });

describe('computeReadingStats', () => {
  it('returns nulls, not zeros, when there are no readings', () => {
    expect(computeReadingStats([])).toEqual({
      totalReadings: 0,
      measuredReadings: 0,
      averageDb: null,
      peakDb: null,
      contributors: 0,
    });
  });

  it('uses the arithmetic mean and the maximum, rounded to one decimal', () => {
    const stats = computeReadingStats([r('a', 50), r('b', 60), r('a', 71.26)]);
    expect(stats.averageDb).toBe(60.4); // (50 + 60 + 71.26) / 3 = 60.42
    expect(stats.peakDb).toBe(71.3);
    expect(stats.totalReadings).toBe(3);
    expect(stats.contributors).toBe(2);
  });

  it('keeps the arithmetic mean, not the energy mean', () => {
    // Leq of 40 and 80 dB is about 77; the arithmetic mean is 60.
    expect(computeReadingStats([r('a', 40), r('a', 80)]).averageDb).toBe(60);
  });

  it('leaves missing and non-finite dB out of every statistic', () => {
    const stats = computeReadingStats([
      r('a', 60),
      r('a', undefined),
      r('a', null),
      r('a', Number.NaN),
      r('a', Number.POSITIVE_INFINITY),
      r('a', '70'),
      r('a', 80),
    ]);
    expect(stats.averageDb).toBe(70); // never (60 + 0 + 0 + 80) / 4
    expect(stats.peakDb).toBe(80);
    expect(stats.measuredReadings).toBe(2);
    expect(stats.totalReadings).toBe(7);
  });

  it('reports null when no reading has a usable dB', () => {
    const stats = computeReadingStats([r('a', undefined), r('b', Number.NaN)]);
    expect(stats.averageDb).toBeNull();
    expect(stats.peakDb).toBeNull();
    expect(stats.contributors).toBe(2);
  });

  it('handles negative dB (a peak below zero is not clamped to 0)', () => {
    expect(computeReadingStats([r('a', -5), r('a', -2)]).peakDb).toBe(-2);
  });

  it('does not overflow the call stack on a very large array', () => {
    const big = Array.from({ length: 300_000 }, (_, i) => r(`u${i % 7}`, i % 100));
    const stats = computeReadingStats(big);
    expect(stats.peakDb).toBe(99);
    expect(stats.contributors).toBe(7);
  });

  it('ignores empty or non-string userIds when counting contributors', () => {
    const stats = computeReadingStats([r('', 50), { userId: undefined, decibelLevel: 50 }, r('x', 50)]);
    expect(stats.contributors).toBe(1);
  });
});
