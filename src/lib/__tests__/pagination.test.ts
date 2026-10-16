import { describe, expect, it } from 'vitest';
import { paginate } from '../pagination';

describe('paginate', () => {
  it('handles zero rows as one empty page, never 1/0 or a negative range', () => {
    expect(paginate(0, 1, 10)).toEqual({
      totalRows: 0,
      totalPages: 1,
      page: 1,
      sliceStart: 0,
      sliceEnd: 0,
      from: 0,
      to: 0,
    });
  });

  it('clamps a page beyond the end when rows shrink (the old "Showing -9 to 0")', () => {
    const info = paginate(0, 2, 10);
    expect(info.page).toBe(1);
    expect(info.from).toBe(0);
    expect(info.to).toBe(0);
    const shrunk = paginate(25, 9, 10);
    expect(shrunk.page).toBe(3);
    expect(shrunk.from).toBe(21);
    expect(shrunk.to).toBe(25);
  });

  it('clamps page 0, negative and non-finite pages up to 1', () => {
    expect(paginate(50, 0, 10).page).toBe(1);
    expect(paginate(50, -4, 10).page).toBe(1);
    expect(paginate(50, Number.NaN, 10).page).toBe(1);
  });

  it('reports the first page of a full table', () => {
    expect(paginate(95, 1, 10)).toMatchObject({
      totalPages: 10,
      page: 1,
      sliceStart: 0,
      sliceEnd: 10,
      from: 1,
      to: 10,
    });
  });

  it('shows a short last page', () => {
    expect(paginate(95, 10, 10)).toMatchObject({ page: 10, sliceStart: 90, sliceEnd: 95, from: 91, to: 95 });
  });

  it('fits an exact multiple into whole pages', () => {
    expect(paginate(100, 10, 10)).toMatchObject({ totalPages: 10, from: 91, to: 100 });
    expect(paginate(100, 11, 10).page).toBe(10);
  });

  it('shows a single row on one page', () => {
    expect(paginate(1, 1, 10)).toMatchObject({ totalPages: 1, from: 1, to: 1 });
  });

  it('survives a bad page size', () => {
    expect(paginate(5, 1, 0).totalPages).toBe(5);
    expect(paginate(5, 1, Number.NaN).totalPages).toBe(1);
  });

  it('treats a negative or non-finite row count as zero', () => {
    expect(paginate(-3, 1, 10).totalRows).toBe(0);
    expect(paginate(Number.NaN, 1, 10).totalPages).toBe(1);
  });
});
