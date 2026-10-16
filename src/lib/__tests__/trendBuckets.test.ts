import { describe, expect, it } from 'vitest';
import { bucketLabel, bucketOf, colomboWallClock, weekLabel } from '@/lib/trendBuckets';

// Colombo is UTC+05:30 all year (no daylight saving). `at` builds the instant
// of a Colombo wall-clock time from explicit UTC math, so every case gives the
// same result whatever time zone the test machine is set to.
const OFFSET_MS = 5.5 * 3_600_000;
const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(Date.UTC(year, month - 1, day, hour, minute) - OFFSET_MS);

describe('colomboWallClock', () => {
  it('reads Asia/Colombo wall-clock fields from a UTC instant', () => {
    const w = colomboWallClock(new Date('2026-03-04T20:00:00Z'));
    expect([w.year, w.month, w.day, w.hour]).toEqual([2026, 3, 5, 1]);
    expect(w.offsetMs).toBe(OFFSET_MS);
  });

  it('is independent of the machine time zone: the offset is always +05:30', () => {
    expect(colomboWallClock(new Date('2026-07-01T00:00:00Z')).offsetMs).toBe(OFFSET_MS);
    expect(colomboWallClock(new Date('2026-12-31T23:59:59.999Z')).offsetMs).toBe(OFFSET_MS);
  });
});

describe('bucketOf near Colombo midnight (bug-12)', () => {
  it('puts 18:29 UTC on 5 Mar in 5 Mar, and 18:30 UTC in 6 Mar', () => {
    expect(bucketOf(new Date('2026-03-05T18:29:59Z'), 'day').key).toBe('2026-03-05');
    expect(bucketOf(new Date('2026-03-05T18:30:00Z'), 'day').key).toBe('2026-03-06');
  });

  it('puts 23:59 Colombo and 00:00 Colombo in different days', () => {
    const late = bucketOf(at(2026, 3, 5, 23, 59), 'day');
    const early = bucketOf(at(2026, 3, 6, 0, 0), 'day');
    expect(late.key).toBe('2026-03-05');
    expect(early.key).toBe('2026-03-06');
    expect(early.start - late.start).toBe(86_400_000);
  });

  it('starts a day at 00:00 Colombo, which is 18:30 UTC the day before', () => {
    expect(bucketOf(at(2026, 3, 5, 9), 'day').start).toBe(Date.parse('2026-03-04T18:30:00Z'));
  });

  it('rolls the month at Colombo midnight, not UTC midnight', () => {
    // 2026-03-31T19:00Z is 2026-04-01 00:30 in Colombo.
    expect(bucketOf(new Date('2026-03-31T19:00:00Z'), 'month').key).toBe('2026-04');
    expect(bucketOf(new Date('2026-03-31T18:00:00Z'), 'month').key).toBe('2026-03');
  });

  it('rolls the year at Colombo midnight', () => {
    expect(bucketOf(new Date('2025-12-31T18:30:00Z'), 'day').key).toBe('2026-01-01');
    expect(bucketOf(new Date('2025-12-31T18:29:00Z'), 'day').key).toBe('2025-12-31');
  });

  it('rolls the ISO week at Colombo midnight on Monday', () => {
    // Sunday 8 Mar 2026 23:59 Colombo -> W10; Monday 9 Mar 00:00 -> W11.
    expect(bucketOf(at(2026, 3, 8, 23, 59), 'week').key).toBe('2026-W10');
    expect(bucketOf(at(2026, 3, 9, 0, 0), 'week').key).toBe('2026-W11');
    // The same boundary in UTC is 18:30 on Sunday.
    expect(bucketOf(new Date('2026-03-08T18:29:00Z'), 'week').key).toBe('2026-W10');
    expect(bucketOf(new Date('2026-03-08T18:30:00Z'), 'week').key).toBe('2026-W11');
  });
});

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

  it('starts the bucket on Monday at Colombo midnight', () => {
    expect(bucketOf(at(2026, 3, 4), 'week').start).toBe(at(2026, 3, 2, 0).getTime());
  });

  it('orders weeks across a year boundary by start', () => {
    const last = bucketOf(at(2025, 12, 24), 'week'); // 2025-W52
    const first = bucketOf(at(2025, 12, 30), 'week'); // 2026-W01
    expect(last.key).toBe('2025-W52');
    expect(first.key).toBe('2026-W01');
    expect(last.start).toBeLessThan(first.start);
  });

  it('starts a week that begins in the previous month on the right day', () => {
    // Wed 1 Apr 2026 is in the week that starts Mon 30 Mar.
    expect(bucketOf(at(2026, 4, 1), 'week').start).toBe(at(2026, 3, 30, 0).getTime());
  });
});

describe('bucketOf other granularities', () => {
  it('formats hour, day and month keys in Colombo time', () => {
    const date = at(2026, 3, 5, 14, 37);
    expect(bucketOf(date, 'hour').key).toBe('2026-03-05 14:00');
    expect(bucketOf(date, 'day').key).toBe('2026-03-05');
    expect(bucketOf(date, 'month').key).toBe('2026-03');
  });

  it('starts each bucket at the beginning of its period', () => {
    const date = at(2026, 3, 5, 14, 37);
    expect(bucketOf(date, 'hour').start).toBe(at(2026, 3, 5, 14).getTime());
    expect(bucketOf(date, 'day').start).toBe(at(2026, 3, 5, 0).getTime());
    expect(bucketOf(date, 'month').start).toBe(at(2026, 3, 1, 0).getTime());
  });

  it('starts the hour bucket on the half-hour offset, not on a UTC hour', () => {
    // 2026-03-05T09:15Z is 14:45 Colombo -> the 14:00 Colombo bucket (08:30Z).
    const b = bucketOf(new Date('2026-03-05T09:15:00Z'), 'hour');
    expect(b.key).toBe('2026-03-05 14:00');
    expect(b.start).toBe(Date.parse('2026-03-05T08:30:00Z'));
  });

  it('handles the 00:00 hour', () => {
    expect(bucketOf(at(2026, 3, 5, 0, 5), 'hour').key).toBe('2026-03-05 00:00');
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

describe('bucketLabel', () => {
  it('labels each granularity from the key text', () => {
    expect(bucketLabel('2026-03-05 14:00', 'hour')).toBe('Mar 5, 2 PM');
    expect(bucketLabel('2026-03-05 00:00', 'hour')).toBe('Mar 5, 12 AM');
    expect(bucketLabel('2026-03-05 12:00', 'hour')).toBe('Mar 5, 12 PM');
    expect(bucketLabel('2026-03-05', 'day')).toBe('Mar 5');
    expect(bucketLabel('2026-W10', 'week')).toBe('Week 10, 2026');
    expect(bucketLabel('2026-03', 'month')).toBe('Mar 2026');
  });

  it('returns a malformed key unchanged', () => {
    expect(bucketLabel('nonsense', 'day')).toBe('nonsense');
    expect(bucketLabel('2026-13', 'month')).toBe('2026-13');
  });
});
