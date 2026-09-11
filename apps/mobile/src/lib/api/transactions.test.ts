import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { ada, balances, fakeAuthorizedFetch, response, transaction } from '@/test-utils/api-fakes';

import {
  createTransaction,
  deleteTransaction,
  fetchBalances,
  fetchTransaction,
  fetchTransactions,
  updateTransaction,
} from './transactions';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('fetchTransactions', () => {
  it('parses the list', async () => {
    const fetcher = fakeAuthorizedFetch(response({ jsonBody: { transactions: [transaction] } }));

    await expect(fetchTransactions(fetcher, transaction.groupId)).resolves.toEqual([transaction]);
    expect(fetcher).toHaveBeenCalledWith(`/groups/${transaction.groupId}/transactions`);
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

