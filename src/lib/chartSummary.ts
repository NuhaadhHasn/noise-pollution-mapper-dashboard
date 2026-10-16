/**
 * Text alternatives for the analytics charts (a11y-3).
 *
 * Pure functions with no React and no Firebase imports, so they run in the
 * node test environment. A chart passes the returned string to its own
 * `aria-label`, so a screen reader hears the numbers instead of an unnamed
 * graphic.
 */

export interface LevelSummary {
  count: number;
  average: number;
  min: number;
  max: number;
}

/** '58.2 dB': one decimal, like the stat cards. */
export function formatDb(value: number): string {
  return `${(Math.round(value * 10) / 10).toFixed(1)} dB`;
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

/**
 * Count, mean, min and max of the finite values, or null when there are none.
 * It loops instead of calling Math.max(...levels), which throws a RangeError on
 * very large arrays.
 */
export function summarizeLevels(levels: readonly number[]): LevelSummary | null {
  let count = 0;
  let sum = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const level of levels) {
    if (typeof level !== 'number' || !Number.isFinite(level)) continue;
    count += 1;
    sum += level;
    if (level < min) min = level;
    if (level > max) max = level;
  }
  return count === 0 ? null : { count, average: sum / count, min, max };
}

export interface TrendChartDescription {
  /** 'hour' | 'day' | 'week' | 'month' */
  granularity: string;
  /** Every reading's dB value, not the per-period averages. */
  levels: readonly number[];
  /** Number of points on the x axis. */
  periods: number;
  /** Display labels of the first and last period. */
  firstPeriod: string;
  lastPeriod: string;
}

export function describeTrendChart(input: TrendChartDescription): string {
  const summary = summarizeLevels(input.levels);
  if (summary === null) {
    return 'Line chart of noise level over time. There are no readings to show.';
  }
  return (
    `Line chart of noise level by ${input.granularity}, from ${input.firstPeriod} to ${input.lastPeriod}. ` +
    `${formatCount(summary.count)} ${plural(summary.count, 'reading')} in ` +
    `${formatCount(input.periods)} ${plural(input.periods, input.granularity)}: ` +
    `average ${formatDb(summary.average)}, lowest ${formatDb(summary.min)}, peak ${formatDb(summary.max)}. ` +
    'Lines: average (solid), maximum (long dashes), minimum (short dashes).'
  );
}

export interface CategoryRow {
  category: string;
  avgDb: number;
  count: number;
}

export function describeCategoryChart(rows: readonly CategoryRow[]): string {
  if (rows.length === 0) {
    return 'Bar chart of average noise level by sound category. There are no categories to show.';
  }
  const items = rows.map(
    (row) =>
      `${row.category} ${formatDb(row.avgDb)} (${formatCount(row.count)} ${plural(row.count, 'reading')})`
  );
  return (
    `Bar chart of average noise level by sound category, ` +
    `${rows.length} ${plural(rows.length, 'category', 'categories')} in the order shown: ${items.join('; ')}.`
  );
}

export interface TypeRow {
  type: string;
  count: number;
  percentage: number;
}

export function describeTypeChart(rows: readonly TypeRow[]): string {
  if (rows.length === 0) {
    return 'Pie chart of sound types. There are no readings to show.';
  }
  const items = rows.map(
    (row) =>
      `${row.type} ${row.percentage}% (${formatCount(row.count)} ${plural(row.count, 'reading')})`
  );
  return `Pie chart of sound types: ${items.join('; ')}.`;
}
