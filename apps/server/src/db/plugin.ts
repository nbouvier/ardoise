import fp from 'fastify-plugin';

import {
  assertMigrated,
  createDatabase,
  migrateToLatest,
  type Database,
  type DatabaseHandle,
} from './client.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

export interface DbPluginOptions {
  /** Use an already-created handle (tests). When set, the plugin does not close it. */
  handle?: DatabaseHandle | undefined;
  /**
   * What to do about the schema on startup. `apply` (default) runs pending
   * migrations; `verify` refuses to start while any is pending, leaving the
   * migrating to the release step (production: with several instances, they
   * would otherwise all try at once); `skip` touches nothing (tests that
   * migrated their handle themselves).
   */
  migrations?: 'apply' | 'verify' | 'skip' | undefined;
  databaseUrl?: string | undefined;
  pgliteDataDir?: string | undefined;
}

/**
 * Attaches `app.db` (a Drizzle instance) and, by default, applies pending
 * migrations before the app becomes ready (or verifies there are none: see
 * `migrations`). A handle the plugin created is closed on `app.close()`; a
 * handle passed in by a test is left alone.
 */
export const dbPlugin = fp<DbPluginOptions>(
  async (app, opts) => {
    const handle =
      opts.handle ??
      (await createDatabase({
        databaseUrl: opts.databaseUrl,
        pgliteDataDir: opts.pgliteDataDir,
        onPoolError: (error) =>
          // Plain object, not the error itself: see `http.request.failed` in docs/LOGGING.md.
          app.log.error(
            { error: { type: error.name, message: error.message, code: (error as { code?: string }).code } },
            'db.pool.error',
          ),
      }));

    const migrations = opts.migrations ?? 'apply';
    if (migrations === 'apply') {
      await migrateToLatest(handle);
    } else if (migrations === 'verify') {
      await assertMigrated(handle);
    }

    app.decorate('db', handle.db);

    if (!opts.handle) {
      app.addHook('onClose', () => handle.close());
    }
  },
  { name: 'db' },
);
