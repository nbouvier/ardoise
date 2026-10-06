import type { FriendEntry } from '@ardoise/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { fetchFriends, removeFriend } from '@/lib/api/friends';
import { setGroupFavorite } from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';
import { loggedRead, readStatus, type ReadStatus } from '@/lib/query/client';
import { queryKeys } from '@/lib/query/keys';
import { createListOrderKeeper } from '@/lib/query/stable-order';
import { useInvalidation } from '@/lib/query/use-invalidation';

export type FriendsStatus = ReadStatus;

export interface UseFriendsResult {
  status: FriendsStatus;
  friends: FriendEntry[];
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

/**
 * The signed-in user's friend list. Refetched when a friendship is created
 * outside it (the invitation confirmation lives above the tabs), and when a
 * group changes: a friend's favorite lives on the implicit pair group's own
 * membership row, the one its own page's star toggles too
 * (`docs/specs/favorites.md`).
 */
export function useFriends(): UseFriendsResult {
  const { authorizedFetch } = useAuth();
  const queryClient = useQueryClient();
  const invalidation = useInvalidation();
  // A friend's own row must not jump when the refetch its own star tap
  // causes lands — see `useGroups`' own `order`.
  const [order] = useState(() => createListOrderKeeper<FriendEntry>((friend) => friend.id));
  const query = useQuery({
    queryKey: queryKeys.friends,
    queryFn: () => loggedRead('friends.list.failed', () => fetchFriends(authorizedFetch)),
    structuralSharing: order.structuralSharing,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [favoriteBusyId, setFavoriteBusyId] = useState<string | null>(null);

  const refetch = useCallback(
    () => queryClient.refetchQueries({ queryKey: queryKeys.friends }),
    [queryClient],
  );

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const pullRefresh = useCallback(() => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  }, [refetch]);

  const remove = useCallback(
    async (friendId: string) => {
      await removeFriend(authorizedFetch, friendId);
      queryClient.setQueryData<FriendEntry[]>(queryKeys.friends, (friends) =>
        friends?.filter((friend) => friend.id !== friendId),
      );
    },
    [authorizedFetch, queryClient],
  );

  const toggleFavorite = useCallback(
    (friend: FriendEntry) => {
      const next = !friend.favorite;
      const flip = (favorite: boolean) =>
        queryClient.setQueryData<FriendEntry[]>(queryKeys.friends, (friends) =>
          friends?.map((f) => (f.id === friend.id ? { ...f, favorite } : f)),
        );
      setFavoriteBusyId(friend.id);
      void queryClient.cancelQueries({ queryKey: queryKeys.friends });
      flip(next);

      setGroupFavorite(authorizedFetch, friend.groupId, next)
        .then(() => order.keepWhile(invalidation.groupsChanged))
        .catch((error: unknown) => {
          logger.warn('friends.favorite.failed', errorFields(error));
          flip(!next);
        })
        .finally(() => setFavoriteBusyId(null));
    },
    [authorizedFetch, invalidation, order, queryClient],
  );

  return {
    status: readStatus(query),
    friends: query.data ?? [],
    refresh,
    pullRefresh,
    refreshing,
    remove,
    toggleFavorite,
    favoriteBusyId,
  };
}
