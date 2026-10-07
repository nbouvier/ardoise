import {
  googleAuthRequestSchema,
  logoutRequestSchema,
  passwordSignInRequestSchema,
  refreshRequestSchema,
  signupRequestSchema,
  signupVerifyRequestSchema,
} from '@ardoise/shared';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import fp from 'fastify-plugin';

import { env } from '../../config/env.js';
import type { EmailCodePurpose } from '../../db/schema.js';
import { reportError } from '../../error-reporting.js';
import { pickLanguage, type Language } from '../../http/language.js';
import { parseRequest } from '../../http/validation.js';
import {
  createMailer,
  MailDeliveryError,
  type Mailer,
  type MailMessage,
} from '../../mail/mailer.js';
import { schedulePeriodicTask } from '../../periodic-task.js';

import { createEmailCodeHasher } from './codes.js';
import { createGoogleVerifier, GoogleVerificationError, type GoogleVerifier } from './google.js';
import { createPasswordHasher, type ScryptCost } from './passwords.js';
import { createAuthRepository, GoogleAccountConflictError } from './repository.js';
import { CodeError, createAuthService, CredentialsError, type AuthService } from './service.js';
import { createSessionService, SessionError } from './sessions.js';
import { AttemptThrottle, ThrottledError } from './throttle.js';
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
  /** Override the password hashing cost (tests: a cheap one). */
  passwordCost?: ScryptCost | undefined;
  /** Override the clock of the per-address limits and the codes (tests). */
  now?: (() => number) | undefined;
  /** Override the e-mail transport (tests: one that keeps the messages). */
  mailer?: Mailer | undefined;
}

const unauthorized = (reply: FastifyReply, error: string) =>
  reply.code(401).send({ error });

/** The per-address limits' answer, shaped like the per-client rate limit's. */
const throttled = (reply: FastifyReply, error: ThrottledError) =>
  reply
    .code(429)
    .header('retry-after', String(error.retryAfterSeconds))
    .send({ error: 'rate_limited' });

/** Failed password checks an address may have in a window (`docs/specs/password-sign-in.md`). */
const SIGN_IN_FAILURES = { limit: 10, windowMs: 15 * 60 * 1000 };
/** Codes an address may ask for, per purpose, in a window. */
const CODE_REQUESTS = { limit: 5, windowMs: 60 * 60 * 1000 };

/** The language e-mails go out in: the one the app or browser asks for. */
const languageOf = (request: FastifyRequest): Language =>
  pickLanguage(undefined, request.headers['accept-language']);

export const authPlugin = fp<AuthPluginOptions>(
  async (app, opts) => {
    const accessTokens = opts.accessTokens ?? createAccessTokenService();
    const google = opts.googleVerifier ?? createGoogleVerifier();
    const repository = createAuthRepository(app.db);
    const sessions = createSessionService(repository);
    const now = opts.now ?? Date.now;
    const mailer = opts.mailer ?? createMailer(env, app.log);

    // Not awaited: the request has answered by the time the provider does.
    function deliver(message: MailMessage, purpose: EmailCodePurpose): void {
      mailer.send(message).then(
        () => app.log.info({ purpose }, 'auth.mail.sent'),
        (error: unknown) => {
          const status = error instanceof MailDeliveryError ? error.status : null;
          const { name, message: detail } =
            error instanceof Error ? error : new Error(String(error));
          app.log.error(
            { purpose, status, error: { type: name, message: detail } },
            'auth.mail.failed',
          );
          reportError(error, 'auth.mail.failed', { purpose, status });
        },
      );
    }

    const auth = createAuthService({
      google,
      accessTokens,
      sessions,
      repository,
      passwords: createPasswordHasher(opts.passwordCost),
      signInThrottle: new AttemptThrottle(SIGN_IN_FAILURES.limit, SIGN_IN_FAILURES.windowMs, now),
      codes: createEmailCodeHasher(env.AUTH_JWT_SECRET),
      codeThrottle: new AttemptThrottle(CODE_REQUESTS.limit, CODE_REQUESTS.windowMs, now),
      deliver,
      now: () => new Date(now()),
    });

    // Every refresh adds a session row; the expired ones are no use to anyone.
    schedulePeriodicTask(app, {
      name: 'auth.sessions.purge',
      intervalMs: 60 * 60 * 1000,
      run: () => sessions.purgeExpired(),
    });
    schedulePeriodicTask(app, {
      name: 'auth.email_codes.purge',
      intervalMs: 60 * 60 * 1000,
      run: () => repository.deleteExpiredEmailCodes(new Date(now())),
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
        const { session, outcome } = await auth.signInWithGoogle(idToken);
        if (outcome === 'linked') {
          app.log.info({ userId: session.user.id, method: 'google' }, 'auth.account.linked');
        }
        app.log.info({ userId: session.user.id }, 'auth.session.issued');
        return reply.code(200).send(session);
      } catch (error) {
        if (error instanceof GoogleVerificationError) {
          app.log.warn({ reason: error.reason }, 'auth.google.verify.failed');
          return unauthorized(reply, 'invalid_google_token');
        }
        if (error instanceof GoogleAccountConflictError) {
          app.log.warn({ userId: error.userId }, 'auth.google.account_conflict');
          return reply.code(409).send({ error: 'account_conflict' });
        }
        throw error;
      }
    });

    app.post('/auth/password', async (request: FastifyRequest, reply) => {
      const { email, password } = parseRequest(passwordSignInRequestSchema, request.body);
      try {
        const session = await auth.signInWithPassword(email, password);
        app.log.info({ userId: session.user.id }, 'auth.session.issued');
        return reply.code(200).send(session);
      } catch (error) {
        if (error instanceof ThrottledError) {
          app.log.warn('auth.password.throttled');
          return throttled(reply, error);
        }
        if (error instanceof CredentialsError) {
          app.log.info({ reason: error.reason, userId: error.userId }, 'auth.password.failed');
          return unauthorized(reply, 'invalid_credentials');
        }
        throw error;
      }
    });

    app.post('/auth/signup', async (request: FastifyRequest, reply) => {
      const input = parseRequest(signupRequestSchema, request.body);
      try {
        await auth.requestSignup(input, languageOf(request));
      } catch (error) {
        if (error instanceof ThrottledError) {
          app.log.warn({ purpose: 'signup' }, 'auth.code.throttled');
          return throttled(reply, error);
        }
        throw error;
      }
      return reply.code(202).send();
    });

    app.post('/auth/signup/verify', async (request: FastifyRequest, reply) => {
      const { email, code } = parseRequest(signupVerifyRequestSchema, request.body);
      try {
        const { session, outcome } = await auth.verifySignup(email, code);
        const userId = session.user.id;
        if (outcome === 'linked') {
          app.log.info({ userId, method: 'password' }, 'auth.account.linked');
        } else {
          app.log.info({ userId, method: 'password' }, 'auth.account.created');
        }
        app.log.info({ userId }, 'auth.session.issued');
        return reply.code(200).send(session);
      } catch (error) {
        if (error instanceof CodeError) {
          app.log.info({ purpose: 'signup', reason: error.reason }, 'auth.code.rejected');
          return unauthorized(reply, 'invalid_code');
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
