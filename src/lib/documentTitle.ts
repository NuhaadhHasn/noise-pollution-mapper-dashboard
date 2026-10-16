/**
 * Per-route document titles (ux-14).
 *
 * Pure module. The router component sets `document.title` from this on every
 * route change, so tabs, history and screen readers get a page name.
 */

export const APP_TITLE = 'Noise Mapper Dashboard';

const ROUTE_NAMES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/map': 'Map',
  '/analytics': 'Analytics',
  '/login': 'Sign in',
};

/** 'Dashboard · Noise Mapper' for a known route, 'Page not found' for an unknown path, else the app title. */
export function titleForPath(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const name = ROUTE_NAMES[path];
  if (name) return `${name} \u00b7 Noise Mapper`;
  return path === '/' || path === '' ? APP_TITLE : 'Page not found \u00b7 Noise Mapper';
}
