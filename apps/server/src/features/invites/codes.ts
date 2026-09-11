import { randomBytes } from 'node:crypto';

import type { InviteRow } from '../../db/schema.js';

/** 128 bits of randomness, base64url — opaque and not enumerable. */
export function generateInviteCode(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * Why an invitation cannot be used. `not_found`, `expired` and `revoked`
 * describe the code itself; `gone` is for a target that no longer accepts
 * anyone (a deleted or archived group) and `self_invite` for the one case where
 * the holder is the wrong person (their own friend link).
 */
export type InviteErrorReason =
  | 'not_found'
  | 'expired'
  | 'revoked'
  | 'gone'
  | 'self_invite';

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
  invite: InviteRow | undefined,
  now: Date,
): asserts invite is InviteRow {
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
