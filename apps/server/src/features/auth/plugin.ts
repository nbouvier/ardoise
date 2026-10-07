import {
  googleAuthRequestSchema,
  logoutRequestSchema,
  refreshRequestSchema,
} from '@ardoise/shared';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import fp from 'fastify-plugin';

import { parseRequest } from '../../http/validation.js';
import { schedulePeriodicTask } from '../../periodic-task.js';

import { createGoogleVerifier, GoogleVerificationError, type GoogleVerifier } from './google.js';
import { createAuthRepository } from './repository.js';
import { createAuthService, type AuthService } from './service.js';
import { createSessionService, SessionError } from './sessions.js';
import { createAccessTokenService, type AccessTokenService } from './tokens.js';

declare module 'fastify' {
  interface FastifyInstance {
    auth: AuthService;
    authenticate: preHandlerHookHandler;
  }
  interface FastifyRequest {
    userId?: string;
  }
}

export interface AuthPluginOptions {
  /** Override the Google verifier (tests). */
  googleVerifier?: GoogleVerifier | undefined;
  /** Override the access-token service (tests). */
  accessTokens?: AccessTokenService | undefined;
}

const unauthorized = (reply: FastifyReply, error: string) =>
  reply.code(401).send({ error });

export const authPlugin = fp<AuthPluginOptions>(
  async (app, opts) => {
    const accessTokens = opts.accessTokens ?? createAccessTokenService();
    const google = opts.googleVerifier ?? createGoogleVerifier();
    const repository = createAuthRepository(app.db);
    const sessions = createSessionService(repository);
    const auth = createAuthService({ google, accessTokens, sessions, repository });

    // Every refresh adds a session row; the expired ones are no use to anyone.
    schedulePeriodicTask(app, {
      name: 'auth.sessions.purge',
      intervalMs: 60 * 60 * 1000,
      run: () => sessions.purgeExpired(),
    });

    app.decorate('auth', auth);
    app.decorate('authenticate', async function authenticate(request, reply) {
      const header = request.headers.authorization;
      const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
      if (!token) {
        return unauthorized(reply, 'missing_access_token');
      }
      let userId: string;
      try {
        ({ userId } = await accessTokens.verify(token));
      } catch {
        return unauthorized(reply, 'invalid_access_token');
      }
      // An access token outlives nothing it was issued for: once the account
      // is deleted, the ones still within their lifetime are refused too
      // (`docs/specs/account-deletion.md`).
      if (!(await repository.findUserById(userId))) {
        return unauthorized(reply, 'unknown_user');
      }
      request.userId = userId;
    });

    app.post('/auth/google', async (request: FastifyRequest, reply) => {
      const { idToken } = parseRequest(googleAuthRequestSchema, request.body);
      try {
        const session = await auth.signInWithGoogle(idToken);
        app.log.info({ userId: session.user.id }, 'auth.session.issued');
        return reply.code(200).send(session);
      } catch (error) {
        if (error instanceof GoogleVerificationError) {
          app.log.warn({ reason: error.reason }, 'auth.google.verify.failed');
          return unauthorized(reply, 'invalid_google_token');
        }
        throw error;
      }
    });

    app.post('/auth/refresh', async (request: FastifyRequest, reply) => {
      const { refreshToken } = parseRequest(refreshRequestSchema, request.body);
      try {
        const session = await auth.refresh(refreshToken);
        return reply.code(200).send(session);
      } catch (error) {
        if (error instanceof SessionError) {
          if (error.reason === 'revoked') {
            // Every session of the user has just been revoked (see sessions.ts).
            app.log.warn({ userId: error.userId }, 'auth.session.refresh.reused');
          }
          return unauthorized(reply, 'invalid_refresh_token');
        }
        throw error;
      }
    });

    app.post('/auth/logout', async (request: FastifyRequest, reply) => {
      const { refreshToken } = parseRequest(logoutRequestSchema, request.body);
      await auth.signOut(refreshToken);
      app.log.info('auth.session.revoked');
      return reply.code(204).send();
    });

    app.get(
      '/auth/me',
      { preHandler: app.authenticate },
      async (request: FastifyRequest, reply) => {
        const profile = await auth.getProfile(request.userId!);
        if (!profile) {
          return unauthorized(reply, 'unknown_user');
        }
        return reply.send({ user: profile });
      },
    );
  },
  { name: 'auth', dependencies: ['db'] },
);
