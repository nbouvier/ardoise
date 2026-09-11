import type { GroupSummary } from '@splitcount/shared';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { fetchGroups } from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';

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
  const externalVersion = useSyncExternalStore(
    groupsChanged.subscribe,
    groupsChanged.getSnapshot,
    groupsChanged.getSnapshot,
  );

  useEffect(() => {
    let active = true;

    fetchGroups(authorizedFetch)
      .then((groups) => {
        if (active) {
          setState({ status: 'ready', groups });
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        logger.warn('groups.list.failed', errorFields(error));
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

  const { active, archived } = useMemo(
    () => ({
      active: state.groups.filter((group) => group.archivedAt === null),
      archived: state.groups.filter((group) => group.archivedAt !== null),
    }),
    [state.groups],
  );

  return { status: state.status, active, archived, refresh };
}
