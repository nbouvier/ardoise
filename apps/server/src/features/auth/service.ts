import type { AuthSession, UserProfile } from '@ardoise/shared';

import type { EmailCodePurpose, EmailCodeRow, UserRow } from '../../db/schema.js';
import type { Language } from '../../http/language.js';
import type { MailMessage } from '../../mail/mailer.js';

import { CODE_ATTEMPTS, CODE_TTL_MS, type EmailCodeHasher } from './codes.js';
import { accountExistsEmail, passwordResetEmail, signupCodeEmail } from './emails.js';
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

export type CodeErrorReason = 'no_code' | 'wrong_code' | 'used' | 'account_has_password';

/**
 * A code that does not stand. Every reason answers the same to the client;
 * `reason` is for the log only.
 */
export class CodeError extends Error {
  constructor(readonly reason: CodeErrorReason) {
    super(`E-mail code refused (${reason})`);
    this.name = 'CodeError';
  }
}

/** A password change whose current password does not match, or an account without one. */
export class PasswordChangeError extends Error {
  constructor(readonly userId: string) {
    super('Current password refused');
    this.name = 'PasswordChangeError';
  }
}

export interface SignupRequest {
  name: string;
  email: string;
  password: string;
}

export interface AuthService {
  signInWithGoogle(
    idToken: string,
  ): Promise<{ session: AuthSession; outcome: GoogleAccountOutcome }>;
  /** Throws `ThrottledError` or `CredentialsError`. */
  signInWithPassword(email: string, password: string): Promise<AuthSession>;
  /**
   * E-mail the address a sign-up code, or an "account exists" note when it
   * already has a password. Answers the same either way. Throws
   * `ThrottledError`.
   */
  requestSignup(request: SignupRequest, lang: Language): Promise<void>;
  /**
   * Create the account the code was sent for, or add its password to the
   * Google-only account with the address. Throws `CodeError`.
   */
  verifySignup(
    email: string,
    code: string,
  ): Promise<{ session: AuthSession; outcome: 'created' | 'linked' }>;
  /**
   * E-mail a password-reset code to the address if it has an account; nothing
   * otherwise. Answers the same either way. Throws `ThrottledError`.
   */
  requestPasswordReset(email: string, lang: Language): Promise<void>;
  /**
   * Set the account's password with the code, revoke every session of it, and
   * start a new one. Throws `CodeError`.
   */
  confirmPasswordReset(email: string, code: string, password: string): Promise<AuthSession>;
  /**
   * Change the password after checking the current one, revoke every session
   * of the account, and start a new one for the caller. Throws
   * `ThrottledError` or `PasswordChangeError`.
   */
  changePassword(userId: string, current: string, next: string): Promise<AuthSession>;
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
  codes: EmailCodeHasher;
  /** Codes asked for, per purpose and address. */
  codeThrottle: AttemptThrottle;
  /**
   * Send an e-mail without waiting for it: the request answers the same
   * whether one went out or not, and as fast. Failures are the caller's to log.
   */
  deliver: (message: MailMessage, purpose: EmailCodePurpose) => void;
  now?: () => Date;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { google, accessTokens, sessions, repository, passwords, signInThrottle } = deps;
  const { codes, codeThrottle, deliver } = deps;
  const now = deps.now ?? (() => new Date());

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

  /**
   * Set a new password and sign every device out but the one asking, which
   * gets a fresh session: whoever knew the old password, or held a session,
   * is locked out.
   *
   * The old sessions are deleted, not revoked: a revoked token coming back
   * reads as theft and revokes every session, the fresh one included, so the
   * first old device to wake up would sign this one out.
   */
  async function replacePassword(user: UserRow, password: string): Promise<AuthSession> {
    const updated = await repository.setPasswordHash(user.id, await passwords.hash(password));
    await repository.deleteUserSessions(user.id);
    return startSession(updated);
  }

