import type { FastifyInstance } from 'fastify';

import { buildApp, type BuildAppOptions } from '../app.js';
import { createTestDatabase, resetDatabase } from './database.js';

export type TestAppOptions = Pick<
  BuildAppOptions,
  'auth' | 'invites' | 'groups' | 'transactions' | 'account' | 'rateLimit'
>;

export interface TestContext {
  app: FastifyInstance;
  /** Empty every table, so the next test starts from nothing. */
  reset: () => Promise<void>;
}

/**
 * A ready Fastify instance backed by a fresh in-memory database, plus the reset
 * that isolates one test from the next.
 *
 * Build it once per test file in a `beforeAll` and `reset()` in a `beforeEach`:
 * migrating a PGlite database costs a second or two, which a per-test instance
 * pays over and over.
 */
export async function createTestContext(
  options: TestAppOptions = {},
): Promise<TestContext> {
  const handle = await createTestDatabase();
  const app = buildApp({
    db: { handle, migrations: 'skip' },
    auth: options.auth,
    invites: options.invites,
    groups: options.groups,
    transactions: options.transactions,
    account: options.account,
    rateLimit: options.rateLimit,
  });
  app.addHook('onClose', () => handle.close());
  await app.ready();

  return { app, reset: () => resetDatabase(handle) };
}

/**
 * A ready Fastify instance backed by a fresh in-memory database. Close it with
 * `await app.close()` (which also closes the database) in an `afterAll`.
 */
export async function createTestApp(
  options: TestAppOptions = {},
): Promise<FastifyInstance> {
  return (await createTestContext(options)).app;
}
