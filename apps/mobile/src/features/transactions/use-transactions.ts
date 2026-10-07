import type { Transaction, TransactionsListScope } from '@ardoise/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { fetchTransactions } from '@/lib/api/transactions';
import { loggedRead, readStatus, type ReadStatus } from '@/lib/query/client';
import { queryKeys } from '@/lib/query/keys';

export type TransactionsStatus = ReadStatus;

export interface UseTransactionsResult {
  status: TransactionsStatus;
  transactions: Transaction[];
  /** Sub-groups left out of `scope: 'subtree'` because the viewer isn't in them; `0` otherwise. */
  excludedSubgroupCount: number;
  refresh: () => void;
  /** Apply a transaction the caller just recorded or edited, without a round trip. */
  upsert: (transaction: Transaction) => void;
  /** Drop a transaction the caller just deleted, without a round trip. */
  remove: (transactionId: string) => void;
}

type TransactionsPage = Awaited<ReturnType<typeof fetchTransactions>>;

/** Most-recent-first, matching the server's own ordering: by date, then by recording order. */
function byMostRecent(a: Transaction, b: Transaction): number {
  if (a.occurredOn !== b.occurredOn) {
    return a.occurredOn < b.occurredOn ? 1 : -1;
  }
  return a.createdAt < b.createdAt ? 1 : -1;
}

/**
 * A group's transactions, most recent first — the server does the ordering.
 * `scope: 'subtree'` (statistics only, `docs/specs/group-statistics.md`) adds
 * every sub-group the viewer belongs to; the default, `'group'`, is what the
 * plain transaction list always uses. `subgroupIds`, only meaningful with
 * `scope: 'subtree'`, narrows that to specific direct sub-groups' own
 * branches. Changing `scope` or `subgroupIds` keeps the last-known data
 * visible (rather than going back to `'loading'`) until the new answer lands.
 */
export function useTransactions(
  groupId: string,
  scope: TransactionsListScope = 'group',
  subgroupIds?: readonly string[],
): UseTransactionsResult {
  const { authorizedFetch } = useAuth();
  const queryClient = useQueryClient();
  // Arrays are a new reference every render; the join is what actually
  // identifies the selection.
  const subgroupIdsKey = subgroupIds?.join(',');
  const queryKey = useMemo(
    () => queryKeys.transactions(groupId, scope, subgroupIdsKey),
    [groupId, scope, subgroupIdsKey],
  );
  const query = useQuery({
    queryKey,
    queryFn: () =>
      loggedRead('transactions.load.failed', () =>
        fetchTransactions(authorizedFetch, groupId, scope, subgroupIds),
      ),
    placeholderData: keepPreviousData,
  });

  const update = useCallback(
    (change: (transactions: Transaction[]) => Transaction[]) =>
      queryClient.setQueryData<TransactionsPage>(queryKey, (page) =>
        page ? { ...page, transactions: change(page.transactions) } : page,
      ),
    [queryKey, queryClient],
  );

  const refresh = useCallback(() => {
    void queryClient.refetchQueries({ queryKey });
  }, [queryKey, queryClient]);

  const upsert = useCallback(
    (transaction: Transaction) =>
      update((current) =>
        [transaction, ...current.filter((t) => t.id !== transaction.id)].sort(byMostRecent),
      ),
    [update],
  );

  const remove = useCallback(
    (transactionId: string) => update((current) => current.filter((t) => t.id !== transactionId)),
    [update],
  );

  return {
    status: readStatus(query),
    transactions: query.data?.transactions ?? [],
    excludedSubgroupCount: query.data?.excludedSubgroupCount ?? 0,
    refresh,
    upsert,
    remove,
  };
}
