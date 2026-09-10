import type { FastifyInstance } from 'fastify';

import { buildApp, type BuildAppOptions } from '../app.js';
import { createTestDatabase } from './database.js';

/**
 * A ready Fastify instance backed by a fresh in-memory database. Close it with
 * `await app.close()` (which also closes the database) in an `afterAll`.
 */
export async function createTestApp(
  options: Pick<BuildAppOptions, 'auth' | 'friends'> = {},
): Promise<FastifyInstance> {
  const handle = await createTestDatabase();
  const app = buildApp({
    db: { handle, runMigrations: false },
    auth: options.auth,
    friends: options.friends,
  });
  app.addHook('onClose', () => handle.close());
  await app.ready();
  return app;
}
