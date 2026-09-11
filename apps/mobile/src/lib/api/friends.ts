import {
  friendsListResponseSchema,
  inviteResponseSchema,
  type FriendSummary,
  type Invite,
} from '@splitcount/shared';

import { expectNoContent, parsedJson, type AuthorizedFetch } from './client';

/** The caller's active invitation, created on first call. */
export async function fetchInvite(fetcher: AuthorizedFetch): Promise<Invite> {
  const response = await fetcher('/friends/invite', { method: 'POST' });
  return (await parsedJson(response, inviteResponseSchema)).invite;
}

/** Replace the active invitation; the previous link stops working. */
export async function rotateInvite(fetcher: AuthorizedFetch): Promise<Invite> {
  const response = await fetcher('/friends/invite/rotate', { method: 'POST' });
  return (await parsedJson(response, inviteResponseSchema)).invite;
}

export async function fetchFriends(fetcher: AuthorizedFetch): Promise<FriendSummary[]> {
  const response = await fetcher('/friends');
  return (await parsedJson(response, friendsListResponseSchema)).friends;
}

/**
 * Remove a friend. Destructive beyond the relationship: the group the two
 * shared goes with it, along with everything in it.
 */
export async function removeFriend(
  fetcher: AuthorizedFetch,
  friendId: string,
): Promise<void> {
  const response = await fetcher(`/friends/${encodeURIComponent(friendId)}`, {
    method: 'DELETE',
  });
  await expectNoContent(response);
}
