import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  ada,
  fakeAuthorizedFetch,
  groupSummary,
  invite,
  response,
} from '@/test-utils/api-fakes';

import { acceptInvite, previewInvite } from './invites';

const BASE_URL = 'https://api.test';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('previewInvite', () => {
  it('reads a friend invitation from the unauthenticated endpoint', async () => {
    const preview = { kind: 'friend', inviter: ada };
    const fetchMock = jest
      .fn<typeof fetch>()
      .mockResolvedValue(response({ jsonBody: { invite: preview } }));
    globalThis.fetch = fetchMock;

    await expect(previewInvite(BASE_URL, invite.code)).resolves.toEqual(preview);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.test/invites/${invite.code}`,
      expect.objectContaining({ method: 'GET' }),
    );
    // No session is involved: the recipient may not have signed in yet.
    expect(fetchMock.mock.calls[0]![1]?.headers).not.toHaveProperty('authorization');
  });

  it('reads a group invitation, including which group it leads to', async () => {
    const preview = {
      kind: 'group',
      inviter: ada,
      group: { id: groupSummary.id, name: groupSummary.name, memberCount: 3 },
    };
    globalThis.fetch = jest
      .fn<typeof fetch>()
      .mockResolvedValue(response({ jsonBody: { invite: preview } }));

    await expect(previewInvite(BASE_URL, invite.code)).resolves.toEqual(preview);
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
      .mockResolvedValue(
        response({ jsonBody: { invite: { kind: 'friend', inviter: { id: 'nope' } } } }),
      );

    await expect(previewInvite(BASE_URL, invite.code)).rejects.toThrow();
  });
});

describe('acceptInvite', () => {
  it('returns the new friend and whether the link was already used', async () => {
    const result = { kind: 'friend', friend: ada, alreadyFriends: true };
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { result } }));

    await expect(acceptInvite(fetcher, invite.code)).resolves.toEqual(result);
    expect(fetcher).toHaveBeenCalledWith(`/invites/${invite.code}/accept`, {
      method: 'POST',
    });
  });

  it('returns the group joined, and whether they were already in it', async () => {
    const result = { kind: 'group', group: groupSummary, alreadyMember: false };
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { result } }));

    await expect(acceptInvite(fetcher, invite.code)).resolves.toEqual(result);
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
