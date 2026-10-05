import { pino } from 'pino';

import { loadMigrateEnv } from '../config/migrate-env.js';
import { createDatabase } from '../db/client.js';
import { deleteAccounts } from '../features/account/operator.js';
import { createAccountRepository } from '../features/account/repository.js';

/**
 * Delete accounts by id, exactly as the app's Delete account does
 * (`docs/specs/account-deletion.md`). Two uses, both in `docs/OPERATIONS.md`:
 * a deletion asked for by e-mail, and re-applying every deletion after a
 * backup taken before them has been restored.
 *
 * `node apps/server/dist/scripts/delete-accounts.js <user id>...`. Needs only
 * `DATABASE_URL`. Safe to repeat: an id no longer in the database is only kept
 * on the deleted-accounts list. Exits 1 when an id is not one, or a deletion
 * fails.
 */
async function main(): Promise<void> {
  const env = loadMigrateEnv();
  const logger = pino({ level: env.LOG_LEVEL });
  const userIds = process.argv.slice(2);
  if (userIds.length === 0) {
    logger.error('account.delete.no_ids');
    process.exitCode = 1;
    return;
  }

  const handle = await createDatabase({ databaseUrl: env.DATABASE_URL });
  try {
    const results = await deleteAccounts(createAccountRepository(handle.db), userIds, logger);
    if (results.some((result) => result.outcome === 'invalid')) {
      process.exitCode = 1;
    }
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  const failure = error instanceof Error ? error : new Error(String(error));
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
    'account.delete.failed',
  );
  process.exitCode = 1;
});
