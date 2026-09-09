import type { OAuth2Client } from 'google-auth-library';
import { describe, expect, it } from 'vitest';

import { createGoogleVerifier, GoogleVerificationError } from './google.js';

type VerifyIdToken = OAuth2Client['verifyIdToken'];

function clientReturning(payload: unknown): Pick<OAuth2Client, 'verifyIdToken'> {
  return {
    verifyIdToken: (async () => ({ getPayload: () => payload })) as unknown as VerifyIdToken,
  };
}

function clientThrowing(message: string): Pick<OAuth2Client, 'verifyIdToken'> {
  return {
    verifyIdToken: (async () => {
      throw new Error(message);
    }) as unknown as VerifyIdToken,
  };
}

const clientIds = ['client-id.apps.googleusercontent.com'];

describe('google verifier', () => {
  it('returns the identity for a valid payload', async () => {
    const verifier = createGoogleVerifier(
      clientIds,
      clientReturning({
        sub: 'google-123',
        email: 'ada@example.com',
        email_verified: true,
        name: 'Ada Lovelace',
        picture: 'https://example.com/a.png',
      }),
    );

    await expect(verifier.verify('token')).resolves.toEqual({
      sub: 'google-123',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      picture: 'https://example.com/a.png',
    });
  });

  it('falls back to the email when no name is present', async () => {
    const verifier = createGoogleVerifier(
      clientIds,
      clientReturning({ sub: 'g', email: 'x@example.com', email_verified: true }),
    );

    await expect(verifier.verify('token')).resolves.toMatchObject({ name: 'x@example.com' });
  });

  it('rejects a payload without claims', async () => {
    const verifier = createGoogleVerifier(clientIds, clientReturning(undefined));

    await expect(verifier.verify('token')).rejects.toMatchObject({ reason: 'missing_claims' });
  });

  it('rejects an unverified email', async () => {
    const verifier = createGoogleVerifier(
      clientIds,
      clientReturning({ sub: 'g', email: 'x@example.com', email_verified: false }),
    );

    await expect(verifier.verify('token')).rejects.toMatchObject({ reason: 'missing_claims' });
  });

  it('categorizes a wrong-audience failure', async () => {
    const verifier = createGoogleVerifier(
      clientIds,
      clientThrowing('Wrong recipient, payload audience != requiredAudience'),
    );

    await expect(verifier.verify('token')).rejects.toMatchObject({ reason: 'wrong_audience' });
  });

  it('categorizes an expired-token failure', async () => {
    const verifier = createGoogleVerifier(clientIds, clientThrowing('Token used too late'));

    await expect(verifier.verify('token')).rejects.toBeInstanceOf(GoogleVerificationError);
    await expect(verifier.verify('token')).rejects.toMatchObject({ reason: 'expired' });
  });
});
