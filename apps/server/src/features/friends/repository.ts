import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';

import type { Database } from '../../db/client.js';
import {
  friendInvites,
  friendships,
  users,
  type FriendInviteRow,
  type FriendshipRow,
  type UserRow,
} from '../../db/schema.js';

import type { FriendshipPair } from './friendships.js';

export interface InsertInviteInput {
  inviterId: string;
  code: string;
  expiresAt: Date;
}

export interface FriendsRepository {
  /**
   * Read a user. `users` is shared domain data (auth owns the writes); reading
   * it here keeps this feature from depending on the auth feature's modules.
   */
  findUserById(id: string): Promise<UserRow | undefined>;
  /** The inviter's usable invite (not revoked, not expired), if any. */
  findActiveInviteByInviter(
    inviterId: string,
    now: Date,
  ): Promise<FriendInviteRow | undefined>;
  findInviteByCode(code: string): Promise<FriendInviteRow | undefined>;
  insertInvite(input: InsertInviteInput): Promise<FriendInviteRow>;
  revokeInvitesByInviter(inviterId: string, at: Date): Promise<void>;
  /** Insert the pair, or do nothing when it already exists. Returns the row. */
  upsertFriendship(pair: FriendshipPair): Promise<{ row: FriendshipRow; created: boolean }>;
  listFriends(userId: string): Promise<UserRow[]>;
  deleteFriendship(pair: FriendshipPair): Promise<void>;
}

export function createFriendsRepository(db: Database): FriendsRepository {
  const matchesPair = (pair: FriendshipPair) =>
    and(eq(friendships.userAId, pair.userAId), eq(friendships.userBId, pair.userBId));

  return {
    async findUserById(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id));
      return row;
    },

    async findActiveInviteByInviter(inviterId, now) {
      const [row] = await db
        .select()
        .from(friendInvites)
        .where(
          and(
            eq(friendInvites.inviterId, inviterId),
            isNull(friendInvites.revokedAt),
            gt(friendInvites.expiresAt, now),
          ),
        );
      return row;
    },

    async findInviteByCode(code) {
      const [row] = await db
        .select()
        .from(friendInvites)
        .where(eq(friendInvites.code, code));
      return row;
    },

    async insertInvite(input) {
      const [row] = await db.insert(friendInvites).values(input).returning();
      return row!;
    },

    async revokeInvitesByInviter(inviterId, at) {
      await db
        .update(friendInvites)
        .set({ revokedAt: at })
        .where(
          and(eq(friendInvites.inviterId, inviterId), isNull(friendInvites.revokedAt)),
        );
    },

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
        .where(
          or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)),
        )
        .orderBy(asc(users.name));

      return rows.map((row) => row.user);
    },

    async deleteFriendship(pair) {
      await db.delete(friendships).where(matchesPair(pair));
    },
  };
}
