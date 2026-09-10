import * as SecureStore from 'expo-secure-store';

import type { UserProfile } from '@splitcount/shared';

import { errorFields, logger } from '@/lib/logger';

const STORAGE_KEY = 'splitcount.session';

export interface StoredSession {
  refreshToken: string;
  user: UserProfile;
}

export interface TokenStore {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Persists the refresh token (and the last-known profile, for a fast launch) in
 * the OS secure store. The access token is never persisted — it lives only in
 * memory for the app session.
 */
export const secureTokenStore: TokenStore = {
  async load() {
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed === 'object' &&
        'refreshToken' in parsed &&
        typeof parsed.refreshToken === 'string' &&
        'user' in parsed
      ) {
        return parsed as StoredSession;
      }
      return null;
    } catch (error) {
      logger.warn('auth.token_store.load.failed', errorFields(error));
      return null;
    }
  },

  async save(session) {
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(session));
  },

  async clear() {
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    } catch (error) {
      logger.warn('auth.token_store.clear.failed', errorFields(error));
    }
  },
};
