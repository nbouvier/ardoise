import type { GroupSummary } from '@ardoise/shared';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { groupsChanged } from '@/features/groups/groups-changed';
import type { AuthorizedFetch } from '@/lib/api/client';
import { fetchFavoriteGroups, setGroupFavorite } from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';

export type FavoriteGroupsStatus = 'loading' | 'ready' | 'error';

interface FavoriteGroupsState {
  status: FavoriteGroupsStatus;
  groups: GroupSummary[];
}

export interface UseFavoriteGroupsResult extends FavoriteGroupsState {
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
 * One read of the section, as the change it makes to the state — so the
 * mount-and-refetch effect and `refresh` share the read itself rather than
 * two copies of it. A failure keeps whatever is already on screen.
 */
async function readFavorites(
  fetcher: AuthorizedFetch,
): Promise<(current: FavoriteGroupsState) => FavoriteGroupsState> {
  try {
    const groups = await fetchFavoriteGroups(fetcher);
    return () => ({ status: 'ready', groups });
  } catch (error: unknown) {
    logger.warn('groups.favorites.load.failed', errorFields(error));
    return (current) => ({ ...current, status: 'error' });
  }
}

/**
 * The groups the signed-in user has starred — every kind at once, unlike the
 * group list: a sub-group and the implicit pair group behind a favorited
 * friend both belong here (`docs/specs/home.md`).
 */
export function useFavoriteGroups(): UseFavoriteGroupsResult {
  const { authorizedFetch } = useAuth();
  const [state, setState] = useState<FavoriteGroupsState>({ status: 'loading', groups: [] });
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);
  // Starring a group anywhere else — its own page, the group list, a friend's
  // row — changes what belongs in this section.
  const groupsVersion = useSyncExternalStore(
    groupsChanged.subscribe,
    groupsChanged.getSnapshot,
    groupsChanged.getSnapshot,
  );

  useEffect(() => {
    let active = true;
    // Deliberately without flipping to "loading": a refetch caused by
    // something else keeps the current rows visible until the new ones land.
    void readFavorites(authorizedFetch).then((apply) => {
      if (active) {
        setState(apply);
      }
    });

    return () => {
      active = false;
    };
  }, [authorizedFetch, groupsVersion]);

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, status: 'loading' }));
    setState(await readFavorites(authorizedFetch));
  }, [authorizedFetch]);

  const toggleFavorite = useCallback(
    (group: GroupSummary) => {
      const next = !group.favorite;
      setFavoriteBusyId(group.id);
      // Dropped from the list on the spot rather than left with a hollow
      // star: this section *is* the favorites, so an unfavorited group has
      // nowhere to stay. Nothing to preserve the order of either, unlike a
      // list where the row would only move (`docs/specs/favorites.md`).
      setState((current) => ({
        ...current,
        groups: current.groups.filter((g) => g.id !== group.id),
      }));

      setGroupFavorite(authorizedFetch, group.id, next)
        .then(() => groupsChanged.notify())
        .catch(async (error: unknown) => {
          logger.warn('groups.favorite.failed', errorFields(error));
          // Put it back wherever the server still says it belongs.
          setState(await readFavorites(authorizedFetch));
        })
        .finally(() => setFavoriteBusyId(null));
    },
    [authorizedFetch],
  );

  return { ...state, refresh, toggleFavorite, favoriteBusyId };
}
