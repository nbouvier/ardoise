import type { GroupDetail } from '@splitcount/shared';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { ApiError } from '@/lib/api/errors';
import { fetchGroup } from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';

import { groupsChanged } from './groups-changed';

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

export function useGroup(groupId: string): UseGroupResult {
  const { authorizedFetch } = useAuth();
  const [status, setStatus] = useState<GroupStatus>('loading');
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  // Refetches whenever a sibling screen creates, joins or otherwise changes a
  // group (docs/DESIGN.md) — e.g. creating a sub-group here and then coming
  // back to this screen needs its `subgroups`/`subgroupCount` to be current.
  // Keeps the last-known data visible rather than resetting to `'loading'`,
  // matching the "don't blink" convention used for balances/transactions.
  const externalVersion = useSyncExternalStore(
    groupsChanged.subscribe,
    groupsChanged.getSnapshot,
    groupsChanged.getSnapshot,
  );

  useEffect(() => {
    let active = true;

    fetchGroup(authorizedFetch, groupId)
      .then((loaded) => {
        if (active) {
          setGroup(loaded);
          setStatus('ready');
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        logger.warn('groups.load.failed', errorFields(error));
        setStatus(error instanceof ApiError && error.status === 404 ? 'gone' : 'error');
      });

    return () => {
      active = false;
    };
  }, [authorizedFetch, groupId, reloadToken, externalVersion]);

  const refresh = useCallback(() => {
    setStatus('loading');
    setReloadToken((token) => token + 1);
  }, []);

  const set = useCallback((next: GroupDetail) => {
    setGroup(next);
    setStatus('ready');
  }, []);

  return { status, group, refresh, set };
}
