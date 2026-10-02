import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp, type BuildAppOptions } from '../app.js';

describe('trustProxy', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  /** What `request.ip` resolves to for a request from `socketAddress` carrying `forwardedFor`. */
  async function resolvedIp(
    trustProxy: BuildAppOptions['trustProxy'],
    socketAddress: string,
    forwardedFor: string,
  ): Promise<string> {
    app = buildApp({ trustProxy });
    // Routes can still be added: the instance is built but not started.
    app.get('/ip', (request) => ({ ip: request.ip }));
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/ip',
      remoteAddress: socketAddress,
      headers: { 'x-forwarded-for': forwardedFor },
    });
    return (response.json() as { ip: string }).ip;
  }

  it('ignores X-Forwarded-For when no proxy is trusted, so a client cannot choose its address', async () => {
    expect(await resolvedIp(false, '203.0.113.9', '198.51.100.7')).toBe('203.0.113.9');
  });

  it('reads the client address from X-Forwarded-For when the peer is a trusted proxy', async () => {
    expect(await resolvedIp(['10.0.0.0/8'], '10.0.1.2', '198.51.100.7')).toBe('198.51.100.7');
  });

  it('does not trust X-Forwarded-For from a peer outside the trusted range', async () => {
    expect(await resolvedIp(['10.0.0.0/8'], '203.0.113.9', '198.51.100.7')).toBe('203.0.113.9');
  });

  it('counts hops from the server, so an address forged by the client is not the one used', async () => {
    // One trusted hop: the proxy appended the real client to what the client sent.
    expect(await resolvedIp(1, '10.0.1.2', '1.2.3.4, 198.51.100.7')).toBe('198.51.100.7');
  });
});
