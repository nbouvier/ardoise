import {
  groupResponseSchema,
  groupsListResponseSchema,
  inviteResponseSchema,
  placeholdersResponseSchema,
  type GroupDetail,
  type GroupSummary,
  type Invite,
  type PlaceholdersResponse,
} from '@ardoise/shared';

import { expectNoContent, parsedJson, type AuthorizedFetch } from './client';

const groupPath = (groupId: string) => `/groups/${encodeURIComponent(groupId)}`;

/** The caller's groups. Pair groups are never included — the server excludes them. */
export async function fetchGroups(fetcher: AuthorizedFetch): Promise<GroupSummary[]> {
  const response = await fetcher('/groups');
  return (await parsedJson(response, groupsListResponseSchema)).groups;
}

/**
 * The caller's favorited groups — unlike `fetchGroups`, of any kind and any
 * depth: a sub-group, and the implicit pair group behind a favorited friend,
 * both belong in the home screen's own section (`docs/specs/home.md`).
 * Ordered by the server: active before archived, alphabetical within each.
 */
export async function fetchFavoriteGroups(fetcher: AuthorizedFetch): Promise<GroupSummary[]> {
  const response = await fetcher('/groups/favorites');
  return (await parsedJson(response, groupsListResponseSchema)).groups;
}

export async function fetchGroup(
  fetcher: AuthorizedFetch,
  groupId: string,
): Promise<GroupDetail> {
  const response = await fetcher(groupPath(groupId));
  return (await parsedJson(response, groupResponseSchema)).group;
}

/**
 * `memberIds` are friends — or, for a sub-group, placeholders of its tree;
 * `placeholderNames` creates new placeholder members
 * (`docs/specs/placeholder-members.md`).
 */
export async function createGroup(
  fetcher: AuthorizedFetch,
  input: { name: string; memberIds?: string[]; placeholderNames?: string[]; parentId?: string },
): Promise<GroupDetail> {
  const response = await fetcher('/groups', { method: 'POST', body: input });
  return (await parsedJson(response, groupResponseSchema)).group;
}

/** Rename and/or archive. Any member may do either. */
export async function updateGroup(
  fetcher: AuthorizedFetch,
  groupId: string,
  changes: { name?: string; archived?: boolean },
): Promise<GroupDetail> {
  const response = await fetcher(groupPath(groupId), { method: 'PATCH', body: changes });
  return (await parsedJson(response, groupResponseSchema)).group;
}

/**
 * Set or clear the caller's own favorite marker on the group
 * (`docs/specs/favorites.md`). Personal to the caller, idempotent either way.
 */
export async function setGroupFavorite(
  fetcher: AuthorizedFetch,
  groupId: string,
  favorite: boolean,
): Promise<GroupDetail> {
  const response = await fetcher(`${groupPath(groupId)}/favorite`, {
    method: favorite ? 'PUT' : 'DELETE',
  });
  return (await parsedJson(response, groupResponseSchema)).group;
}

/** Delete the group and everything in it. Owner only, irreversible. */
export async function deleteGroup(
  fetcher: AuthorizedFetch,
  groupId: string,
): Promise<void> {
  await expectNoContent(await fetcher(groupPath(groupId), { method: 'DELETE' }));
}

/** Friends or placeholders of the tree (`memberIds`), and new placeholders, at once. */
export async function addGroupMembers(
  fetcher: AuthorizedFetch,
  groupId: string,
  people: { memberIds?: string[]; placeholderNames?: string[] },
): Promise<GroupDetail> {
  const response = await fetcher(`${groupPath(groupId)}/members`, {
    method: 'POST',
    body: people,
  });
  return (await parsedJson(response, groupResponseSchema)).group;
}

/**
 * Every placeholder of the group's tree, with what claiming it would take
 * over, and whether the caller may still claim one
 * (`docs/specs/placeholder-members.md`).
 */
export async function fetchPlaceholders(
  fetcher: AuthorizedFetch,
  groupId: string,
): Promise<PlaceholdersResponse> {
  const response = await fetcher(`${groupPath(groupId)}/placeholders`);
  return parsedJson(response, placeholdersResponseSchema);
}

export async function renamePlaceholder(
  fetcher: AuthorizedFetch,
  groupId: string,
  placeholderId: string,
  name: string,
): Promise<GroupDetail> {
  const response = await fetcher(
    `${groupPath(groupId)}/placeholders/${encodeURIComponent(placeholderId)}`,
    { method: 'PATCH', body: { name } },
  );
  return (await parsedJson(response, groupResponseSchema)).group;
}

/** "This is me": the placeholder's transactions and memberships become the caller's. */
export async function claimPlaceholder(
  fetcher: AuthorizedFetch,
  groupId: string,
  placeholderId: string,
): Promise<GroupDetail> {
  const response = await fetcher(
    `${groupPath(groupId)}/placeholders/${encodeURIComponent(placeholderId)}/claim`,
    { method: 'POST' },
  );
  return (await parsedJson(response, groupResponseSchema)).group;
}

/** Remove a member, or leave when `userId` is the signed-in user. */
export async function removeGroupMember(
  fetcher: AuthorizedFetch,
  groupId: string,
  userId: string,
): Promise<void> {
  const response = await fetcher(
    `${groupPath(groupId)}/members/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
  );
  await expectNoContent(response);
}

/** The group's invitation link — one per group, shared by every member. */
export async function fetchGroupInvite(
  fetcher: AuthorizedFetch,
  groupId: string,
): Promise<Invite> {
  const response = await fetcher(`${groupPath(groupId)}/invite`, { method: 'POST' });
  return (await parsedJson(response, inviteResponseSchema)).invite;
}

export async function rotateGroupInvite(
  fetcher: AuthorizedFetch,
  groupId: string,
): Promise<Invite> {
  const response = await fetcher(`${groupPath(groupId)}/invite/rotate`, {
    method: 'POST',
  });
  return (await parsedJson(response, inviteResponseSchema)).invite;
}

/**
 * Join a sub-group visible in a group the caller already belongs to — no
 * friendship check, unlike accepting an invitation link. Idempotent.
 */
export async function joinGroup(
  fetcher: AuthorizedFetch,
  groupId: string,
): Promise<GroupDetail> {
  const response = await fetcher(`${groupPath(groupId)}/join`, { method: 'POST' });
  return (await parsedJson(response, groupResponseSchema)).group;
}
