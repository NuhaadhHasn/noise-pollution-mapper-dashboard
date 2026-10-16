/**
 * Trend-chart bucketing in Sri Lanka time (bug-12).
 *
 * Every reading comes from a phone in Sri Lanka, so a "day" on the chart is a
 * Colombo calendar day, whatever time zone the viewer's browser is in. The
 * wall-clock parts come from Intl.DateTimeFormat with timeZone 'Asia/Colombo',
 * not from the browser's local time. The keys are plain strings built from
 * those parts, and the labels are built from the key text, so no step re-parses
 * a wall-clock string with `new Date(...)` in the browser's zone.
 *
 * Pure module: no React, no Firebase.
 */

/** IANA zone of the readings (UTC+05:30, no daylight saving). */
export const TREND_TIME_ZONE = 'Asia/Colombo';

export type TimeGranularity = 'hour' | 'day' | 'week' | 'month';

export interface TrendBucket {
  /** Stable group key, also the chart's category value. */
  key: string;
  /** Epoch ms of the start of the bucket. Sort by this, never by the key text. */
  start: number;
}

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  /** Zone offset from UTC at this instant, in ms (+19 800 000 for Colombo). */
  offsetMs: number;
}

// One formatter, built once: constructing Intl formatters is the slow part.
const colomboParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TREND_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** The Asia/Colombo calendar fields of an instant. */
export function colomboWallClock(date: Date): WallClock {
  const parts: Record<string, number> = {};
  for (const part of colomboParts.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  // Drop the milliseconds on the instant: the formatter drops them as well.
  const instantSeconds = Math.floor(date.getTime() / 1000) * 1000;
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    offsetMs: wallAsUtc - instantSeconds,
  };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Epoch ms of a Colombo wall-clock time (month 1-based, day may overflow). */
function colomboEpoch(year: number, month: number, day: number, hour: number, offsetMs: number): number {
  return Date.UTC(year, month - 1, day, hour) - offsetMs;
}

/** ISO 8601 week number and week-year of a calendar date. */
function isoWeekOf(year: number, month: number, day: number): { weekYear: number; week: number } {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = date.getUTCDay() || 7; // Monday = 1 ... Sunday = 7
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek); // the Thursday of this week
  const weekYear = date.getUTCFullYear();
  const yearStart = Date.UTC(weekYear, 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return { weekYear, week };
}

/**
 * Which trend bucket a date belongs to, in Asia/Colombo time.
 *
 * Weeks are ISO weeks (Monday start). The key pairs the ISO week-year (not the
 * calendar year) with a zero-padded week number, so 2025-12-29 is '2026-W01'
 * and 2027-01-01 is '2026-W53'.
 */
export function bucketOf(date: Date, granularity: TimeGranularity): TrendBucket {
  const w = colomboWallClock(date);
  const ymd = `${w.year}-${pad2(w.month)}-${pad2(w.day)}`;
  switch (granularity) {
    case 'hour':
      return {
        key: `${ymd} ${pad2(w.hour)}:00`,
        start: colomboEpoch(w.year, w.month, w.day, w.hour, w.offsetMs),
      };
    case 'week': {
      const { weekYear, week } = isoWeekOf(w.year, w.month, w.day);
      const dayOfWeek = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay() || 7;
      return {
        key: `${weekYear}-W${pad2(week)}`,
        start: colomboEpoch(w.year, w.month, w.day - (dayOfWeek - 1), 0, w.offsetMs),
      };
    }
    case 'month':
      return {
        key: `${w.year}-${pad2(w.month)}`,
        start: colomboEpoch(w.year, w.month, 1, 0, w.offsetMs),
      };
    case 'day':
    default:
      return { key: ymd, start: colomboEpoch(w.year, w.month, w.day, 0, w.offsetMs) };
  }
}

/** '2026-W02' -> 'Week 2, 2026'. A key that is not a week key is returned unchanged. */
export function weekLabel(key: string): string {
  const match = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!match) return key;
  return `Week ${Number(match[2])}, ${match[1]}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The axis and tooltip label for a bucket key, built from the key text alone:
 * hour 'Mar 5, 2 PM', day 'Mar 5', week 'Week 10, 2026', month 'Mar 2026'.
 * A key that does not match its granularity is returned unchanged.
 */
export function bucketLabel(key: string, granularity: TimeGranularity): string {
  switch (granularity) {
    case 'week':
      return weekLabel(key);
    case 'month': {
      const m = /^(\d{4})-(\d{2})$/.exec(key);
      return m && MONTHS[Number(m[2]) - 1] ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : key;
    }
    case 'hour': {
      const m = /^\d{4}-(\d{2})-(\d{2}) (\d{2}):00$/.exec(key);
      if (!m || !MONTHS[Number(m[1]) - 1]) return key;
      const hour = Number(m[3]);
      const hour12 = hour % 12 === 0 ? 12 : hour % 12;
      return `${MONTHS[Number(m[1]) - 1]} ${Number(m[2])}, ${hour12} ${hour < 12 ? 'AM' : 'PM'}`;
    }
    case 'day':
    default: {
      const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(key);
      return m && MONTHS[Number(m[1]) - 1] ? `${MONTHS[Number(m[1]) - 1]} ${Number(m[2])}` : key;
    }
  }
}
