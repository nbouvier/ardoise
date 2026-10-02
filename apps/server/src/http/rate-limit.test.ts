import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp } from '../test/app.js';

const CODE = 'abcdefghijklmnop0123';

describe('rate limiting', () => {
  let app: FastifyInstance;
  let nextClient = 0;

  beforeAll(async () => {
    app = await createTestApp({
      rateLimit: { globalPerMinute: 6, authPerMinute: 3, publicPerMinute: 2 },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  /** A client address no other test has used, so each test starts with fresh counters. */
  function newClient(): string {
    nextClient += 1;
    return `203.0.113.${nextClient}`;
  }

  const authRequest = (address: string, url = '/auth/google') =>
    app.inject({ method: 'POST', url, remoteAddress: address, payload: {} });

  describe('/auth/*', () => {
    it('answers 429 rate_limited once a client exhausts the auth budget', async () => {
      const client = newClient();

      for (let i = 0; i < 3; i += 1) {
        expect((await authRequest(client)).statusCode).toBe(400);
      }
      const blocked = await authRequest(client);

      expect(blocked.statusCode).toBe(429);
      expect(blocked.json()).toEqual({ error: 'rate_limited' });
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('shares one budget across every /auth route, so rotating routes does not reset it', async () => {
      const client = newClient();

      await authRequest(client, '/auth/google');
      await authRequest(client, '/auth/refresh');
      await authRequest(client, '/auth/logout');

      expect((await authRequest(client, '/auth/refresh')).statusCode).toBe(429);
    });

    it('limits each client address on its own', async () => {
      const noisy = newClient();
      const quiet = newClient();
      for (let i = 0; i < 4; i += 1) {
        await authRequest(noisy);
      }

      expect((await authRequest(noisy)).statusCode).toBe(429);
      expect((await authRequest(quiet)).statusCode).toBe(400);
    });

    it('does not draw from the global budget', async () => {
      const client = newClient();
      // 3 auth requests: below the auth limit, but half the global one.
      for (let i = 0; i < 3; i += 1) {
        await authRequest(client);
      }

      for (let i = 0; i < 6; i += 1) {
        const response = await app.inject({
          method: 'GET',
          url: '/groups',
          remoteAddress: client,
        });
        expect(response.statusCode).toBe(401);
      }
    });
  });

  describe('public invitation routes', () => {
    it('share one tight budget between the landing page and the JSON preview', async () => {
      const client = newClient();
      const get = (url: string) =>
        app.inject({ method: 'GET', url, remoteAddress: client });

      expect((await get(`/i/${CODE}`)).statusCode).toBe(404);
      expect((await get(`/invites/${CODE}`)).statusCode).toBe(404);

      const page = await get(`/i/${CODE}`);
      expect(page.statusCode).toBe(429);
      expect(page.json()).toEqual({ error: 'rate_limited' });
      expect((await get(`/invites/${CODE}`)).statusCode).toBe(429);
    });

    it('leave the authenticated accept route on the global budget', async () => {
      const client = newClient();

      for (let i = 0; i < 3; i += 1) {
        const response = await app.inject({
          method: 'POST',
          url: `/invites/${CODE}/accept`,
          remoteAddress: client,
        });
        expect(response.statusCode).toBe(401);
      }
    });
  });

  describe('the rest of the API', () => {
    it('shares one global budget across routes', async () => {
      const client = newClient();
      const get = (url: string) =>
        app.inject({ method: 'GET', url, remoteAddress: client });

      for (const url of ['/groups', '/friends', '/groups', '/friends', '/groups', '/friends']) {
        expect((await get(url)).statusCode).toBe(401);
      }

      expect((await get('/groups')).statusCode).toBe(429);
    });

    it('reports the budget in X-RateLimit headers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/groups',
        remoteAddress: newClient(),
      });

      expect(response.headers['x-ratelimit-limit']).toBe('6');
      expect(response.headers['x-ratelimit-remaining']).toBe('5');
    });
  });

  it('never limits /health, so load balancer probes keep working', async () => {
    const client = newClient();

    for (let i = 0; i < 20; i += 1) {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
        remoteAddress: client,
      });
      expect(response.statusCode).toBe(200);
    }
  });
});
