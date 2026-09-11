import type { FriendSummary, Invite } from '@splitcount/shared';

import { InviteError } from '../invites/codes.js';
import type { InviteHandler, InvitesService } from '../invites/service.js';
import { toUserSummary } from '../users/repository.js';

import { orderPair } from './friendships.js';
import type { FriendsRepository } from './repository.js';

export interface FriendsService {
  /** The caller's active invitation, creating one when there is none. */
  getOrCreateInvite(userId: string): Promise<Invite>;
  /** Revoke the active invitation and issue a fresh one. */
  rotateInvite(userId: string): Promise<Invite>;
  /** Revoke the active invitation. Idempotent. */
  revokeInvite(userId: string): Promise<void>;
  listFriends(userId: string): Promise<FriendSummary[]>;
  removeFriend(userId: string, friendId: string): Promise<void>;
}

export interface FriendsServiceDeps {
  repository: FriendsRepository;
  invites: InvitesService;
}

/** One active friend invitation per inviter — the link *is* "add me". */
const targetFor = (userId: string) => ({ kind: 'friend' as const, inviterId: userId });

export function createFriendsService(deps: FriendsServiceDeps): FriendsService {
  const { repository, invites } = deps;

  return {
    getOrCreateInvite: (userId) => invites.getOrCreate(targetFor(userId), userId),
    rotateInvite: (userId) => invites.rotate(targetFor(userId), userId),
    revokeInvite: (userId) => invites.revoke(targetFor(userId)),

    async listFriends(userId) {
      const rows = await repository.listFriends(userId);
      return rows.map(toUserSummary);
    },

    async removeFriend(userId, friendId) {
      if (userId === friendId) {
        return;
      }
      // Cascades: the group the pair shared goes with the friendship.
      await repository.deleteFriendship(orderPair(userId, friendId));
    },
  };
}

/**
 * What a `friend` invitation does: becoming the inviter's friend. Registered
 * with the invites feature, which owns the code and its lifecycle.
 */
export function createFriendInviteHandler(repository: FriendsRepository): InviteHandler {
  return {
    async preview({ inviter }) {
      return { kind: 'friend', inviter };
    },

    async accept({ invite, inviter }, userId) {
      if (invite.inviterId === userId) {
        throw new InviteError('self_invite');
      }

      const { created } = await repository.upsertFriendship(
        orderPair(invite.inviterId, userId),
      );

      return { kind: 'friend', friend: inviter, alreadyFriends: !created };
    },
  };
}
