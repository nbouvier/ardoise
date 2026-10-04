import { createHash } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, createTestContext } from '../../test/app.js';
import { signInAs } from '../../test/auth.js';
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
  let reset: () => Promise<void>;

  beforeAll(async () => {
    ({ app, reset } = await createTestContext({
      auth: { googleVerifier: google },
      invites: { publicBaseUrl: 'https://ardoise.test', storeLinks: {} },
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => reset());

  async function friendInviteCodeFor(idToken: string): Promise<string> {
    const user = await signInAs(app, idToken);
    const response = await app.inject({
      method: 'POST',
      url: '/friends/invite',
      headers: user.headers,
    });
    return response.json().invite.code as string;
  }

  /** A group whose name is whatever the test needs, plus its invitation code. */
  async function groupInviteCodeFor(idToken: string, name: string): Promise<string> {
    const user = await signInAs(app, idToken);
    const group = (
      await app.inject({
        method: 'POST',
        url: '/groups',
        headers: user.headers,
        payload: { name },
      })
    ).json().group;

    const response = await app.inject({
      method: 'POST',
      url: `/groups/${group.id}/invite`,
      headers: user.headers,
    });
    return response.json().invite.code as string;
  }

  it('serves an HTML page carrying the deep link and the manual code', async () => {
    const code = await friendInviteCodeFor('ada');

    const response = await app.inject({ method: 'GET', url: `/i/${code}` });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain(`ardoise://invite/${code}`);
    expect(response.body).toContain('Ada Lovelace');
    expect(response.body).toContain(code);
  });

  it('names the group a group invitation leads to', async () => {
    const code = await groupInviteCodeFor('ada', 'Corsica 2026');

    const response = await app.inject({ method: 'GET', url: `/i/${code}` });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Ada Lovelace');
    expect(response.body).toContain('Corsica 2026');
    expect(response.body).toContain(`ardoise://invite/${code}`);
  });

  it('never lets the code be cached', async () => {
    const code = await friendInviteCodeFor('ada');
    const response = await app.inject({ method: 'GET', url: `/i/${code}` });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  describe('Content-Security-Policy', () => {
    /** The hash CSP expects for an inline block's text. */
    const hashOf = (text: string) =>
      `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
    const inlineBlock = (html: string, tag: 'script' | 'style') =>
      (tag === 'script'
        ? /<script>([\s\S]*?)<\/script>/
        : /<style>([\s\S]*?)<\/style>/
      ).exec(html)?.[1] ?? '';

    it('allows only the inline script and style of the page itself, pinned by hash', async () => {
      const code = await friendInviteCodeFor('ada');

      const response = await app.inject({ method: 'GET', url: `/i/${code}` });
      const policy = response.headers['content-security-policy'] as string;

      expect(policy).toContain("default-src 'none'");
      expect(policy).toContain(`script-src ${hashOf(inlineBlock(response.body, 'script'))}`);
      expect(policy).toContain(`style-src ${hashOf(inlineBlock(response.body, 'style'))}`);
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).not.toContain('unsafe-inline');
    });

    it('allows no script on the "no longer valid" page, which has none', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/i/does-not-exist-0123456789',
      });
      const policy = response.headers['content-security-policy'] as string;

      expect(response.statusCode).toBe(404);
      expect(policy).toContain(`style-src ${hashOf(inlineBlock(response.body, 'style'))}`);
      expect(policy).not.toContain('script-src');
    });
  });

  it('escapes an inviter name containing markup', async () => {
    const code = await friendInviteCodeFor('mallory');

    const response = await app.inject({ method: 'GET', url: `/i/${code}` });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('<script>alert(1)</script>');
    expect(response.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes a group name containing markup', async () => {
    const code = await groupInviteCodeFor('ada', '<img src=x onerror=alert(1)>');

    const response = await app.inject({ method: 'GET', url: `/i/${code}` });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('<img src=x');
    expect(response.body).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('shows the "no longer valid" page for an unknown code', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/i/AAAAAAAAAAAAAAAAAAAAAA',
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('no longer valid');
    expect(response.body).not.toContain('ardoise://invite');
  });

  it('shows the same page for a malformed code', async () => {
    const response = await app.inject({ method: 'GET', url: '/i/nope' });
    expect(response.statusCode).toBe(404);
    expect(response.body).toContain('no longer valid');
  });

  it('shows the "no longer valid" page once the invitation is revoked', async () => {
    const ada = await signInAs(app, 'ada');
    const code = (
      await app.inject({ method: 'POST', url: '/friends/invite', headers: ada.headers })
    ).json().invite.code;

    await app.inject({ method: 'DELETE', url: '/friends/invite', headers: ada.headers });

    const response = await app.inject({ method: 'GET', url: `/i/${code}` });
    expect(response.statusCode).toBe(404);
    expect(response.body).toContain('no longer valid');
  });

  it('links to the stores when they are configured', async () => {
    // Its own instance: the store links are fixed when the app is built.
    const configured = await createTestApp({
      auth: { googleVerifier: google },
      invites: {
        storeLinks: {
          appStoreUrl: 'https://apps.apple.com/app/id1',
          playStoreUrl: 'https://play.google.com/store/apps/details?id=x',
        },
      },
    });

    try {
      const ada = await signInAs(configured, 'ada');
      const code = (
        await configured.inject({
          method: 'POST',
          url: '/friends/invite',
          headers: ada.headers,
        })
      ).json().invite.code;

      const response = await configured.inject({ method: 'GET', url: `/i/${code}` });

      expect(response.body).toContain('https://apps.apple.com/app/id1');
      expect(response.body).toContain('Google Play');
    } finally {
      await configured.close();
    }
  });
});

describe('GET /invites/:code', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp({ auth: { googleVerifier: google } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports an unknown code as not found', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/invites/AAAAAAAAAAAAAAAAAAAAAA',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'invite_not_found' });
  });

  it('does not leak whether a malformed code ever existed', async () => {
    const response = await app.inject({ method: 'GET', url: '/invites/short' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'invite_not_found' });
  });
});
