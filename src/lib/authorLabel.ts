/**
 * Contributor label for a reading (priv-2).
 *
 * The Flutter app writes a privacy-safe author label into every
 * `noise_readings.userEmail` (APP `FirebaseService.authorLabel`,
 * `lib/services/firebase_service.dart:30-37`): the Auth display name, or a
 * masked address like `abc***@domain.com`, or 'Anonymous', or 'Deleted User'
 * after account deletion. The dashboard shows that label and never looks up
 * `users/{uid}.email`, which holds the raw address.
 *
 * One legacy path can still store a RAW address: an offline recording queued
 * without a label is uploaded with the auth email
 * (`lib/services/sync_service.dart:308`, priv-6; fixed app-side later).
 * `authorLabel` therefore re-masks anything that still looks like
 * `local@domain` to its first two characters plus `***`.
 *
 * - a label already masked by the app (`abc***@x.com`) is returned unchanged
 * - a display name, 'Anonymous' or 'Deleted User' is returned unchanged
 * - a missing, blank or non-string label becomes 'Anonymous'
 *
 * Pure module: no Firebase import, so it is safe to unit-test (master
 * playbook convention 2.15).
 */

export const ANONYMOUS_LABEL = 'Anonymous';

const RAW_ADDRESS = /^([^\s@]+)@([^\s@]+)$/;
const MASK = '***';
const VISIBLE_CHARS = 2;

export function authorLabel(userEmail?: string | null): string {
  if (typeof userEmail !== 'string') {
    return ANONYMOUS_LABEL;
  }
  const label = userEmail.trim();
  if (label === '') {
    return ANONYMOUS_LABEL;
  }
  const match = RAW_ADDRESS.exec(label);
  if (!match) {
    return label;
  }
  const [, local, domain] = match;
  if (local.endsWith(MASK)) {
    return label;
  }
  return `${local.slice(0, VISIBLE_CHARS)}${MASK}@${domain}`;
}
