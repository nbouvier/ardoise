import type {
  AcceptInviteResult,
  FriendSummary,
  Invite,
  InviteKind,
  InvitePreview,
} from '@ardoise/shared';

import { env } from '../../config/env.js';
import type { InviteRow } from '../../db/schema.js';
import type { UsersRepository } from '../users/repository.js';
import { toUserSummary } from '../users/repository.js';

import { assertInviteUsable, generateInviteCode, InviteError } from './codes.js';
import type { InsertInviteInput, InvitesRepository, InviteTarget } from './repository.js';

/** A usable invitation together with the person who issued it. */
export interface InviteContext {
  invite: InviteRow;
  inviter: FriendSummary;
}

/**
 * What a kind of invitation actually does. The invites feature owns the code,
 * its lifetime and its revocation, and knows nothing about friendships or
 * groups: each feature registers how its own invitations are previewed and
 * accepted. That keeps `friends` and `groups` independent of each other while
 * sharing one code space, one link format and one landing page.
 *
 * Both methods may throw `InviteError` — typically `gone` when the target no
 * longer exists or no longer accepts anyone.
 */
export interface InviteHandler {
  preview(context: InviteContext): Promise<InvitePreview>;
  accept(context: InviteContext, userId: string): Promise<AcceptInviteResult>;
}

export interface InvitesService {
  /** Register the handler for one kind. Called by the feature that owns it. */
  register(kind: InviteKind, handler: InviteHandler): void;
  /** The target's active invitation, creating one when there is none. */
  getOrCreate(target: InviteTarget, inviterId: string): Promise<Invite>;
  /** Revoke the active invitation and issue a fresh one. */
  rotate(target: InviteTarget, inviterId: string): Promise<Invite>;
  /** Revoke the active invitation. Idempotent. */
  revoke(target: InviteTarget): Promise<void>;
  /** What the code leads to. Unauthenticated; throws `InviteError` when unusable. */
  preview(code: string): Promise<InvitePreview>;
  accept(code: string, userId: string): Promise<AcceptInviteResult>;
  /**
   * Delete the invitations dead for over `STALE_INVITE_RETENTION_DAYS`;
   * returns how many. Until then, an old link still says it expired.
   */
  purgeStale(): Promise<number>;
}

/**
 * How long a revoked or expired invitation is kept: its link still answers
 * "expired" (or "no longer valid") rather than "not found" for that long.
 */
export const STALE_INVITE_RETENTION_DAYS = 30;

export interface InvitesServiceDeps {
  repository: InvitesRepository;
  users: UsersRepository;
  ttlSeconds?: number;
  publicBaseUrl?: string;
  now?: () => Date;
}

export function createInvitesService(deps: InvitesServiceDeps): InvitesService {
  const {
    repository,
    users,
    ttlSeconds = env.INVITE_TTL_SECONDS,
    publicBaseUrl = env.PUBLIC_BASE_URL,
    now = () => new Date(),
  } = deps;

  const base = publicBaseUrl.replace(/\/+$/, '');
  const handlers = new Map<InviteKind, InviteHandler>();

  function toInvite(row: InviteRow): Invite {
    return {
      code: row.code,
      url: `${base}/i/${row.code}`,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  function newInvite(target: InviteTarget, inviterId: string): InsertInviteInput {
    return {
      target,
      inviterId,
      code: generateInviteCode(),
      expiresAt: new Date(now().getTime() + ttlSeconds * 1000),
    };
  }

  /** Resolve a code into a usable invitation, its inviter, and its handler. */
  async function resolve(code: string): Promise<InviteContext & { handler: InviteHandler }> {
    const invite = await repository.findByCode(code);
    assertInviteUsable(invite, now());

    const handler = handlers.get(invite.kind as InviteKind);
    if (!handler) {
      // A kind nobody claims cannot lead anywhere; the holder's next step is
      // the same as for a dead link.
      throw new InviteError('not_found');
    }

    const inviter = await users.findById(invite.inviterId);
    if (!inviter) {
      throw new InviteError('gone');
    }

    return { invite, inviter: toUserSummary(inviter), handler };
  }

  return {
    register(kind, handler) {
      handlers.set(kind, handler);
    },

    async getOrCreate(target, inviterId) {
      return toInvite(await repository.findOrInsertActive(newInvite(target, inviterId), now()));
    },

    async rotate(target, inviterId) {
      return toInvite(await repository.replaceActive(newInvite(target, inviterId), now()));
    },

    async revoke(target) {
      await repository.revokeActive(target, now());
    },

    async preview(code) {
      const { handler, ...context } = await resolve(code);
      return handler.preview(context);
    },

    async accept(code, userId) {
      const { handler, ...context } = await resolve(code);
      return handler.accept(context, userId);
    },

    purgeStale() {
      const retentionMs = STALE_INVITE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
      return repository.deleteStale(new Date(now().getTime() - retentionMs));
    },
  };
}
