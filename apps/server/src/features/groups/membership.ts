import type { GroupRole } from '@splitcount/shared';

import type { GroupRow } from '../../db/schema.js';

/**
 * Why a group operation is refused.
 *
 * `not_found` covers both "no such group" and "you are not a member": a
 * non-member must not be able to tell a group they cannot see from one that
 * does not exist.
 */
export type GroupAccessReason =
  | 'not_found'
  | 'not_owner'
  | 'pair_immutable'
  | 'archived'
  | 'owner_cannot_leave'
  | 'cannot_remove_owner'
  | 'not_friends';

export class GroupAccessError extends Error {
  constructor(readonly reason: GroupAccessReason) {
    super(`Group access refused: ${reason}`);
    this.name = 'GroupAccessError';
  }
}

/**
 * A pair group is immutable by construction: it belongs to a friendship, always
 * has exactly those two people, and lives and dies with it. Renaming,
 * archiving, deleting, inviting into it or changing who is in it can never
 * apply.
 */
export function assertNotPairGroup(group: GroupRow): void {
  if (group.kind === 'pair') {
    throw new GroupAccessError('pair_immutable');
  }
}

/** An archived group is inactive: it takes no new members and issues no links. */
export function assertActive(group: GroupRow): void {
  if (group.archivedAt) {
    throw new GroupAccessError('archived');
  }
}

/** Deleting is irreversible and loses everything, so it stays with the owner. */
export function assertOwner(role: GroupRole): void {
  if (role !== 'owner') {
    throw new GroupAccessError('not_owner');
  }
}

/**
 * The owner cannot walk away from a group only they can delete. Alone, leaving
 * *is* deleting, which is allowed.
 */
export function assertCanLeave(role: GroupRole, memberCount: number): void {
  if (role === 'owner' && memberCount > 1) {
    throw new GroupAccessError('owner_cannot_leave');
  }
}

/**
 * Members may remove each other, but not the owner: that would leave a group
 * nobody is allowed to delete. The owner leaves on their own terms.
 */
export function assertRemovable(targetRole: GroupRole): void {
  if (targetRole === 'owner') {
    throw new GroupAccessError('cannot_remove_owner');
  }
}
