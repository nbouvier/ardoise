import { and, asc, eq, or, sql } from 'drizzle-orm';

import type { Database, DatabaseTransaction } from '../../db/client.js';
import {
  friendships,
  groupMembers,
  groups,
  users,
  type FriendshipRow,
  type UserRow,
} from '../../db/schema.js';

import type { FriendshipPair } from './friendships.js';

/**
 * A friend as `listFriends` reports them: the user, plus the implicit pair
 * group the two share and the caller's own favorite marker on it
 * (`docs/specs/favorites.md`). The group always exists by the time a
 * friendship is listed — it is created the moment the friendship is
 * (`docs/specs/friends-and-invitations.md`) — so this is a plain join, not a
 * get-or-create.
 */
export interface FriendRow {
  user: UserRow;
  groupId: string;
  favorite: boolean;
}

export interface FriendsRepository {
  /** Insert the pair, or do nothing when it already exists. Returns the row. */
  /**
   * The pair's friendship, inserted unless it exists, then `alongside` in the
   * same transaction: if `alongside` fails, no new friendship is left behind.
   */
  upsertFriendship(
    pair: FriendshipPair,
    alongside: (tx: DatabaseTransaction, row: FriendshipRow) => Promise<void>,
  ): Promise<{ row: FriendshipRow; created: boolean }>;
  listFriends(userId: string): Promise<FriendRow[]>;
  deleteFriendship(pair: FriendshipPair): Promise<void>;
}

/** Match the single row holding a pair, which is always stored canonically. */
export function matchesPair(pair: FriendshipPair) {
  return and(eq(friendships.userAId, pair.userAId), eq(friendships.userBId, pair.userBId));
}

export function createFriendsRepository(db: Database): FriendsRepository {
  return {
    async upsertFriendship(pair, alongside) {
      return db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(friendships)
          .values(pair)
          .onConflictDoNothing()
          .returning();
        // Lost the race (or already friends): the existing row is authoritative.
        const [row] = inserted
          ? [inserted]
          : await tx.select().from(friendships).where(matchesPair(pair));
        await alongside(tx, row!);
        return { row: row!, created: Boolean(inserted) };
      });
    },

    async listFriends(userId) {
      const friendId = sql<string>`case when ${friendships.userAId} = ${userId}
        then ${friendships.userBId} else ${friendships.userAId} end`;

      const rows = await db
        .select({
          user: users,
          groupId: groups.id,
          favoritedAt: groupMembers.favoritedAt,
        })
        .from(friendships)
        .innerJoin(users, eq(users.id, friendId))
        .innerJoin(groups, eq(groups.friendshipId, friendships.id))
        .innerJoin(
          groupMembers,
          and(eq(groupMembers.groupId, groups.id), eq(groupMembers.userId, userId)),
        )
        .where(or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)))
        // Favorited friends first (`docs/specs/favorites.md`), alphabetical
        // within that — the same rule the group list applies.
        .orderBy(sql`${groupMembers.favoritedAt} is null`, asc(users.name));

      return rows.map((row) => ({
        user: row.user,
        groupId: row.groupId,
        favorite: row.favoritedAt !== null,
      }));
    },

    async deleteFriendship(pair) {
      await db.delete(friendships).where(matchesPair(pair));
    },
  };
}
