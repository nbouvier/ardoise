import type { CategoryBreakdown } from '@ardoise/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { fetchStatistics, type StatisticsFilter } from '@/lib/api/transactions';
import { loggedRead, readStatus, type ReadStatus } from '@/lib/query/client';
import { queryKeys } from '@/lib/query/keys';

export interface UseGroupStatisticsResult {
  status: ReadStatus;
  breakdown: CategoryBreakdown;
  /** Sub-groups in the selected branches left out because the viewer isn't in them. */
  excludedSubgroupCount: number;
  refresh: () => void;
}

const empty: CategoryBreakdown = { totalCents: 0, slices: [] };

/**
 * One category breakdown of a group, computed by the server
 * (`docs/specs/group-statistics.md`). Changing the filter keeps the last
 * breakdown on screen, rather than going back to `'loading'`, until the new
 * one lands.
 */
export function useGroupStatistics(
  groupId: string,
  filter: StatisticsFilter,
): UseGroupStatisticsResult {
  const { authorizedFetch } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.statistics(groupId, filter);
  const query = useQuery({
    queryKey,
    queryFn: () =>
      loggedRead('statistics.load.failed', () => fetchStatistics(authorizedFetch, groupId, filter)),
    placeholderData: keepPreviousData,
  });

  const refresh = useCallback(() => {
    void queryClient.refetchQueries({ queryKey: queryKeys.statistics(groupId, filter) });
  }, [queryClient, groupId, filter]);

  const breakdown = useMemo(
    () =>
      query.data ? { totalCents: query.data.totalCents, slices: query.data.slices } : empty,
    [query.data],
  );

  return {
    status: readStatus(query),
    breakdown,
    excludedSubgroupCount: query.data?.excludedSubgroupCount ?? 0,
    refresh,
  };
}
