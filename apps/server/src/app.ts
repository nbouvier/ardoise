import Fastify, { type FastifyInstance } from 'fastify';

import { env } from './config/env.js';
import { dbPlugin, type DbPluginOptions } from './db/plugin.js';
import { authPlugin, type AuthPluginOptions } from './features/auth/plugin.js';
import { friendsPlugin } from './features/friends/plugin.js';
import { groupsPlugin, type GroupsPluginOptions } from './features/groups/plugin.js';
import { invitesPlugin, type InvitesPluginOptions } from './features/invites/plugin.js';
import {
  transactionsPlugin,
  type TransactionsPluginOptions,
} from './features/transactions/plugin.js';
import { registerErrorHandler } from './http/error-handler.js';
import { registerHealthRoutes } from './routes/health.js';

export interface BuildAppOptions {
  /** Database plugin overrides. Tests pass a pre-created in-memory handle here. */
  db?: DbPluginOptions;
  /** Auth plugin overrides. Tests pass fake Google / token services here. */
  auth?: AuthPluginOptions;
  /** Invite plugin overrides. Tests pass a fake clock / short invite TTL here. */
  invites?: InvitesPluginOptions;
  /** Groups plugin overrides. Tests pass a fake clock here. */
  groups?: GroupsPluginOptions;
  /** Transactions plugin overrides. Tests pass a fake clock here. */
  transactions?: TransactionsPluginOptions;
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

  registerErrorHandler(app);

  app.register(dbPlugin, {
    databaseUrl: env.DATABASE_URL,
    pgliteDataDir:
      env.NODE_ENV === 'development' ? env.PGLITE_DATA_DIR : undefined,
    ...options.db,
  });

  app.register(authPlugin, { ...options.auth });
  // `invites` owns the code space; `friends` and `groups` register what their
  // own invitations lead to, so neither depends on the other.
  app.register(invitesPlugin, { ...options.invites });
  app.register(friendsPlugin);
  app.register(groupsPlugin, { ...options.groups });
  app.register(transactionsPlugin, { ...options.transactions });

  registerHealthRoutes(app);

  return app;
}
