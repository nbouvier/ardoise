import { errorFields, logger } from '@/lib/logger';

// Type-only: erased at build time, so it does not resolve back to this file.
import type { StoredSession, TokenStore } from './token-store';

const STORAGE_KEY = 'ardoise.session';

/**
 * The web build's store. The refresh token is an `HttpOnly` cookie the page
 * cannot read, so nothing secret is kept here: only the last-known profile,
 * which says a session may exist (worth a refresh on launch) and lets the app
 * open on it.
 */
export const tokenStore: TokenStore = {
  async load() {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'user' in parsed) {
        return { refreshToken: null, user: parsed.user } as StoredSession;
      }
      return null;
    } catch (error) {
      logger.warn('auth.token_store.load.failed', errorFields(error));
      return null;
    }
  },

  async save(session) {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ user: session.user }));
    } catch (error) {
      // Private browsing or blocked storage: the session still works until the tab closes.
      logger.warn('auth.token_store.save.failed', errorFields(error));
    }
  },

  async clear() {
    try {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
    } catch (error) {
      logger.warn('auth.token_store.clear.failed', errorFields(error));
    }
  },
};
