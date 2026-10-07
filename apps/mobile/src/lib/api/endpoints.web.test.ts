import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { apiRequest, refreshSession, revokeSession } from './endpoints';

// As the web build has it: the refresh token is an HttpOnly cookie.
jest.mock('./auth-transport', () => ({ REFRESH_TOKEN_IN_COOKIE: true }));

const BASE_URL = 'https://api.test';

const webSession = {
  accessToken: 'access-1',
  accessTokenExpiresAt: '2026-09-09T19:15:00.000Z',
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'a@example.com',
    name: 'Ada',
    picture: null,
    hasPassword: true,
  },
};

function mockFetch(jsonBody: unknown = webSession) {
  const impl = jest.fn<typeof fetch>().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => jsonBody,
  } as Response);
  globalThis.fetch = impl;
  return impl;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('on the web', () => {
  it('marks auth calls as the web client and sends the cookie with them', async () => {
    const fetchMock = mockFetch();

    await apiRequest(BASE_URL, { method: 'POST', path: '/auth/password', body: {} });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.credentials).toBe('include');
    expect((init?.headers as Record<string, string>)['x-ardoise-client']).toBe('web');
  });

  it('sends neither with other calls', async () => {
    const fetchMock = mockFetch();

    await apiRequest(BASE_URL, { method: 'GET', path: '/groups', accessToken: 'access-1' });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.credentials).toBeUndefined();
    expect(init?.headers).not.toHaveProperty('x-ardoise-client');
  });

  it('refreshes with the cookie alone, and reads a session without a refresh token', async () => {
    const fetchMock = mockFetch();

    const session = await refreshSession(BASE_URL, null);

    expect(fetchMock.mock.calls[0]![1]?.body).toBeUndefined();
    expect(session).toMatchObject({ accessToken: 'access-1', refreshToken: null });
  });

  it('signs out with the cookie alone', async () => {
    const fetchMock = mockFetch();

    await revokeSession(BASE_URL, null);

    expect(fetchMock.mock.calls[0]![1]?.body).toBeUndefined();
  });
});
