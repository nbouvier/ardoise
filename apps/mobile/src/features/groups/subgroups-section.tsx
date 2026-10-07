import type { SubgroupSummary } from '@ardoise/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { FavoriteStar } from '@/components/favorite-star';
import { MedallionBadge } from '@/components/medallion-badge';
import { TextAction } from '@/components/text-action';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { balanceTone, groupBalanceLabel } from '@/features/transactions/balance-display';

import { GroupActionsMenu } from './group-actions-menu';
import { SectionHeader } from './section-header';

export interface SubgroupsSectionProps {
  subgroups: readonly SubgroupSummary[];
  readOnly: boolean;
  busy: boolean;
  /** The one sub-group whose favorite star is mid-request, if any. */
  favoriteBusyId: string | null;
  /** The one sub-group whose "⋮" action is mid-request, if any. */
  actionsBusyId: string | null;
  onOpen: (groupId: string) => void;
  onJoin: (subgroup: SubgroupSummary) => void;
  onCreate: () => void;
  onToggleFavorite: (subgroup: SubgroupSummary) => void;
  onManage: (groupId: string) => void;
  onArchiveToggle: (subgroup: SubgroupSummary) => void;
  onLeave: (subgroup: SubgroupSummary) => void;
  onDelete: (subgroup: SubgroupSummary) => void;
}

/**
 * A group's direct sub-groups, above the transaction list. Ones the viewer
 * has already joined are always shown; ones they have not are hidden by
 * default behind a toggle, mirroring the group list's archived-groups
 * pattern (`docs/specs/groups.md`).
 */
export function SubgroupsSection({
  subgroups,
  readOnly,
  busy,
  favoriteBusyId,
  actionsBusyId,
  onOpen,
  onJoin,
  onCreate,
  onToggleFavorite,
  onManage,
  onArchiveToggle,
  onLeave,
  onDelete,
}: SubgroupsSectionProps) {
  const [showUnjoined, setShowUnjoined] = useState(false);
  const joined = subgroups.filter((subgroup) => subgroup.viewerIsMember);
  const unjoined = subgroups.filter((subgroup) => !subgroup.viewerIsMember);

  if (subgroups.length === 0 && readOnly) {
    return null;
  }

  return (
    <View style={styles.section}>
      <SectionHeader
        title="Sub-groups"
        action={
          readOnly ? null : <TextAction label="+ Create" onPress={onCreate} disabled={busy} />
        }
      />

      {joined.map((subgroup) => (
        <SubgroupRow
          key={subgroup.id}
          subgroup={subgroup}
          favoriteBusy={favoriteBusyId === subgroup.id}
          actionsBusy={actionsBusyId === subgroup.id}
          onPress={() => onOpen(subgroup.id)}
          onToggleFavorite={() => onToggleFavorite(subgroup)}
          onManage={() => onManage(subgroup.id)}
          onArchiveToggle={() => onArchiveToggle(subgroup)}
          onLeave={() => onLeave(subgroup)}
          onDelete={() => onDelete(subgroup)}
        />
      ))}

      {unjoined.length > 0 ? (
        <>
          <TextAction
            label={
              showUnjoined
                ? 'Hide sub-groups I’m not in'
                : `Show sub-groups I’m not in (${unjoined.length})`
            }
            onPress={() => setShowUnjoined((shown) => !shown)}
            style={styles.toggle}
          />
          {showUnjoined
            ? unjoined.map((subgroup) => (
                <SubgroupRow
                  key={subgroup.id}
                  subgroup={subgroup}
                  muted
                  onPress={() => onJoin(subgroup)}
                />
              ))
            : null}
        </>
      ) : null}

      {joined.length === 0 && unjoined.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No sub-groups yet.
        </ThemedText>
      ) : null}
    </View>
  );
}

function SubgroupRow({
  subgroup,
  muted = false,
  favoriteBusy = false,
  actionsBusy = false,
  onPress,
  onToggleFavorite,
  onManage,
  onArchiveToggle,
  onLeave,
  onDelete,
}: {
  subgroup: SubgroupSummary;
  muted?: boolean;
  favoriteBusy?: boolean;
  actionsBusy?: boolean;
  onPress: () => void;
  /** Absent for a sub-group the viewer has not joined — nothing to favorite there. */
  onToggleFavorite?: () => void;
  /** Absent for a sub-group the viewer has not joined — nothing to manage there. */
  onManage?: () => void;
  onArchiveToggle?: () => void;
  onLeave?: () => void;
  onDelete?: () => void;
}) {
  const members = subgroup.memberCount === 1 ? '1 member' : `${subgroup.memberCount} members`;

  return (
    <Card muted={muted}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={subgroup.name}
          onPress={onPress}
          style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
          <MedallionBadge seed={subgroup.id} content="↳" size={36} />
          <View style={styles.rowText}>
            <ThemedText numberOfLines={1}>{subgroup.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {muted ? `${members} · not joined` : members}
            </ThemedText>
            {/* Not joined means none of the viewer's transactions can be in this
                sub-tree, so the balance is always exactly 0 — not worth a line. */}
            {muted ? null : (
              <ThemedText type="smallBold" themeColor={balanceTone(subgroup.viewerBalanceCents)}>
                {groupBalanceLabel(subgroup.viewerBalanceCents)}
              </ThemedText>
            )}
          </View>
        </Pressable>
        {onToggleFavorite ? (
          <FavoriteStar
            favorite={subgroup.favorite}
            label={subgroup.name}
            disabled={favoriteBusy}
            onToggle={onToggleFavorite}
          />
        ) : null}
        {onManage && onArchiveToggle && onLeave && onDelete ? (
          <GroupActionsMenu
            name={subgroup.name}
            kind="standard"
            viewerRole={subgroup.viewerRole}
            memberCount={subgroup.memberCount}
            archived={subgroup.archivedAt !== null}
            busy={actionsBusy}
            onManage={onManage}
            onArchiveToggle={onArchiveToggle}
            onLeave={onLeave}
            onDelete={onDelete}
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    // The star aligns with the name line specifically, not the row's full
    // height — the row also carries a member count and balance beneath it.
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.6,
  },
  toggle: {
    alignSelf: 'flex-start',
    marginVertical: 0,
  },
});
