import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle as drizzleNodePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';

import * as schema from './schema.js';

/**
 * The application always talks to Postgres. In production that is a real server
 * (`DATABASE_URL`); in local development and tests it is an embedded PGlite
 * instance (same SQL dialect, no external service). Query code is written
 * against this single type.
 */
export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  dialect: 'pglite' | 'node-postgres';
  close: () => Promise<void>;
}

export interface CreateDatabaseOptions {
  /** Postgres connection string. When omitted, an embedded PGlite database is used. */
  databaseUrl?: string | undefined;
  /** PGlite data directory. Omit for an in-memory database (tests). */
  pgliteDataDir?: string | undefined;
  /** Called when the Postgres pool reports an error on an idle connection. */
  onPoolError?: ((error: Error) => void) | undefined;
}

/**
 * `pg.Pool` emits `error` when an idle client's connection breaks — Postgres
 * restarting, a failover, a network drop. An `EventEmitter` with no `error`
 * listener turns that into an uncaught exception, so without this the whole
 * API would crash on a database blip instead of failing the queries that hit it.
 * The pool discards the broken client itself and connects anew on the next query.
 */
export function attachPoolErrorHandler(
  pool: { on: (event: 'error', listener: (error: Error) => void) => unknown },
  onError: (error: Error) => void,
): void {
  pool.on('error', onError);
}

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function createDatabase(
  options: CreateDatabaseOptions = {},
): Promise<DatabaseHandle> {
  if (options.databaseUrl) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: options.databaseUrl });
    attachPoolErrorHandler(pool, options.onPoolError ?? (() => undefined));
    return {
      db: drizzleNodePg(pool, { schema }),
      dialect: 'node-postgres',
      close: () => pool.end(),
    };
  }

  const client = new PGlite(options.pgliteDataDir);
  return {
    db: drizzlePglite(client, { schema }) as unknown as Database,
    dialect: 'pglite',
    close: () => client.close(),
  };
}

/** Apply every pending migration in `apps/server/drizzle`. */
export async function migrateToLatest(handle: DatabaseHandle): Promise<void> {
  if (handle.dialect === 'pglite') {
    await migratePglite(handle.db as never, { migrationsFolder });
  } else {
    await migrateNodePg(handle.db as never, { migrationsFolder });
  }
}

/**
 * How many migrations in `apps/server/drizzle` the database has not applied yet.
 * Same rule as drizzle's migrator: a migration is pending when it is newer than
 * the latest one recorded in `drizzle.__drizzle_migrations`. A database that has
 * seen *more* migrations than this build knows (a rollback to an older image)
 * counts as up to date: running code older than the schema is a deliberate
 * choice, and migrations are written to allow it (see `docs/DEPLOYMENT.md`).
 */
export async function countPendingMigrations(handle: DatabaseHandle): Promise<number> {
  const { rows: tables } = await handle.db.execute<{ name: string | null }>(
    sql`select to_regclass('drizzle.__drizzle_migrations') as name`,
  );
  let lastApplied = 0;
  if (tables[0]?.name) {
    const { rows } = await handle.db.execute<{ created_at: string | null }>(
      sql`select max(created_at) as created_at from drizzle.__drizzle_migrations`,
    );
    lastApplied = Number(rows[0]?.created_at ?? 0);
  }
  return readMigrationFiles({ migrationsFolder }).filter(
    (migration) => migration.folderMillis > lastApplied,
  ).length;
}

/** Throw unless the schema is up to date: in production the server never migrates itself. */
export async function assertMigrated(handle: DatabaseHandle): Promise<void> {
  const pending = await countPendingMigrations(handle);
  if (pending > 0) {
    throw new Error(
      `${pending} database migration(s) pending: run the release step ` +
        '(`node apps/server/dist/scripts/migrate.js`) before starting the server',
    );
  }
}
