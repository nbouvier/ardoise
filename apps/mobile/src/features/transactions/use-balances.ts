import type { Balance } from '@ardoise/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { fetchBalances } from '@/lib/api/transactions';
import { loggedRead, readStatus, type ReadStatus } from '@/lib/query/client';
import { queryKeys } from '@/lib/query/keys';

export type BalancesStatus = ReadStatus;

export interface UseBalancesResult {
  status: BalancesStatus;
  balances: Balance[];
  refresh: () => void;
}

/** Every current member's net balance in the group. Positive: owed to them. */
export function useBalances(groupId: string): UseBalancesResult {
  const { authorizedFetch } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.balances(groupId),
    queryFn: () =>
      loggedRead('balances.load.failed', () => fetchBalances(authorizedFetch, groupId)),
  });

  const refresh = useCallback(() => {
    void queryClient.refetchQueries({ queryKey: queryKeys.balances(groupId) });
  }, [groupId, queryClient]);

  return { status: readStatus(query), balances: query.data ?? [], refresh };
}
