import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { users } from '../../db/schema.js';
import { createTestApp } from '../../test/app.js';
import { fakeGoogleVerifier } from '../../test/google.js';

import { createAccessTokenService } from './tokens.js';

const google = fakeGoogleVerifier({
  ada: { sub: 'google-ada', email: 'ada@example.com', name: 'Ada Lovelace' },
});

describe('auth routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp({ auth: { googleVerifier: google } });
  });

  afterAll(async () => {
    await app.close();
  });

  const signIn = (idToken: string) =>
    app.inject({ method: 'POST', url: '/auth/google', payload: { idToken } });

  describe('POST /auth/google', () => {
    it('issues a session for a valid Google token', async () => {
      const response = await signIn('ada');

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        accessTokenExpiresAt: expect.any(String),
        user: { email: 'ada@example.com', name: 'Ada Lovelace' },
      });
    });

    it('rejects a token Google will not verify', async () => {
      const response = await signIn('forged');
      expect(response.statusCode).toBe(401);
    });

    it('rejects a malformed request body', async () => {
      const response = await app.inject({ method: 'POST', url: '/auth/google', payload: {} });
      expect(response.statusCode).toBe(400);
    });

    it('reuses the existing user on repeated sign-in', async () => {
      const first = (await signIn('ada')).json();
      const second = (await signIn('ada')).json();

      expect(second.user.id).toBe(first.user.id);
      const rows = await app.db.select().from(users);
      expect(rows).toHaveLength(1);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rotates the session and invalidates the old refresh token', async () => {
      const { refreshToken } = (await signIn('ada')).json();

      const rotated = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      });
      expect(rotated.statusCode).toBe(200);
      expect(rotated.json().refreshToken).not.toBe(refreshToken);

      const reuse = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      });
      expect(reuse.statusCode).toBe(401);
    });

    it('signs the user out everywhere when an old refresh token comes back', async () => {
      const { refreshToken } = (await signIn('ada')).json();
      const rotated = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      });

      await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });

      const afterReuse = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: rotated.json().refreshToken },
      });
      expect(afterReuse.statusCode).toBe(401);
      expect(afterReuse.json()).toEqual({ error: 'invalid_refresh_token' });
    });

    it('rejects an unknown refresh token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: 'nonsense' },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the session and is idempotent', async () => {
      const { refreshToken } = (await signIn('ada')).json();

      const first = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        payload: { refreshToken },
      });
      expect(first.statusCode).toBe(204);

      const refreshAfterLogout = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken },
      });
      expect(refreshAfterLogout.statusCode).toBe(401);

      const second = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        payload: { refreshToken },
      });
      expect(second.statusCode).toBe(204);
    });
  });

  describe('GET /auth/me', () => {
    it('returns the profile for a valid access token', async () => {
      const { accessToken } = (await signIn('ada')).json();

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().user.email).toBe('ada@example.com');
    });

    it('rejects a request without a token', async () => {
      const response = await app.inject({ method: 'GET', url: '/auth/me' });
      expect(response.statusCode).toBe(401);
    });

    it('rejects a garbage token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: 'Bearer not-a-jwt' },
      });
      expect(response.statusCode).toBe(401);
    });
  });
});

describe('GET /auth/me with an expired access token', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp({
      auth: {
        googleVerifier: google,
        accessTokens: createAccessTokenService('expired-suite-secret-16chars', -1),
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('is rejected as unauthorized', async () => {
    const { accessToken } = (
      await app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: 'ada' } })
    ).json();

    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(401);
  });
});
