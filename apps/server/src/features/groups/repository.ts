import type { GroupRole } from '@splitcount/shared';
import { aliasedTable, and, asc, eq, inArray, isNull, ne, notExists, or, sql } from 'drizzle-orm';

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

/**
 * A group as the listing queries below report it: its own direct sub-group
 * count, and the caller's own `favorited_at` off their membership row
 * (`docs/specs/favorites.md`).
 */
export interface ListedGroupSummary extends GroupWithCount {
  subgroupCount: number;
  favoritedAt: Date | null;
}

export interface MemberWithUser {
  user: UserRow;
  role: GroupRole;
}

export interface RemoveMemberResult {
  /** Every group, from `groupId` down, the person actually lost membership at. */
  removedFromGroupIds: string[];
  /** Of those, the ones left with no members afterward, and deleted. */
  deletedGroupIds: string[];
}

export interface CreateGroupInput {
  name: string;
  ownerId: string;
  memberIds: readonly string[];
  /** Creates a sub-group under this group instead of a root group. */
  parentId?: string | null;
  /** `parent.depth + 1`, or `0` for a root group. Computed by the caller. */
  depth?: number;
}

export interface GroupsRepository {
  findGroupById(groupId: string): Promise<GroupRow | undefined>;
  findMembership(groupId: string, userId: string): Promise<GroupMemberRow | undefined>;
  /**
   * The user's **root** groups with their member and direct sub-group counts.
   * Pair groups are excluded, and so is any group that is itself a sub-group —
   * it is reached by opening its parent, not listed at the top level.
   */
  listGroupsForUser(userId: string): Promise<ListedGroupSummary[]>;
  /**
   * Every group the user has favorited, with the same counts — of any kind
   * and any depth, unlike `listGroupsForUser`: a sub-group and the implicit
   * pair group behind a favorited friend both belong in the one place the
   * product gathers favorites (`docs/specs/home.md`). Unordered here; a pair
   * group has no name of its own to sort on until the service resolves it.
   */
  listFavoriteGroupsForUser(userId: string): Promise<ListedGroupSummary[]>;
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
   * Remove `userId` from `groupId` and from every one of its descendants —
   * nobody can remain in a sub-group of a group they are no longer part of
   * (`docs/specs/groups.md`). Also deletes any of those groups left with no
   * members afterward, cascading their own remaining sub-tree through the
   * database's foreign key.
   */
  removeMemberWithDescendants(groupId: string, userId: string): Promise<RemoveMemberResult>;
  /**
   * Of `groupId`'s descendants, the ones where `userId` is the owner *and*
   * someone else still belongs to it — cascading `userId` out of `groupId`
   * would strand such a sub-group, since it would be left with no owner and
   * other members still in it. Used to extend the "owner cannot leave"
   * guard down the tree.
   */
  listOwnedPopulatedDescendants(
    groupId: string,
    userId: string,
  ): Promise<{ id: string; name: string | null }[]>;
  /** Of `candidateIds`, those who are friends of `userId`. */
  filterFriendIds(userId: string, candidateIds: readonly string[]): Promise<string[]>;
  /**
   * Of `groupIds`, those `userId` currently belongs to — used to mark, in a
   * parent's `subgroups` list, which of its sub-groups the viewer has already
   * joined.
   */
  filterMemberGroupIds(userId: string, groupIds: readonly string[]): Promise<string[]>;
  /**
   * Of `groupIds`, those `userId` currently has favorited — used to pin a
   * favorited sub-group above its non-favorited siblings in a parent's own
   * `subgroups` list (`docs/specs/favorites.md`). Only ever meaningful for
   * ids `userId` is a member of; a non-member has no membership row to have
   * favorited on.
   */
  listFavoriteGroupIds(userId: string, groupIds: readonly string[]): Promise<string[]>;
  /** Set or clear the caller's own favorite marker on their membership row. */
  setFavorite(groupId: string, userId: string, favoritedAt: Date | null): Promise<void>;
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

/**
 * Every ancestor id of a group, nearest parent first, as a plain list — used
 * both to build `listAncestors`'s ordered rows and to propagate a membership
 * write up the tree. Bounded by the depth cap (`groups_depth_valid`), and
 * `parent_id` is immutable after creation, so no cycle guard is needed
 * (`docs/specs/groups.md`).
 */
async function fetchAncestorIds(db: Database, groupId: string): Promise<string[]> {
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
  return rows.map((row) => row.id);
}

/**
 * Every descendant id of a group, at any depth, as a plain list — used both
 * to build `listDescendantIds` and to cascade a membership removal down the
 * tree. Bounded the same way `fetchAncestorIds` is (`docs/specs/groups.md`).
 */
async function fetchDescendantIds(db: Database, groupId: string): Promise<string[]> {
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
}

/**
 * Add each listed group's direct sub-group count, in one further query.
 *
 * A second, separate query rather than a third join in the listing itself:
 * joining both the member count and the sub-group count in a single query
 * multiplies rows (3 members × 2 sub-groups = 6 rows) before any aggregation
 * runs, forcing every count into a `distinct` — a plain `group by parent_id`
 * here is simpler and reads its own index.
 */
async function withSubgroupCounts(
  db: Database,
  rows: readonly { group: GroupRow; memberCount: number; favoritedAt: Date | null }[],
): Promise<ListedGroupSummary[]> {
  if (rows.length === 0) {
    return [];
  }

  const subgroupCounts = await db
    .select({ parentId: groups.parentId, count: sql<number>`count(*)` })
    .from(groups)
    .where(
      inArray(
        groups.parentId,
        rows.map((row) => row.group.id),
      ),
    )
    .groupBy(groups.parentId);

  const countByParent = new Map(subgroupCounts.map((row) => [row.parentId, toCount(row.count)]));

  return rows.map((row) => ({
    group: row.group,
    memberCount: toCount(row.memberCount),
    subgroupCount: countByParent.get(row.group.id) ?? 0,
    favoritedAt: row.favoritedAt,
  }));
}

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
      // Joined twice: once to find the caller's root groups, once to count
      // everyone in them.
      const everyone = aliasedTable(groupMembers, 'everyone');

