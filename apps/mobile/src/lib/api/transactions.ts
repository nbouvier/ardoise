import {
  balancesResponseSchema,
  groupStatisticsResponseSchema,
  recentTransactionsResponseSchema,
  transactionResponseSchema,
  transactionsListResponseSchema,
  DEFAULT_RECENT_TRANSACTIONS,
  type Balance,
  type CreateTransactionRequest,
  type GroupStatisticsResponse,
  type RecentTransaction,
  type StatisticsType,
  type Transaction,
  type TransactionsListResponse,
  type UpdateTransactionRequest,
} from '@ardoise/shared';

import { expectNoContent, parsedJson, type AuthorizedFetch } from './client';

const transactionsPath = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/transactions`;
const transactionPath = (groupId: string, transactionId: string) =>
  `${transactionsPath(groupId)}/${encodeURIComponent(transactionId)}`;

/**
 * One page of a group's own transactions, most recent first — the server does
 * the ordering and the page size. `cursor` is the previous page's
 * `nextCursor`; omitted, the first page (`docs/specs/transactions.md`).
 */
export async function fetchTransactions(
  fetcher: AuthorizedFetch,
  groupId: string,
  cursor?: string,
): Promise<TransactionsListResponse> {
  const query = cursor ? `?${new URLSearchParams({ cursor }).toString()}` : '';
  const response = await fetcher(`${transactionsPath(groupId)}${query}`);
  return parsedJson(response, transactionsListResponseSchema);
}

export interface StatisticsFilter {
  type: StatisticsType;
  /** `null` is everyone. */
  participantIds: readonly string[] | null;
  /** Direct sub-groups whose branches count; `null` is every one. */
  subgroupIds: readonly string[] | null;
  /** Inclusive `YYYY-MM-DD` bounds; `null` is unbounded. */
  from: string | null;
  to: string | null;
}

/** One category breakdown, computed by the server (`docs/specs/group-statistics.md`). */
export async function fetchStatistics(
  fetcher: AuthorizedFetch,
  groupId: string,
  filter: StatisticsFilter,
): Promise<GroupStatisticsResponse> {
  const params = new URLSearchParams({ type: filter.type });
  if (filter.participantIds) {
    params.set('participantIds', filter.participantIds.join(','));
  }
  if (filter.subgroupIds) {
    params.set('subgroupIds', filter.subgroupIds.join(','));
  }
  if (filter.from) {
    params.set('from', filter.from);
  }
  if (filter.to) {
    params.set('to', filter.to);
  }
  const response = await fetcher(`/groups/${encodeURIComponent(groupId)}/statistics?${params.toString()}`);
  return parsedJson(response, groupStatisticsResponseSchema);
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

