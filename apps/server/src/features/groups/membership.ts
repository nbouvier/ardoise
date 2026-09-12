import { MAX_GROUP_DEPTH, type GroupRole } from '@splitcount/shared';

import type { GroupRow } from '../../db/schema.js';

/**
 * Why a group operation is refused.
 *
 * `not_found` covers both "no such group" and "you are not a member": a
 * non-member must not be able to tell a group they cannot see from one that
 * does not exist. `join_required` is the one deliberate exception: a member
 * of a group's immediate parent who has not joined it already knows it
 * exists — it is shown to them in the parent's own sub-group list
 * (`docs/specs/groups.md`).
 */
export type GroupAccessReason =
  | 'not_found'
  | 'join_required'
  | 'not_owner'
  | 'pair_immutable'
  | 'archived'
  | 'owner_cannot_leave'
  | 'cannot_remove_owner'
  | 'not_friends'
  | 'max_depth_reached';

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

/**
 * A group is read-only whenever it, *or any ancestor of it*, is archived —
 * archiving a group makes every sub-group of it effectively archived too,
 * without writing anything to those sub-groups (`docs/specs/groups.md`).
 * `ancestors` is the caller's own `listAncestors(group.id)` result; passed in
 * rather than fetched here so this stays a plain, synchronous predicate like
 * every other check in this module. The single definition both the
 * throwing assertion below and `GroupDetail.readOnly` are built from.
 */
export function isEffectivelyArchived(group: GroupRow, ancestors: readonly GroupRow[]): boolean {
  return group.archivedAt !== null || ancestors.some((ancestor) => ancestor.archivedAt !== null);
}

/** Throws when {@link isEffectivelyArchived} would be `true`. */
export function assertEffectivelyActive(group: GroupRow, ancestors: readonly GroupRow[]): void {
  if (isEffectivelyArchived(group, ancestors)) {
    throw new GroupAccessError('archived');
  }
}

/**
 * A sub-group cannot nest past the fixed depth cap. Takes the *parent's*
 * depth, since the check is "would the new group be too deep", asked before
 * that group exists.
 */
export function assertWithinDepthLimit(parentDepth: number): void {
  if (parentDepth >= MAX_GROUP_DEPTH) {
    throw new GroupAccessError('max_depth_reached');
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
