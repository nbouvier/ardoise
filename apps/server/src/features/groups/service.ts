import type {
  CreateGroupRequest,
  GroupDetail,
  GroupRole,
  GroupSummary,
  Invite,
  UpdateGroupRequest,
} from '@splitcount/shared';

import type { GroupRow } from '../../db/schema.js';
import { orderPair } from '../friends/friendships.js';
import { InviteError } from '../invites/codes.js';
import type { InviteHandler, InvitesService } from '../invites/service.js';
import { toUserSummary } from '../users/repository.js';

import {
  assertCanLeave,
  assertEffectivelyActive,
  assertNotPairGroup,
  assertOwner,
  assertRemovable,
  assertWithinDepthLimit,
  GroupAccessError,
  isEffectivelyArchived,
  isPairRooted,
} from './membership.js';
import type { GroupsRepository, MemberWithUser } from './repository.js';

/** A group the caller is allowed to see, with the role that lets them see it. */
interface GroupContext {
  group: GroupRow;
  role: GroupRole;
}

export interface RemovedMember {
  /** The group had no members left and was deleted with its contents. */
  groupDeleted: boolean;
  /**
   * How many of the group's descendants the person also lost membership at,
   * as a side effect (`docs/specs/groups.md`) — `0` when the group has none,
   * or when the removal was a no-op (already gone).
   */
  removedFromDescendantCount: number;
}

export interface GroupsService {
  list(userId: string): Promise<GroupSummary[]>;
  get(userId: string, groupId: string): Promise<GroupDetail>;
  create(userId: string, input: CreateGroupRequest): Promise<GroupDetail>;
  update(userId: string, groupId: string, input: UpdateGroupRequest): Promise<GroupDetail>;
  remove(userId: string, groupId: string): Promise<void>;
  addMembers(userId: string, groupId: string, memberIds: string[]): Promise<GroupDetail>;
  removeMember(userId: string, groupId: string, targetId: string): Promise<RemovedMember>;
  /**
   * Join a sub-group visible in a group the caller already belongs to —
   * lighter than an invitation link, since being in the parent is already a
   * stronger trust signal than friendship. Joins that sub-group only; the
   * caller's membership in every ancestor already holds by construction
   * (`docs/specs/groups.md`).
   */
  join(userId: string, groupId: string): Promise<GroupDetail>;
  getOrCreateInvite(userId: string, groupId: string): Promise<Invite>;
  rotateInvite(userId: string, groupId: string): Promise<Invite>;
  revokeInvite(userId: string, groupId: string): Promise<void>;
  /** The group the caller shares with a friend, created on first access. */
  getPairGroup(userId: string, friendId: string): Promise<GroupDetail>;
  /**
   * What the statistics "including sub-groups" scope needs
   * (`docs/specs/group-statistics.md`): of `groupId`'s descendants, at any
   * depth, the ones `userId` belongs to — and how many they do not, so the
   * view can say when it is leaving some out. A sub-group's mere visibility
   * must never leak into this: an unjoined one is excluded, full stop.
   */
  subtreeScope(
    userId: string,
    groupId: string,
  ): Promise<{ memberDescendantIds: string[]; excludedCount: number }>;
}

/**
 * The slice of the transaction ledger a group's own balance needs: a
 * user's own net balance in a specific set of groups. Narrow on purpose —
 * `groups` reads the ledger, it does not get to write to it, the same
 * pattern `friends`' `CounterpartyBalances` already uses.
 */
export interface GroupBalances {
  balancesByGroup(userId: string, groupIds: readonly string[]): Promise<Map<string, number>>;
}

export interface GroupsServiceDeps {
  repository: GroupsRepository;
  invites: InvitesService;
  ledger: GroupBalances;
  now?: () => Date;
}

/** One active invitation per group, not per member: the link belongs to the group. */
const targetFor = (groupId: string) => ({ kind: 'group' as const, groupId });

/**
 * What to call a group. A standard group carries its own name; a pair group
 * carries none and is named after the *other* person, so each side sees who
 * they are sharing with.
 */
