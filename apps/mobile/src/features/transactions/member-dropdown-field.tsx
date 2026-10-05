import type { FriendSummary, PartyId } from '@ardoise/shared';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { DropdownMenu } from '@/components/dropdown-menu';
import { Icon } from '@/components/icon';
import { MeTag } from '@/components/me-tag';
import { OthersAvatar } from '@/components/others-avatar';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * What a single-party field currently holds: nothing yet, or someone —
 * `id: null` being Others (`docs/specs/transactions.md`). Two states rather
 * than a nullable id, so "not picked yet" and "Others" can never be mistaken
 * for each other.
 */
export type PartyChoice = { status: 'unset' } | { status: 'picked'; id: PartyId };

export interface MemberDropdownFieldProps {
  /** What this field picks — "Who paid", "Who received it", "To"… */
  accessibilityLabel: string;
  members: FriendSummary[];
  selected: PartyChoice;
  /** A member's id, or `null` for Others — only possible with `offerOthers`. */
  onSelect: (id: PartyId) => void;
  /** The signed-in member — marked "Me" and pinned to the top of the list. */
  viewerId: string | null;
  /** A party to leave out of the list — typically the payer, for "To". */
  excludeId?: PartyId;
  /**
   * List Others as the last option. Only for a transaction that was stored
   * with Others in this very field, so picking a member stays undoable.
   */
  offerOthers?: boolean;
}

/** One entry of the list: a member, or Others when `member` is `null`. */
interface PartyOption {
  id: PartyId;
  member: FriendSummary | null;
}

/**
 * A single-select member field that looks and behaves like any other field in
 * the form — who paid, or who a transfer goes to. Tapping it opens a dropdown
 * list over the form, the same popup language as a group's own "⋮" menu,
 * rather than a row of options sitting inline in the form itself. The current
 * pick is a tinted row, not a separate checkmark. Group members, not friends:
 * anyone currently in the group is a valid choice. The viewer's own row is
 * pinned first and marked "Me", since picking yourself is the common case.
 *
 * Others is not a choice for a new transaction. It is one only when a
 * transaction already stored with Others as payer or recipient is being edited
 * (`offerOthers`): the field then reads "Others", and Others stays the last
 * option, so picking a member by mistake can be undone.
 */
export function MemberDropdownField({
  accessibilityLabel,
  members,
  selected: choice,
  onSelect,
  viewerId,
  excludeId,
  offerOthers = false,
}: MemberDropdownFieldProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const options: PartyOption[] = members
    .filter((member) => member.id !== excludeId)
    .sort((a, b) => (a.id === viewerId ? -1 : b.id === viewerId ? 1 : 0))
    .map((member) => ({ id: member.id, member }));
  if (offerOthers && excludeId !== null) {
    options.push({ id: null, member: null });
  }
  const selectedId = choice.status === 'picked' ? choice.id : undefined;
  const isOthers = choice.status === 'picked' && choice.id === null;
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
        {isOthers ? (
          <>
            <OthersAvatar size={28} />
            <ThemedText style={styles.name} numberOfLines={1}>
              Others
            </ThemedText>
          </>
        ) : selected ? (
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
        {options.map(({ id, member }, index) => (
          <Fragment key={id ?? OTHERS_KEY}>
            {index > 0 ? (
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
            ) : null}
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: id === selectedId }}
              accessibilityLabel={member ? member.name : 'Others'}
              onPress={() => {
                setOpen(false);
                onSelect(id);
              }}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor:
                    id === selectedId
                      ? theme.primarySoft
                      : pressed
                        ? theme.backgroundSelected
                        : 'transparent',
                },
              ]}>
              {member ? (
                <>
                  <Avatar name={member.name} picture={member.picture} size={32} seed={member.id} />
                  <ThemedText style={styles.name} numberOfLines={1}>
                    {member.name}
                  </ThemedText>
                  {member.id === viewerId ? <MeTag /> : null}
                </>
              ) : (
                <>
                  <OthersAvatar size={32} />
                  <ThemedText style={styles.name} numberOfLines={1}>
                    Others
                  </ThemedText>
                </>
              )}
            </Pressable>
          </Fragment>
        ))}
      </DropdownMenu>
    </>
  );
}

const OTHERS_KEY = 'others';

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
