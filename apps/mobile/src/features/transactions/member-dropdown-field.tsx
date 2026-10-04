import type { FriendSummary } from '@ardoise/shared';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { DropdownMenu } from '@/components/dropdown-menu';
import { Icon } from '@/components/icon';
import { MeTag } from '@/components/me-tag';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface MemberDropdownFieldProps {
  /** What this field picks — "Who paid", "Who received it", "To"… */
  accessibilityLabel: string;
  members: FriendSummary[];
  selectedId: string | null;
  onSelect: (userId: string) => void;
  /** The signed-in member — marked "Me" and pinned to the top of the list. */
  viewerId: string | null;
  /** A member to leave out of the list — typically the payer, for "To". */
  excludeId?: string | null;
}

/**
 * A single-select member field that looks and behaves like any other field in
 * the form — who paid, or who a transfer goes to. Tapping it opens a dropdown
 * list over the form, the same popup language as a group's own "⋮" menu,
 * rather than a row of options sitting inline in the form itself. The current
 * pick is a tinted row, not a separate checkmark. Group members, not friends:
 * anyone currently in the group is a valid choice. The viewer's own row is
 * pinned first and marked "Me", since picking yourself is the common case.
 */
export function MemberDropdownField({
  accessibilityLabel,
  members,
  selectedId,
  onSelect,
  viewerId,
  excludeId,
}: MemberDropdownFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const selectable = members
    .filter((member) => member.id !== excludeId)
    .sort((a, b) => (a.id === viewerId ? -1 : b.id === viewerId ? 1 : 0));
  const selected = members.find((member) => member.id === selectedId) ?? null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
        ]}>
        {selected ? (
          <>
            <Avatar name={selected.name} picture={selected.picture} size={28} seed={selected.id} />
            <ThemedText style={styles.name} numberOfLines={1}>
              {selected.name}
            </ThemedText>
            {selected.id === viewerId ? <MeTag /> : null}
          </>
        ) : (
          <ThemedText style={styles.name} themeColor="textSecondary">
            Select a member
          </ThemedText>
        )}
        <Icon name="collapse" size={16} color={theme.textSecondary} />
      </Pressable>

      <DropdownMenu visible={open} onClose={() => setOpen(false)}>
        {selectable.map((member, index) => (
          <Fragment key={member.id}>
            {index > 0 ? (
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
            ) : null}
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: member.id === selectedId }}
              accessibilityLabel={member.name}
              onPress={() => {
                setOpen(false);
                onSelect(member.id);
              }}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor:
                    member.id === selectedId
                      ? theme.primarySoft
                      : pressed
                        ? theme.backgroundSelected
                        : 'transparent',
                },
              ]}>
              <Avatar name={member.name} picture={member.picture} size={32} seed={member.id} />
              <ThemedText style={styles.name} numberOfLines={1}>
                {member.name}
              </ThemedText>
              {member.id === viewerId ? <MeTag /> : null}
            </Pressable>
          </Fragment>
        ))}
      </DropdownMenu>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    height: 52,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
  },
  name: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
  },
  divider: {
    height: 1,
  },
});
