import { describe, expect, it } from 'vitest';

import { loadEnv, parseTrustProxy } from './env.js';

/** The variables that are required whatever the environment. */
const base = {
  GOOGLE_CLIENT_IDS: 'web.apps.googleusercontent.com',
  AUTH_JWT_SECRET: 'x'.repeat(32),
};

const production = {
  ...base,
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://user:pass@db.internal:5432/ardoise',
  PUBLIC_BASE_URL: 'https://api.ardoise.test',
  TRUST_PROXY: '1',
  CONTACT_EMAIL: 'contact@example.com',
  LEGAL_PUBLISHER_NAME: 'Jane Doe',
  LEGAL_HOST_NAME: 'Example Hosting',
  LEGAL_HOST_ADDRESS: '1 Example Street, 75000 Paris, France',
  LEGAL_HOST_PHONE: '+33 1 00 00 00 00',
};

describe('loadEnv', () => {
  describe('in development', () => {
    it('falls back to the embedded database and a local base URL', () => {
      const env = loadEnv({ ...base, NODE_ENV: 'development' });

      expect(env.DATABASE_URL).toBeUndefined();
      expect(env.PUBLIC_BASE_URL).toBe('http://localhost:3000');
      expect(env.TRUST_PROXY).toBe(false);
    });

    it('refuses a JWT secret shorter than 32 characters', () => {
      expect(() =>
        loadEnv({ ...base, NODE_ENV: 'development', AUTH_JWT_SECRET: 'x'.repeat(31) }),
      ).toThrow(/AUTH_JWT_SECRET/);
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

  describe('error reporting', () => {
    it('is off without a DSN, and files reports under NODE_ENV by default', () => {
      const env = loadEnv(production);

      expect(env.SENTRY_DSN).toBeUndefined();
      expect(env.SENTRY_ENVIRONMENT).toBe('production');
      expect(env.APP_RELEASE).toBeUndefined();
    });

    it('takes the DSN, the environment and the release from the deployment', () => {
      const env = loadEnv({
        ...production,
        SENTRY_DSN: 'https://public@o0.ingest.example.test/1',
        SENTRY_ENVIRONMENT: 'staging',
        APP_RELEASE: 'sha-abc1234',
      });

      expect(env.SENTRY_DSN).toBe('https://public@o0.ingest.example.test/1');
      expect(env.SENTRY_ENVIRONMENT).toBe('staging');
      expect(env.APP_RELEASE).toBe('sha-abc1234');
    });

    it('treats the empty release of an image built without one as unknown', () => {
      expect(loadEnv({ ...production, APP_RELEASE: '' }).APP_RELEASE).toBeUndefined();
    });

    it('refuses a DSN that is not a URL rather than silently reporting nothing', () => {
      expect(() => loadEnv({ ...production, SENTRY_DSN: 'not-a-dsn' })).toThrow(/SENTRY_DSN/);
    });
  });

  describe('legal pages', () => {
    it('are optional outside production', () => {
      const env = loadEnv({ ...base, NODE_ENV: 'development' });

      expect(env.CONTACT_EMAIL).toBeUndefined();
      expect(env.LEGAL_PUBLISHER_NAME).toBeUndefined();
    });

    it('takes the publisher, the contact and the host as given', () => {
      const env = loadEnv(production);

      expect(env.CONTACT_EMAIL).toBe('contact@example.com');
      expect(env.LEGAL_PUBLISHER_NAME).toBe('Jane Doe');
      expect(env.LEGAL_HOST_PHONE).toBe('+33 1 00 00 00 00');
    });

    it.each([
      'CONTACT_EMAIL',
      'LEGAL_PUBLISHER_NAME',
      'LEGAL_HOST_NAME',
      'LEGAL_HOST_ADDRESS',
      'LEGAL_HOST_PHONE',
    ])('refuses to start in production without %s, which the legal pages need', (name) => {
      const source: Record<string, string | undefined> = { ...production };
      delete source[name];

      expect(() => loadEnv(source)).toThrow(`${name}: is required when NODE_ENV=production`);
    });

    it('refuses a blank value as missing', () => {
      expect(() => loadEnv({ ...production, LEGAL_PUBLISHER_NAME: '  ' })).toThrow(
        /LEGAL_PUBLISHER_NAME/,
      );
    });

    it('refuses a contact that is not an e-mail address, which every public page shows', () => {
      expect(() => loadEnv({ ...production, CONTACT_EMAIL: 'write to us' })).toThrow(
        /CONTACT_EMAIL/,
      );
    });
  });

  describe('Android App Links', () => {
    const fingerprint = (byte: string) => Array.from({ length: 32 }, () => byte).join(':');

    it('are optional', () => {
      const env = loadEnv(production);

      expect(env.ANDROID_APP_ID).toBeUndefined();
      expect(env.ANDROID_CERT_FINGERPRINTS).toBeUndefined();
    });

    it('reads a comma-separated list of fingerprints, uppercased', () => {
      const env = loadEnv({
        ...production,
        ANDROID_APP_ID: 'app.example.ardoise',
        ANDROID_CERT_FINGERPRINTS: ` ${fingerprint('ab')} , ${fingerprint('CD')}`,
      });

      expect(env.ANDROID_CERT_FINGERPRINTS).toEqual([fingerprint('AB'), fingerprint('CD')]);
    });

    it.each([
      ['a truncated fingerprint', fingerprint('AB').slice(0, -3)],
      ['a SHA-1 fingerprint', Array.from({ length: 20 }, () => 'AB').join(':')],
      ['bare hex', 'AB'.repeat(32)],
    ])('refuses %s', (_label, value) => {
      expect(() =>
        loadEnv({
          ...production,
          ANDROID_APP_ID: 'app.example.ardoise',
          ANDROID_CERT_FINGERPRINTS: value,
        }),
      ).toThrow(/ANDROID_CERT_FINGERPRINTS/);
    });

    it('refuses fingerprints without the app they vouch for', () => {
      expect(() =>
        loadEnv({ ...production, ANDROID_CERT_FINGERPRINTS: fingerprint('AB') }),
      ).toThrow('ANDROID_APP_ID: is required when ANDROID_CERT_FINGERPRINTS is set');
    });

    it('refuses an application id Android would not accept', () => {
      expect(() => loadEnv({ ...production, ANDROID_APP_ID: 'ardoise' })).toThrow(
        /ANDROID_APP_ID/,
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
