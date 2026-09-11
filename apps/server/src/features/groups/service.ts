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
  assertActive,
  assertCanLeave,
  assertNotPairGroup,
  assertOwner,
  assertRemovable,
  GroupAccessError,
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
}

export interface GroupsService {
  list(userId: string): Promise<GroupSummary[]>;
  get(userId: string, groupId: string): Promise<GroupDetail>;
  create(userId: string, input: CreateGroupRequest): Promise<GroupDetail>;
  update(userId: string, groupId: string, input: UpdateGroupRequest): Promise<GroupDetail>;
  remove(userId: string, groupId: string): Promise<void>;
  addMembers(userId: string, groupId: string, memberIds: string[]): Promise<GroupDetail>;
  removeMember(userId: string, groupId: string, targetId: string): Promise<RemovedMember>;
  getOrCreateInvite(userId: string, groupId: string): Promise<Invite>;
  rotateInvite(userId: string, groupId: string): Promise<Invite>;
  revokeInvite(userId: string, groupId: string): Promise<void>;
  /** The group the caller shares with a friend, created on first access. */
  getPairGroup(userId: string, friendId: string): Promise<GroupDetail>;
}

export interface GroupsServiceDeps {
  repository: GroupsRepository;
  invites: InvitesService;
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

export function createGroupsService(deps: GroupsServiceDeps): GroupsService {
  const { repository, invites, now = () => new Date() } = deps;

  function summaryOf(group: GroupRow, name: string, memberCount: number): GroupSummary {
    return {
      id: group.id,
      kind: group.kind as GroupSummary['kind'],
      name,
      memberCount,
      archivedAt: group.archivedAt?.toISOString() ?? null,
      createdAt: group.createdAt.toISOString(),
    };
  }

  async function detailOf(group: GroupRow, viewerId: string, role: GroupRole) {
    const members = await repository.listMembers(group.id);
    return {
      ...summaryOf(group, nameFor(group, viewerId, members), members.length),
      members: members.map((member) => ({
        ...toUserSummary(member.user),
        role: member.role,
      })),
      viewerRole: role,
    };
  }

  /**
   * Membership is the only authorization. A group the caller does not belong to
   * is reported as missing, so its existence is never disclosed.
   */
  async function requireMembership(userId: string, groupId: string): Promise<GroupContext> {
    const group = await repository.findGroupById(groupId);
    if (!group) {
      throw new GroupAccessError('not_found');
    }
    const membership = await repository.findMembership(groupId, userId);
    if (!membership) {
      throw new GroupAccessError('not_found');
    }
    return { group, role: membership.role as GroupRole };
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
      return rows.map(({ group, memberCount }) =>
        summaryOf(group, group.name ?? 'Untitled group', memberCount),
      );
    },

    async get(userId, groupId) {
      const { group, role } = await requireMembership(userId, groupId);
      return detailOf(group, userId, role);
    },

    async create(userId, input) {
      const memberIds = await requireFriends(userId, input.memberIds ?? []);
      const group = await repository.createGroup({
        name: input.name,
        ownerId: userId,
        memberIds,
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
      assertActive(group);

      await repository.addMembers(groupId, await requireFriends(userId, memberIds));
      return detailOf(group, userId, role);
    },

    async removeMember(userId, groupId, targetId) {
      const { group, role } = await requireManageable(userId, groupId);

      if (targetId === userId) {
        assertCanLeave(role, await repository.countMembers(groupId));
      } else {
        // Removing someone else is a management action; leaving is not.
        assertActive(group);
        const target = await repository.findMembership(groupId, targetId);
        if (!target) {
          // Already out — nothing to do, and nothing to disclose.
          return { groupDeleted: false };
        }
        assertRemovable(target.role as GroupRole);
      }

      await repository.removeMember(groupId, targetId);

      // A group nobody belongs to is unreachable; keeping it would be a leak.
      if ((await repository.countMembers(groupId)) === 0) {
        await repository.deleteGroup(groupId);
        return { groupDeleted: true };
      }
      return { groupDeleted: false };
    },

    async getOrCreateInvite(userId, groupId) {
      const { group } = await requireManageable(userId, groupId);
      assertActive(group);
      return invites.getOrCreate(targetFor(groupId), userId);
    },

    async rotateInvite(userId, groupId) {
      const { group } = await requireManageable(userId, groupId);
      assertActive(group);
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
  };
}

/**
 * What a `group` invitation does: joining the group it points at. Registered
 * with the invites feature, which owns the code and its lifecycle.
 */
export function createGroupInviteHandler(repository: GroupsRepository): InviteHandler {
  /**
   * A group that was deleted, or archived since the link was shared, takes no
   * new members — the holder's next step is the same as for a dead link.
   */
  async function resolveGroup(groupId: string | null): Promise<GroupRow> {
    const group = groupId ? await repository.findGroupById(groupId) : undefined;
    if (!group || group.kind === 'pair' || group.archivedAt) {
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
      const inserted = await repository.addMembers(group.id, [userId]);

      return {
        kind: 'group',
        group: {
          id: group.id,
          kind: 'standard',
          name: group.name ?? 'Untitled group',
          memberCount: await repository.countMembers(group.id),
          archivedAt: null,
          createdAt: group.createdAt.toISOString(),
        },
        alreadyMember: inserted.length === 0,
      };
    },
  };
}
