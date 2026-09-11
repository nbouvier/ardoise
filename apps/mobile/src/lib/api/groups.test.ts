import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  fakeAuthorizedFetch,
  grace,
  groupDetail,
  groupSummary,
  invite,
  response,
} from '@/test-utils/api-fakes';

import {
  addGroupMembers,
  createGroup,
  deleteGroup,
  fetchGroup,
  fetchGroupInvite,
  fetchGroups,
  fetchPairGroup,
  removeGroupMember,
  updateGroup,
} from './groups';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchGroups', () => {
  it('parses the list', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { groups: [groupSummary] } }));

    await expect(fetchGroups(fetcher)).resolves.toEqual([groupSummary]);
    expect(fetcher).toHaveBeenCalledWith('/groups');
  });

  it('rejects a response that does not match the contract', async () => {
    const fetcher = fakeAuthorizedFetch(
      response({ jsonBody: { groups: [{ ...groupSummary, memberCount: 0 }] } }),
    );

    await expect(fetchGroups(fetcher)).rejects.toThrow();
  });
});

describe('fetchGroup', () => {
  it('parses the detail, members included', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { group: groupDetail } }));

    await expect(fetchGroup(fetcher, groupDetail.id)).resolves.toEqual(groupDetail);
    expect(fetcher).toHaveBeenCalledWith(`/groups/${groupDetail.id}`);
  });

  it('surfaces the 404 a non-member gets', async () => {
    const fetcher = fakeAuthorizedFetch(
      response({ ok: false, status: 404, jsonBody: { error: 'group_not_found' } }),
    );

    await expect(fetchGroup(fetcher, groupDetail.id)).rejects.toMatchObject({
      status: 404,
      code: 'group_not_found',
    });
  });
});

describe('createGroup', () => {
  it('sends the name and the chosen friends', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { group: groupDetail } }));

    await expect(
      createGroup(fetcher, { name: 'Corsica 2026', memberIds: [grace.id] }),
    ).resolves.toEqual(groupDetail);
    expect(fetcher).toHaveBeenCalledWith('/groups', {
      method: 'POST',
      body: { name: 'Corsica 2026', memberIds: [grace.id] },
    });
  });
});

describe('updateGroup', () => {
  it('archives without touching the name', async () => {
    const archived = { ...groupDetail, archivedAt: '2026-09-11T12:00:00.000Z' };
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { group: archived } }));

    await expect(updateGroup(fetcher, groupDetail.id, { archived: true })).resolves.toEqual(
      archived,
    );
    expect(fetcher).toHaveBeenCalledWith(`/groups/${groupDetail.id}`, {
      method: 'PATCH',
      body: { archived: true },
    });
  });
});

describe('deleteGroup', () => {
  it('surfaces the refusal when the caller is not the owner', async () => {
    const fetcher = fakeAuthorizedFetch(
      response({ ok: false, status: 403, jsonBody: { error: 'not_group_owner' } }),
    );

    await expect(deleteGroup(fetcher, groupDetail.id)).rejects.toMatchObject({
      status: 403,
      code: 'not_group_owner',
    });
  });

  it('resolves on a successful deletion', async () => {
    const fetcher = fakeAuthorizedFetch(response({ status: 204 }));

    await expect(deleteGroup(fetcher, groupDetail.id)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(`/groups/${groupDetail.id}`, {
      method: 'DELETE',
    });
  });
});

describe('members', () => {
  it('adds friends', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { group: groupDetail } }));

    await expect(
      addGroupMembers(fetcher, groupDetail.id, [grace.id]),
    ).resolves.toEqual(groupDetail);
    expect(fetcher).toHaveBeenCalledWith(`/groups/${groupDetail.id}/members`, {
      method: 'POST',
      body: { memberIds: [grace.id] },
    });
  });

  it('removes one', async () => {
    const fetcher = fakeAuthorizedFetch(response({ status: 204 }));

    await expect(
      removeGroupMember(fetcher, groupDetail.id, grace.id),
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(
      `/groups/${groupDetail.id}/members/${grace.id}`,
      { method: 'DELETE' },
    );
  });
});

describe('fetchGroupInvite', () => {
  it('asks the group for its link', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { invite } }));

    await expect(fetchGroupInvite(fetcher, groupDetail.id)).resolves.toEqual(invite);
    expect(fetcher).toHaveBeenCalledWith(`/groups/${groupDetail.id}/invite`, {
      method: 'POST',
    });
  });
});

describe('fetchPairGroup', () => {
  it('gets or creates the group shared with a friend', async () => {
    const pair = {
      ...groupDetail,
      kind: 'pair' as const,
      name: 'Grace',
      viewerRole: 'member' as const,
    };
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { group: pair } }));

    await expect(fetchPairGroup(fetcher, grace.id)).resolves.toEqual(pair);
    expect(fetcher).toHaveBeenCalledWith(`/groups/pair/${grace.id}`, { method: 'POST' });
  });
});
