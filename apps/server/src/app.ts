import Fastify, { type FastifyInstance } from 'fastify';

import { env } from './config/env.js';
import { dbPlugin, type DbPluginOptions } from './db/plugin.js';
import { registerHealthRoutes } from './routes/health.js';

export interface BuildAppOptions {
  /** Database plugin overrides. Tests pass a pre-created in-memory handle here. */
  db?: DbPluginOptions;
}

/**
 * Build a fully configured Fastify instance without starting the network
 * listener, so tests can drive it through `app.inject`. Async setup (database
 * connection, migrations) resolves during `app.ready()`.
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  });

  app.register(dbPlugin, {
    databaseUrl: env.DATABASE_URL,
    pgliteDataDir:
      env.NODE_ENV === 'development' ? env.PGLITE_DATA_DIR : undefined,
    ...options.db,
  });

  registerHealthRoutes(app);

  return app;
}
