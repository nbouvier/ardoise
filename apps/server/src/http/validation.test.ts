import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { reportError } from '../error-reporting.js';

import { registerErrorHandler } from './error-handler.js';
import { InvalidRequestError, parseRequest } from './validation.js';

vi.mock('../error-reporting.js', () => ({ reportError: vi.fn() }));

const schema = z.object({ name: z.string().trim().min(1) });

describe('parseRequest', () => {
  afterEach(() => {
    vi.mocked(reportError).mockClear();
  });

  it('returns the parsed value, transforms applied', () => {
    expect(parseRequest(schema, { name: '  Corsica  ' })).toEqual({ name: 'Corsica' });
  });

  it('throws an InvalidRequestError for a value the schema refuses', () => {
    expect(() => parseRequest(schema, { name: '' })).toThrow(InvalidRequestError);
    expect(() => parseRequest(schema, undefined)).toThrow(InvalidRequestError);
  });

  it('answers 400 invalid_request through the error handler, without reporting it', async () => {
    const app = Fastify({ logger: false });
    registerErrorHandler(app);
    app.post('/groups', async (request) => parseRequest(schema, request.body));

    const response = await app.inject({ method: 'POST', url: '/groups', payload: { name: 1 } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_request' });
    expect(reportError).not.toHaveBeenCalled();
    await app.close();
  });
});
