import type { RecentTransaction } from '@ardoise/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { fetchRecentTransactions } from '@/lib/api/transactions';
import { loggedRead, readStatus, type ReadStatus } from '@/lib/query/client';
import { queryKeys } from '@/lib/query/keys';

export type RecentTransactionsStatus = ReadStatus;

export interface UseRecentTransactionsResult {
  status: RecentTransactionsStatus;
  /** Most recent first, capped and ordered by the server. */
  transactions: RecentTransaction[];
  /**
   * Reload the section — its retry action. Resolves once the read lands,
   * either way, so pull-to-refresh can spin until it does.
   */
  refresh: () => Promise<void>;
}

/**
 * The last transactions that involve the signed-in user, across every group
 * and sub-group they belong to (`docs/specs/home.md`). The server decides
 * what involves them, in what order, and how many. A transaction recorded in
 * any group, and joining or leaving one, refetches it (`useInvalidation`).
 */
export function useRecentTransactions(): UseRecentTransactionsResult {
  const { authorizedFetch } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.recentTransactions,
    queryFn: () =>
      loggedRead('transactions.recent.load.failed', () => fetchRecentTransactions(authorizedFetch)),
  });

  const refresh = useCallback(
    () => queryClient.refetchQueries({ queryKey: queryKeys.recentTransactions }),
    [queryClient],
  );

  return { status: readStatus(query), transactions: query.data ?? [], refresh };
}
