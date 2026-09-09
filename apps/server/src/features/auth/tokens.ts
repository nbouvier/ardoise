import { errors as joseErrors, jwtVerify, SignJWT } from 'jose';

import { env } from '../../config/env.js';

const ISSUER = 'splitcount';
const AUDIENCE = 'splitcount';
const encoder = new TextEncoder();

export interface AccessToken {
  token: string;
  expiresAt: Date;
}

export type AccessTokenErrorReason = 'expired' | 'invalid';

export class AccessTokenError extends Error {
  constructor(readonly reason: AccessTokenErrorReason) {
    super(`Access token ${reason}`);
    this.name = 'AccessTokenError';
  }
}

export interface AccessTokenService {
  issue(userId: string): Promise<AccessToken>;
  verify(token: string): Promise<{ userId: string }>;
}

/**
 * Issues and verifies short-lived HS256 access tokens. The refresh token, not
 * this one, carries session longevity.
 */
export function createAccessTokenService(
  secret: string = env.AUTH_JWT_SECRET,
  ttlSeconds: number = env.AUTH_ACCESS_TTL_SECONDS,
): AccessTokenService {
  const key = encoder.encode(secret);

  return {
    async issue(userId) {
      const issuedAt = Math.floor(Date.now() / 1000);
      const expiresAt = issuedAt + ttlSeconds;
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt(issuedAt)
        .setExpirationTime(expiresAt)
        .sign(key);
      return { token, expiresAt: new Date(expiresAt * 1000) };
    },

    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: ISSUER,
          audience: AUDIENCE,
        });
        if (!payload.sub) {
          throw new AccessTokenError('invalid');
        }
        return { userId: payload.sub };
      } catch (error) {
        if (error instanceof joseErrors.JWTExpired) {
          throw new AccessTokenError('expired');
        }
        if (error instanceof AccessTokenError) {
          throw error;
        }
        throw new AccessTokenError('invalid');
      }
    },
  };
}
