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

  it('uses the app title for the root', () => {
    expect(titleForPath('/')).toBe(APP_TITLE);
    expect(titleForPath('')).toBe(APP_TITLE);
  });

  it('says so for an unknown path (ux-8)', () => {
    expect(titleForPath('/nope')).toBe('Page not found · Noise Mapper');
    expect(titleForPath('/map/extra')).toBe('Page not found · Noise Mapper');
  });
});
