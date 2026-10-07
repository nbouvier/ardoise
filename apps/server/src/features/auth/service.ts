import type { AuthSession, UserProfile } from '@ardoise/shared';

import type { UserRow } from '../../db/schema.js';

import type { GoogleVerifier } from './google.js';
import type { PasswordHasher } from './passwords.js';
import type { AuthRepository, GoogleAccountOutcome } from './repository.js';
import { SessionError, type SessionService } from './sessions.js';
import { ThrottledError, type AttemptThrottle } from './throttle.js';
import type { AccessTokenService } from './tokens.js';

function toProfile(user: UserRow): UserProfile {
  return {
    id: user.id,
    // Always set for an account (`users_account_shape`); only a placeholder,
    // which never signs in, has none.
    email: user.email ?? '',
    name: user.name,
    picture: user.picture,
    hasPassword: user.passwordHash !== null,
  };
}

export type CredentialsErrorReason = 'unknown_account' | 'no_password' | 'wrong_password';

/**
 * A password sign-in that did not match. Every reason answers the same to the
 * client (`docs/specs/password-sign-in.md`); `reason` and `userId` are for the
 * log only.
 */
export class CredentialsError extends Error {
  constructor(
    readonly reason: CredentialsErrorReason,
    readonly userId?: string,
  ) {
    super(`Password sign-in refused (${reason})`);
    this.name = 'CredentialsError';
  }
}

export interface AuthService {
  signInWithGoogle(
    idToken: string,
  ): Promise<{ session: AuthSession; outcome: GoogleAccountOutcome }>;
  /** Throws `ThrottledError` or `CredentialsError`. */
  signInWithPassword(email: string, password: string): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
  signOut(refreshToken: string): Promise<void>;
  getProfile(userId: string): Promise<UserProfile | undefined>;
}

export interface AuthServiceDeps {
  google: GoogleVerifier;
  accessTokens: AccessTokenService;
  sessions: SessionService;
  repository: AuthRepository;
  passwords: PasswordHasher;
  /** Failed password checks per address. */
  signInThrottle: AttemptThrottle;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { google, accessTokens, sessions, repository, passwords, signInThrottle } = deps;

  async function toSession(user: UserRow, refreshToken: string): Promise<AuthSession> {
    const access = await accessTokens.issue(user.id);
    return {
      accessToken: access.token,
      refreshToken,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      user: toProfile(user),
    };
  }

  async function startSession(user: UserRow): Promise<AuthSession> {
    const session = await sessions.create(user.id);
    return toSession(user, session.refreshToken);
  }

  return {
    async signInWithGoogle(idToken) {
      const identity = await google.verify(idToken);
      const { user, outcome } = await repository.signInGoogleAccount({
        googleSub: identity.sub,
        email: identity.email,
        name: identity.name,
        picture: identity.picture,
      });
      return { session: await startSession(user), outcome };
    },

    async signInWithPassword(email, password) {
      const retryAfter = signInThrottle.retryAfterSeconds(email);
      if (retryAfter > 0) {
        throw new ThrottledError(retryAfter);
      }
      const user = await repository.findAccountByEmail(email);
      // Hashes even without an account, so the time taken gives nothing away.
      const matches = await passwords.verify(password, user?.passwordHash ?? null);
      if (!user || !matches) {
        signInThrottle.record(email);
        if (!user) {
          throw new CredentialsError('unknown_account');
        }
        throw new CredentialsError(user.passwordHash ? 'wrong_password' : 'no_password', user.id);
      }
      return startSession(user);
    },

    async refresh(refreshToken) {
      const rotated = await sessions.rotate(refreshToken);
      const user = await repository.findUserById(rotated.userId);
      if (!user) {
        throw new SessionError('not_found');
      }
      return toSession(user, rotated.refreshToken);
    },

    async signOut(refreshToken) {
      await sessions.revoke(refreshToken);
    },

    async getProfile(userId) {
      const user = await repository.findUserById(userId);
      return user ? toProfile(user) : undefined;
    },
  };
}
