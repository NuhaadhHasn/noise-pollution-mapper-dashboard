import { describe, expect, it } from 'vitest';
import { APP_TITLE, titleForPath } from '../documentTitle';

describe('titleForPath', () => {
  it('names each route', () => {
    expect(titleForPath('/dashboard')).toBe('Dashboard \u00b7 Noise Mapper');
    expect(titleForPath('/map')).toBe('Map \u00b7 Noise Mapper');
    expect(titleForPath('/analytics')).toBe('Analytics \u00b7 Noise Mapper');
    expect(titleForPath('/login')).toBe('Sign in \u00b7 Noise Mapper');
  });

  it('ignores a trailing slash', () => {
    expect(titleForPath('/map/')).toBe('Map \u00b7 Noise Mapper');
  });

  it('falls back to the app title for the root and unknown paths', () => {
    expect(titleForPath('/')).toBe(APP_TITLE);
    expect(titleForPath('/nope')).toBe(APP_TITLE);
    expect(titleForPath('')).toBe(APP_TITLE);
  });
});
