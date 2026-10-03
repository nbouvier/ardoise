import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzleNodePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator';
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
