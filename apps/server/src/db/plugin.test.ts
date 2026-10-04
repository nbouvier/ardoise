import { sql } from 'drizzle-orm';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { createDatabase, migrateToLatest, type DatabaseHandle } from './client.js';
import { dbPlugin } from './plugin.js';

describe('db plugin migrations', () => {
  let handle: DatabaseHandle | undefined;

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
  });

  async function build(migrations: 'apply' | 'verify' | 'skip', migrated = false) {
    handle = await createDatabase();
    if (migrated) {
      await migrateToLatest(handle);
    }
    const app = Fastify();
    app.register(dbPlugin, { handle, migrations });
    // Wrapped: a Fastify instance is thenable, and awaiting it would boot it.
    return { app };
  }

  async function usersTableExists(app: { db: DatabaseHandle['db'] }): Promise<boolean> {
    const { rows } = await app.db.execute(
      sql`select 1 from information_schema.tables where table_name = 'users'`,
    );
    return rows.length > 0;
  }

  it('applies pending migrations in apply mode', async () => {
    const { app } = await build('apply');
    await app.ready();

    expect(await usersTableExists(app)).toBe(true);
  });

  it('refuses to start in verify mode while migrations are pending', async () => {
    const { app } = await build('verify');

    await expect(app.ready()).rejects.toThrow(/pending/);
  });

  it('starts in verify mode once the database is migrated', async () => {
    const { app } = await build('verify', true);
    await app.ready();

    expect(await usersTableExists(app)).toBe(true);
  });

  it('leaves the database alone in skip mode', async () => {
    const { app } = await build('skip');
    await app.ready();

    expect(await usersTableExists(app)).toBe(false);
  });
});
