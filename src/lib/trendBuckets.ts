import {
  format,
  getISOWeek,
  getISOWeekYear,
  startOfDay,
  startOfHour,
  startOfISOWeek,
  startOfMonth,
} from 'date-fns';

export type TimeGranularity = 'hour' | 'day' | 'week' | 'month';

export interface TrendBucket {
  /** Stable group key, also the chart's category value. */
  key: string;
  /** Epoch ms of the start of the bucket. Sort by this, never by the key text. */
  start: number;
}

/**
 * Which trend bucket a date belongs to, in the browser's local time.
 *
 * Weeks are ISO weeks. The key pairs the ISO week-year (not the calendar year)
 * with a zero-padded week number, so 2025-12-29 is '2026-W01' and
 * 2027-01-01 is '2026-W53'.
 */
export function bucketOf(date: Date, granularity: TimeGranularity): TrendBucket {
  switch (granularity) {
    case 'hour':
      return { key: format(date, 'yyyy-MM-dd HH:00'), start: startOfHour(date).getTime() };
    case 'week': {
      const week = String(getISOWeek(date)).padStart(2, '0');
      return { key: `${getISOWeekYear(date)}-W${week}`, start: startOfISOWeek(date).getTime() };
    }
    case 'month':
      return { key: format(date, 'yyyy-MM'), start: startOfMonth(date).getTime() };
    case 'day':
    default:
      return { key: format(date, 'yyyy-MM-dd'), start: startOfDay(date).getTime() };
  }
}

/** '2026-W02' -> 'Week 2, 2026'. A key that is not a week key is returned unchanged. */
export function weekLabel(key: string): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!match) return key;
  return `Week ${Number(match[2])}, ${match[1]}`;
}
