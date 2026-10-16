/**
 * Page arithmetic for the readings table (ux-9).
 *
 * Pure module. The requested page is clamped into 1..totalPages, so a shrinking
 * data set (a filter, a re-sync) can never leave the table on a page that no
 * longer exists, and an empty data set is one empty page, never "1/0" or
 * "Showing -9 to 0".
 */

export interface PageInfo {
  totalRows: number;
  /** At least 1, even with no rows. */
  totalPages: number;
  /** The requested page clamped into 1..totalPages. */
  page: number;
  /** 0-based index of the first row on the page (slice start). */
  sliceStart: number;
  /** 0-based exclusive end index (slice end). */
  sliceEnd: number;
  /** 1-based number of the first row shown; 0 when there are no rows. */
  from: number;
  /** 1-based number of the last row shown; 0 when there are no rows. */
  to: number;
}

function wholeNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.floor(value) : fallback;
}

export function paginate(totalRows: number, requestedPage: number, pageSize: number): PageInfo {
  const rows = Math.max(0, wholeNumber(totalRows, 0));
  const size = Math.max(1, wholeNumber(pageSize, 10));
  const totalPages = Math.max(1, Math.ceil(rows / size));
  const page = Math.min(Math.max(1, wholeNumber(requestedPage, 1)), totalPages);
  const sliceStart = Math.min((page - 1) * size, rows);
  const sliceEnd = Math.min(sliceStart + size, rows);
  return {
    totalRows: rows,
    totalPages,
    page,
    sliceStart,
    sliceEnd,
    from: rows === 0 ? 0 : sliceStart + 1,
    to: sliceEnd,
  };
}
