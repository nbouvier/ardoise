import { OAuth2Client } from 'google-auth-library';

import { env } from '../../config/env.js';

/** The subset of a verified Google identity SplitCount consumes. */
export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

export type GoogleVerificationReason =
  | 'malformed'
  | 'expired'
  | 'wrong_audience'
  | 'missing_claims'
  | 'unknown';

/** Raised when a Google ID token cannot be trusted. `reason` is for logging. */
export class GoogleVerificationError extends Error {
  constructor(
    readonly reason: GoogleVerificationReason,
    message?: string,
  ) {
    super(message ?? `Google ID token verification failed (${reason})`);
    this.name = 'GoogleVerificationError';
  }
}

export interface GoogleVerifier {
  verify(idToken: string): Promise<GoogleIdentity>;
}

type IdTokenVerifier = Pick<OAuth2Client, 'verifyIdToken'>;

function categorize(error: unknown): GoogleVerificationReason {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('audience')) return 'wrong_audience';
  if (message.includes('too late') || message.includes('expired')) return 'expired';
  if (message.includes('segments') || message.includes('signature') || message.includes('pem')) {
    return 'malformed';
  }
  return 'unknown';
}

/**
 * Verifies Google ID tokens against the configured OAuth client IDs. The token
 * signature, issuer and audience are all checked by `google-auth-library`; an
 * unverified email is rejected.
 */
export function createGoogleVerifier(
  clientIds: readonly string[] = env.GOOGLE_CLIENT_IDS,
  client: IdTokenVerifier = new OAuth2Client(),
): GoogleVerifier {
  return {
    async verify(idToken) {
      let payload;
      try {
        const ticket = await client.verifyIdToken({
          idToken,
          audience: [...clientIds],
        });
        payload = ticket.getPayload();
      } catch (error) {
        throw new GoogleVerificationError(
          categorize(error),
          error instanceof Error ? error.message : undefined,
        );
      }

      if (!payload?.sub || !payload.email) {
        throw new GoogleVerificationError('missing_claims');
      }
      if (payload.email_verified === false) {
        throw new GoogleVerificationError('missing_claims', 'email not verified');
      }

      return {
        sub: payload.sub,
        email: payload.email,
        name: payload.name?.trim() || payload.email,
        picture: payload.picture ?? null,
      };
    },
  };
}
