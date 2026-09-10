import type { FriendSummary } from '@splitcount/shared';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { fetchFriends, removeFriend } from '@/lib/api/friends';
import { errorFields, logger } from '@/lib/logger';

import { friendsChanged } from './friends-changed';

export type FriendsStatus = 'loading' | 'ready' | 'error';

interface FriendsState {
  status: FriendsStatus;
  friends: FriendSummary[];
}

export interface UseFriendsResult extends FriendsState {
  /** Reload the list — the retry action of the error state. */
  refresh: () => void;
  remove: (friendId: string) => Promise<void>;
}

/** The signed-in user's friend list, loaded from the server on mount. */
export function useFriends(): UseFriendsResult {
  const { authorizedFetch } = useAuth();
  const [state, setState] = useState<FriendsState>({ status: 'loading', friends: [] });
  const [reloadToken, setReloadToken] = useState(0);
  // Reload when a friendship is created outside this screen (the invitation
  // confirmation modal lives above the tabs).
  const externalVersion = useSyncExternalStore(
    friendsChanged.subscribe,
    friendsChanged.getSnapshot,
    friendsChanged.getSnapshot,
  );

  useEffect(() => {
    let active = true;

    fetchFriends(authorizedFetch)
      .then((friends) => {
        if (active) {
          setState({ status: 'ready', friends });
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        logger.warn('friends.list.failed', errorFields(error));
        setState((current) => ({ ...current, status: 'error' }));
      });

    return () => {
      active = false;
    };
  }, [authorizedFetch, reloadToken, externalVersion]);

  const refresh = useCallback(() => {
    setState((current) => ({ ...current, status: 'loading' }));
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

  return { ...state, refresh, remove };
}
