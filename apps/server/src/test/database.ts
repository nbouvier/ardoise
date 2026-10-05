import { sql } from 'drizzle-orm';

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

/**
 * Empty every table, so one migrated database can serve a whole test file
 * instead of paying for a migration per test.
 *
 * `users` and `groups` are the two roots: everything else hangs off one of them
 * by a foreign key, and `cascade` follows those. A standard group belongs to no
 * user directly, which is why it has to be named here too; `deleted_accounts`
 * hangs off nothing at all.
 */
export async function resetDatabase(handle: DatabaseHandle): Promise<void> {
  await handle.db.execute(
    sql`truncate table "users", "groups", "deleted_accounts" restart identity cascade`,
  );
}
