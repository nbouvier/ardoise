import { createHash, randomBytes } from 'node:crypto';

import { env } from '../../config/env.js';

import type { AuthRepository } from './repository.js';

/** SHA-256 hex digest. Refresh tokens are only ever persisted in this form. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type SessionErrorReason = 'not_found' | 'expired' | 'revoked';

export class SessionError extends Error {
  constructor(readonly reason: SessionErrorReason) {
    super(`Refresh session ${reason}`);
    this.name = 'SessionError';
  }
}

export interface IssuedRefreshToken {
  refreshToken: string;
  expiresAt: Date;
}

export interface SessionService {
  create(userId: string): Promise<IssuedRefreshToken>;
  rotate(refreshToken: string): Promise<IssuedRefreshToken & { userId: string }>;
  revoke(refreshToken: string): Promise<void>;
}

/**
 * Manages refresh-token sessions. Tokens are opaque 256-bit random strings,
 * stored hashed, rotated on every use (the previous token is revoked) and
 * revocable on sign-out.
 */
export function createSessionService(
  repository: AuthRepository,
  ttlSeconds: number = env.AUTH_REFRESH_TTL_SECONDS,
  now: () => Date = () => new Date(),
): SessionService {
  async function create(userId: string): Promise<IssuedRefreshToken> {
    const refreshToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now().getTime() + ttlSeconds * 1000);
    await repository.insertSession({
      userId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      expiresAt,
    });
    return { refreshToken, expiresAt };
  }

  return {
    create,

    async rotate(refreshToken) {
      const session = await repository.findSessionByHash(hashRefreshToken(refreshToken));
      if (!session) {
        throw new SessionError('not_found');
      }
      if (session.revokedAt) {
        throw new SessionError('revoked');
      }
      if (session.expiresAt.getTime() <= now().getTime()) {
        throw new SessionError('expired');
      }

      await repository.revokeSessionById(session.id, now());
      const next = await create(session.userId);
      return { userId: session.userId, ...next };
    },

    async revoke(refreshToken) {
      await repository.revokeSessionByHash(hashRefreshToken(refreshToken), now());
    },
  };
}
