import { afterEach, describe, expect, it, jest } from '@jest/globals';

import type { AuthSession } from '@splitcount/shared';

import {
  authenticateWithGoogle,
  fetchMe,
  refreshSession,
  revokeSession,
} from './endpoints';
import { ApiError, NetworkError } from './errors';

const BASE_URL = 'https://api.test';

const session: AuthSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  accessTokenExpiresAt: '2026-09-09T19:15:00.000Z',
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'a@example.com',
    name: 'Ada',
    picture: null,
  },
};

function mockFetch(response: { ok?: boolean; status?: number; jsonBody?: unknown }) {
  const impl = jest.fn<typeof fetch>().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.jsonBody ?? {},
  } as Response);
  globalThis.fetch = impl;
  return impl;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('authenticateWithGoogle', () => {
  it('posts the id token and parses the session', async () => {
    const fetchMock = mockFetch({ jsonBody: session });

    await expect(authenticateWithGoogle(BASE_URL, 'google-id-token')).resolves.toEqual(session);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/auth/google',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ idToken: 'google-id-token' }),
      }),
    );
  });

  it('raises ApiError with the server error code on 401', async () => {
    mockFetch({ ok: false, status: 401, jsonBody: { error: 'invalid_google_token' } });

    await expect(authenticateWithGoogle(BASE_URL, 'bad')).rejects.toMatchObject({
      status: 401,
      code: 'invalid_google_token',
    });
  });

  it('raises NetworkError when the request never completes', async () => {
    globalThis.fetch = jest
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('Network request failed'));

    await expect(authenticateWithGoogle(BASE_URL, 'x')).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('refreshSession', () => {
  it('parses a rotated session', async () => {
    mockFetch({ jsonBody: { ...session, refreshToken: 'refresh-2' } });

    await expect(refreshSession(BASE_URL, 'refresh-1')).resolves.toMatchObject({
      refreshToken: 'refresh-2',
    });
  });
});

describe('revokeSession', () => {
  it('treats a 401 as a successful logout', async () => {
    mockFetch({ ok: false, status: 401 });
    await expect(revokeSession(BASE_URL, 'refresh-1')).resolves.toBeUndefined();
  });

  it('throws on a server error', async () => {
    mockFetch({ ok: false, status: 500 });
    await expect(revokeSession(BASE_URL, 'refresh-1')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('fetchMe', () => {
  it('sends the bearer token and parses the profile', async () => {
    const fetchMock = mockFetch({ jsonBody: { user: session.user } });

    await expect(fetchMe(BASE_URL, 'access-1')).resolves.toEqual({ user: session.user });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/auth/me',
      expect.objectContaining({ headers: { authorization: 'Bearer access-1' } }),
    );
  });
});
