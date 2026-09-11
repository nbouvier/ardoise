import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  acceptInvite,
  fetchFriends,
  fetchInvite,
  previewInvite,
  removeFriend,
  rotateInvite,
  type AuthorizedFetch,
} from './friends';

const BASE_URL = 'https://api.test';

const invite = {
  code: 'Zx3k9QpL2mN7vR1sT4uW8g',
  url: 'https://api.test/i/Zx3k9QpL2mN7vR1sT4uW8g',
  expiresAt: '2026-09-17T12:00:00.000Z',
};

const ada = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ada',
  picture: null,
};

function response(body: {
  ok?: boolean;
  status?: number;
  jsonBody?: unknown;
}): Response {
  return {
    ok: body.ok ?? true,
    status: body.status ?? 200,
    json: async () => body.jsonBody ?? {},
  } as Response;
}

/** Stands in for `AuthClient.authorizedFetch`, which already handles 401s. */
function fakeAuthorizedFetch(result: Response) {
  return jest.fn<AuthorizedFetch>().mockResolvedValue(result);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('previewInvite', () => {
  it('reads the inviter from the unauthenticated endpoint', async () => {
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(response({ jsonBody: { inviter: ada } }));
    globalThis.fetch = fetchMock;

    await expect(previewInvite(BASE_URL, invite.code)).resolves.toEqual({ inviter: ada });

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.test/friends/invites/${invite.code}`,
      expect.objectContaining({ method: 'GET' }),
    );
    // No session is involved: the recipient may not have signed in yet.
    expect(fetchMock.mock.calls[0]![1]?.headers).not.toHaveProperty('authorization');
  });

  it('raises ApiError with the server code for a dead link', async () => {
    globalThis.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ ok: false, status: 410, jsonBody: { error: 'invite_expired' } }),
      );

    await expect(previewInvite(BASE_URL, invite.code)).rejects.toMatchObject({
      status: 410,
      code: 'invite_expired',
    });
  });

  it('rejects a response that does not match the contract', async () => {
    globalThis.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(response({ jsonBody: { inviter: { id: 'nope' } } }));

    await expect(previewInvite(BASE_URL, invite.code)).rejects.toThrow();
  });
});

describe('fetchInvite', () => {
  it('creates or reuses the caller invitation', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { invite } }));

    await expect(fetchInvite(fetcher)).resolves.toEqual(invite);
    expect(fetcher).toHaveBeenCalledWith('/friends/invite', { method: 'POST' });
  });
});

describe('rotateInvite', () => {
  it('asks the server for a fresh link', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { invite } }));

    await expect(rotateInvite(fetcher)).resolves.toEqual(invite);
    expect(fetcher).toHaveBeenCalledWith('/friends/invite/rotate', { method: 'POST' });
  });
});

describe('acceptInvite', () => {
  it('returns the new friend and whether the link was already used', async () => {
    const fetcher = fakeAuthorizedFetch(
      response({ jsonBody: { friend: ada, alreadyFriends: true } }),
    );

    await expect(acceptInvite(fetcher, invite.code)).resolves.toEqual({
      friend: ada,
      alreadyFriends: true,
    });
    expect(fetcher).toHaveBeenCalledWith(`/friends/invites/${invite.code}/accept`, {
      method: 'POST',
    });
  });

  it('surfaces a refused self-invitation', async () => {
    const fetcher = fakeAuthorizedFetch(
      response({ ok: false, status: 409, jsonBody: { error: 'self_invite' } }),
    );

    await expect(acceptInvite(fetcher, invite.code)).rejects.toMatchObject({
      status: 409,
      code: 'self_invite',
    });
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
