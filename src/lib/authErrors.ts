/**
 * Plain-language Firebase Auth messages for the login page (a11y-7).
 *
 * A pure module with no Firebase import, so it is unit-tested without the SDK.
 * It reads only the stable `code` of a FirebaseError (for example
 * 'auth/invalid-credential'), never the raw SDK message.
 */

const NETWORK_MESSAGE =
  'Could not reach the sign-in service. Check your connection and try again.';

/** The Firebase Auth error code of `err`, or null when it has none. */
export function authErrorCode(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const { code } = err as { code?: unknown };
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/**
 * The message for a failed sign-in. An unknown email and a wrong password get
 * the same text, so the form never reveals which accounts exist.
 */
export function signInErrorMessage(err: unknown): string {
  switch (authErrorCode(err)) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'The email or password is incorrect.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many sign-in attempts. Wait a few minutes, or reset your password, then try again.';
    case 'auth/network-request-failed':
      return NETWORK_MESSAGE;
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact the project administrator.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}

/** Shown after a reset request, whether or not an account exists for `address`. */
export function resetSentMessage(address: string): string {
  return `If an account exists for ${address}, a password reset link is on its way. Check your inbox and spam folder.`;
}

/**
 * What to show when sendPasswordResetEmail fails. 'auth/user-not-found' (sent
 * by projects without email-enumeration protection) is answered exactly like
 * a success, so the reset form does not reveal which accounts exist either.
 */
export function passwordResetFailure(
  err: unknown,
  address: string,
): { notice: string } | { error: string } {
  switch (authErrorCode(err)) {
    case 'auth/user-not-found':
      return { notice: resetSentMessage(address) };
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return { error: 'Enter a valid email address.' };
    case 'auth/too-many-requests':
      return { error: 'Too many requests. Wait a few minutes, then try again.' };
    case 'auth/network-request-failed':
      return { error: NETWORK_MESSAGE };
    default:
      return { error: 'Could not send the reset email. Please try again.' };
  }
}
