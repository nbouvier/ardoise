import { createDatabase, migrateToLatest, type DatabaseHandle } from '../db/client.js';

/**
 * A fresh, migrated, in-memory Postgres (PGlite) for a single test file.
 * Remember to `await handle.close()` in an `afterAll`.
 */
export async function createTestDatabase(): Promise<DatabaseHandle> {
  const handle = await createDatabase();
  await migrateToLatest(handle);
  return handle;
}
