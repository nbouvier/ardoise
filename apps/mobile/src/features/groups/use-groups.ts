import type { GroupSummary } from '@ardoise/shared';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { fetchGroups, setGroupFavorite } from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';
import { preserveOrder } from '@/lib/stable-order';

import { groupsChanged } from './groups-changed';

export type GroupsStatus = 'loading' | 'ready' | 'error';

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
  const [state, setState] = useState<{ status: GroupsStatus; groups: GroupSummary[] }>({
    status: 'loading',
    groups: [],
  });
  const [reloadToken, setReloadToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);
  const externalVersion = useSyncExternalStore(
    groupsChanged.subscribe,
    groupsChanged.getSnapshot,
    groupsChanged.getSnapshot,
  );
  // Whether the *next* fetch to resolve should be trusted for row order.
  // Default true — a background refetch triggered by something else (another
  // screen archiving a group, an invite accepted) is free to bring the
  // pinned order into view, the same "don't blink" eventual consistency
  // every other silent refetch in this app already has. `toggleFavorite`
  // below sets this `false` for exactly the one refetch *it* causes: a
  // group's own row jumping the instant its own star is tapped reads as
  // disorienting mid-scroll (`docs/specs/favorites.md`) — every fetch after
  // that one goes back to trusting the server, this is not a standing
  // "never reorder" switch. The Groups tab stays mounted across tab
  // switches (native tabs), so there is no remount to reset it otherwise.
  const trustNextOrder = useRef(true);
  const displayedOrder = useRef<string[]>([]);

  useEffect(() => {
    let active = true;
    const trustOrder = trustNextOrder.current;
    trustNextOrder.current = true;

    fetchGroups(authorizedFetch)
      .then((groups) => {
        if (!active) {
          return;
        }
        const ordered = trustOrder
          ? groups
          : preserveOrder(displayedOrder.current, groups, (group) => group.id);
        displayedOrder.current = ordered.map((group) => group.id);
        setState({ status: 'ready', groups: ordered });
        setRefreshing(false);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        logger.warn('groups.list.failed', errorFields(error));
        setState((current) => ({ ...current, status: 'error' }));
        setRefreshing(false);
      });

    return () => {
      active = false;
    };
  }, [authorizedFetch, reloadToken, externalVersion]);

  const refresh = useCallback(() => {
    trustNextOrder.current = true;
    setState((current) => ({ ...current, status: 'loading' }));
    setReloadToken((token) => token + 1);
  }, []);

  const pullRefresh = useCallback(() => {
    trustNextOrder.current = true;
    setRefreshing(true);
    setReloadToken((token) => token + 1);
  }, []);

  const toggleFavorite = useCallback(
    (group: GroupSummary) => {
      const next = !group.favorite;
      setFavoriteBusyId(group.id);
      // Suppress reordering on the one refetch this toggle itself is about
      // to trigger below (`trustNextOrder` above) — flip the star in place
      // instead, without moving the row.
      trustNextOrder.current = false;
      setState((current) => ({
        ...current,
        groups: current.groups.map((g) => (g.id === group.id ? { ...g, favorite: next } : g)),
      }));

      setGroupFavorite(authorizedFetch, group.id, next)
        .then(() => groupsChanged.notify())
        .catch((error: unknown) => {
          logger.warn('groups.favorite.failed', errorFields(error));
          setState((current) => ({
            ...current,
            groups: current.groups.map((g) => (g.id === group.id ? { ...g, favorite: !next } : g)),
          }));
        })
        .finally(() => setFavoriteBusyId(null));
    },
    [authorizedFetch],
  );

  const { active, archived } = useMemo(
    () => ({
      active: state.groups.filter((group) => group.archivedAt === null),
      archived: state.groups.filter((group) => group.archivedAt !== null),
    }),
    [state.groups],
  );

  return {
    status: state.status,
    active,
    archived,
    refresh,
    pullRefresh,
    refreshing,
    toggleFavorite,
    favoriteBusyId,
  };
}
