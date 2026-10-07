import type { GroupDetail } from '@ardoise/shared';
import { replaceEqualDeep, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { ApiError } from '@/lib/api/errors';
import { fetchGroup } from '@/lib/api/groups';
import { loggedRead, readStatus } from '@/lib/query/client';
import { queryKeys } from '@/lib/query/keys';
import { preserveOrder } from '@/lib/stable-order';

/**
 * `gone` is the group answering `404`: it was deleted, or the viewer was
 * removed from it while looking at it. Either way there is nothing to show and
 * retrying will not help.
 */
export type GroupStatus = 'loading' | 'ready' | 'gone' | 'error';

export interface UseGroupResult {
  status: GroupStatus;
  group: GroupDetail | null;
  refresh: () => void;
  /** Apply a group the caller just changed, without a round trip. */
  set: (group: GroupDetail) => void;
}

/** Groups handed to `set`: the viewer's own change, whose order is trusted. */
const ownChanges = new WeakSet<GroupDetail>();

/**
 * Keeps the sub-groups in the order already shown across a silent refetch —
 * a sub-group's own star toggled from its row here must not reorder a
 * section the viewer is looking at (`docs/specs/favorites.md`). A first load,
 * an explicit `refresh()` (which starts over) and the viewer's own change to
 * this group (`set`) are trusted instead.
 */
function keepingSubgroupOrder(previous: unknown, next: unknown): unknown {
  const fresh = next as GroupDetail;
  const shown = previous as GroupDetail | undefined;
  if (!shown || ownChanges.has(fresh)) {
    return replaceEqualDeep(previous, fresh);
  }
  const subgroups = preserveOrder(
    shown.subgroups.map((subgroup) => subgroup.id),
    fresh.subgroups,
    (subgroup) => subgroup.id,
  );
  return replaceEqualDeep(previous, { ...fresh, subgroups });
}

export function useGroup(groupId: string): UseGroupResult {
  const { authorizedFetch } = useAuth();
  const queryClient = useQueryClient();
  // Refetched whenever something changes a group (`useInvalidation`) — e.g.
  // creating a sub-group here and coming back needs `subgroups` current —
  // keeping the last-known data visible meanwhile.
  const query = useQuery({
    queryKey: queryKeys.group(groupId),
    queryFn: () => loggedRead('groups.load.failed', () => fetchGroup(authorizedFetch, groupId)),
    structuralSharing: keepingSubgroupOrder,
  });

  const refresh = useCallback(() => {
    void queryClient.resetQueries({ queryKey: queryKeys.group(groupId) });
  }, [groupId, queryClient]);

  const set = useCallback(
    (next: GroupDetail) => {
      ownChanges.add(next);
      queryClient.setQueryData(queryKeys.group(groupId), next);
    },
    [groupId, queryClient],
  );

  const status: GroupStatus =
    query.isError &&
    !query.isFetching &&
    query.error instanceof ApiError &&
    query.error.status === 404
      ? 'gone'
      : readStatus(query);

  return { status, group: query.data ?? null, refresh, set };
}
