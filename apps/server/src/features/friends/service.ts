import type { FriendEntry, Invite } from '@splitcount/shared';

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
  /** The caller's friends, each with where the two of them stand. */
  listFriends(userId: string): Promise<FriendEntry[]>;
  removeFriend(userId: string, friendId: string): Promise<void>;
}

/**
 * The slice of the transaction ledger a friend list needs: how much each
 * person the caller shares transactions with owes them, or is owed. Narrow on
 * purpose — `friends` reads the ledger, it does not get to write to it.
 */
export interface CounterpartyBalances {
  balancesWith(userId: string): Promise<Map<string, number>>;
}

export interface FriendsServiceDeps {
  repository: FriendsRepository;
  invites: InvitesService;
  ledger: CounterpartyBalances;
}

/** One active friend invitation per inviter — the link *is* "add me". */
const targetFor = (userId: string) => ({ kind: 'friend' as const, inviterId: userId });

export function createFriendsService(deps: FriendsServiceDeps): FriendsService {
  const { repository, invites, ledger } = deps;

  return {
    getOrCreateInvite: (userId) => invites.getOrCreate(targetFor(userId), userId),
    rotateInvite: (userId) => invites.rotate(targetFor(userId), userId),
    revokeInvite: (userId) => invites.revoke(targetFor(userId)),

    async listFriends(userId) {
      // The ledger is keyed by counterparty across every group, so a friend
      // absent from it simply shares no transaction with the caller: settled,
      // not missing.
      const [rows, balances] = await Promise.all([
        repository.listFriends(userId),
        ledger.balancesWith(userId),
      ]);

      return rows.map((row) => ({
        ...toUserSummary(row),
        balanceCents: balances.get(row.id) ?? 0,
      }));
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
