import type { GroupDetail } from '@splitcount/shared';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { useAuth } from '@/features/auth/use-auth';
import { ApiError } from '@/lib/api/errors';
import { fetchGroup } from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';
import { preserveOrder } from '@/lib/stable-order';

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
  // Whether the *next* fetch to resolve should be trusted for the
  // sub-groups' order: true for the first load of a given group and right
  // after an explicit `refresh()` — a silent background refetch (a
  // sub-group's own favorite toggled from its row here, notifying
  // `groupsChanged`) must not reorder a section the viewer is currently
  // looking at (`docs/specs/favorites.md`). Keyed off `groupId` too, so
  // navigating to a different group always starts trusted.
  const trustNextOrder = useRef(true);
  const trackedGroupId = useRef<string | null>(null);
  const subgroupOrder = useRef<string[]>([]);

  useEffect(() => {
    let active = true;
    const isNewGroup = trackedGroupId.current !== groupId;
    trackedGroupId.current = groupId;
    const trustOrder = isNewGroup || trustNextOrder.current;
    trustNextOrder.current = false;
    if (isNewGroup) {
      subgroupOrder.current = [];
    }

    fetchGroup(authorizedFetch, groupId)
      .then((loaded) => {
        if (!active) {
          return;
        }
        const subgroups = trustOrder
          ? loaded.subgroups
          : preserveOrder(subgroupOrder.current, loaded.subgroups, (subgroup) => subgroup.id);
        subgroupOrder.current = subgroups.map((subgroup) => subgroup.id);
        setGroup({ ...loaded, subgroups });
        setStatus('ready');
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
    trustNextOrder.current = true;
    setStatus('loading');
    setReloadToken((token) => token + 1);
  }, []);

  const set = useCallback((next: GroupDetail) => {
    // A direct response to the viewer's own action on *this* group (rename,
    // archive, favorite itself, add/remove a member…) — trust its order too,
    // the same as an explicit reload; it is just as fresh a server read.
    subgroupOrder.current = next.subgroups.map((subgroup) => subgroup.id);
    setGroup(next);
    setStatus('ready');
  }, []);

  return { status, group, refresh, set };
}
