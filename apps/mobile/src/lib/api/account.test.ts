import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { fakeAuthorizedFetch, response } from '@/test-utils/api-fakes';

import { deleteOwnAccount, fetchDeletionPreview } from './account';

afterEach(() => {
  jest.restoreAllMocks();
});

const preview = {
  friendCount: 1,
  balances: [
    {
      groupId: '33333333-3333-4333-8333-333333333333',
      kind: 'standard',
      name: 'Flat',
      balanceCents: 600,
    },
  ],
};

describe('fetchDeletionPreview', () => {
  it('reads what deleting the account would lose', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: preview }));

    await expect(fetchDeletionPreview(fetcher)).resolves.toEqual(preview);
    expect(fetcher).toHaveBeenCalledWith('/me/deletion-preview');
  });

  it('rejects a response that does not match the contract', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { friendCount: -1, balances: [] } }));

    await expect(fetchDeletionPreview(fetcher)).rejects.toThrow();
  });
});

describe('deleteOwnAccount', () => {
  it('deletes the caller itself, naming no id', async () => {
    const fetcher = fakeAuthorizedFetch(response({ status: 204 }));

    await deleteOwnAccount(fetcher);

    expect(fetcher).toHaveBeenCalledWith('/me', { method: 'DELETE' });
  });

  it('fails on an error status', async () => {
    const fetcher = fakeAuthorizedFetch(
      response({ ok: false, status: 500, jsonBody: { error: 'internal_error' } }),
    );

    await expect(deleteOwnAccount(fetcher)).rejects.toThrow();
  });
});
