import type { GroupKind, GroupRole } from '@ardoise/shared';

import { IconMenuButton, type IconMenuOption } from '@/components/icon-menu-button';

export interface GroupActionsMenuProps {
  name: string;
  kind: GroupKind;
  /** `null` when the viewer hasn't joined — never actually rendered then. */
  viewerRole: GroupRole | null;
  memberCount: number;
  archived: boolean;
  busy?: boolean;
  onManage: () => void;
  onArchiveToggle: () => void;
  onLeave: () => void;
  onDelete: () => void;
}

/**
 * A group's own row-level "⋮" menu: Manage always, plus whatever the viewer
 * is actually allowed to do here — mirrors the group page's own Details
 * sheet exactly, so a row's own menu never offers something opening the
 * group would refuse. A pair group only ever offers Manage and Delete: it
 * has no owner, no archived state, and leaving one independently of the
 * friendship isn't a thing — its Delete reads as "Remove friend" because
 * that is exactly what it does (`docs/specs/groups.md`).
 */
export function GroupActionsMenu({
  name,
  kind,
  viewerRole,
  memberCount,
  archived,
  busy = false,
  onManage,
  onArchiveToggle,
  onLeave,
  onDelete,
}: GroupActionsMenuProps) {
  const pair = kind === 'pair';
  const isOwner = viewerRole === 'owner';
  const alone = memberCount === 1;

  const options: IconMenuOption[] = [{ icon: 'manage', label: 'Manage', onPress: onManage }];

  if (pair) {
    options.push({
      icon: 'trash',
      label: 'Remove friend',
      destructive: true,
      onPress: onDelete,
    });
  } else {
    options.push({
      icon: 'archive',
      label: archived ? 'Reopen group' : 'Archive group',
      onPress: onArchiveToggle,
    });
    if (!isOwner || alone) {
      options.push({ icon: 'leave', label: 'Leave group', onPress: onLeave });
    }
    if (isOwner) {
      options.push({ icon: 'trash', label: 'Delete group', destructive: true, onPress: onDelete });
    }
  }

  return (
    <IconMenuButton accessibilityLabel={`Actions for ${name}`} options={options} disabled={busy} />
  );
}
