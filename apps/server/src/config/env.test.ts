import { describe, expect, it } from 'vitest';

import { loadEnv, parseTrustProxy } from './env.js';

/** The variables that are required whatever the environment. */
const base = {
  GOOGLE_CLIENT_IDS: 'web.apps.googleusercontent.com',
  AUTH_JWT_SECRET: 'a-secret-that-is-long-enough',
};

const production = {
  ...base,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://user:pass@db.internal:5432/ardoise',
  PUBLIC_BASE_URL: 'https://api.ardoise.test',
  TRUST_PROXY: '1',
};

describe('loadEnv', () => {
  describe('in development', () => {
    it('falls back to the embedded database and a local base URL', () => {
      const env = loadEnv({ ...base, NODE_ENV: 'development' });

      expect(env.DATABASE_URL).toBeUndefined();
      expect(env.PUBLIC_BASE_URL).toBe('http://localhost:3000');
      expect(env.TRUST_PROXY).toBe(false);
    });
  });

  describe('in production', () => {
    it('accepts a complete configuration', () => {
      const env = loadEnv(production);

      expect(env.DATABASE_URL).toBe(production.DATABASE_URL);
      expect(env.PUBLIC_BASE_URL).toBe(production.PUBLIC_BASE_URL);
    });

    it('is the default when NODE_ENV is not set, so a forgotten variable cannot skip the checks', () => {
      expect(() => loadEnv(base)).toThrow(/DATABASE_URL: is required/);
    });

    it('refuses to start without DATABASE_URL, instead of using an in-memory database', () => {
      const source: Record<string, string | undefined> = { ...production };
      delete source.DATABASE_URL;

      expect(() => loadEnv(source)).toThrow(
        'DATABASE_URL: is required when NODE_ENV=production',
      );
    });

    it('refuses to start without PUBLIC_BASE_URL', () => {
      const source: Record<string, string | undefined> = { ...production };
      delete source.PUBLIC_BASE_URL;

      expect(() => loadEnv(source)).toThrow(
        'PUBLIC_BASE_URL: is required when NODE_ENV=production',
      );
    });

    it('refuses to start without TRUST_PROXY, since neither default is right behind a load balancer', () => {
      const source: Record<string, string | undefined> = { ...production };
      delete source.TRUST_PROXY;

      expect(() => loadEnv(source)).toThrow(
        'TRUST_PROXY: is required when NODE_ENV=production',
      );
    });

    it('accepts TRUST_PROXY=false explicitly, for a server with no proxy in front', () => {
      expect(loadEnv({ ...production, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false);
    });

    it.each([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://[::1]:3000',
      'http://0.0.0.0:3000',
      'http://api.localhost',
    ])('refuses a PUBLIC_BASE_URL that points at the local machine (%s)', (url) => {
      expect(() => loadEnv({ ...production, PUBLIC_BASE_URL: url })).toThrow(
        /PUBLIC_BASE_URL: must not point at a local address/,
      );
    });

    it('reports every problem at once', () => {
      expect(() => loadEnv({ ...base, NODE_ENV: 'production' })).toThrow(
        /DATABASE_URL.*TRUST_PROXY.*PUBLIC_BASE_URL/,
      );
    });
  });

  it('rejects a TRUST_PROXY that is not understood, in any environment', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'development', TRUST_PROXY: 'yes' })).toThrow(
      /TRUST_PROXY: must be true, false/,
    );
  });
});

describe('parseTrustProxy', () => {
  it.each([
    ['true', true],
    ['false', false],
    [' FALSE ', false],
    ['1', 1],
    ['2', 2],
    ['10.0.0.0/8', ['10.0.0.0/8']],
    ['10.0.0.0/8, 192.168.1.5', ['10.0.0.0/8', '192.168.1.5']],
    ['2001:db8::/32', ['2001:db8::/32']],
    ['loopback,uniquelocal', ['loopback', 'uniquelocal']],
  ])('parses %j', (raw, expected) => {
    expect(parseTrustProxy(raw)).toEqual(expected);
  });

  it.each(['', 'yes', '-1', '1.5', '10.0.0.0/33', '10.0.0.0/8/9', 'example.com', '10.0.0.0/8,,'])(
    'rejects %j',
    (raw) => {
      expect(parseTrustProxy(raw)).toBeUndefined();
    },
  );
});
