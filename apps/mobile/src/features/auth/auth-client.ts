import type { AuthSession, UserProfile } from '@splitcount/shared';

import { ApiError } from '@/lib/api/errors';
import {
  apiRequest,
  authenticateWithGoogle,
  refreshSession,
  revokeSession,
} from '@/lib/api/endpoints';
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
  private session: AuthSession | null = null;
  private listeners = new Set<() => void>();
  private refreshing: Promise<AuthSession | null> | null = null;

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

  private async applySession(session: AuthSession): Promise<void> {
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

  readonly signOut = async (): Promise<void> => {
    const refreshToken = this.session?.refreshToken;
    await this.deps.google.signOut();
    await this.clearSession();
    if (refreshToken) {
      revokeSession(this.deps.baseUrl, refreshToken).catch((error) => {
        logger.warn('auth.session.revoke.failed', errorFields(error));
      });
    }
  };

  private refresh(): Promise<AuthSession | null> {
    this.refreshing ??= (async () => {
      const current = this.session?.refreshToken;
      try {
        if (!current) {
          return null;
        }
        const session = await refreshSession(this.deps.baseUrl, current);
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