function nameFor(group: GroupRow, viewerId: string, members: MemberWithUser[]): string {
  if (group.kind !== 'pair') {
    return group.name ?? 'Untitled group';
  }
  const other = members.find((member) => member.user.id !== viewerId);
  // The other account could have been deleted; the group still has to render.
  return other?.user.name ?? 'Shared expenses';
}

/**
 * The viewer's own net balance in `group` — that group's transactions and
 * nothing else. A sub-group keeps its own figure rather than folding into
 * its parent's: "where do I stand *here*" is the question every screen
 * showing this asks, and a figure that silently included spaces the viewer
 * is not looking at could not be reconciled with the group's own member
 * list (`docs/specs/balances.md`). Module-level (not a closure over
 * `createGroupsService`) so the invite handler below can compute the same
 * figure without a second formula that could drift from this one.
 */
async function ownBalance(
  ledger: GroupBalances,
  userId: string,
  groupId: string,
): Promise<number> {
  const balances = await ledger.balancesByGroup(userId, [groupId]);
  return balances.get(groupId) ?? 0;
}

/**
 * The two-person ceiling a pair-rooted tree can never exceed, or `null` for
 * an ordinary standard-rooted one. Every way a third person could end up in
 * `group` — picked as an initial member, added later, or joining through an
 * invite link — inserts a membership row that propagates up the tree
 * (`docs/specs/groups.md`), which for a pair-rooted group would reach the
 * friendship's own immutable group. Checking the candidate ids against this
 * set at the point of insertion is what actually prevents that; `isPairRooted`
 * alone only says whether the ceiling applies, not who it allows.
 */
async function pairCeiling(
  repository: GroupsRepository,
  group: GroupRow,
): Promise<ReadonlySet<string> | null> {
  const ancestors = await repository.listAncestors(group.id);
  if (!isPairRooted(group, ancestors)) {
    return null;
  }
  const root = ancestors[0] ?? group;
  const members = await repository.listMembers(root.id);
  return new Set(members.map((member) => member.user.id));
}

/** Throws `pair_immutable` when `candidateIds` would add someone `ceiling` does not already allow. */
function assertWithinPairCeiling(
  ceiling: ReadonlySet<string> | null,
  candidateIds: readonly string[],
): void {
  if (ceiling && candidateIds.some((id) => !ceiling.has(id))) {
    throw new GroupAccessError('pair_immutable');
  }
}

/**
 * An invite link has no friendship check at all — whoever holds it joins
 * (`InvitesService`) — so it is refused outright for a pair-rooted group
 * rather than checked against the ceiling on acceptance: there is no one
 * left it could legitimately be for, since the only other allowed person is
 * already reachable through the ordinary unjoined-sub-group toggle.
 */
async function assertNotPairRooted(repository: GroupsRepository, group: GroupRow): Promise<void> {
  if (await pairCeiling(repository, group)) {
    throw new GroupAccessError('pair_immutable');
  }
}

