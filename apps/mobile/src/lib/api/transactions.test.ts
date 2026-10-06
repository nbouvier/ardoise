import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { ada, balances, fakeAuthorizedFetch, response, transaction } from '@/test-utils/api-fakes';

import {
  createTransaction,
  deleteTransaction,
  fetchBalances,
  fetchRecentTransactions,
  fetchStatistics,
  fetchTransaction,
  fetchTransactions,
  updateTransaction,
} from './transactions';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchRecentTransactions', () => {
  const entry = {
    transaction,
    group: { id: transaction.groupId, name: 'Corsica 2026', ancestors: [] },
  };

  it('asks for the caller\u2019s own feed and parses it', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { transactions: [entry] } }));

    await expect(fetchRecentTransactions(fetcher)).resolves.toEqual([entry]);
    expect(fetcher).toHaveBeenCalledWith('/me/transactions?limit=10');
  });

  it('rejects a response that does not match the contract', async () => {
    const fetcher = fakeAuthorizedFetch(
      response({ jsonBody: { transactions: [{ transaction }] } }),
    );

    await expect(fetchRecentTransactions(fetcher)).rejects.toThrow();
  });
});

describe('fetchTransactions', () => {
  it('asks for the first page and parses it', async () => {
    const fetcher = fakeAuthorizedFetch(
      response({ jsonBody: { transactions: [transaction], nextCursor: 'next-page' } }),
    );

    await expect(fetchTransactions(fetcher, transaction.groupId)).resolves.toEqual({
      transactions: [transaction],
      nextCursor: 'next-page',
    });
    expect(fetcher).toHaveBeenCalledWith(`/groups/${transaction.groupId}/transactions`);
  });

  it('asks for the page after a cursor', async () => {
    const fetcher = fakeAuthorizedFetch(
      response({ jsonBody: { transactions: [], nextCursor: null } }),
    );

    await fetchTransactions(fetcher, transaction.groupId, 'abc_-12');
    expect(fetcher).toHaveBeenCalledWith(
      `/groups/${transaction.groupId}/transactions?cursor=abc_-12`,
    );
  });
});

describe('fetchStatistics', () => {
  const breakdown = {
    totalCents: 900,
    slices: [{ category: 'groceries', amountCents: 900, percent: 100 }],
    excludedSubgroupCount: 1,
  };

  it('asks for everyone and every branch by leaving both out', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: breakdown }));

    await expect(
      fetchStatistics(fetcher, 'g1', {
        type: 'spending',
        participantIds: null,
        subgroupIds: null,
        from: null,
        to: null,
      }),
    ).resolves.toEqual(breakdown);
    expect(fetcher).toHaveBeenCalledWith('/groups/g1/statistics?type=spending');
  });

  it('spells out a selection, an empty one included, and the date bounds', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: breakdown }));

    await fetchStatistics(fetcher, 'g1', {
      type: 'income',
      participantIds: ['u1', 'u2'],
      subgroupIds: [],
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(fetcher).toHaveBeenCalledWith(
      '/groups/g1/statistics?type=income&participantIds=u1%2Cu2&subgroupIds=&from=2026-09-01&to=2026-09-30',
    );
  });
});

describe('fetchTransaction', () => {
  it('parses one transaction', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { transaction } }));

    await expect(fetchTransaction(fetcher, transaction.groupId, transaction.id)).resolves.toEqual(
      transaction,
    );
    expect(fetcher).toHaveBeenCalledWith(
      `/groups/${transaction.groupId}/transactions/${transaction.id}`,
    );
  });

  it('surfaces a not-found refusal', async () => {
    const fetcher = fakeAuthorizedFetch(
      response({ ok: false, status: 404, jsonBody: { error: 'transaction_not_found' } }),
    );

    await expect(
      fetchTransaction(fetcher, transaction.groupId, transaction.id),
    ).rejects.toMatchObject({ status: 404, code: 'transaction_not_found' });
  });
});

describe('createTransaction', () => {
  it('sends the request as given', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { transaction }, status: 201 }));
    const body = {
      kind: 'expense' as const,
      title: 'Groceries',
      amount: 4250,
      occurredOn: '2026-09-11',
      payerId: ada.id,
      split: { mode: 'shares' as const, participants: [{ userId: ada.id, weight: 1 }] },
    };

    await expect(createTransaction(fetcher, transaction.groupId, body)).resolves.toEqual(
      transaction,
    );
    expect(fetcher).toHaveBeenCalledWith(`/groups/${transaction.groupId}/transactions`, {
      method: 'POST',
      body,
    });
  });

  it('surfaces an invalid split refusal', async () => {
    const fetcher = fakeAuthorizedFetch(
      response({ ok: false, status: 400, jsonBody: { error: 'invalid_split' } }),
    );

    await expect(
      createTransaction(fetcher, transaction.groupId, {
        kind: 'transfer',
        title: 'Reimbursement',
        amount: 100,
        occurredOn: '2026-09-11',
        payerId: ada.id,
        toUserId: ada.id,
      }),
    ).rejects.toMatchObject({ status: 400, code: 'invalid_split' });
  });
});

describe('updateTransaction', () => {
  it('replaces the whole transaction', async () => {
    const updated = { ...transaction, title: 'Groceries (corrected)' };
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { transaction: updated } }));
    const body = {
      kind: 'expense' as const,
      title: 'Groceries (corrected)',
      amount: 4250,
      occurredOn: '2026-09-11',
      payerId: ada.id,
      split: { mode: 'shares' as const, participants: [{ userId: ada.id, weight: 1 }] },
    };

    await expect(
      updateTransaction(fetcher, transaction.groupId, transaction.id, body),
    ).resolves.toEqual(updated);
    expect(fetcher).toHaveBeenCalledWith(
      `/groups/${transaction.groupId}/transactions/${transaction.id}`,
      { method: 'PATCH', body },
    );
  });
});

describe('deleteTransaction', () => {
  it('resolves on a successful deletion', async () => {
    const fetcher = fakeAuthorizedFetch(response({ status: 204 }));

    await expect(
      deleteTransaction(fetcher, transaction.groupId, transaction.id),
    ).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith(
      `/groups/${transaction.groupId}/transactions/${transaction.id}`,
      { method: 'DELETE' },
    );
  });
});

describe('fetchBalances', () => {
  it('parses the balances', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { balances } }));

    await expect(fetchBalances(fetcher, transaction.groupId)).resolves.toEqual(balances);
    expect(fetcher).toHaveBeenCalledWith(`/groups/${transaction.groupId}/transactions/balances`);
  });
});

