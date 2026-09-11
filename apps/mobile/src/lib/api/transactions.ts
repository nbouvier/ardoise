import {
  balancesResponseSchema,
  transactionResponseSchema,
  transactionsListResponseSchema,
  type Balance,
  type CreateTransactionRequest,
  type Transaction,
  type UpdateTransactionRequest,
} from '@splitcount/shared';

import { expectNoContent, parsedJson, type AuthorizedFetch } from './client';

const transactionsPath = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/transactions`;
const transactionPath = (groupId: string, transactionId: string) =>
  `${transactionsPath(groupId)}/${encodeURIComponent(transactionId)}`;

/** A group's transactions, most recent first — the server does the ordering. */
export async function fetchTransactions(
  fetcher: AuthorizedFetch,
  groupId: string,
): Promise<Transaction[]> {
  const response = await fetcher(transactionsPath(groupId));
  return (await parsedJson(response, transactionsListResponseSchema)).transactions;
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