      const own = await db
        .select({
          group: groups,
          memberCount: sql<number>`count(${everyone.id})`,
          favoritedAt: groupMembers.favoritedAt,
        })
        .from(groupMembers)
        .innerJoin(groups, eq(groups.id, groupMembers.groupId))
        .innerJoin(everyone, eq(everyone.groupId, groups.id))
        .where(
          and(
            eq(groupMembers.userId, userId),
            ne(groups.kind, 'pair'),
            // Only root groups: a group that is itself a sub-group is reached
            // by opening its parent, never listed at the top level.
            isNull(groups.parentId),
          ),
        )
        .groupBy(groups.id, groupMembers.favoritedAt)
        // Active groups first, then archived ones; favorited groups first
        // within each of those (`docs/specs/favorites.md`); alphabetical
        // within what's left.
        .orderBy(
          sql`${groups.archivedAt} is not null`,
          sql`${groupMembers.favoritedAt} is null`,
          asc(groups.name),
        );

      return withSubgroupCounts(db, own);
    },

    async listFavoriteGroupsForUser(userId) {
      const everyone = aliasedTable(groupMembers, 'everyone');

      const own = await db
        .select({
          group: groups,
          memberCount: sql<number>`count(${everyone.id})`,
          favoritedAt: groupMembers.favoritedAt,
        })
        .from(groupMembers)
        .innerJoin(groups, eq(groups.id, groupMembers.groupId))
        .innerJoin(everyone, eq(everyone.groupId, groups.id))
        // No kind or depth filter, unlike `listGroupsForUser`: a favorite is
        // gathered wherever it lives (`docs/specs/home.md`).
        .where(
          and(eq(groupMembers.userId, userId), sql`${groupMembers.favoritedAt} is not null`),
        )
        .groupBy(groups.id, groupMembers.favoritedAt);

      return withSubgroupCounts(db, own);
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
      const parentId = input.parentId ?? null;
      const depth = input.depth ?? 0;
      // Read outside the transaction: `parent_id` is immutable after
      // creation, so the parent's own ancestor chain cannot change underneath
      // this call — there is nothing here for a transaction to protect.
      const ancestorIds = parentId ? [parentId, ...(await fetchAncestorIds(db, parentId))] : [];

      return db.transaction(async (tx) => {
        const [group] = await tx
          .insert(groups)
          .values({ kind: 'standard', name: input.name, parentId, depth })
          .returning();

        const others = input.memberIds.filter((id) => id !== input.ownerId);
        const everyone = [input.ownerId, ...others];

        // The owner's row at the new group is explicit and always 'owner';
        // every other initial member's row there is 'member'. Every one of
        // them (owner included) also needs a row at every ancestor of the new
        // group — membership flows down the tree, never up on its own
        // (`docs/specs/groups.md`) — always as 'member': a role is only ever
        // granted at the level it was actually earned, and `onConflictDoNothing`
        // leaves an existing row (say, an owner role held there already)
        // untouched rather than downgrading it.
        await tx
          .insert(groupMembers)
          .values([
            { groupId: group!.id, userId: input.ownerId, role: 'owner' as const },
            ...others.map((userId) => ({ groupId: group!.id, userId, role: 'member' as const })),
            ...ancestorIds.flatMap((ancestorId) =>
              everyone.map((userId) => ({
                groupId: ancestorId,
                userId,
                role: 'member' as const,
              })),
            ),
          ])
          .onConflictDoNothing();

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
      // Membership flows down the tree: adding someone to a group adds them
      // to every ancestor of it too, in the same insert (`docs/specs/groups.md`).
      const targets = [groupId, ...(await fetchAncestorIds(db, groupId))];

      const inserted = await db
        .insert(groupMembers)
        .values(
          targets.flatMap((targetGroupId) =>
            userIds.map((userId) => ({ groupId: targetGroupId, userId, role: 'member' })),
          ),
        )
        .onConflictDoNothing()
        .returning({ groupId: groupMembers.groupId, userId: groupMembers.userId });

      // Only report what changed at the target group itself — ancestor
      // memberships are a side effect callers don't branch on (e.g. whether
      // to report "already a member" for an invite acceptance).
      return inserted
        .filter((row) => row.groupId === groupId)
        .map((row) => row.userId);
    },

    async removeMember(groupId, userId) {
      await db
        .delete(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
    },

    async removeMemberWithDescendants(groupId, userId) {
      const scope = [groupId, ...(await fetchDescendantIds(db, groupId))];

      const removed = await db
        .delete(groupMembers)
        .where(and(eq(groupMembers.userId, userId), inArray(groupMembers.groupId, scope)))
        .returning({ groupId: groupMembers.groupId });

      if (removed.length === 0) {
        return { removedFromGroupIds: [], deletedGroupIds: [] };
      }

      // Any of the touched groups left with nobody in it is gone too — the
      // same "a group nobody belongs to is unreachable" rule as a single
      // group's last member leaving, applied at every level this reached.
      // Deleting it cascades its *own* remaining sub-tree through
      // `groups.parent_id`, so nothing further is needed for a deeper branch
      // that became empty this same way.
      const deleted = await db
        .delete(groups)
        .where(
          and(
            inArray(groups.id, scope),
            notExists(
              db
                .select({ id: groupMembers.id })
                .from(groupMembers)
                .where(eq(groupMembers.groupId, groups.id)),
            ),
          ),
        )
        .returning({ id: groups.id });

      return {
        removedFromGroupIds: removed.map((row) => row.groupId),
        deletedGroupIds: deleted.map((row) => row.id),
      };
    },

    async listOwnedPopulatedDescendants(groupId, userId) {
      const descendantIds = await fetchDescendantIds(db, groupId);
      if (descendantIds.length === 0) {
        return [];
      }

      // Joined twice against `group_members`: once to require `userId` owns
      // the group, once to require someone *else* still belongs to it —
      // `selectDistinct` collapses the fan-out from that second join when
      // more than one other member exists.
      const otherMember = aliasedTable(groupMembers, 'other_member');

      return db
        .selectDistinct({ id: groups.id, name: groups.name })
        .from(groups)
        .innerJoin(
          groupMembers,
          and(
            eq(groupMembers.groupId, groups.id),
            eq(groupMembers.userId, userId),
            eq(groupMembers.role, 'owner'),
          ),
        )
        .innerJoin(
          otherMember,
          and(eq(otherMember.groupId, groups.id), ne(otherMember.userId, userId)),
        )
        .where(inArray(groups.id, descendantIds));
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

    async filterMemberGroupIds(userId, groupIds) {
      if (groupIds.length === 0) {
        return [];
      }
      const rows = await db
        .select({ groupId: groupMembers.groupId })
        .from(groupMembers)
        .where(
          and(eq(groupMembers.userId, userId), inArray(groupMembers.groupId, [...groupIds])),
        );
      return rows.map((row) => row.groupId);
    },

    async listFavoriteGroupIds(userId, groupIds) {
      if (groupIds.length === 0) {
        return [];
      }
      const rows = await db
        .select({ groupId: groupMembers.groupId })
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.userId, userId),
            inArray(groupMembers.groupId, [...groupIds]),
            sql`${groupMembers.favoritedAt} is not null`,
          ),
        );
      return rows.map((row) => row.groupId);
    },

    async setFavorite(groupId, userId, favoritedAt) {
      await db
        .update(groupMembers)
        .set({ favoritedAt })
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
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
      const ids = await fetchAncestorIds(db, groupId);
      if (ids.length === 0) {
        return [];
      }
      // `depth` is already stored on every row, so ordering by it gives
      // root-first order for free — no need to thread a `level` column
      // through the recursive query itself.
      return db.select().from(groups).where(inArray(groups.id, ids)).orderBy(asc(groups.depth));
    },

    async listDescendantIds(groupId) {
      return fetchDescendantIds(db, groupId);
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
