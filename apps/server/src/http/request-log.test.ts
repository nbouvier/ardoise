import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestContext } from '../test/app.js';

describe('request logs', () => {
  let app: FastifyInstance;
  const logs: Record<string, unknown>[] = [];

  beforeAll(async () => {
    ({ app } = await createTestContext({
      log: { level: 'info', stream: { write: (line) => logs.push(JSON.parse(line)) } },
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logs.length = 0;
  });

  it.each(['/i/AbCdEf0123456789xyz', '/invites/AbCdEf0123456789xyz', '/invites/AbCdEf0123456789xyz/accept'])(
    'keeps the invitation code out of %s',
    async (url) => {
      await app.inject({ method: 'GET', url });

      const requestLines = logs.filter((line) => line.req !== undefined);
      expect(requestLines.length).toBeGreaterThan(0);
      expect(JSON.stringify(logs)).not.toContain('AbCdEf0123456789xyz');
      expect(requestLines[0]?.req).toEqual({ method: 'GET', url: url.replace('AbCdEf0123456789xyz', '[code]') });
    },
  );

  it('answers an unknown route with the API’s error shape', async () => {
    const response = await app.inject({ method: 'GET', url: '/nowhere' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'route_not_found' });
  });
});
