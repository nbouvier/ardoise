import { eq, isNull } from 'drizzle-orm';

import { env } from '../config/env.js';
import { createDatabase } from '../db/client.js';
import { friendships, groups } from '../db/schema.js';
import { createGroupsRepository } from '../features/groups/repository.js';

/**
 * One-time backfill for friendships created before the implicit pair group
 * became eager (`docs/specs/friends-and-invitations.md`): every friendship
 * used to get its group lazily, on first access, so one that was never opened
 * has none yet. Safe to run more than once — a friendship that already has
 * its group is left untouched.
 *
 * Run once after deploying that change: `npm run backfill:pair-groups
 * --workspace @splitcount/server`.
 */
async function main(): Promise<void> {
  const handle = await createDatabase({
    databaseUrl: env.DATABASE_URL,
    pgliteDataDir: env.PGLITE_DATA_DIR,
  });
  const repository = createGroupsRepository(handle.db);

  try {
    const missing = await handle.db
      .select({
        id: friendships.id,
        userAId: friendships.userAId,
        userBId: friendships.userBId,
      })
      .from(friendships)
      .leftJoin(groups, eq(groups.friendshipId, friendships.id))
      .where(isNull(groups.id));

    for (const friendship of missing) {
      await repository.createPairGroup(friendship.id, {
        userAId: friendship.userAId,
        userBId: friendship.userBId,
      });
    }

    console.log(`Backfilled ${missing.length} pair group(s).`);
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
