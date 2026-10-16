import { describe, expect, it } from 'vitest';
import { FIREBASE_ENV_NAMES, findMissingFirebaseEnv } from '@/lib/firebaseEnv';

function completeEnv(): Record<string, unknown> {
  return Object.fromEntries(FIREBASE_ENV_NAMES.map((name) => [name, 'some-value']));
}

describe('findMissingFirebaseEnv', () => {
  it('names the six variables the app reads', () => {
    expect([...FIREBASE_ENV_NAMES]).toEqual([
      'VITE_FIREBASE_API_KEY',
      'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_PROJECT_ID',
      'VITE_FIREBASE_STORAGE_BUCKET',
      'VITE_FIREBASE_MESSAGING_SENDER_ID',
      'VITE_FIREBASE_APP_ID',
    ]);
  });

  it('returns nothing when every variable is set', () => {
    expect(findMissingFirebaseEnv(completeEnv())).toEqual([]);
  });

  it('lists every name when the environment is empty', () => {
    expect(findMissingFirebaseEnv({})).toEqual([...FIREBASE_ENV_NAMES]);
  });

  it('lists a variable that is absent', () => {
    const env = completeEnv();
    delete env.VITE_FIREBASE_APP_ID;
    expect(findMissingFirebaseEnv(env)).toEqual(['VITE_FIREBASE_APP_ID']);
  });

  it('treats empty, whitespace-only, undefined and non-string values as missing', () => {
    const env = {
      ...completeEnv(),
      VITE_FIREBASE_API_KEY: '',
      VITE_FIREBASE_AUTH_DOMAIN: '   ',
      VITE_FIREBASE_PROJECT_ID: undefined,
      VITE_FIREBASE_STORAGE_BUCKET: null,
      VITE_FIREBASE_MESSAGING_SENDER_ID: 123,
    };
    expect(findMissingFirebaseEnv(env)).toEqual([
      'VITE_FIREBASE_API_KEY',
      'VITE_FIREBASE_AUTH_DOMAIN',
      'VITE_FIREBASE_PROJECT_ID',
      'VITE_FIREBASE_STORAGE_BUCKET',
      'VITE_FIREBASE_MESSAGING_SENDER_ID',
    ]);
  });

  it('returns only names, never values', () => {
    const env = { ...completeEnv(), VITE_FIREBASE_API_KEY: '' };
    expect(JSON.stringify(findMissingFirebaseEnv(env))).not.toContain('some-value');
  });

  it('ignores unrelated variables', () => {
    expect(findMissingFirebaseEnv({ ...completeEnv(), VITE_APP_NAME: '' })).toEqual([]);
  });
});
