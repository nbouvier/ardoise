import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { createTestDatabase } from './database.js';

/**
 * A ready Fastify instance backed by a fresh in-memory database. Close it with
 * `await app.close()` (which also closes the database) in an `afterAll`.
 */
export async function createTestApp(): Promise<FastifyInstance> {
  const handle = await createTestDatabase();
  const app = buildApp({ db: { handle, runMigrations: false } });
  app.addHook('onClose', () => handle.close());
  await app.ready();
  return app;
}
