import type { GroupKind } from '@ardoise/shared';
import { useState, type ReactNode } from 'react';

import { useDialog } from '@/components/use-dialog';
import { useAuth } from '@/features/auth/use-auth';
import {
  isUnsettledRemoval,
  UNSETTLED_REMOVAL_TITLE,
  unsettledRemovalMessage,
} from '@/features/friends/unsettled-removal';
import { deleteGroup, removeGroupMember, updateGroup } from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';

import { groupsChanged } from './groups-changed';

/** Everything a row's own Manage/Archive/Leave/Delete actions need, and no more. */
export interface ActionableGroup {
  id: string;
  name: string;
  kind: GroupKind;
  archivedAt: string | null;
  memberCount: number;
  /** Absent for a sub-group row — its own nested sub-groups aren't counted there. */
  subgroupCount?: number;
}

export interface UseGroupRowActionsResult {
  /** The one group whose action is mid-request, if any — disables its own menu. */
  busyId: string | null;
  /** The confirmation and error dialogs — the screen renders it once. */
  dialog: ReactNode;
  archiveToggle: (group: ActionableGroup) => void;
  confirmLeave: (group: ActionableGroup) => void;
  confirmDelete: (group: ActionableGroup) => void;
}

/**
 * The archive/leave/delete actions offered from a group's own row — the "⋮"
 * menu on the Groups list, the home screen's favorites, and a group's own
 * joined sub-groups. Mirrors `GroupScreen`'s own confirmations, scoped to
 * whatever summary a row already has rather than a full `GroupDetail`: every
 * field either needs is already on `GroupSummary` or `SubgroupSummary`.
 */
export function useGroupRowActions(): UseGroupRowActionsResult {
  const { authorizedFetch, state: authState } = useAuth();
  const viewerId = authState.status === 'signedIn' ? authState.user.id : null;
  const [busyId, setBusyId] = useState<string | null>(null);
  const { dialog, confirm, inform } = useDialog();

  function run(group: ActionableGroup, what: string, action: () => Promise<unknown>) {
    setBusyId(group.id);
    action()
      .then(() => groupsChanged.notify())
      .catch((error: unknown) => {
        logger.warn(`groups.${what}.failed`, errorFields(error));
        if (isUnsettledRemoval(error)) {
          // Deleting a pair group is removing the friend it is named after.
          inform(UNSETTLED_REMOVAL_TITLE, unsettledRemovalMessage(group.name));
        } else {
          inform('That didn’t work', 'Check your connection and try again.');
        }
      })
      .finally(() => setBusyId(null));
  }

  function archiveToggle(group: ActionableGroup) {
    run(group, 'archive', () =>
      updateGroup(authorizedFetch, group.id, { archived: group.archivedAt === null }),
    );
  }

  function confirmLeave(group: ActionableGroup) {
    if (!viewerId) {
      return;
    }
    const alone = group.memberCount === 1;
    const hasSubgroups = (group.subgroupCount ?? 0) > 0;
    const warning = alone
      ? `Leave “${group.name}”? You’re the only member, so the group${hasSubgroups ? ' and every sub-group nested inside it' : ''} is deleted.`
      : `Leave “${group.name}”?${hasSubgroups ? ' This also removes you from its sub-groups.' : ''}`;

    confirm({
      title: 'Leave group',
      message: warning,
      confirmLabel: 'Leave',
      destructive: true,
      onConfirm: () =>
        run(group, 'leave', () => removeGroupMember(authorizedFetch, group.id, viewerId)),
    });
  }

  function confirmDelete(group: ActionableGroup) {
    if (group.kind === 'pair') {
      // Deleting an implicit group works like removing the friend it belongs
      // to — the server treats it exactly that way (`docs/specs/groups.md`) —
      // so the confirmation reads as a friend removal, not a group deletion.
      confirm({
        title: 'Remove friend',
        message: `Remove ${group.name} from your friends? The group you share with them, and everything in it, is deleted for you both.`,
        confirmLabel: 'Remove',
        destructive: true,
        onConfirm: () => run(group, 'delete', () => deleteGroup(authorizedFetch, group.id)),
      });
      return;
    }

    const hasSubgroups = (group.subgroupCount ?? 0) > 0;
    confirm({
      title: 'Delete group',
      message: `Delete “${group.name}” permanently? Everything in it${hasSubgroups ? ', and every sub-group nested inside it,' : ''} is lost, for everyone.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => run(group, 'delete', () => deleteGroup(authorizedFetch, group.id)),
    });
  }

  return { busyId, dialog, archiveToggle, confirmLeave, confirmDelete };
}
