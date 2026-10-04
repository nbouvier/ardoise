import type { FriendEntry } from '@ardoise/shared';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { groupsChanged } from '@/features/groups/groups-changed';
import { fetchFriends, removeFriend } from '@/lib/api/friends';
import { setGroupFavorite } from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';
import { preserveOrder } from '@/lib/stable-order';

import { friendsChanged } from './friends-changed';

export type FriendsStatus = 'loading' | 'ready' | 'error';

interface FriendsState {
  status: FriendsStatus;
  friends: FriendEntry[];
}

export interface UseFriendsResult extends FriendsState {
  /** Reload the list — the retry action of the error state. */
  refresh: () => void;
  /** Reload while the list stays up — a pull to refresh. */
  pullRefresh: () => void;
  /** A pull to refresh is under way. */
  refreshing: boolean;
  remove: (friendId: string) => Promise<void>;
  /** Toggle a friend's favorite for the viewer (`docs/specs/favorites.md`). */
  toggleFavorite: (friend: FriendEntry) => void;
  /** The one friend whose favorite star is mid-request, if any. */
  favoriteBusyId: string | null;
}

/** The signed-in user's friend list, loaded from the server on mount. */
export function useFriends(): UseFriendsResult {
  const { authorizedFetch } = useAuth();
  const [state, setState] = useState<FriendsState>({ status: 'loading', friends: [] });
  const [reloadToken, setReloadToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);
  // Reload when a friendship is created outside this screen (the invitation
  // confirmation modal lives above the tabs).
  const friendsVersion = useSyncExternalStore(
    friendsChanged.subscribe,
    friendsChanged.getSnapshot,
    friendsChanged.getSnapshot,
  );
  // A friend's favorite lives on the implicit pair group's own membership
  // row, the same one its own page's header star toggles — a change there
  // must reach this list too (`docs/specs/favorites.md`).
  const groupsVersion = useSyncExternalStore(
    groupsChanged.subscribe,
    groupsChanged.getSnapshot,
    groupsChanged.getSnapshot,
  );
  // Whether the *next* fetch to resolve should be trusted for row order.
  // Default true — a background refetch triggered by something else is free
  // to bring the pinned order into view. `toggleFavorite` below sets this
  // `false` for exactly the one refetch *it* causes, so a friend's own row
  // does not jump the instant its own star is tapped — see
  // `useGroups.toggleFavorite` for the full reasoning; the Friends tab stays
  // mounted across tab switches the same way.
  const trustNextOrder = useRef(true);
  const displayedOrder = useRef<string[]>([]);

  useEffect(() => {
    let active = true;
    const trustOrder = trustNextOrder.current;
    trustNextOrder.current = true;

    fetchFriends(authorizedFetch)
      .then((friends) => {
        if (!active) {
          return;
        }
        const ordered = trustOrder
          ? friends
          : preserveOrder(displayedOrder.current, friends, (friend) => friend.id);
        displayedOrder.current = ordered.map((friend) => friend.id);
        setState({ status: 'ready', friends: ordered });
        setRefreshing(false);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        logger.warn('friends.list.failed', errorFields(error));
        setState((current) => ({ ...current, status: 'error' }));
        setRefreshing(false);
      });

    return () => {
      active = false;
    };
  }, [authorizedFetch, reloadToken, friendsVersion, groupsVersion]);

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

  const remove = useCallback(
    async (friendId: string) => {
      await removeFriend(authorizedFetch, friendId);
      setState((current) => ({
        ...current,
        friends: current.friends.filter((friend) => friend.id !== friendId),
      }));
    },
    [authorizedFetch],
  );

  const toggleFavorite = useCallback(
    (friend: FriendEntry) => {
      const next = !friend.favorite;
      setFavoriteBusyId(friend.id);
      // Suppress reordering on the one refetch this toggle itself is about
      // to trigger below (`trustNextOrder` above) — flip the star in place
      // instead, without moving the row.
      trustNextOrder.current = false;
      setState((current) => ({
        ...current,
        friends: current.friends.map((f) => (f.id === friend.id ? { ...f, favorite: next } : f)),
      }));

      setGroupFavorite(authorizedFetch, friend.groupId, next)
        .then(() => groupsChanged.notify())
        .catch((error: unknown) => {
          logger.warn('friends.favorite.failed', errorFields(error));
          setState((current) => ({
            ...current,
            friends: current.friends.map((f) =>
              f.id === friend.id ? { ...f, favorite: !next } : f,
            ),
          }));
        })
        .finally(() => setFavoriteBusyId(null));
    },
    [authorizedFetch],
  );

  return { ...state, refresh, pullRefresh, refreshing, remove, toggleFavorite, favoriteBusyId };
}
