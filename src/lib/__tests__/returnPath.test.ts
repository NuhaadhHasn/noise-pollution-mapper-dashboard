import { describe, expect, it } from 'vitest';
import { safeReturnPath } from '@/lib/returnPath';

describe('safeReturnPath', () => {
  it('accepts an internal path, keeping its query and hash', () => {
    expect(safeReturnPath('/analytics')).toBe('/analytics');
    expect(safeReturnPath('/map?q=galle#top')).toBe('/map?q=galle#top');
  });

  it('falls back for a missing or non-string value', () => {
    expect(safeReturnPath(undefined)).toBe('/dashboard');
    expect(safeReturnPath(null)).toBe('/dashboard');
    expect(safeReturnPath(42)).toBe('/dashboard');
    expect(safeReturnPath({ pathname: '/map' })).toBe('/dashboard');
    expect(safeReturnPath('')).toBe('/dashboard');
  });

  it('rejects absolute and protocol-relative URLs (no open redirect)', () => {
    expect(safeReturnPath('https://evil.example/phish')).toBe('/dashboard');
    expect(safeReturnPath('http://evil.example')).toBe('/dashboard');
    expect(safeReturnPath('//evil.example/phish')).toBe('/dashboard');
    expect(safeReturnPath('javascript:alert(1)')).toBe('/dashboard');
    expect(safeReturnPath('analytics')).toBe('/dashboard');
  });

  it('rejects backslash and control-character tricks', () => {
    expect(safeReturnPath('/\\evil.example')).toBe('/dashboard');
    expect(safeReturnPath('/\\/evil.example')).toBe('/dashboard');
    expect(safeReturnPath('/\t/evil.example')).toBe('/dashboard');
    expect(safeReturnPath('/\n/evil.example')).toBe('/dashboard');
    expect(safeReturnPath('/\r/evil.example')).toBe('/dashboard');
  });

  it('never returns to /login, which would loop', () => {
    expect(safeReturnPath('/login')).toBe('/dashboard');
    expect(safeReturnPath('/login?x=1')).toBe('/dashboard');
    expect(safeReturnPath('/login/')).toBe('/dashboard');
  });

  it('uses the caller\'s fallback', () => {
    expect(safeReturnPath('//evil.example', '/map')).toBe('/map');
  });
});
