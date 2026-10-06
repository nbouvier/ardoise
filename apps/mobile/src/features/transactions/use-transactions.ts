import type { Transaction, TransactionsListResponse } from '@ardoise/shared';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { fetchTransactions } from '@/lib/api/transactions';
import { loggedRead, readStatus, type ReadStatus } from '@/lib/query/client';
import { queryKeys } from '@/lib/query/keys';

export type TransactionsStatus = ReadStatus;

/** Where loading the page after the last one stands. */
export type MoreStatus = 'idle' | 'loading' | 'error';

export interface UseTransactionsResult {
  /** The first page's; a further page failing leaves it `ready`. */
  status: TransactionsStatus;
  /** Every page loaded so far, most recent first. */
  transactions: Transaction[];
  /** Whether there are older transactions than the ones loaded. */
  hasMore: boolean;
  moreStatus: MoreStatus;
  /** Ask for the next page — nothing if there is none, one is on its way, or the last attempt failed. */
  loadMore: () => void;
  /** Ask again for the next page after it failed. */
  retryMore: () => void;
  refresh: () => void;
  /** Apply a transaction the caller just recorded or edited, without a round trip. */
  upsert: (transaction: Transaction) => void;
  /** Drop a transaction the caller just deleted, without a round trip. */
  remove: (transactionId: string) => void;
}

export type TransactionPages = InfiniteData<TransactionsListResponse, string | null>;

/**
 * Most-recent-first, matching the server's own total order: by date, then by
 * recording order, then by id.
 */
function byMostRecent(a: Transaction, b: Transaction): number {
  if (a.occurredOn !== b.occurredOn) {
    return a.occurredOn < b.occurredOn ? 1 : -1;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? 1 : -1;
  }
  return a.id < b.id ? 1 : -1;
}

/**
 * `transaction` placed in the page it belongs to — the first whose last row
 * is older — or the last page once there is nothing more to load. Belonging
 * past what is loaded, it is left out: it comes with its own page.
 */
export function upsertInto(data: TransactionPages, transaction: Transaction, hasMore: boolean): TransactionPages {
  const pages = data.pages.map((page) => ({
    ...page,
    transactions: page.transactions.filter((t) => t.id !== transaction.id),
  }));
  let target = pages.findIndex((page) => {
    const last = page.transactions.at(-1);
    return last !== undefined && byMostRecent(transaction, last) < 0;
  });
  if (target === -1 && !hasMore) {
    target = pages.length - 1;
  }
  const page = pages[target];
  if (page) {
    pages[target] = { ...page, transactions: [...page.transactions, transaction].sort(byMostRecent) };
  }
  return { ...data, pages };
}

/**
 * A group's own transactions, most recent first, a page at a time
 * (`docs/specs/transactions.md`) — the server does the ordering and the page
 * size. A refetch reads every page loaded so far again.
 */
export function useTransactions(groupId: string): UseTransactionsResult {
  const { authorizedFetch } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => queryKeys.transactions(groupId), [groupId]);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      loggedRead('transactions.load.failed', () =>
        fetchTransactions(authorizedFetch, groupId, pageParam ?? undefined),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = query;

  const transactions = useMemo(
    () => query.data?.pages.flatMap((page) => page.transactions) ?? [],
    [query.data],
  );

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const retryMore = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  const refresh = useCallback(() => {
    void queryClient.refetchQueries({ queryKey });
  }, [queryKey, queryClient]);

  const upsert = useCallback(
    (transaction: Transaction) =>
      queryClient.setQueryData<TransactionPages>(queryKey, (data) =>
        data ? upsertInto(data, transaction, hasNextPage) : data,
      ),
    [queryKey, queryClient, hasNextPage],
  );

  const remove = useCallback(
    (transactionId: string) =>
      queryClient.setQueryData<TransactionPages>(queryKey, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                transactions: page.transactions.filter((t) => t.id !== transactionId),
              })),
            }
          : data,
      ),
    [queryKey, queryClient],
  );

  return {
    // A further page failing is the footer's to say: the rows above stay.
    status: isFetchNextPageError ? 'ready' : readStatus(query),
    transactions,
    hasMore: hasNextPage,
    moreStatus: isFetchingNextPage ? 'loading' : isFetchNextPageError ? 'error' : 'idle',
    loadMore,
    retryMore,
    refresh,
    upsert,
    remove,
  };
}
