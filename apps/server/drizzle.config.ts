import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit configuration. `generate` reads only the schema file and needs no
 * database. `migrate` (against a real Postgres) reads `DATABASE_URL`.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
