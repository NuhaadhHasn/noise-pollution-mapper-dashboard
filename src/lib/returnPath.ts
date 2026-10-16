/**
 * The page to return to after sign-in (ux-8).
 *
 * ProtectedRoute sends a signed-out visitor to /login with the page they asked
 * for in router location state. Location state is only same-origin data the app
 * itself set, but it can be forged (a crafted history entry, an old tab), so the
 * value is checked here before it is ever passed to navigate(): only an
 * in-app absolute path is accepted, so the login page can never be turned into
 * an open redirect.
 *
 * Pure module: no router import, unit-tested directly.
 */

export const DEFAULT_RETURN_PATH = '/dashboard';

// A throwaway origin used only to parse the value; never leaves this module.
const PARSE_BASE = 'http://return-path.invalid';

/**
 * The path + query + hash to navigate to, or `fallback` when `value` is not a
 * safe internal path. Rejected: non-strings, anything not starting with a
 * single "/", protocol-relative ("//host"), backslash or control-character
 * tricks, absolute URLs, and /login itself (it would loop).
 */
export function safeReturnPath(value: unknown, fallback: string = DEFAULT_RETURN_PATH): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  // Backslashes and control characters (tab, CR, LF ...) are stripped or turned
  // into "/" by URL parsers, which is how "/\evil.com" and "/\t/evil.com" escape.
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(value, PARSE_BASE);
  } catch {
    return fallback;
  }
  if (parsed.origin !== PARSE_BASE) return fallback;
  if (parsed.pathname === '/login' || parsed.pathname.startsWith('/login/')) return fallback;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