export function createGroupsService(deps: GroupsServiceDeps): GroupsService {
  const { repository, invites, ledger, now = () => new Date() } = deps;

  function summaryOf(
    group: GroupRow,
    name: string,
    memberCount: number,
    subgroupCount: number,
    viewerBalanceCents: number,
  ): GroupSummary {
    return {
      id: group.id,
      kind: group.kind as GroupSummary['kind'],
      name,
      memberCount,
      parentId: group.parentId,
      depth: group.depth,
      subgroupCount,
      viewerBalanceCents,
      archivedAt: group.archivedAt?.toISOString() ?? null,
      createdAt: group.createdAt.toISOString(),
    };
  }

  async function detailOf(group: GroupRow, viewerId: string, role: GroupRole) {
    const [members, children, ancestors] = await Promise.all([
      repository.listMembers(group.id),
      repository.listChildren(group.id),
      repository.listAncestors(group.id),
    ]);
    const joinedChildIds = new Set(
      await repository.filterMemberGroupIds(
        viewerId,
        children.map((child) => child.group.id),
      ),
    );
    // One ledger read for this group and each sub-group shown with a figure
    // of its own. An unjoined sub-group is not asked for at all: the viewer
    // is on none of its transactions, so it is `0` without a query.
    const balances = await ledger.balancesByGroup(viewerId, [group.id, ...joinedChildIds]);

    return {
      ...summaryOf(
        group,
        nameFor(group, viewerId, members),
        members.length,
        children.length,
        balances.get(group.id) ?? 0,
      ),
      members: members.map((member) => ({
        ...toUserSummary(member.user),
        role: member.role,
      })),
      viewerRole: role,
      subgroups: children.map((child) => ({
        id: child.group.id,
        // A sub-group is always a standard group (`groups_pair_no_parent`),
        // so it always carries its own name — no `nameFor` fallback needed.
        name: child.group.name ?? 'Untitled group',
        memberCount: child.memberCount,
        viewerIsMember: joinedChildIds.has(child.group.id),
        viewerBalanceCents: balances.get(child.group.id) ?? 0,
      })),
      ancestors: ancestors.map((ancestor) => ({
        id: ancestor.id,
        name: ancestor.name ?? 'Untitled group',
      })),
      // A root group's `readOnly` is exactly its own archived flag, since it
      // has no ancestors — this only differs from `archivedAt !== null` for a
      // sub-group whose ancestor is archived (`docs/specs/groups.md`).
      readOnly: isEffectivelyArchived(group, ancestors),
      pairRooted: isPairRooted(group, ancestors),
    };
  }

  /** {@link assertEffectivelyActive}, fetching the ancestor chain itself. */
  async function assertGroupEffectivelyActive(group: GroupRow): Promise<void> {
    assertEffectivelyActive(group, await repository.listAncestors(group.id));
  }

  /**
   * Membership is the only authorization. A group the caller does not belong
   * to is reported as missing, so its existence is never disclosed — *unless*
   * the caller belongs to its immediate parent, in which case they already
   * legitimately know it exists (it is shown to them in the parent's own
   * sub-group list) and the refusal says "join it" instead
   * (`docs/specs/groups.md`). This never applies transitively: belonging to a
   * grandparent says nothing about knowing a grandchild exists.
   */
  async function requireMembership(userId: string, groupId: string): Promise<GroupContext> {
    const group = await repository.findGroupById(groupId);
    if (!group) {
      throw new GroupAccessError('not_found');
    }
    const membership = await repository.findMembership(groupId, userId);
    if (membership) {
      return { group, role: membership.role as GroupRole };
    }
    if (group.parentId && (await repository.findMembership(group.parentId, userId))) {
      throw new GroupAccessError('join_required');
    }
    throw new GroupAccessError('not_found');
  }

  /** Membership plus the guards every management action shares. */
  async function requireManageable(userId: string, groupId: string): Promise<GroupContext> {
    const context = await requireMembership(userId, groupId);
    assertNotPairGroup(context.group);
    return context;
  }

  /**
   * The friendship two users share. Reported as a missing group when there is
   * none: without the friendship there is no shared group to reach, and the
   * answer must not double as a "are these two people friends?" oracle.
   */
  async function requireFriendship(userId: string, friendId: string): Promise<string> {
    if (userId === friendId) {
      throw new GroupAccessError('not_found');
    }
    const friendship = await repository.findFriendship(orderPair(userId, friendId));
    if (!friendship) {
      throw new GroupAccessError('not_found');
    }
    return friendship.id;
  }

  /** Only the caller's own friends can be pulled into a group directly. */
  async function requireFriends(userId: string, memberIds: readonly string[]) {
    const wanted = [...new Set(memberIds)].filter((id) => id !== userId);
    const friendIds = await repository.filterFriendIds(userId, wanted);
    if (friendIds.length !== wanted.length) {
      throw new GroupAccessError('not_friends');
    }
    return friendIds;
  }

  return {
    async list(userId) {
      const rows = await repository.listGroupsForUser(userId);
      if (rows.length === 0) {
        return [];
      }

      // One ledger read for every listed group, rather than one per group:
      // the balance is a client of `transactions`' ledger, not a second
      // implementation of it.
      const balances = await ledger.balancesByGroup(
        userId,
        rows.map(({ group }) => group.id),
      );

      return rows.map(({ group, memberCount, subgroupCount }) =>
        summaryOf(
          group,
          group.name ?? 'Untitled group',
          memberCount,
          subgroupCount,
          balances.get(group.id) ?? 0,
        ),
      );
    },

    async get(userId, groupId) {
      const { group, role } = await requireMembership(userId, groupId);
      return detailOf(group, userId, role);
    },

    async create(userId, input) {
      let parentId: string | null = null;
      let depth = 0;
      let ceiling: ReadonlySet<string> | null = null;

      if (input.parentId) {
        // Creating a sub-group is available to any member of the parent —
        // the same people who can add a friend to it — so this is exactly
        // the membership check every other group action already uses. The
        // parent itself may be a pair group: a friendship can have
        // sub-groups too, just capped at its own two people (`pairCeiling`).
        const { group: parent } = await requireMembership(userId, input.parentId);
        await assertGroupEffectivelyActive(parent);
        assertWithinDepthLimit(parent.depth);
        parentId = parent.id;
        depth = parent.depth + 1;
        ceiling = await pairCeiling(repository, parent);
      }

      let memberIds = await requireFriends(userId, input.memberIds ?? []);
      assertWithinPairCeiling(ceiling, memberIds);
      if (ceiling) {
        // A pair-rooted sub-group can only ever hold the friendship's own two
        // people, so there is no picking involved — both start out as
        // members instead of leaving the partner to notice and join an
        // "unjoined" sub-group later.
        memberIds = [...ceiling];
      }
      const group = await repository.createGroup({
        name: input.name,
        ownerId: userId,
        memberIds,
        parentId,
        depth,
      });
      return detailOf(group, userId, 'owner');
    },

    async update(userId, groupId, input) {
      const { group, role } = await requireManageable(userId, groupId);

      const values: { name?: string; archivedAt?: Date | null } = {};
      if (input.name !== undefined) {
        values.name = input.name;
      }
      if (input.archived !== undefined) {
        values.archivedAt = input.archived ? now() : null;
      }

      const updated = await repository.updateGroup(groupId, values, now());
      return detailOf(updated ?? group, userId, role);
    },

    async remove(userId, groupId) {
      const { group, role } = await requireManageable(userId, groupId);
      assertOwner(role);
      await repository.deleteGroup(group.id);
    },

    async addMembers(userId, groupId, memberIds) {
      const { group, role } = await requireManageable(userId, groupId);
      await assertGroupEffectivelyActive(group);

      const friendIds = await requireFriends(userId, memberIds);
      assertWithinPairCeiling(await pairCeiling(repository, group), friendIds);
      await repository.addMembers(groupId, friendIds);
      return detailOf(group, userId, role);
    },

    async removeMember(userId, groupId, targetId) {
      const { group, role } = await requireManageable(userId, groupId);

      if (targetId === userId) {
        assertCanLeave(role, await repository.countMembers(groupId));
      } else {
        // Removing someone else is a management action; leaving is not.
        await assertGroupEffectivelyActive(group);
        const target = await repository.findMembership(groupId, targetId);
        if (!target) {
          // Already out — nothing to do, and nothing to disclose.
          return { groupDeleted: false, removedFromDescendantCount: 0 };
        }
        assertRemovable(target.role as GroupRole);
      }

      // Cascading targetId out of groupId must not strand a sub-group only
      // they can delete — the same reasoning as `assertCanLeave`, extended
      // down the tree (`docs/specs/groups.md`). Applies whether targetId is
      // leaving on their own or being removed by someone else: either way,
      // their membership in every descendant goes with it.
      const stranded = await repository.listOwnedPopulatedDescendants(groupId, targetId);
      if (stranded.length > 0) {
        throw new GroupAccessError('owner_cannot_leave');
      }

      const { removedFromGroupIds, deletedGroupIds } =
        await repository.removeMemberWithDescendants(groupId, targetId);

      return {
        groupDeleted: deletedGroupIds.includes(groupId),
        removedFromDescendantCount: Math.max(0, removedFromGroupIds.length - 1),
      };
    },

    async join(userId, groupId) {
      const group = await repository.findGroupById(groupId);
      // A root group has no "already visible without membership" story, so
      // there is nothing to join directly — the same not_found a stranger
      // gets. Joining only ever applies to a sub-group shown in its parent's
      // own list.
      if (!group || group.parentId === null) {
        throw new GroupAccessError('not_found');
      }
      if (!(await repository.findMembership(group.parentId, userId))) {
        throw new GroupAccessError('not_found');
      }
      await assertGroupEffectivelyActive(group);

      await repository.addMembers(group.id, [userId]);
      // Re-read rather than assume 'member': joining is idempotent, and a
      // caller already a member — as an owner, say — must not be downgraded
      // in the response.
      const membership = await repository.findMembership(group.id, userId);
      return detailOf(group, userId, membership!.role as GroupRole);
    },

    async getOrCreateInvite(userId, groupId) {
      const { group } = await requireManageable(userId, groupId);
      await assertGroupEffectivelyActive(group);
      await assertNotPairRooted(repository, group);
      return invites.getOrCreate(targetFor(groupId), userId);
    },

    async rotateInvite(userId, groupId) {
      const { group } = await requireManageable(userId, groupId);
      await assertGroupEffectivelyActive(group);
      await assertNotPairRooted(repository, group);
      return invites.rotate(targetFor(groupId), userId);
    },

    async revokeInvite(userId, groupId) {
      await requireManageable(userId, groupId);
      await invites.revoke(targetFor(groupId));
    },

    async getPairGroup(userId, friendId) {
      const friendshipId = await requireFriendship(userId, friendId);
      const existing = await repository.findGroupByFriendship(friendshipId);
      const group =
        existing ??
        (await repository.createPairGroup(friendshipId, orderPair(userId, friendId)));

      return detailOf(group, userId, 'member');
    },

    async subtreeScope(userId, groupId) {
      await requireMembership(userId, groupId);
      const descendantIds = await repository.listDescendantIds(groupId);
      const memberDescendantIds = await repository.filterMemberGroupIds(userId, descendantIds);
      return {
        memberDescendantIds,
        excludedCount: descendantIds.length - memberDescendantIds.length,
      };
    },
  };
}

