import type { RecentTransaction } from '@ardoise/shared';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { groupsChanged } from '@/features/groups/groups-changed';
import { transactionsChanged } from '@/features/transactions/transactions-changed';
import type { AuthorizedFetch } from '@/lib/api/client';
import { fetchRecentTransactions } from '@/lib/api/transactions';
import { errorFields, logger } from '@/lib/logger';

export type RecentTransactionsStatus = 'loading' | 'ready' | 'error';

interface RecentTransactionsState {
  status: RecentTransactionsStatus;
  /** Most recent first, capped and ordered by the server. */
  transactions: RecentTransaction[];
}

export interface UseRecentTransactionsResult extends RecentTransactionsState {
  /**
   * Reload the section — its retry action. Resolves once the read lands,
   * either way, so pull-to-refresh can spin until it does.
   */
  refresh: () => Promise<void>;
}

/** One read of the section, as the change it makes — see `readFavorites`. */
async function readRecent(
  fetcher: AuthorizedFetch,
): Promise<(current: RecentTransactionsState) => RecentTransactionsState> {
  try {
    const transactions = await fetchRecentTransactions(fetcher);
    return () => ({ status: 'ready', transactions });
  } catch (error: unknown) {
    logger.warn('transactions.recent.load.failed', errorFields(error));
    return (current) => ({ ...current, status: 'error' });
  }
}

/**
 * The last transactions that involve the signed-in user, across every group
 * and sub-group they belong to (`docs/specs/home.md`). The server decides
 * what involves them, in what order, and how many.
 */
export function useRecentTransactions(): UseRecentTransactionsResult {
  const { authorizedFetch } = useAuth();
  const [state, setState] = useState<RecentTransactionsState>({
    status: 'loading',
    transactions: [],
  });
  // A transaction recorded in any group at all belongs here, so this listens
  // for one anywhere — the home is never the screen it was recorded on.
  const transactionsVersion = useSyncExternalStore(
    transactionsChanged.subscribe,
    transactionsChanged.getSnapshot,
    transactionsChanged.getSnapshot,
  );
  // And leaving, joining or deleting a group changes which transactions are
  // the viewer's to see at all.
  const groupsVersion = useSyncExternalStore(
    groupsChanged.subscribe,
    groupsChanged.getSnapshot,
    groupsChanged.getSnapshot,
  );

  useEffect(() => {
    let active = true;
    void readRecent(authorizedFetch).then((apply) => {
      if (active) {
        setState(apply);
      }
    });

    return () => {
      active = false;
    };
  }, [authorizedFetch, transactionsVersion, groupsVersion]);

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, status: 'loading' }));
    setState(await readRecent(authorizedFetch));
  }, [authorizedFetch]);

  return { ...state, refresh };
}
