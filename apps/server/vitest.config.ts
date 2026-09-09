import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      GOOGLE_CLIENT_IDS: 'test-google-client-id.apps.googleusercontent.com',
      AUTH_JWT_SECRET: 'test-secret-at-least-16-chars-long',
      AUTH_ACCESS_TTL_SECONDS: '900',
    },
  },
});
