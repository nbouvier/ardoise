import type { FriendEntry, Invite } from '@ardoise/shared';

import type { DatabaseTransaction } from '../../db/client.js';
import type { PairTreeSettlement } from '../groups/settlement.js';
import { InviteError } from '../invites/codes.js';
import type { InviteHandler, InvitesService } from '../invites/service.js';
import { toUserSummary } from '../users/repository.js';

import { orderPair, type FriendshipPair } from './friendships.js';
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
  /** Throws `FriendRemovalError` while the two still owe each other in their pair tree. */
  removeFriend(userId: string, friendId: string): Promise<void>;
}

/** Why a friend cannot be removed (yet). */
export class FriendRemovalError extends Error {
  constructor(readonly reason: 'balance_not_settled') {
    super(`Friend removal refused: ${reason}`);
    this.name = 'FriendRemovalError';
  }
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
  pairTrees: PairTreeSettlement;
}

/** One active friend invitation per inviter — the link *is* "add me". */
const targetFor = (userId: string) => ({ kind: 'friend' as const, inviterId: userId });

export function createFriendsService(deps: FriendsServiceDeps): FriendsService {
  const { repository, invites, ledger, pairTrees } = deps;

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
        ...toUserSummary(row.user),
        groupId: row.groupId,
        favorite: row.favorite,
        balanceCents: balances.get(row.user.id) ?? 0,
      }));
    },

    async removeFriend(userId, friendId) {
      if (userId === friendId) {
        return;
      }
      // Cascades: the group the pair shared goes with the friendship, so it
      // waits until nothing is owed in it, sub-groups included.
      const pair = orderPair(userId, friendId);
      const pairGroupId = await repository.findPairGroupId(pair);
      if (pairGroupId && !(await pairTrees.isSettled(userId, pairGroupId))) {
        throw new FriendRemovalError('balance_not_settled');
      }
      await repository.deleteFriendship(pair);
    },
  };
}

/**
 * Materialises the implicit group two friends share, the moment they become
 * friends (`docs/specs/friends-and-invitations.md`) rather than lazily on
 * first access — the narrow slice of `groups` this needs, the same pattern
 * `CounterpartyBalances` above already uses.
 */
export interface PairGroups {
  /** Runs in the transaction creating the friendship. */
  ensure(tx: DatabaseTransaction, friendshipId: string, pair: FriendshipPair): Promise<void>;
}

/**
 * What a `friend` invitation does: becoming the inviter's friend, and — since
 * a friendship always has its pair group — materialising that group in the
 * same step. Registered with the invites feature, which owns the code and
 * its lifecycle.
 */
export function createFriendInviteHandler(
  repository: FriendsRepository,
  pairGroups: PairGroups,
): InviteHandler {
  return {
    async preview({ inviter }) {
      return { kind: 'friend', inviter };
    },

    async accept({ invite, inviter }, userId) {
      if (invite.inviterId === userId) {
        throw new InviteError('self_invite');
      }

      const pair = orderPair(invite.inviterId, userId);
      // One transaction: a friendship without its pair group would be
      // invisible (the friend list joins through the group) yet still exist.
      const { created } = await repository.upsertFriendship(pair, (tx, row) =>
        pairGroups.ensure(tx, row.id, pair),
      );

      return { kind: 'friend', friend: inviter, alreadyFriends: !created };
    },
  };
}
