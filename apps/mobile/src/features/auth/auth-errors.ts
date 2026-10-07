import { ApiError, NetworkError } from '@/lib/api/errors';

/**
 * What the signed-out screens say when a request fails
 * (`docs/specs/password-sign-in.md`). The server answers the same whether an
 * address has an account or not; these messages keep it that way.
 */
export function authErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'Could not reach Ardoise. Check your connection and try again.';
  }
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return 'Too many attempts. Please wait a little and try again.';
    }
    switch (error.code) {
      case 'invalid_credentials':
        return 'Incorrect e-mail or password.';
      case 'invalid_code':
        return 'This code is not valid. Check it, or ask for a new one.';
      case 'invalid_password':
        return 'Your current password is not right.';
      case 'account_conflict':
        return 'This address is already used by another Google account.';
    }
  }
  return 'Something went wrong. Please try again.';
}
