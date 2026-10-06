import { ApiError } from '@/lib/api/errors';

/**
 * The server refuses removing a friend — or deleting the group the two share,
 * which is the same thing — while anything is still owed in that group or
 * its sub-groups (`docs/specs/friends-and-invitations.md`).
 */
export function isUnsettledRemoval(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'balance_not_settled';
}

export const UNSETTLED_REMOVAL_TITLE = 'Settle up first';

export function unsettledRemovalMessage(friendName: string): string {
  return `You and ${friendName} still owe each other money in the group you share. Settle up there first, then remove them.`;
}
