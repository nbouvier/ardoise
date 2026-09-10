import type { FriendInvite, FriendSummary } from '@splitcount/shared';

import { env } from '../../config/env.js';
import type { FriendInviteRow, UserRow } from '../../db/schema.js';

import { orderPair } from './friendships.js';
import { assertInviteUsable, generateInviteCode, InviteError } from './invites.js';
import type { FriendsRepository } from './repository.js';

/** How another user is exposed. Narrower than `UserProfile`: no email address. */
export function toFriendSummary(user: UserRow): FriendSummary {
  return { id: user.id, name: user.name, picture: user.picture };
}

export interface AcceptedInvite {
  friend: FriendSummary;
  alreadyFriends: boolean;
  inviterId: string;
}

export interface FriendsService {
  /** The caller's active invite, creating one when there is none. */
  getOrCreateInvite(userId: string): Promise<FriendInvite>;
  /** Revoke the active invite and issue a fresh one. */
  rotateInvite(userId: string): Promise<FriendInvite>;
  /** Revoke the active invite. Idempotent. */
  revokeInvite(userId: string): Promise<void>;
  /** Who is inviting. Unauthenticated; throws `InviteError` when unusable. */
  previewInvite(code: string): Promise<FriendSummary>;
  acceptInvite(code: string, userId: string): Promise<AcceptedInvite>;
  listFriends(userId: string): Promise<FriendSummary[]>;
  removeFriend(userId: string, friendId: string): Promise<void>;
}

export interface FriendsServiceDeps {
  repository: FriendsRepository;
  ttlSeconds?: number;
  publicBaseUrl?: string;
  now?: () => Date;
}

export function createFriendsService(deps: FriendsServiceDeps): FriendsService {
  const {
    repository,
    ttlSeconds = env.FRIEND_INVITE_TTL_SECONDS,
    publicBaseUrl = env.PUBLIC_BASE_URL,
    now = () => new Date(),
  } = deps;

  const base = publicBaseUrl.replace(/\/+$/, '');

  function toInvite(row: FriendInviteRow): FriendInvite {
    return {
      code: row.code,
      url: `${base}/i/${row.code}`,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  async function create(userId: string): Promise<FriendInvite> {
    const row = await repository.insertInvite({
      inviterId: userId,
      code: generateInviteCode(),
      expiresAt: new Date(now().getTime() + ttlSeconds * 1000),
    });
    return toInvite(row);
  }

  async function resolveUsableInvite(code: string): Promise<FriendInviteRow> {
    const invite = await repository.findInviteByCode(code);
    assertInviteUsable(invite, now());
    return invite;
  }

  return {
    async getOrCreateInvite(userId) {
      const existing = await repository.findActiveInviteByInviter(userId, now());
      return existing ? toInvite(existing) : create(userId);
    },

    async rotateInvite(userId) {
      await repository.revokeInvitesByInviter(userId, now());
      return create(userId);
    },

    async revokeInvite(userId) {
      await repository.revokeInvitesByInviter(userId, now());
    },

    async previewInvite(code) {
      const invite = await resolveUsableInvite(code);
      const inviter = await repository.findUserById(invite.inviterId);
      if (!inviter) {
        throw new InviteError('not_found');
      }
      return toFriendSummary(inviter);
    },

    async acceptInvite(code, userId) {
      const invite = await resolveUsableInvite(code);
      if (invite.inviterId === userId) {
        throw new InviteError('self_invite');
      }
      const inviter = await repository.findUserById(invite.inviterId);
      if (!inviter) {
        throw new InviteError('not_found');
      }

      const { created } = await repository.upsertFriendship(
        orderPair(invite.inviterId, userId),
      );

      return {
        friend: toFriendSummary(inviter),
        alreadyFriends: !created,
        inviterId: invite.inviterId,
      };
    },

    async listFriends(userId) {
      const rows = await repository.listFriends(userId);
      return rows.map(toFriendSummary);
    },

    async removeFriend(userId, friendId) {
      if (userId === friendId) {
        return;
      }
      await repository.deleteFriendship(orderPair(userId, friendId));
    },
  };
}
