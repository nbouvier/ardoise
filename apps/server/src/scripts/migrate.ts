import { pino } from 'pino';

import { loadMigrateEnv } from '../config/migrate-env.js';
import { countPendingMigrations, createDatabase, migrateToLatest } from '../db/client.js';

/**
 * The release step: apply pending migrations once, before the new version
 * starts. In production the server only *checks* the schema is up to date
 * (`docs/DEPLOYMENT.md`), so running several instances never means several
 * concurrent migrators.
 *
 * Needs only `DATABASE_URL`. Run from the built output, where drizzle-kit (a
 * dev dependency) is not installed: `node apps/server/dist/scripts/migrate.js`,
 * or `npm run migrate:deploy --workspace @splitcount/server`. Safe to repeat.
 * Exits 1 when it fails, which must block the release.
 */
async function main(): Promise<void> {
  const env = loadMigrateEnv();
  const logger = pino({ level: env.LOG_LEVEL });
  const handle = await createDatabase({ databaseUrl: env.DATABASE_URL });

  try {
    const pending = await countPendingMigrations(handle);
    logger.info({ pending }, 'db.migrate.started');
    const startedAt = Date.now();
    await migrateToLatest(handle);
    logger.info({ applied: pending, durationMs: Date.now() - startedAt }, 'db.migrate.completed');
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  const failure = error instanceof Error ? error : new Error(String(error));
  // Drizzle wraps the driver's error: the useful part (ECONNREFUSED, a SQL
  // error code) is the cause.
  const driver = failure.cause instanceof Error ? failure.cause : undefined;
  // Plain object, not the error itself: see `http.request.failed` in docs/LOGGING.md.
  pino().error(
    {
      error: {
        type: failure.name,
        message: failure.message,
        code: (driver as { code?: string } | undefined)?.code,
        causeMessage: driver?.message,
      },
    },
    'db.migrate.failed',
  );
  process.exitCode = 1;
});
