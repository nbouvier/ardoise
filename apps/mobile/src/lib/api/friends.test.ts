import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { ada, fakeAuthorizedFetch, invite, response } from '@/test-utils/api-fakes';

import { fetchFriends, fetchInvite, removeFriend, rotateInvite } from './friends';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchInvite', () => {
  it('creates or reuses the caller invitation', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { invite } }));

    await expect(fetchInvite(fetcher)).resolves.toEqual(invite);
    expect(fetcher).toHaveBeenCalledWith('/friends/invite', { method: 'POST' });
  });

  it('rejects a response that does not match the contract', async () => {
    const fetcher = fakeAuthorizedFetch(
      response({ jsonBody: { invite: { code: 'too short' } } }),
    );

    await expect(fetchInvite(fetcher)).rejects.toThrow();
  });
});

describe('rotateInvite', () => {
  it('asks the server for a fresh link', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { invite } }));

    await expect(rotateInvite(fetcher)).resolves.toEqual(invite);
    expect(fetcher).toHaveBeenCalledWith('/friends/invite/rotate', { method: 'POST' });
  });
});

describe('fetchFriends', () => {
  it('parses the list', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { friends: [ada] } }));

    await expect(fetchFriends(fetcher)).resolves.toEqual([ada]);
    expect(fetcher).toHaveBeenCalledWith('/friends');
  });
});

describe('removeFriend', () => {
  it('deletes the relationship', async () => {
    const fetcher = fakeAuthorizedFetch(response({ status: 204 }));

    await expect(removeFriend(fetcher, ada.id)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(`/friends/${ada.id}`, { method: 'DELETE' });
  });

  it('raises on a failed deletion', async () => {
    const fetcher = fakeAuthorizedFetch(response({ ok: false, status: 500 }));

    await expect(removeFriend(fetcher, ada.id)).rejects.toMatchObject({ status: 500 });
  });
});
