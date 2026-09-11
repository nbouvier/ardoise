import { randomBytes } from 'node:crypto';

import type { FriendInviteRow } from '../../db/schema.js';

/** 128 bits of randomness, base64url — opaque and not enumerable. */
export function generateInviteCode(): string {
  return randomBytes(16).toString('base64url');
}

export type InviteErrorReason = 'not_found' | 'expired' | 'revoked' | 'self_invite';

export class InviteError extends Error {
  constructor(readonly reason: InviteErrorReason) {
    super(`Invitation ${reason}`);
    this.name = 'InviteError';
  }
}

/**
 * Reject an invitation that can no longer be used. Revocation is checked before
 * expiry so a rotated link reports the more specific reason.
 */
export function assertInviteUsable(
  invite: FriendInviteRow | undefined,
  now: Date,
): asserts invite is FriendInviteRow {
  if (!invite) {
    throw new InviteError('not_found');
  }
  if (invite.revokedAt) {
    throw new InviteError('revoked');
  }
  if (invite.expiresAt.getTime() <= now.getTime()) {
    throw new InviteError('expired');
  }
}
