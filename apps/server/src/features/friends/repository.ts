import { and, asc, eq, or, sql } from 'drizzle-orm';

import type { Database } from '../../db/client.js';
import { friendships, users, type FriendshipRow, type UserRow } from '../../db/schema.js';

import type { FriendshipPair } from './friendships.js';

export interface FriendsRepository {
  /** Insert the pair, or do nothing when it already exists. Returns the row. */
  upsertFriendship(pair: FriendshipPair): Promise<{ row: FriendshipRow; created: boolean }>;
  listFriends(userId: string): Promise<UserRow[]>;
  deleteFriendship(pair: FriendshipPair): Promise<void>;
}

/** Match the single row holding a pair, which is always stored canonically. */
export function matchesPair(pair: FriendshipPair) {
  return and(eq(friendships.userAId, pair.userAId), eq(friendships.userBId, pair.userBId));
}

export function createFriendsRepository(db: Database): FriendsRepository {
  return {
    async upsertFriendship(pair) {
      const [inserted] = await db
        .insert(friendships)
        .values(pair)
        .onConflictDoNothing()
        .returning();
      if (inserted) {
        return { row: inserted, created: true };
      }
      // Lost the race (or already friends): the existing row is authoritative.
      const [existing] = await db.select().from(friendships).where(matchesPair(pair));
      return { row: existing!, created: false };
    },

    async listFriends(userId) {
      const friendId = sql<string>`case when ${friendships.userAId} = ${userId}
        then ${friendships.userBId} else ${friendships.userAId} end`;

      const rows = await db
        .select({ user: users })
        .from(friendships)
        .innerJoin(users, eq(users.id, friendId))
        .where(or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)))
        .orderBy(asc(users.name));

      return rows.map((row) => row.user);
    },

    async deleteFriendship(pair) {
      await db.delete(friendships).where(matchesPair(pair));
    },
  };
}
