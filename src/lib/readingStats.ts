/**
 * Headline statistics for the stat cards (bug-10).
 *
 * Pure module (no React, no Firebase), so it runs in the node test
 * environment. A dB value that is missing or not finite is left out of every
 * statistic; it is never counted as 0. Min and max come from a loop, never
 * from Math.max(...array), which throws a RangeError on very large arrays.
 *
 * The average is the plain arithmetic mean, the same definition the mobile
 * app's analytics screen uses. It is not the energy-equivalent level (Leq).
 */

import { summarizeLevels } from '@/lib/chartSummary';

export interface ReadingStats {
  /** Every reading, including ones with no usable dB. */
  totalReadings: number;
  /** Readings that contributed to the dB statistics. */
  measuredReadings: number;
  /** Arithmetic mean of the finite dB values, one decimal; null when there are none. */
  averageDb: number | null;
  /** Loudest finite dB value, one decimal; null when there are none. */
  peakDb: number | null;
  /** Distinct non-empty userIds. */
  contributors: number;
}

export interface StatsInput {
  userId?: unknown;
  decibelLevel?: unknown;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeReadingStats(readings: readonly StatsInput[]): ReadingStats {
  const levels: number[] = [];
  const users = new Set<string>();
  for (const reading of readings) {
    if (typeof reading.decibelLevel === 'number' && Number.isFinite(reading.decibelLevel)) {
      levels.push(reading.decibelLevel);
    }
    if (typeof reading.userId === 'string' && reading.userId !== '') {
      users.add(reading.userId);
    }
  }
  const summary = summarizeLevels(levels);
  return {
    totalReadings: readings.length,
    measuredReadings: summary?.count ?? 0,
    averageDb: summary ? round1(summary.average) : null,
    peakDb: summary ? round1(summary.max) : null,
    contributors: users.size,
  };
}
