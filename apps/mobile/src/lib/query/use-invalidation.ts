import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { queryKeys } from './keys';

export interface Invalidation {
  /**
   * A group was created, joined, left, renamed, archived, deleted or
   * (un)favorited, or its members changed. Also reaches the friend list — a
   * friend's star lives on the pair group — the home's latest transactions,
   * which only show groups the viewer is still in, and the statistics, whose
   * sub-groups in scope are the ones the viewer is in.
   */
  groupsChanged: () => Promise<void>;
  /**
   * A transaction was recorded, edited or deleted — or rewritten, by a
   * placeholder being removed or claimed. Every figure derived from the
   * ledger moves with it: lists, balances, the groups' and friends' own.
   */
  transactionsChanged: () => Promise<void>;
  /** A friendship was created or removed outside the friend list. */
  friendsChanged: () => Promise<void>;
}

/**
 * Say what changed, and every read showing it refetches — mounted ones now,
 * the others when they next mount. The resolved promise means the mounted
 * reads have landed. Replaces the change signals the screens used to listen
 * to one by one.
 */
export function useInvalidation(): Invalidation {
  const queryClient = useQueryClient();

  return useMemo(() => {
    const invalidate = async (...keys: (readonly unknown[])[]) => {
      await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    };
    return {
      groupsChanged: () =>
        invalidate(
          queryKeys.groups,
          queryKeys.recentTransactions,
          queryKeys.allStatistics,
          queryKeys.friends,
        ),
      transactionsChanged: () =>
        invalidate(queryKeys.ledger, queryKeys.groups, queryKeys.friends),
      friendsChanged: () => invalidate(queryKeys.friends),
    };
  }, [queryClient]);
}
