import { GroupAccessError, type GroupAccessReason } from './membership.js';

/**
 * HTTP mapping of a refused group operation. `not_found` is deliberately what
 * a non-member gets: a `403` would confirm that the group exists. The one
 * exception is `join_required` — a member of a group's immediate parent who
 * has not joined it already knows the group exists, since it is shown to
 * them in the parent's own sub-group list (`docs/specs/groups.md`).
 */
const groupAccessFailures: Record<GroupAccessReason, { status: number; error: string }> = {
  not_found: { status: 404, error: 'group_not_found' },
  join_required: { status: 403, error: 'join_required' },
  not_owner: { status: 403, error: 'not_group_owner' },
  pair_immutable: { status: 409, error: 'pair_group_immutable' },
  archived: { status: 409, error: 'group_archived' },
  owner_cannot_leave: { status: 409, error: 'owner_cannot_leave' },
  cannot_remove_owner: { status: 409, error: 'cannot_remove_owner' },
  not_friends: { status: 400, error: 'not_friends' },
  max_depth_reached: { status: 409, error: 'max_depth_reached' },
  // The caller is a member here, so a placeholder's existence is no secret:
  // gone means claimed or removed by someone else.
  placeholder_not_found: { status: 404, error: 'placeholder_not_found' },
  placeholder_name_taken: { status: 409, error: 'placeholder_name_taken' },
  already_claimed: { status: 409, error: 'already_claimed' },
};

export interface GroupAccessFailure {
  status: number;
  error: string;
  reason: GroupAccessReason;
}

/**
 * Translate a `GroupAccessError` into its HTTP answer, or `undefined` when
 * `error` isn't one — shared by the `groups` plugin and every other feature
 * that resolves group membership through `GroupsService` (transactions, so
 * far) and needs to answer a refusal the same way.
 */
export function translateGroupAccessError(error: unknown): GroupAccessFailure | undefined {
  if (!(error instanceof GroupAccessError)) {
    return undefined;
  }
  return { ...groupAccessFailures[error.reason], reason: error.reason };
}
