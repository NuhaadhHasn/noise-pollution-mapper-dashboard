import { describe, expect, it } from 'vitest';
import {
  authErrorCode,
  passwordResetFailure,
  resetSentMessage,
  signInErrorMessage,
} from '@/lib/authErrors';

// Shaped like a FirebaseError: an Error with a string `code`.
function authError(code: string): Error {
  return Object.assign(new Error(`Firebase: Error (${code}).`), { code });
}

describe('authErrorCode', () => {
  it('reads the code of a Firebase-style error', () => {
    expect(authErrorCode(authError('auth/too-many-requests'))).toBe('auth/too-many-requests');
  });

  it('returns null for anything without a string code', () => {
    expect(authErrorCode(new Error('boom'))).toBeNull();
    expect(authErrorCode({ code: 42 })).toBeNull();
    expect(authErrorCode('auth/invalid-credential')).toBeNull();
    expect(authErrorCode(null)).toBeNull();
    expect(authErrorCode(undefined)).toBeNull();
  });
});

describe('signInErrorMessage (a11y-7)', () => {
  it('never shows the raw SDK text', () => {
    const message = signInErrorMessage(authError('auth/invalid-credential'));
    expect(message).toBe('The email or password is incorrect.');
    expect(message).not.toMatch(/firebase|auth\//i);
  });

  it('gives an unknown email and a wrong password the same message', () => {
    const wrongPassword = signInErrorMessage(authError('auth/wrong-password'));
    expect(signInErrorMessage(authError('auth/user-not-found'))).toBe(wrongPassword);
    expect(signInErrorMessage(authError('auth/invalid-credential'))).toBe(wrongPassword);
  });

  it('explains rate limiting, network failure and disabled accounts', () => {
    expect(signInErrorMessage(authError('auth/too-many-requests'))).toMatch(/too many/i);
    expect(signInErrorMessage(authError('auth/network-request-failed'))).toMatch(/connection/i);
    expect(signInErrorMessage(authError('auth/user-disabled'))).toMatch(/disabled/i);
  });

  it('falls back to a generic message for unknown codes and non-errors', () => {
    expect(signInErrorMessage(authError('auth/internal-error'))).toBe('Sign-in failed. Please try again.');
    expect(signInErrorMessage('oops')).toBe('Sign-in failed. Please try again.');
  });
});

describe('password reset outcomes (a11y-7)', () => {
  it('answers an unknown account exactly like a sent email', () => {
    expect(passwordResetFailure(authError('auth/user-not-found'), 'a@b.lk')).toEqual({
      notice: resetSentMessage('a@b.lk'),
    });
  });

  it('reports a bad address, rate limiting and network failure as errors', () => {
    expect(passwordResetFailure(authError('auth/invalid-email'), 'x')).toEqual({
      error: 'Enter a valid email address.',
    });
    expect(passwordResetFailure(authError('auth/too-many-requests'), 'a@b.lk')).toHaveProperty('error');
    expect(passwordResetFailure(authError('auth/network-request-failed'), 'a@b.lk')).toHaveProperty('error');
    expect(passwordResetFailure(new Error('boom'), 'a@b.lk')).toEqual({
      error: 'Could not send the reset email. Please try again.',
    });
  });

  it('never says whether the account exists', () => {
    expect(resetSentMessage('a@b.lk')).toMatch(/^If an account exists for a@b\.lk,/);
  });
});
