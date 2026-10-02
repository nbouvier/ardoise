import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';

import { registerErrorHandler } from './error-handler.js';

/** What `pg` throws on a unique violation: the message names the constraint, `detail` the value. */
function postgresError(): Error {
  return Object.assign(
    new Error('duplicate key value violates unique constraint "users_email_unique"'),
    {
      code: '23505',
      constraint: 'users_email_unique',
      detail: 'Key (email)=(ada@example.com) already exists.',
    },
  );
}

describe('error handler', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function appWithFailingRoute(error: Error) {
    const logs: Record<string, unknown>[] = [];
    app = Fastify({
      logger: {
        level: 'info',
        stream: { write: (line: string) => logs.push(JSON.parse(line)) },
      },
    });
    registerErrorHandler(app);
    app.get('/boom', () => {
      throw error;
    });
    await app.ready();
    return { app, logs };
  }

  it('sends a generic body for an unexpected error, never its message', async () => {
    const { app } = await appWithFailingRoute(postgresError());

    const response = await app.inject({ method: 'GET', url: '/boom' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'internal_error' });
    expect(response.body).not.toMatch(/users_email_unique|ada@example\.com|duplicate/);
  });

  it('keeps the status of a 5xx error but still hides its message', async () => {
    const { app } = await appWithFailingRoute(
      Object.assign(new Error('connect ECONNREFUSED 10.0.0.12:5432'), { statusCode: 503 }),
    );

    const response = await app.inject({ method: 'GET', url: '/boom' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'internal_error' });
  });

  it('logs the failure with enough context to diagnose it, but not the offending value', async () => {
    const { app, logs } = await appWithFailingRoute(postgresError());

    await app.inject({ method: 'GET', url: '/boom' });

    const entry = logs.find((line) => line.msg === 'http.request.failed');
    expect(entry).toMatchObject({
      level: 50,
      error: {
        type: 'Error',
        code: '23505',
        message: expect.stringContaining('users_email_unique') as unknown,
      },
    });
    expect(JSON.stringify(entry)).not.toContain('ada@example.com');
  });

  it('answers a client error with its status and an error code', async () => {
    const { app } = await appWithFailingRoute(
      Object.assign(new Error('Body is too large'), { statusCode: 413, code: 'FST_ERR_CTP_BODY_TOO_LARGE' }),
    );

    const response = await app.inject({ method: 'GET', url: '/boom' });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: 'payload_too_large' });
  });

  it('answers a malformed JSON body with the API-wide invalid_request code', async () => {
    app = buildApp();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/auth/google',
      headers: { 'content-type': 'application/json' },
      payload: '{"idToken": ',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_request' });
  });
});
