import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp } from '../test/app.js';

describe('security headers', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp({ rateLimit: { authPerMinute: 1 } });
  });

  afterAll(async () => {
    await app.close();
  });

  it('forbids rendering, framing and sniffing of an API response', async () => {
    const { headers } = await app.inject({ method: 'GET', url: '/health' });

    expect(headers['content-security-policy']).toBe(
      "default-src 'none';base-uri 'none';form-action 'none';frame-ancestors 'none'",
    );
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(headers['strict-transport-security']).toBe('max-age=15552000');
  });

  it('does not advertise the framework', async () => {
    const { headers } = await app.inject({ method: 'GET', url: '/health' });

    expect(headers['x-powered-by']).toBeUndefined();
  });

  it('also covers error responses, so a 404 or a 429 is no exception', async () => {
    const notFound = await app.inject({ method: 'GET', url: '/nope' });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.headers['x-content-type-options']).toBe('nosniff');

    await app.inject({ method: 'POST', url: '/auth/google', payload: {} });
    const limited = await app.inject({ method: 'POST', url: '/auth/google', payload: {} });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['x-content-type-options']).toBe('nosniff');
    expect(limited.headers['content-security-policy']).toContain("default-src 'none'");
  });
});
