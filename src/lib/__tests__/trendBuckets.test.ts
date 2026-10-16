import { describe, expect, it } from 'vitest';
import { bucketOf, weekLabel } from '@/lib/trendBuckets';

// Local-time dates (month is 1-based here). Noon keeps every case away from
// midnight and DST edges, whatever time zone the test runs in.
const at = (year: number, month: number, day: number, hour = 12) => new Date(year, month - 1, day, hour);

describe('bucketOf week', () => {
  it('zero-pads the week number', () => {
    expect(bucketOf(at(2026, 1, 7), 'week').key).toBe('2026-W02');
    expect(bucketOf(at(2026, 3, 4), 'week').key).toBe('2026-W10');
  });

  it('orders W2 before W10 by bucket start, and the padded keys agree', () => {
    const w2 = bucketOf(at(2026, 1, 7), 'week');
    const w10 = bucketOf(at(2026, 3, 4), 'week');
    expect(w2.start).toBeLessThan(w10.start);
    expect(w2.key < w10.key).toBe(true);
  });

  it('puts 2025-12-29 in ISO week-year 2026, week 01', () => {
    expect(bucketOf(at(2025, 12, 29), 'week').key).toBe('2026-W01');
    expect(bucketOf(at(2025, 12, 31), 'week').key).toBe('2026-W01');
    expect(bucketOf(at(2026, 1, 1), 'week').key).toBe('2026-W01');
  });

  it('puts 2027-01-01 in week 53 of 2026', () => {
    expect(bucketOf(at(2026, 12, 31), 'week').key).toBe('2026-W53');
    expect(bucketOf(at(2027, 1, 1), 'week').key).toBe('2026-W53');
  });

  it('puts 2024-12-30 in week 01 of 2025', () => {
    expect(bucketOf(at(2024, 12, 30), 'week').key).toBe('2025-W01');
  });

  it('keeps Monday to Sunday of one ISO week in one bucket', () => {
    const monday = bucketOf(at(2026, 3, 2, 0), 'week');
    const sunday = bucketOf(at(2026, 3, 8, 23), 'week');
    expect(monday.key).toBe('2026-W10');
    expect(sunday.key).toBe('2026-W10');
    expect(sunday.start).toBe(monday.start);
  });

  it('starts the bucket on Monday at local midnight', () => {
    expect(bucketOf(at(2026, 3, 4), 'week').start).toBe(at(2026, 3, 2, 0).getTime());
  });

  it('orders weeks across a year boundary by start', () => {
    const last = bucketOf(at(2025, 12, 24), 'week'); // 2025-W52
    const first = bucketOf(at(2025, 12, 30), 'week'); // 2026-W01
    expect(last.key).toBe('2025-W52');
    expect(first.key).toBe('2026-W01');
    expect(last.start).toBeLessThan(first.start);
  });
});

describe('bucketOf other granularities', () => {
  it('formats hour, day and month keys as before', () => {
    const date = new Date(2026, 2, 5, 14, 37);
    expect(bucketOf(date, 'hour').key).toBe('2026-03-05 14:00');
    expect(bucketOf(date, 'day').key).toBe('2026-03-05');
    expect(bucketOf(date, 'month').key).toBe('2026-03');
  });

  it('starts each bucket at the beginning of its period', () => {
    const date = new Date(2026, 2, 5, 14, 37);
    expect(bucketOf(date, 'hour').start).toBe(new Date(2026, 2, 5, 14).getTime());
    expect(bucketOf(date, 'day').start).toBe(new Date(2026, 2, 5).getTime());
    expect(bucketOf(date, 'month').start).toBe(new Date(2026, 2, 1).getTime());
  });
});

describe('weekLabel', () => {
  it('includes the year and drops the padding', () => {
    expect(weekLabel('2026-W02')).toBe('Week 2, 2026');
    expect(weekLabel('2026-W53')).toBe('Week 53, 2026');
  });

  it('returns a key that is not a week key unchanged', () => {
    expect(weekLabel('2026-03-05')).toBe('2026-03-05');
    expect(weekLabel('')).toBe('');
  });
});
