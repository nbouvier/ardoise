import {
  GoogleVerificationError,
  type GoogleIdentity,
  type GoogleVerifier,
} from '../features/auth/google.js';

/**
 * A Google verifier stub for tests. `verify` resolves the identity registered
 * for the given token, or rejects with a `GoogleVerificationError` for unknown
 * tokens (simulating Google rejecting an invalid ID token).
 */
export function fakeGoogleVerifier(
  identitiesByToken: Record<string, Partial<GoogleIdentity> & { sub: string }>,
): GoogleVerifier {
  return {
    async verify(idToken) {
      const identity = identitiesByToken[idToken];
      if (!identity) {
        throw new GoogleVerificationError('malformed', 'unknown test token');
      }
      return {
        sub: identity.sub,
        email: identity.email ?? `${identity.sub}@example.com`,
        name: identity.name ?? 'Test User',
        picture: identity.picture ?? null,
      };
    },
  };
}
