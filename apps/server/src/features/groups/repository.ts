import type { GroupRole } from '@splitcount/shared';
import { aliasedTable, and, asc, eq, inArray, ne, or, sql } from 'drizzle-orm';

import type { Database } from '../../db/client.js';
import {
  friendships,
  groupMembers,
  groups,
  users,
  type GroupMemberRow,
  type GroupRow,
  type UserRow,
} from '../../db/schema.js';
import type { FriendshipPair } from '../friends/friendships.js';

export interface GroupWithCount {
  group: GroupRow;
  memberCount: number;
}

export interface MemberWithUser {
  user: UserRow;
  role: GroupRole;
}

export interface CreateGroupInput {
  name: string;
  ownerId: string;
  memberIds: readonly string[];
}

export interface GroupsRepository {
  findGroupById(groupId: string): Promise<GroupRow | undefined>;
  findMembership(groupId: string, userId: string): Promise<GroupMemberRow | undefined>;
  /** The user's groups with their member counts. Pair groups are excluded. */
  listGroupsForUser(userId: string): Promise<GroupWithCount[]>;
  listMembers(groupId: string): Promise<MemberWithUser[]>;
  countMembers(groupId: string): Promise<number>;
  createGroup(input: CreateGroupInput): Promise<GroupRow>;
  updateGroup(
    groupId: string,
    values: { name?: string; archivedAt?: Date | null },
    at: Date,
  ): Promise<GroupRow | undefined>;
  deleteGroup(groupId: string): Promise<void>;
  /**
   * Insert the memberships that are missing, and report which ones were
   * actually created — the database decides, so a repeated or concurrent join
   * is reported as "already there" rather than guessed.
   */
  addMembers(groupId: string, userIds: readonly string[]): Promise<string[]>;
  removeMember(groupId: string, userId: string): Promise<void>;
  /**
   * The friendship joining two users, if they are friends. Read directly:
   * `friendships` is shared domain data, like `users`.
   */
  findFriendship(pair: FriendshipPair): Promise<{ id: string } | undefined>;
  /** Of `candidateIds`, those who are friends of `userId`. */
  filterFriendIds(userId: string, candidateIds: readonly string[]): Promise<string[]>;
  findGroupByFriendship(friendshipId: string): Promise<GroupRow | undefined>;
  /**
   * Create the group two friends share. Returns the existing one when another
   * request won the race — the unique constraint on `friendship_id` is what
   * guarantees there is only ever one.
   */
  createPairGroup(friendshipId: string, pair: FriendshipPair): Promise<GroupRow>;
  /**
   * Every ancestor of a group, root first (ascending `depth`) — nearest parent
   * last. Empty for a root group. Used for breadcrumbs and for the
   * "effectively archived" / "effectively active" checks a sub-group's write
   * paths need (`docs/specs/groups.md`).
   */
  listAncestors(groupId: string): Promise<GroupRow[]>;
  /**
   * Every descendant of a group, at any depth, in no particular order. Empty
   * for a group with no sub-groups. Used to cascade a membership change (leave,
   * removal) down the tree — deleting a group itself cascades through the
   * database's own foreign key instead, see `groups.parent_id`.
   */
  listDescendantIds(groupId: string): Promise<string[]>;
  /**
   * A group's direct sub-groups only (not their own sub-groups), each with its
   * member count — what the group screen's sub-groups section lists.
   */
  listChildren(groupId: string): Promise<GroupWithCount[]>;
}

/** Postgres returns `count(*)` as a string; normalise at the boundary. */
const toCount = (value: unknown): number => Number(value ?? 0);

