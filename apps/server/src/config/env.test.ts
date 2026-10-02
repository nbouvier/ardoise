import { describe, expect, it } from 'vitest';

import { loadEnv } from './env.js';

/** The variables that are required whatever the environment. */
const base = {
  GOOGLE_CLIENT_IDS: 'web.apps.googleusercontent.com',
  AUTH_JWT_SECRET: 'a-secret-that-is-long-enough',
};

const production = {
  ...base,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://user:pass@db.internal:5432/splitcount',
  PUBLIC_BASE_URL: 'https://api.splitcount.app',
};

describe('loadEnv', () => {
  describe('in development', () => {
    it('falls back to the embedded database and a local base URL', () => {
      const env = loadEnv({ ...base, NODE_ENV: 'development' });

      expect(env.DATABASE_URL).toBeUndefined();
      expect(env.PUBLIC_BASE_URL).toBe('http://localhost:3000');
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
        /DATABASE_URL.*PUBLIC_BASE_URL/,
      );
    });
  });
});
