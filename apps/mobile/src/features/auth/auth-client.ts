import type { PasswordResetConfirmRequest, SignupRequest, UserProfile } from '@ardoise/shared';

import { deleteOwnAccount } from '@/lib/api/account';
import {
  apiRequest,
  authenticateWithGoogle,
  confirmPasswordReset,
  parseSession,
  refreshSession,
  requestPasswordReset,
  requestSignup,
  revokeSession,
  signInWithPassword,
  verifySignup,
  type ClientSession,
} from '@/lib/api/endpoints';
import { ApiError, expectOk } from '@/lib/api/errors';
import { errorFields, logger } from '@/lib/logger';

import type { GoogleModule } from './google-module';
import type { TokenStore } from './token-store';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'error';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'error' }
  | { status: 'signedIn'; user: UserProfile };

export interface AuthClientDeps {
  baseUrl: string;
  google: GoogleModule;
  store: TokenStore;
}

/**
 * The authentication state machine, independent of React. Owns the in-memory
 * session, persists the refresh token, and performs a single-flight refresh
 * when an authorized request comes back 401.
 */
export class AuthClient {
  private state: AuthState = { status: 'loading' };
  private session: ClientSession | null = null;
  private listeners = new Set<() => void>();
  private refreshing: Promise<ClientSession | null> | null = null;

  constructor(private readonly deps: AuthClientDeps) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): AuthState => this.state;

  get googleAvailable(): boolean {
    return this.deps.google.available;
  }

  private setState(state: AuthState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private async applySession(session: ClientSession): Promise<void> {
    this.session = session;
    await this.deps.store.save({ refreshToken: session.refreshToken, user: session.user });
    this.setState({ status: 'signedIn', user: session.user });
  }

  private async clearSession(): Promise<void> {
    this.session = null;
    await this.deps.store.clear();
    this.setState({ status: 'signedOut' });
  }

  /** Restore a session on launch. Called once when the provider mounts. */
  readonly bootstrap = async (): Promise<void> => {
    const stored = await this.deps.store.load();
    if (!stored) {
      this.setState({ status: 'signedOut' });
      return;
    }
    try {
      const session = await refreshSession(this.deps.baseUrl, stored.refreshToken);
      await this.applySession(session);
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) {
        logger.info('auth.session.restore.rejected');
        await this.clearSession();
      } else {
        // Network / server error: do not sign the user out on a transient failure.
        logger.warn('auth.session.restore.failed', errorFields(error));
        this.setState({ status: 'error' });
      }
    }
  };

  readonly signIn = async (): Promise<void> => {
    const idToken = await this.deps.google.signIn();
    const session = await authenticateWithGoogle(this.deps.baseUrl, idToken);
    logger.info('auth.session.started');
    await this.applySession(session);
  };

  readonly signInWithPassword = async (email: string, password: string): Promise<void> => {
    const session = await signInWithPassword(this.deps.baseUrl, email, password);
    logger.info('auth.session.started');
    await this.applySession(session);
  };

  /** Ask for a sign-up code (`docs/specs/password-sign-in.md`); signs nothing in. */
  readonly requestSignup = (request: SignupRequest): Promise<void> =>
    requestSignup(this.deps.baseUrl, request);

  readonly verifySignup = async (email: string, code: string): Promise<void> => {
    const session = await verifySignup(this.deps.baseUrl, email, code);
    logger.info('auth.session.started');
    await this.applySession(session);
  };

  /** Ask for a password-reset code; signs nothing in. */
  readonly requestPasswordReset = (email: string): Promise<void> =>
    requestPasswordReset(this.deps.baseUrl, email);

  readonly confirmPasswordReset = async (request: PasswordResetConfirmRequest): Promise<void> => {
    const session = await confirmPasswordReset(this.deps.baseUrl, request);
    logger.info('auth.session.started');
    await this.applySession(session);
  };

  /**
   * Change the password. The server ends every other session and hands this
   * device a fresh one, which replaces the current. A wrong current password
   * is an `ApiError` 403 `invalid_password`.
   */
  readonly changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
    const response = await this.authorizedFetch('/auth/password/change', {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
    await expectOk(response);
    await this.applySession(parseSession(await response.json()));
  };

  readonly signOut = async (): Promise<void> => {
    const session = this.session;
    await this.deps.google.signOut();
    await this.clearSession();
    if (session) {
      revokeSession(this.deps.baseUrl, session.refreshToken).catch((error) => {
        logger.warn('auth.session.revoke.failed', errorFields(error));
      });
    }
  };

  /**
   * Delete the account (`docs/specs/account-deletion.md`), then end the
   * session here as sign-out does — the server has already ended every
   * session of it. A `401` means the account is already gone (a retry after
   * a deletion that did go through): done all the same.
   */
  readonly deleteAccount = async (): Promise<void> => {
    try {
      await deleteOwnAccount(this.authorizedFetch);
    } catch (error) {
      if (!(error instanceof ApiError && error.isUnauthorized)) {
        throw error;
      }
    }
    logger.info('auth.account.deleted');
    await this.deps.google.signOut();
    await this.clearSession();
  };

  private refresh(): Promise<ClientSession | null> {
    this.refreshing ??= (async () => {
      const current = this.session;
      try {
        if (!current) {
          return null;
        }
        const session = await refreshSession(this.deps.baseUrl, current.refreshToken);
        await this.applySession(session);
        return session;
      } catch (error) {
        if (error instanceof ApiError && error.isUnauthorized) {
          await this.clearSession();
        } else {
          logger.warn('auth.session.refresh.failed', errorFields(error));
        }
        return null;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  /**
   * Fetch a protected endpoint with the current access token, transparently
   * refreshing and retrying once on 401.
   */
  readonly authorizedFetch = async (
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<Response> => {
    if (!this.session) {
      throw new ApiError(401, 'no_session');
    }
    const send = (accessToken: string) =>
      apiRequest(this.deps.baseUrl, {
        method: init.method ?? 'GET',
        path,
        body: init.body,
        accessToken,
      });

    const response = await send(this.session.accessToken);
    if (response.status !== 401) {
      return response;
    }

    const refreshed = await this.refresh();
    if (!refreshed) {
      throw new ApiError(401, 'session_expired');
    }
    return send(refreshed.accessToken);
  };
}
