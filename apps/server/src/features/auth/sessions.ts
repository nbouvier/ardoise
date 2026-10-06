import { createHash, randomBytes } from 'node:crypto';

import { env } from '../../config/env.js';

import type { AuthRepository } from './repository.js';

/** SHA-256 hex digest. Refresh tokens are only ever persisted in this form. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type SessionErrorReason = 'not_found' | 'expired' | 'revoked';

export class SessionError extends Error {
  constructor(
    readonly reason: SessionErrorReason,
    /** Whose token it was, when known: set for a reused (`revoked`) token. */
    readonly userId?: string,
  ) {
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
  /** Delete the expired sessions; returns how many were. */
  purgeExpired(): Promise<number>;
}

/**
 * Manages refresh-token sessions. Tokens are opaque 256-bit random strings,
 * stored hashed, rotated on every use (the previous token is revoked) and
 * revocable on sign-out.
 *
 * A revoked token presented again means two parties hold it, one of them
 * likely a thief (the app never reuses a token it has rotated). Which one is
 * unknowable, so every session of the user is revoked: both must sign in again.
 */
export function createSessionService(
  repository: AuthRepository,
  ttlSeconds: number = env.AUTH_REFRESH_TTL_SECONDS,
  now: () => Date = () => new Date(),
): SessionService {
  function newToken(): IssuedRefreshToken {
    return {
      refreshToken: randomBytes(32).toString('base64url'),
      expiresAt: new Date(now().getTime() + ttlSeconds * 1000),
    };
  }

  async function create(userId: string): Promise<IssuedRefreshToken> {
    const { refreshToken, expiresAt } = newToken();
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
      const hash = hashRefreshToken(refreshToken);
      const at = now();
      const next = newToken();
      const rotated = await repository.rotateSession(hash, at, {
        refreshTokenHash: hashRefreshToken(next.refreshToken),
        expiresAt: next.expiresAt,
      });
      if (rotated) {
        return { userId: rotated.userId, ...next };
      }

      const session = await repository.findSessionByHash(hash);
      if (!session) {
        throw new SessionError('not_found');
      }
      if (session.revokedAt) {
        await repository.revokeUserSessions(session.userId, at);
        throw new SessionError('revoked', session.userId);
      }
      throw new SessionError('expired');
    },

    async revoke(refreshToken) {
      await repository.revokeSessionByHash(hashRefreshToken(refreshToken), now());
    },

    purgeExpired() {
      return repository.deleteExpiredSessions(now());
    },
  };
}
