import {
  acceptInviteResponseSchema,
  friendInviteResponseSchema,
  friendsListResponseSchema,
  invitePreviewResponseSchema,
  type AcceptInviteResponse,
  type FriendInvite,
  type FriendSummary,
  type InvitePreviewResponse,
} from '@splitcount/shared';

import { apiRequest } from './endpoints';
import { expectOk } from './errors';

/**
 * A request signed with the current session, refreshing transparently on 401.
 * `AuthClient.authorizedFetch` implements it; tests pass a fake.
 */
export type AuthorizedFetch = (
  path: string,
  init?: { method?: string; body?: unknown },
) => Promise<Response>;

async function parsedJson<T>(
  response: Response,
  schema: { parse: (value: unknown) => T },
): Promise<T> {
  await expectOk(response);
  return schema.parse(await response.json());
}

/**
 * Who is inviting. Unauthenticated: the recipient sees this before deciding to
 * sign in, so it cannot go through `authorizedFetch`.
 */
export async function previewInvite(
  baseUrl: string,
  code: string,
): Promise<InvitePreviewResponse> {
  const response = await apiRequest(baseUrl, {
    method: 'GET',
    path: `/friends/invites/${encodeURIComponent(code)}`,
  });
  return parsedJson(response, invitePreviewResponseSchema);
}

/** The caller's active invitation, created on first call. */
export async function fetchInvite(fetcher: AuthorizedFetch): Promise<FriendInvite> {
  const response = await fetcher('/friends/invite', { method: 'POST' });
  return (await parsedJson(response, friendInviteResponseSchema)).invite;
}

/** Replace the active invitation; the previous link stops working. */
export async function rotateInvite(fetcher: AuthorizedFetch): Promise<FriendInvite> {
  const response = await fetcher('/friends/invite/rotate', { method: 'POST' });
  return (await parsedJson(response, friendInviteResponseSchema)).invite;
}

export async function acceptInvite(
  fetcher: AuthorizedFetch,
  code: string,
): Promise<AcceptInviteResponse> {
  const response = await fetcher(`/friends/invites/${encodeURIComponent(code)}/accept`, {
    method: 'POST',
  });
  return parsedJson(response, acceptInviteResponseSchema);
}

export async function fetchFriends(fetcher: AuthorizedFetch): Promise<FriendSummary[]> {
  const response = await fetcher('/friends');
  return (await parsedJson(response, friendsListResponseSchema)).friends;
}

export async function removeFriend(
  fetcher: AuthorizedFetch,
  friendId: string,
): Promise<void> {
  const response = await fetcher(`/friends/${encodeURIComponent(friendId)}`, {
    method: 'DELETE',
  });
  await expectOk(response);
}
