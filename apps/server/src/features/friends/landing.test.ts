import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp } from '../../test/app.js';
import { fakeGoogleVerifier } from '../../test/google.js';

import { escapeHtml } from './landing.js';

const google = fakeGoogleVerifier({
  ada: { sub: 'google-ada', email: 'ada@example.com', name: 'Ada Lovelace' },
  // A display name is whatever Google holds for the account — including markup.
  mallory: { sub: 'google-mallory', email: 'm@example.com', name: '<script>alert(1)</script>' },
});

describe('escapeHtml', () => {
  it('neutralises markup and quotes', () => {
    expect(escapeHtml(`<a href="x">O'Neill & co</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;O&#39;Neill &amp; co&lt;/a&gt;',
    );
  });
});

describe('GET /i/:code', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp({
      auth: { googleVerifier: google },
      friends: { publicBaseUrl: 'https://splitcount.test', storeLinks: {} },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  async function inviteCodeFor(idToken: string): Promise<string> {
    const session = (
      await app.inject({ method: 'POST', url: '/auth/google', payload: { idToken } })
    ).json();
    const response = await app.inject({
      method: 'POST',
      url: '/friends/invite',
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    return response.json().invite.code as string;
  }

  it('serves an HTML page carrying the deep link and the manual code', async () => {
    const code = await inviteCodeFor('ada');

    const response = await app.inject({ method: 'GET', url: `/i/${code}` });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain(`splitcount://invite/${code}`);
    expect(response.body).toContain('Ada Lovelace');
    expect(response.body).toContain(code);
  });

  it('never lets the code be cached', async () => {
    const code = await inviteCodeFor('ada');
    const response = await app.inject({ method: 'GET', url: `/i/${code}` });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('escapes an inviter name containing markup', async () => {
    const code = await inviteCodeFor('mallory');

    const response = await app.inject({ method: 'GET', url: `/i/${code}` });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('<script>alert(1)</script>');
    expect(response.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('shows the "no longer valid" page for an unknown code', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/i/AAAAAAAAAAAAAAAAAAAAAA',
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('no longer valid');
    expect(response.body).not.toContain('splitcount://invite');
  });

  it('shows the same page for a malformed code', async () => {
    const response = await app.inject({ method: 'GET', url: '/i/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.body).toContain('no longer valid');
  });

  it('shows the "no longer valid" page once the invitation is revoked', async () => {
    const session = (
      await app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: 'ada' } })
    ).json();
    const headers = { authorization: `Bearer ${session.accessToken}` };
    const code = (
      await app.inject({ method: 'POST', url: '/friends/invite', headers })
    ).json().invite.code;

    await app.inject({ method: 'DELETE', url: '/friends/invite', headers });

    const response = await app.inject({ method: 'GET', url: `/i/${code}` });
    expect(response.statusCode).toBe(404);
    expect(response.body).toContain('no longer valid');
  });

  it('links to the stores when they are configured', async () => {
    await app.close();
    app = await createTestApp({
      auth: { googleVerifier: google },
      friends: {
        storeLinks: {
          appStoreUrl: 'https://apps.apple.com/app/id1',
          playStoreUrl: 'https://play.google.com/store/apps/details?id=x',
        },
      },
    });
    const code = await inviteCodeFor('ada');

    const response = await app.inject({ method: 'GET', url: `/i/${code}` });

    expect(response.body).toContain('https://apps.apple.com/app/id1');
    expect(response.body).toContain('Google Play');
  });
});
