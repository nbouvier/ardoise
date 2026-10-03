import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Every database-backed file starts its own PGlite and migrates it — a
    // second or two on its own, and they all run at once, so the defaults
    // (10s for a hook, 5s for a test) are not the setup being slow, they are
    // the machine being busy. Usually a `beforeAll`, but a couple of tests
    // build their own instance inline, hence both. See `docs/TESTING.md`.
    hookTimeout: 60_000,
    testTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      GOOGLE_CLIENT_IDS: 'test-google-client-id.apps.googleusercontent.com',
      AUTH_JWT_SECRET: 'test-secret-at-least-16-chars-long',
      AUTH_ACCESS_TTL_SECONDS: '900',
      // Tests share one client address and fire far more than a real client
      // would; the rate-limit tests pass their own small limits.
      RATE_LIMIT_GLOBAL_PER_MINUTE: '1000000',
      RATE_LIMIT_AUTH_PER_MINUTE: '1000000',
      RATE_LIMIT_PUBLIC_PER_MINUTE: '1000000',
    },
  },
});