/**
 * What a `group` invitation does: joining the group it points at. Registered
 * with the invites feature, which owns the code and its lifecycle.
 */
export function createGroupInviteHandler(
  repository: GroupsRepository,
  ledger: GroupBalances,
): InviteHandler {
  /**
   * A group that was deleted, or archived since the link was shared —
   * itself, or any ancestor of it — takes no new members: the holder's next
   * step is the same as for a dead link (`docs/specs/groups.md`).
   */
  async function resolveGroup(groupId: string | null): Promise<GroupRow> {
    const group = groupId ? await repository.findGroupById(groupId) : undefined;
    if (!group || group.kind === 'pair') {
      throw new InviteError('gone');
    }
    const ancestors = await repository.listAncestors(group.id);
    if (isEffectivelyArchived(group, ancestors)) {
      throw new InviteError('gone');
    }
    return group;
  }

  return {
    async preview({ invite, inviter }) {
      const group = await resolveGroup(invite.groupId);
      return {
        kind: 'group',
        inviter,
        group: {
          id: group.id,
          name: group.name ?? 'Untitled group',
          memberCount: await repository.countMembers(group.id),
        },
      };
    },

    async accept({ invite }, userId) {
      const group = await resolveGroup(invite.groupId);
      // Membership flows down the tree: this also joins every ancestor of
      // `group` (`docs/specs/groups.md`) — a side effect of `addMembers`, not
      // something reflected in the summary below, which describes `group`
      // itself only.
      const inserted = await repository.addMembers(group.id, [userId]);
      const [children, viewerBalanceCents] = await Promise.all([
        repository.listChildren(group.id),
        ownBalance(ledger, userId, group.id),
      ]);

      return {
        kind: 'group',
        group: {
          id: group.id,
          kind: 'standard',
          name: group.name ?? 'Untitled group',
          memberCount: await repository.countMembers(group.id),
          parentId: group.parentId,
          depth: group.depth,
          subgroupCount: children.length,
          viewerBalanceCents,
          archivedAt: null,
          createdAt: group.createdAt.toISOString(),
        },
        alreadyMember: inserted.length === 0,
      };
    },
  };
}
