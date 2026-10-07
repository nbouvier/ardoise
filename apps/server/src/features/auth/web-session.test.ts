import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestContext, type TestContext } from '../../test/app.js';
import { createPasswordAccount } from '../../test/auth.js';

const WEB_APP = 'http://localhost:8081';
const PASSWORD = 'correct horse battery';
const WEB = { 'x-ardoise-client': 'web', origin: WEB_APP };

/** The `ardoise_refresh` cookie a response sets, with its attributes. */
function refreshCookie(headers: Record<string, unknown>): string | undefined {
  const raw = headers['set-cookie'];
  const all = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return all.find((cookie: string) => cookie.startsWith('ardoise_refresh='));
}

const tokenOf = (cookie: string | undefined) => cookie?.split(';')[0]?.split('=')[1] ?? '';

describe('web sessions', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await createTestContext({ webOrigins: [WEB_APP] });
  });

  afterAll(async () => {
    await context.app.close();
  });

  beforeEach(async () => {
    await context.reset();
    await createPasswordAccount(context.app, { email: 'ada@example.com', password: PASSWORD });
  });

  const post = (url: string, payload: object | undefined, headers: Record<string, string>) =>
    context.app.inject({ method: 'POST', url, payload, headers });

  const signInOnWeb = () =>
    post('/auth/password', { email: 'ada@example.com', password: PASSWORD }, WEB);

  const withCookie = (token: string) => ({ ...WEB, cookie: `ardoise_refresh=${token}` });

  it('puts the refresh token in an HttpOnly cookie scoped to /auth, never in the body', async () => {
    const response = await signInOnWeb();

    expect(response.statusCode).toBe(200);
    expect(response.json()).not.toHaveProperty('refreshToken');
    expect(response.json()).toMatchObject({ accessToken: expect.any(String) });
    const cookie = refreshCookie(response.headers);
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/auth');
    expect(cookie).toMatch(/Max-Age=\d+/);
  });

  it('refreshes from the cookie, rotating it, and refuses the rotated one', async () => {
    const first = tokenOf(refreshCookie((await signInOnWeb()).headers));

    const refreshed = await post('/auth/refresh', undefined, withCookie(first));

    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json()).not.toHaveProperty('refreshToken');
    const second = tokenOf(refreshCookie(refreshed.headers));
    expect(second).not.toBe('');
    expect(second).not.toBe(first);

    const reused = await post('/auth/refresh', undefined, withCookie(first));
    expect(reused.statusCode).toBe(401);
    // And the browser is told to forget it.
    expect(refreshCookie(reused.headers)).toMatch(/ardoise_refresh=;/);
  });

  it('answers 401 to a web refresh without a cookie', async () => {
    const response = await post('/auth/refresh', undefined, WEB);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'invalid_refresh_token' });
  });

  it('signs out from the cookie: revokes the session and clears the cookie', async () => {
    const token = tokenOf(refreshCookie((await signInOnWeb()).headers));

    const response = await post('/auth/logout', undefined, withCookie(token));

    expect(response.statusCode).toBe(204);
    expect(refreshCookie(response.headers)).toMatch(/ardoise_refresh=;/);
    expect((await post('/auth/refresh', undefined, withCookie(token))).statusCode).toBe(401);
  });

  it('refuses a web request from another origin, or none', async () => {
    const elsewhere = await post(
      '/auth/password',
      { email: 'ada@example.com', password: PASSWORD },
      { 'x-ardoise-client': 'web', origin: 'https://evil.example' },
    );
    const noOrigin = await post('/auth/refresh', undefined, { 'x-ardoise-client': 'web' });

    for (const response of [elsewhere, noOrigin]) {
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'forbidden_origin' });
    }
  });

  it('ignores the cookie without the web header, as a form from another site would send it', async () => {
    const token = tokenOf(refreshCookie((await signInOnWeb()).headers));

    const response = await context.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { origin: 'https://evil.example', cookie: `ardoise_refresh=${token}` },
    });

    expect(response.statusCode).toBe(400);
  });

  it('leaves native clients as they were: the token in the body, no cookie', async () => {
    const response = await post(
      '/auth/password',
      { email: 'ada@example.com', password: PASSWORD },
      {},
    );

    expect(response.json()).toHaveProperty('refreshToken');
    expect(refreshCookie(response.headers)).toBeUndefined();
  });

  describe('CORS', () => {
    const preflight = (origin: string) =>
      context.app.inject({
        method: 'OPTIONS',
        url: '/auth/password',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type,x-ardoise-client',
        },
      });

    it('answers the web app, with credentials and the web header allowed', async () => {
      const response = await preflight(WEB_APP);

      expect(response.headers['access-control-allow-origin']).toBe(WEB_APP);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(String(response.headers['access-control-allow-headers'])).toContain(
        'x-ardoise-client',
      );
    });

    it('gives another origin no CORS header at all', async () => {
      const response = await preflight('https://evil.example');

      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    });
  });
});
