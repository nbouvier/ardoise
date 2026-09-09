import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDatabase, migrateToLatest, type DatabaseHandle } from './client.js';
import { sessions, users } from './schema.js';

describe('database migrations', () => {
  let handle: DatabaseHandle;

  beforeAll(async () => {
    handle = await createDatabase();
    await migrateToLatest(handle);
  });

  afterAll(async () => {
    await handle.close();
  });

  it('creates the users and sessions tables', async () => {
    const { rows } = await handle.db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    );

    expect(rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(['sessions', 'users']),
    );
  });

  it('persists a user and a cascading session', async () => {
    const [user] = await handle.db
      .insert(users)
      .values({ googleSub: 'google-sub-1', email: 'a@example.com', name: 'Ada' })
      .returning();

    expect(user?.id).toMatch(/^[0-9a-f-]{36}$/);

    await handle.db.insert(sessions).values({
      userId: user!.id,
      refreshTokenHash: 'hash-1',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await handle.db.delete(users);

    const remaining = await handle.db.select().from(sessions);
    expect(remaining).toHaveLength(0);
  });

  it('runs migrations idempotently', async () => {
    await expect(migrateToLatest(handle)).resolves.not.toThrow();
  });
});