export function createGroupsRepository(db: Database): GroupsRepository {
  return {
    async findGroupById(groupId) {
      const [row] = await db.select().from(groups).where(eq(groups.id, groupId));
      return row;
    },

    async findMembership(groupId, userId) {
      const [row] = await db
        .select()
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
      return row;
    },

    async listGroupsForUser(userId) {
      // Joined twice: once to find the caller's groups, once to count everyone
      // in them.
      const everyone = aliasedTable(groupMembers, 'everyone');

      const rows = await db
        .select({ group: groups, memberCount: sql<number>`count(${everyone.id})` })
        .from(groupMembers)
        .innerJoin(groups, eq(groups.id, groupMembers.groupId))
        .innerJoin(everyone, eq(everyone.groupId, groups.id))
        .where(and(eq(groupMembers.userId, userId), ne(groups.kind, 'pair')))
        .groupBy(groups.id)
        // Active groups first, then archived ones; alphabetical within each.
        .orderBy(sql`${groups.archivedAt} is not null`, asc(groups.name));

      return rows.map((row) => ({
        group: row.group,
        memberCount: toCount(row.memberCount),
      }));
    },

    async listMembers(groupId) {
      const rows = await db
        .select({ user: users, role: groupMembers.role })
        .from(groupMembers)
        .innerJoin(users, eq(users.id, groupMembers.userId))
        .where(eq(groupMembers.groupId, groupId))
        .orderBy(asc(users.name));

      return rows.map((row) => ({ user: row.user, role: row.role as GroupRole }));
    },

    async countMembers(groupId) {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(groupMembers)
        .where(eq(groupMembers.groupId, groupId));
      return toCount(row?.count);
    },

    async createGroup(input) {
      return db.transaction(async (tx) => {
        const [group] = await tx
          .insert(groups)
          .values({ kind: 'standard', name: input.name })
          .returning();

        const others = input.memberIds.filter((id) => id !== input.ownerId);
        await tx.insert(groupMembers).values([
          { groupId: group!.id, userId: input.ownerId, role: 'owner' },
          ...others.map((userId) => ({ groupId: group!.id, userId, role: 'member' })),
        ]);

        return group!;
      });
    },

    async updateGroup(groupId, values, at) {
      const [row] = await db
        .update(groups)
        .set({ ...values, updatedAt: at })
        .where(eq(groups.id, groupId))
        .returning();
      return row;
    },

    async deleteGroup(groupId) {
      await db.delete(groups).where(eq(groups.id, groupId));
    },

    async addMembers(groupId, userIds) {
      if (userIds.length === 0) {
        return [];
      }
      const inserted = await db
        .insert(groupMembers)
        .values(userIds.map((userId) => ({ groupId, userId, role: 'member' })))
        .onConflictDoNothing()
        .returning({ userId: groupMembers.userId });

      return inserted.map((row) => row.userId);
    },

    async removeMember(groupId, userId) {
      await db
        .delete(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
    },

    async findFriendship(pair) {
      const [row] = await db
        .select({ id: friendships.id })
        .from(friendships)
        .where(
          and(
            eq(friendships.userAId, pair.userAId),
            eq(friendships.userBId, pair.userBId),
          ),
        );
      return row;
    },

    async filterFriendIds(userId, candidateIds) {
      if (candidateIds.length === 0) {
        return [];
      }
      const otherId = sql<string>`case when ${friendships.userAId} = ${userId}
        then ${friendships.userBId} else ${friendships.userAId} end`;

      const rows = await db
        .select({ id: otherId })
        .from(friendships)
        .where(
          and(
            or(eq(friendships.userAId, userId), eq(friendships.userBId, userId)),
            inArray(otherId, [...candidateIds]),
          ),
        );

      return rows.map((row) => row.id);
    },

    async findGroupByFriendship(friendshipId) {
      const [row] = await db
        .select()
        .from(groups)
        .where(eq(groups.friendshipId, friendshipId));
      return row;
    },

    async createPairGroup(friendshipId, pair) {
      const created = await db.transaction(async (tx) => {
        const [group] = await tx
          .insert(groups)
          .values({ kind: 'pair', name: null, friendshipId })
          .onConflictDoNothing()
          .returning();

        if (!group) {
          return undefined;
        }

        await tx.insert(groupMembers).values([
          { groupId: group.id, userId: pair.userAId, role: 'member' },
          { groupId: group.id, userId: pair.userBId, role: 'member' },
        ]);

        return group;
      });

      if (created) {
        return created;
      }

      // Another request created it first; its row is the authoritative one.
      const [existing] = await db
        .select()
        .from(groups)
        .where(eq(groups.friendshipId, friendshipId));
      return existing!;
    },

    async listAncestors(groupId) {
      // Depth is capped at 4 (`groups_depth_valid`), so this recursion is
      // bounded by construction — no `parent_id` cycle can exist since it is
      // immutable after creation (`docs/specs/groups.md`).
      const { rows } = await db.execute<{ id: string }>(sql`
        WITH RECURSIVE ancestors(id) AS (
          SELECT parent_id FROM groups WHERE id = ${groupId} AND parent_id IS NOT NULL
          UNION ALL
          SELECT g.parent_id
          FROM groups g
          JOIN ancestors a ON g.id = a.id
          WHERE g.parent_id IS NOT NULL
        )
        SELECT id FROM ancestors
      `);
      if (rows.length === 0) {
        return [];
      }
      // One extra query rather than threading a `level` column through the
      // recursion: `depth` is already stored on every row, so ordering by it
      // gives root-first order for free.
      return db
        .select()
        .from(groups)
        .where(
          inArray(
            groups.id,
            rows.map((row) => row.id),
          ),
        )
        .orderBy(asc(groups.depth));
    },

    async listDescendantIds(groupId) {
      const { rows } = await db.execute<{ id: string }>(sql`
        WITH RECURSIVE descendants(id) AS (
          SELECT id FROM groups WHERE parent_id = ${groupId}
          UNION ALL
          SELECT g.id
          FROM groups g
          JOIN descendants d ON g.parent_id = d.id
        )
        SELECT id FROM descendants
      `);
      return rows.map((row) => row.id);
    },

    async listChildren(groupId) {
      // A left join, unlike `listGroupsForUser`'s: this starts from the
      // sub-groups themselves rather than from a member's own row, so a
      // (transiently) empty one must still be counted as zero, not dropped.
      const rows = await db
        .select({ group: groups, memberCount: sql<number>`count(${groupMembers.id})` })
        .from(groups)
        .leftJoin(groupMembers, eq(groupMembers.groupId, groups.id))
        .where(eq(groups.parentId, groupId))
        .groupBy(groups.id)
        .orderBy(asc(groups.name));

      return rows.map((row) => ({
        group: row.group,
        memberCount: toCount(row.memberCount),
      }));
    },
  };
}
