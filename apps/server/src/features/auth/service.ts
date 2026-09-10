import type { AuthSession, UserProfile } from '@splitcount/shared';

import type { UserRow } from '../../db/schema.js';

import type { GoogleVerifier } from './google.js';
import type { AuthRepository } from './repository.js';
import { SessionError, type SessionService } from './sessions.js';
import type { AccessTokenService } from './tokens.js';

function toProfile(user: UserRow): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
  };
}

export interface AuthService {
  signInWithGoogle(idToken: string): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
  signOut(refreshToken: string): Promise<void>;
  getProfile(userId: string): Promise<UserProfile | undefined>;
}

export interface AuthServiceDeps {
  google: GoogleVerifier;
  accessTokens: AccessTokenService;
  sessions: SessionService;
  repository: AuthRepository;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { google, accessTokens, sessions, repository } = deps;

  async function toSession(
    user: UserRow,
    refreshToken: string,
  ): Promise<AuthSession> {
    const access = await accessTokens.issue(user.id);
    return {
      accessToken: access.token,
      refreshToken,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      user: toProfile(user),
    };
  }

  return {
    async signInWithGoogle(idToken) {
      const identity = await google.verify(idToken);
      const user = await repository.upsertUserByGoogleSub({
        googleSub: identity.sub,
        email: identity.email,
        name: identity.name,
        picture: identity.picture,
      });
      const session = await sessions.create(user.id);
      return toSession(user, session.refreshToken);
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