  /** Count a code request for the address; throws once it has asked too often. */
  function throttleCodeRequest(purpose: EmailCodePurpose, email: string): void {
    const key = `${purpose}:${email}`;
    const retryAfter = codeThrottle.retryAfterSeconds(key);
    if (retryAfter > 0) {
      throw new ThrottledError(retryAfter);
    }
    codeThrottle.record(key);
  }

  /** Store a new code for the address and return it, to be e-mailed. */
  async function issueCode(
    purpose: EmailCodePurpose,
    email: string,
    fields: { userId: string | null; name?: string; passwordHash?: string },
  ): Promise<string> {
    const code = codes.generate();
    await repository.saveEmailCode({
      purpose,
      email,
      ...fields,
      codeHash: codes.hash(purpose, email, code),
      attemptsLeft: CODE_ATTEMPTS,
      expiresAt: new Date(now().getTime() + CODE_TTL_MS),
    });
    return code;
  }

  /** Check `code` and use it up. Throws `CodeError`. */
  async function consumeCode(
    purpose: EmailCodePurpose,
    email: string,
    code: string,
  ): Promise<EmailCodeRow> {
    const row = await repository.claimEmailCodeAttempt(purpose, email, now());
    if (!row) {
      throw new CodeError('no_code');
    }
    if (!codes.matches(purpose, email, code, row.codeHash)) {
      throw new CodeError('wrong_code');
    }
    if (!(await repository.deleteEmailCode(row.id))) {
      throw new CodeError('used');
    }
    return row;
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

    async requestSignup({ name, email, password }, lang) {
      throttleCodeRequest('signup', email);
      // Hashed whatever the address, so the time taken gives nothing away.
      const passwordHash = await passwords.hash(password);
      const existing = await repository.findAccountByEmail(email);
      if (existing?.passwordHash) {
        deliver(accountExistsEmail(email, lang), 'signup');
        return;
      }
      const code = await issueCode('signup', email, {
        userId: existing?.id ?? null,
        name,
        passwordHash,
      });
      deliver(signupCodeEmail(email, code, lang, existing !== undefined), 'signup');
    },

    async verifySignup(email, code) {
      const row = await consumeCode('signup', email, code);
      // Both set on every sign-up code (`email_codes_signup_shape`).
      const passwordHash = row.passwordHash!;
      const existing = await repository.findAccountByEmail(email);
      if (!existing) {
        const user = await repository.insertPasswordAccount({
          email,
          name: row.name!,
          passwordHash,
        });
        return { session: await startSession(user), outcome: 'created' };
      }
      // It gained a password since the code was sent ("Forgot password?"
      // meanwhile): that one stands.
      if (existing.passwordHash) {
        throw new CodeError('account_has_password');
      }
      const user = await repository.setPasswordHash(existing.id, passwordHash);
      return { session: await startSession(user), outcome: 'linked' };
    },

    async requestPasswordReset(email, lang) {
      throttleCodeRequest('password_reset', email);
      const existing = await repository.findAccountByEmail(email);
      if (!existing) {
        return;
      }
      const code = await issueCode('password_reset', email, { userId: existing.id });
      deliver(passwordResetEmail(email, code, lang), 'password_reset');
    },

    async confirmPasswordReset(email, code, password) {
      const row = await consumeCode('password_reset', email, code);
      // Deleting the account deletes its codes: a live one has its account.
      const user = row.userId ? await repository.findUserById(row.userId) : undefined;
      if (!user) {
        throw new CodeError('no_code');
      }
      return replacePassword(user, password);
    },

    async changePassword(userId, current, next) {
      const user = await repository.findUserById(userId);
      if (!user) {
        throw new SessionError('not_found');
      }
      // The same budget as signing in: this is a password check too.
      const key = (user.email ?? userId).toLowerCase();
      const retryAfter = signInThrottle.retryAfterSeconds(key);
      if (retryAfter > 0) {
        throw new ThrottledError(retryAfter);
      }
      if (!(await passwords.verify(current, user.passwordHash))) {
        signInThrottle.record(key);
        throw new PasswordChangeError(userId);
      }
      return replacePassword(user, next);
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
