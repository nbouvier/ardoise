import { afterEach, describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@ardoise/shared';

import { ApiError } from '@/lib/api/errors';

import { AuthClient } from './auth-client';
import { GoogleSignInCancelled, type GoogleModule } from './google-module';
import type { StoredSession, TokenStore } from './token-store';

const BASE_URL = 'https://api.test';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ada@example.com',
  name: 'Ada',
  picture: null,
};

function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    accessTokenExpiresAt: '2026-09-09T19:15:00.000Z',
    user,
    ...overrides,
  };
}

function memoryStore(
  initial: StoredSession | null = null,
): TokenStore & { value: StoredSession | null } {
  return {
    value: initial,
    async load() {
      return this.value;
    },
    async save(session) {
      this.value = session;
    },
    async clear() {
      this.value = null;
    },
  };
}

function fakeGoogle(overrides: Partial<GoogleModule> = {}): GoogleModule {
  return {
    available: true,
    signIn: jest.fn<() => Promise<string>>().mockResolvedValue('google-id-token'),
    signOut: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AuthClient.bootstrap', () => {
  it('restores a session when the stored refresh token is still valid', async () => {
    globalThis.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(makeSession({ refreshToken: 'refresh-2' })));
    const store = memoryStore({ refreshToken: 'refresh-1', user });
    const client = new AuthClient({ baseUrl: BASE_URL, google: fakeGoogle(), store });

    await client.bootstrap();

    expect(client.getState()).toEqual({ status: 'signedIn', user });
    expect(store.value?.refreshToken).toBe('refresh-2');
  });

  it('signs out when there is no stored session', async () => {
    const client = new AuthClient({
      baseUrl: BASE_URL,
      google: fakeGoogle(),
      store: memoryStore(),
    });

    await client.bootstrap();

    expect(client.getState()).toEqual({ status: 'signedOut' });
  });

  it('signs out and clears storage when the refresh token is rejected', async () => {
    globalThis.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ error: 'invalid_refresh_token' }, 401));
    const store = memoryStore({ refreshToken: 'stale', user });
    const client = new AuthClient({ baseUrl: BASE_URL, google: fakeGoogle(), store });

    await client.bootstrap();

    expect(client.getState()).toEqual({ status: 'signedOut' });
    expect(store.value).toBeNull();
  });

  it('goes to the error state (keeping storage) on a network failure', async () => {
    globalThis.fetch = jest.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));
    const store = memoryStore({ refreshToken: 'refresh-1', user });
    const client = new AuthClient({ baseUrl: BASE_URL, google: fakeGoogle(), store });

    await client.bootstrap();

    expect(client.getState()).toEqual({ status: 'error' });
    expect(store.value).not.toBeNull();
  });
});

describe('AuthClient.signIn / signOut', () => {
  it('exchanges the Google token for a session and persists it', async () => {
    globalThis.fetch = jest.fn<typeof fetch>().mockResolvedValue(jsonResponse(makeSession()));
    const store = memoryStore();
    const client = new AuthClient({ baseUrl: BASE_URL, google: fakeGoogle(), store });

    await client.signIn();

    expect(client.getState()).toEqual({ status: 'signedIn', user });
    expect(store.value?.refreshToken).toBe('refresh-1');
  });

  it('propagates a cancellation without changing state', async () => {
    const google = fakeGoogle({
      signIn: jest.fn<() => Promise<string>>().mockRejectedValue(new GoogleSignInCancelled()),
    });
    const client = new AuthClient({ baseUrl: BASE_URL, google, store: memoryStore() });
    await client.bootstrap();

    await expect(client.signIn()).rejects.toBeInstanceOf(GoogleSignInCancelled);
    expect(client.getState()).toEqual({ status: 'signedOut' });
  });

  it('clears local state on sign-out and best-effort revokes the session', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(makeSession()))
      .mockResolvedValueOnce(jsonResponse(null, 204));
    globalThis.fetch = fetchMock;
    const store = memoryStore();
    const google = fakeGoogle();
    const client = new AuthClient({ baseUrl: BASE_URL, google, store });
    await client.signIn();

    await client.signOut();

    expect(client.getState()).toEqual({ status: 'signedOut' });
    expect(store.value).toBeNull();
    expect(google.signOut).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.test/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('AuthClient.authorizedFetch', () => {
  it('refreshes once and retries when the access token is expired', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(makeSession({ accessToken: 'expired' })))
      .mockResolvedValueOnce(jsonResponse({ error: 'invalid_access_token' }, 401))
      .mockResolvedValueOnce(
        jsonResponse(makeSession({ accessToken: 'fresh', refreshToken: 'refresh-2' })),
      )
      .mockResolvedValueOnce(jsonResponse({ user }));
    globalThis.fetch = fetchMock;
    const client = new AuthClient({
      baseUrl: BASE_URL,
      google: fakeGoogle(),
      store: memoryStore(),
    });
    await client.signIn();

    const response = await client.authorizedFetch('/auth/me');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://api.test/auth/refresh',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('performs a single refresh for concurrent 401s', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(makeSession()))
      .mockResolvedValue(jsonResponse({ error: 'invalid_access_token' }, 401));
    globalThis.fetch = fetchMock;
    const client = new AuthClient({
      baseUrl: BASE_URL,
      google: fakeGoogle(),
      store: memoryStore(),
    });
    await client.signIn();

    await expect(
      Promise.all([
        client.authorizedFetch('/a').catch((error: unknown) => error),
        client.authorizedFetch('/b').catch((error: unknown) => error),
      ]),
    ).resolves.toEqual([expect.any(ApiError), expect.any(ApiError)]);

    const refreshCalls = fetchMock.mock.calls.filter(
      ([url]) => url === 'https://api.test/auth/refresh',
    );
    expect(refreshCalls).toHaveLength(1);
    expect(client.getState()).toEqual({ status: 'signedOut' });
  });
});

describe('AuthClient.deleteAccount', () => {
  async function signedInClient(fetchMock: jest.Mock<typeof fetch>) {
    globalThis.fetch = fetchMock;
    const store = memoryStore();
    const google = fakeGoogle();
    const client = new AuthClient({ baseUrl: BASE_URL, google, store });
    await client.signIn();
    return { client, store, google };
  }

  it('deletes the account, then ends the session here as sign-out does', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(makeSession()))
      .mockResolvedValueOnce(jsonResponse(null, 204));
    const { client, store, google } = await signedInClient(fetchMock);

    await client.deleteAccount();

    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.test/me',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(client.getState()).toEqual({ status: 'signedOut' });
    expect(store.value).toBeNull();
    expect(google.signOut).toHaveBeenCalled();
  });

  it('treats an account already gone (a retry after it went through) as done', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(makeSession()))
      .mockResolvedValue(jsonResponse({ error: 'unknown_user' }, 401));
    const { client, store } = await signedInClient(fetchMock);

    await expect(client.deleteAccount()).resolves.toBeUndefined();

    expect(client.getState()).toEqual({ status: 'signedOut' });
    expect(store.value).toBeNull();
  });

  it('stays signed in when the deletion fails, so it can be tried again', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(makeSession()))
      .mockResolvedValueOnce(jsonResponse({ error: 'internal_error' }, 500));
    const { client, store } = await signedInClient(fetchMock);

    await expect(client.deleteAccount()).rejects.toBeInstanceOf(ApiError);

    expect(client.getState()).toEqual({ status: 'signedIn', user });
    expect(store.value).not.toBeNull();
  });
});
