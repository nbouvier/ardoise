import type { GroupSummary } from '@ardoise/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { fetchGroups, setGroupFavorite } from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';
import { loggedRead, readStatus, type ReadStatus } from '@/lib/query/client';
import { queryKeys } from '@/lib/query/keys';
import { createListOrderKeeper } from '@/lib/query/stable-order';
import { useInvalidation } from '@/lib/query/use-invalidation';

export type GroupsStatus = ReadStatus;

export interface UseGroupsResult {
  status: GroupsStatus;
  /** Groups still going on. */
  active: GroupSummary[];
  /** Groups that were archived — kept whole, just out of the way. */
  archived: GroupSummary[];
  /** Reload the list — the retry action of the error state. */
  refresh: () => void;
  /** Reload while the list stays up — a pull to refresh. */
  pullRefresh: () => void;
  /** A pull to refresh is under way. */
  refreshing: boolean;
  /** Toggle a group's favorite for the viewer (`docs/specs/favorites.md`). */
  toggleFavorite: (group: GroupSummary) => void;
  /** The one group whose favorite star is mid-request, if any. */
  favoriteBusyId: string | null;
}

/**
 * The signed-in user's groups, split into the two sections the list shows.
 * Pair groups are not here: the server leaves them out, they are reached from
 * the friend list.
 */
export function useGroups(): UseGroupsResult {
  const { authorizedFetch } = useAuth();
  const queryClient = useQueryClient();
  const invalidation = useInvalidation();
  // Held for exactly the one refetch a star tap causes: the row has already
  // moved where it belongs (the screen splits favorites from the rest) and
  // must not jump a second time when the server's answer lands
  // (`docs/specs/favorites.md`). Every other read is trusted for order —
  // this is not a standing "never reorder" switch.
  const [order] = useState(() => createListOrderKeeper<GroupSummary>((group) => group.id));
  const query = useQuery({
    queryKey: queryKeys.groupList,
    queryFn: () => loggedRead('groups.list.failed', () => fetchGroups(authorizedFetch)),
    structuralSharing: order.structuralSharing,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);

  const refetch = useCallback(
    () => queryClient.refetchQueries({ queryKey: queryKeys.groupList }),
    [queryClient],
  );

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const pullRefresh = useCallback(() => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  }, [refetch]);

  const toggleFavorite = useCallback(
    (group: GroupSummary) => {
      const next = !group.favorite;
      const flip = (favorite: boolean) =>
        queryClient.setQueryData<GroupSummary[]>(queryKeys.groupList, (groups) =>
          groups?.map((g) => (g.id === group.id ? { ...g, favorite } : g)),
        );
      setFavoriteBusyId(group.id);
      void queryClient.cancelQueries({ queryKey: queryKeys.groupList });
      flip(next);

      setGroupFavorite(authorizedFetch, group.id, next)
        .then(() => order.keepWhile(invalidation.groupsChanged))
        .catch((error: unknown) => {
          logger.warn('groups.favorite.failed', errorFields(error));
          flip(!next);
        })
        .finally(() => setFavoriteBusyId(null));
    },
    [authorizedFetch, invalidation, order, queryClient],
  );

  const { active, archived } = useMemo(() => {
    const groups = query.data ?? [];
    return {
      active: groups.filter((group) => group.archivedAt === null),
      archived: groups.filter((group) => group.archivedAt !== null),
    };
  }, [query.data]);

  return {
    status: readStatus(query),
    active,
    archived,
    refresh,
    pullRefresh,
    refreshing,
    toggleFavorite,
    favoriteBusyId,
  };
}
