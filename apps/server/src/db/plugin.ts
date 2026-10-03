import fp from 'fastify-plugin';

import {
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
  /** Run pending migrations on startup. Default: true. */
  runMigrations?: boolean | undefined;
  databaseUrl?: string | undefined;
  pgliteDataDir?: string | undefined;
}

/**
 * Attaches `app.db` (a Drizzle instance) and, by default, applies pending
 * migrations before the app becomes ready. A handle the plugin created is
 * closed on `app.close()`; a handle passed in by a test is left alone.
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

    if (opts.runMigrations ?? true) {
      await migrateToLatest(handle);
    }

    app.decorate('db', handle.db);

    if (!opts.handle) {
      app.addHook('onClose', () => handle.close());
    }
  },
  { name: 'db' },
);
