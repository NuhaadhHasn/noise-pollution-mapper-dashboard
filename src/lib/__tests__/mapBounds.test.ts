import { describe, expect, it } from 'vitest';
import { SRI_LANKA_BOUNDS, isWithinBounds } from '@/lib/mapBounds';

describe('isWithinBounds', () => {
  it('accepts Colombo, Kandy and Jaffna', () => {
    expect(isWithinBounds(6.9271, 79.8612)).toBe(true);
    expect(isWithinBounds(7.2906, 80.6337)).toBe(true);
    expect(isWithinBounds(9.6615, 80.0255)).toBe(true);
  });

  it('includes the edges', () => {
    const [[south, west], [north, east]] = SRI_LANKA_BOUNDS;
    expect(isWithinBounds(south, west)).toBe(true);
    expect(isWithinBounds(north, east)).toBe(true);
  });

  it('rejects positions outside the box', () => {
    expect(isWithinBounds(0, 0)).toBe(false); // null island
    expect(isWithinBounds(37.42, -122.08)).toBe(false); // emulator default
    expect(isWithinBounds(13.08, 80.27)).toBe(false); // Chennai
    expect(isWithinBounds(7.0, 82.01)).toBe(false);
  });

  it('rejects NaN', () => {
    expect(isWithinBounds(Number.NaN, 80)).toBe(false);
  });
});
