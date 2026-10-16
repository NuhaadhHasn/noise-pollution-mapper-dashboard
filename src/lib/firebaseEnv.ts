/**
 * Startup check for the Firebase web config (build-3).
 *
 * Vite inlines VITE_* variables at BUILD time. A build made without them still
 * succeeds, and the app then dies at import (firebase/auth throws
 * auth/invalid-api-key) before React renders anything, leaving a blank page.
 * main.tsx calls this first and shows ConfigErrorPage instead.
 *
 * Only variable NAMES ever leave this module; values are never returned,
 * logged or rendered (they are public web config, but there is no reason to
 * print them). findMissingFirebaseEnv is pure, so it is unit-tested directly.
 */

/** The six variables src/config/firebase.ts reads. */
export const FIREBASE_ENV_NAMES = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

export type FirebaseEnvName = (typeof FIREBASE_ENV_NAMES)[number];

/**
 * The names (in the order above) whose value is missing, not a string, or only
 * whitespace. An empty list means the config is complete.
 */
export function findMissingFirebaseEnv(env: Readonly<Record<string, unknown>>): FirebaseEnvName[] {
  return FIREBASE_ENV_NAMES.filter((name) => {
    const value = env[name];
    return typeof value !== 'string' || value.trim() === '';
  });
}

/**
 * The six variables as the running build sees them. Each is read by its full
 * name, which is what lets Vite inline it; only these six go into the bundle
 * from here (not the whole import.meta.env object).
 */
export function currentFirebaseEnv(): Record<FirebaseEnvName, unknown> {
  return {
    VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}
