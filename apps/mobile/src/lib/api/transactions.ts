import {
  balancesResponseSchema,
  recentTransactionsResponseSchema,
  transactionResponseSchema,
  transactionsListResponseSchema,
  DEFAULT_RECENT_TRANSACTIONS,
  type Balance,
  type CreateTransactionRequest,
  type RecentTransaction,
  type Transaction,
  type TransactionsListResponse,
  type TransactionsListScope,
  type UpdateTransactionRequest,
} from '@splitcount/shared';

import { expectNoContent, parsedJson, type AuthorizedFetch } from './client';

const transactionsPath = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/transactions`;
const transactionPath = (groupId: string, transactionId: string) =>
  `${transactionsPath(groupId)}/${encodeURIComponent(transactionId)}`;

/**
 * A group's transactions, most recent first — the server does the ordering.
 * `scope: 'subtree'` adds those of every sub-group the caller belongs to
 * (`docs/specs/group-statistics.md`); the default, `'group'`, is what the
 * plain transaction list always uses. `subgroupIds`, only meaningful with
 * `scope: 'subtree'`, narrows that to specific direct sub-groups' own
 * branches; omitted, every branch counts.
 */
export async function fetchTransactions(
  fetcher: AuthorizedFetch,
  groupId: string,
  scope: TransactionsListScope = 'group',
  subgroupIds?: readonly string[],
): Promise<TransactionsListResponse> {
  const params = new URLSearchParams();
  if (scope === 'subtree') {
    params.set('scope', 'subtree');
    if (subgroupIds) {
      params.set('subgroupIds', subgroupIds.join(','));
    }
  }
  const query = params.toString();
  const response = await fetcher(`${transactionsPath(groupId)}${query ? `?${query}` : ''}`);
  return parsedJson(response, transactionsListResponseSchema);
}

/**
 * The caller's own most recent transactions across every group they belong
 * to — the home screen's latest-transactions section (`docs/specs/home.md`).
 * Only what involves them, most recent first, each with the group it happened
 * in; the server does the filtering, the ordering and the cap.
 */
export async function fetchRecentTransactions(
  fetcher: AuthorizedFetch,
  limit: number = DEFAULT_RECENT_TRANSACTIONS,
): Promise<RecentTransaction[]> {
  const response = await fetcher(`/me/transactions?limit=${limit}`);
  return (await parsedJson(response, recentTransactionsResponseSchema)).transactions;
}

export async function fetchTransaction(
  fetcher: AuthorizedFetch,
  groupId: string,
  transactionId: string,
): Promise<Transaction> {
  const response = await fetcher(transactionPath(groupId, transactionId));
  return (await parsedJson(response, transactionResponseSchema)).transaction;
}

export async function createTransaction(
  fetcher: AuthorizedFetch,
  groupId: string,
  input: CreateTransactionRequest,
): Promise<Transaction> {
  const response = await fetcher(transactionsPath(groupId), { method: 'POST', body: input });
  return (await parsedJson(response, transactionResponseSchema)).transaction;
}

/** A full replace — every field is required, mirroring the create request. */
export async function updateTransaction(
  fetcher: AuthorizedFetch,
  groupId: string,
  transactionId: string,
  input: UpdateTransactionRequest,
): Promise<Transaction> {
  const response = await fetcher(transactionPath(groupId, transactionId), {
    method: 'PATCH',
    body: input,
  });
  return (await parsedJson(response, transactionResponseSchema)).transaction;
}

export async function deleteTransaction(
  fetcher: AuthorizedFetch,
  groupId: string,
  transactionId: string,
): Promise<void> {
  await expectNoContent(await fetcher(transactionPath(groupId, transactionId), { method: 'DELETE' }));
}

/** Every member's net balance in the group. Positive: the group owes them. */
export async function fetchBalances(
  fetcher: AuthorizedFetch,
  groupId: string,
): Promise<Balance[]> {
  const response = await fetcher(`${transactionsPath(groupId)}/balances`);
  return (await parsedJson(response, balancesResponseSchema)).balances;
}

