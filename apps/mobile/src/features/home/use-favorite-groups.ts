import type { GroupSummary } from '@ardoise/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { fetchFavoriteGroups, setGroupFavorite } from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';
import { loggedRead, readStatus, type ReadStatus } from '@/lib/query/client';
import { queryKeys } from '@/lib/query/keys';
import { useInvalidation } from '@/lib/query/use-invalidation';

export type FavoriteGroupsStatus = ReadStatus;

export interface UseFavoriteGroupsResult {
  status: FavoriteGroupsStatus;
  groups: GroupSummary[];
  /**
   * Reload the section — its retry action. Resolves once the read lands,
   * either way, so pull-to-refresh can spin until it does.
   */
  refresh: () => Promise<void>;
  /** Unfavorite a group, which takes it out of this section (`docs/specs/home.md`). */
  toggleFavorite: (group: GroupSummary) => void;
  /** The one group whose star is mid-request, if any. */
  favoriteBusyId: string | null;
}

/**
 * The groups the signed-in user has starred — every kind at once, unlike the
 * group list: a sub-group and the implicit pair group behind a favorited
 * friend both belong here (`docs/specs/home.md`). Starring a group anywhere
 * else refetches it (`useInvalidation`).
 */
export function useFavoriteGroups(): UseFavoriteGroupsResult {
  const { authorizedFetch } = useAuth();
  const queryClient = useQueryClient();
  const invalidation = useInvalidation();
  const query = useQuery({
    queryKey: queryKeys.favoriteGroups,
    queryFn: () =>
      loggedRead('groups.favorites.load.failed', () => fetchFavoriteGroups(authorizedFetch)),
  });
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);

  const refresh = useCallback(
    () => queryClient.refetchQueries({ queryKey: queryKeys.favoriteGroups }),
    [queryClient],
  );

  const toggleFavorite = useCallback(
    (group: GroupSummary) => {
      const next = !group.favorite;
      setFavoriteBusyId(group.id);
      // Dropped from the list on the spot rather than left with a hollow
      // star: this section *is* the favorites, so an unfavorited group has
      // nowhere to stay. Nothing to preserve the order of either, unlike a
      // list where the row would only move (`docs/specs/favorites.md`).
      void queryClient.cancelQueries({ queryKey: queryKeys.favoriteGroups });
      queryClient.setQueryData<GroupSummary[]>(queryKeys.favoriteGroups, (groups) =>
        groups?.filter((g) => g.id !== group.id),
      );

      setGroupFavorite(authorizedFetch, group.id, next)
        .then(() => invalidation.groupsChanged())
        .catch((error: unknown) => {
          logger.warn('groups.favorite.failed', errorFields(error));
          // Put it back wherever the server still says it belongs.
          void refresh();
        })
        .finally(() => setFavoriteBusyId(null));
    },
    [authorizedFetch, invalidation, queryClient, refresh],
  );

  return {
    status: readStatus(query),
    groups: query.data ?? [],
    refresh,
    toggleFavorite,
    favoriteBusyId,
  };
}
