import type {
  AmountSplitParticipant,
  FriendSummary,
  SharesSplitParticipant,
  SplitInput,
} from '@splitcount/shared';
import { splitByShares } from '@splitcount/shared';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { MeTag } from '@/components/me-tag';
import { SegmentedSwitch } from '@/components/segmented-switch';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { AmountInput, centsToText } from './amount-input';

export interface SplitEditorProps {
  /** Everyone who can be picked — the group's current members. */
  members: FriendSummary[];
  /** The transaction's total, driving the shares preview and the amount-mode remainder. */
  amountCents: number;
  value: SplitInput;
  onChange: (value: SplitInput) => void;
  /** The signed-in member — marked "Me" in the member list. */
  viewerId: string | null;
}

const MAX_WEIGHT = 1000;

/**
 * Who a transaction concerns, and how the amount is divided between them.
 * Defaulting to shares with everyone at weight 1 (an equal split) is the
 * caller's job — this component just edits whatever `value` it is given.
 *
 * Every member gets a row, whether or not they are currently concerned —
 * their stepper or amount field just reads zero. Editing that field is the
 * only way in or out of the split: raising a weight above zero, or typing a
 * non-zero amount, adds the member; bringing either back down to zero
 * removes them. There is no separate checkbox — the row's own background
 * tint (`primarySoft` when concerned) is the only selection cue.
 */
export function SplitEditor({ members, amountCents, value, onChange, viewerId }: SplitEditorProps) {
  // The viewer's own row is pinned first — the same ordering `MemberSelect`
  // uses for "who paid" — since picking yourself first is the common case.
  const orderedMembers = [...members].sort((a, b) =>
    a.id === viewerId ? -1 : b.id === viewerId ? 1 : 0,
  );

  const preview: Map<string, number> | null =
    value.mode === 'shares' && value.participants.length > 0
      ? new Map(splitByShares(amountCents, value.participants).map((s) => [s.userId, s.shareCents]))
      : null;

  function setMode(mode: 'shares' | 'amount') {
    if (mode === value.mode) {
      return;
    }
    if (mode === 'amount' && value.mode === 'shares') {
      const shares =
        value.participants.length > 0 ? splitByShares(amountCents, value.participants) : [];
      onChange({
        mode: 'amount',
        participants: shares.map((s) => ({ userId: s.userId, amount: s.shareCents })),
      });
    } else if (mode === 'shares' && value.mode === 'amount') {
      onChange({
        mode: 'shares',
        participants: value.participants.map((p) => ({ userId: p.userId, weight: 1 })),
      });
    }
  }

  /** A weight of zero removes the member from the split entirely — the schema never persists one. */
  function setWeight(userId: string, weight: number) {
    if (value.mode !== 'shares') {
      return;
    }
    if (weight <= 0) {
      onChange({
        mode: 'shares',
        participants: value.participants.filter((p) => p.userId !== userId),
      });
      return;
    }
    const clamped = Math.min(MAX_WEIGHT, weight);
    const participants: SharesSplitParticipant[] = value.participants.some(
      (p) => p.userId === userId,
    )
      ? value.participants.map((p) => (p.userId === userId ? { ...p, weight: clamped } : p))
      : [...value.participants, { userId, weight: clamped }];
    onChange({ mode: 'shares', participants });
  }

  /** Same rule as `setWeight`: an amount of zero removes the member. */
  function setAmount(userId: string, amount: number) {
    if (value.mode !== 'amount') {
      return;
    }
    if (amount <= 0) {
      onChange({
        mode: 'amount',
        participants: value.participants.filter((p) => p.userId !== userId),
      });
      return;
    }
    const participants: AmountSplitParticipant[] = value.participants.some(
      (p) => p.userId === userId,
    )
      ? value.participants.map((p) => (p.userId === userId ? { ...p, amount } : p))
      : [...value.participants, { userId, amount }];
    onChange({ mode: 'amount', participants });
  }

  const allocated =
    value.mode === 'amount' ? value.participants.reduce((sum, p) => sum + p.amount, 0) : null;
  const remaining = allocated === null ? null : amountCents - allocated;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="overline" themeColor="textSecondary">
          Participants
        </ThemedText>
        <SegmentedSwitch
          options={[
            { key: 'shares', label: 'Shares' },
            { key: 'amount', label: 'Fixed' },
          ]}
          value={value.mode}
          onChange={setMode}
          size="small"
        />
      </View>

      <Card style={styles.rows}>
        {value.mode === 'shares'
          ? orderedMembers.map((member) => {
              const participant = value.participants.find((p) => p.userId === member.id);
              const weight = participant?.weight ?? 0;
              const previewCents = participant ? (preview?.get(member.id) ?? 0) : 0;
              return (
                <MemberRow
                  key={member.id}
                  member={member}
                  isViewer={member.id === viewerId}
                  selected={participant !== undefined}>
                  <View style={styles.shareControl}>
                    <Stepper value={weight} onChange={(w) => setWeight(member.id, w)} />
                    <ThemedText
                      type="small"
                      themeColor="textSecondary"
                      style={styles.previewAmount}>
                      {`= ${centsToText(previewCents)}`}
                    </ThemedText>
                  </View>
                </MemberRow>
              );
            })
          : orderedMembers.map((member) => {
              const participant = value.participants.find((p) => p.userId === member.id);
              return (
                <MemberRow
                  key={member.id}
                  member={member}
                  isViewer={member.id === viewerId}
                  selected={participant !== undefined}>
                  <AmountInput
                    key={`${member.id}-amount`}
                    defaultValueCents={participant?.amount ?? 0}
                    onChangeCents={(cents) => setAmount(member.id, cents ?? 0)}
                    style={styles.amountControl}
                    accessibilityLabel={`${member.name}’s amount`}
                  />
                </MemberRow>
              );
            })}
      </Card>

      {remaining !== null ? (
        <ThemedText
          type="small"
          themeColor={remaining === 0 ? 'credit' : 'debit'}
          style={styles.allocationStatus}>
          {remaining === 0
            ? 'Fully allocated'
            : remaining > 0
              ? `${centsToText(remaining)} left to allocate`
              : `${centsToText(-remaining)} over the total`}
        </ThemedText>
      ) : null}
    </View>
  );
}

function MemberRow({
  member,
  isViewer,
  selected,
  children,
}: {
  member: FriendSummary;
  isViewer: boolean;
  selected: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.row, selected && { backgroundColor: theme.primarySoft }]}>
      <View style={styles.memberInfo}>
        <Avatar name={member.name} picture={member.picture} size={32} seed={member.id} />
        <ThemedText style={styles.name} numberOfLines={1}>
          {member.name}
        </ThemedText>
        {isViewer ? <MeTag /> : null}
      </View>
      {children}
    </View>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const theme = useTheme();

  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease weight"
        accessibilityState={{ disabled: value <= 0 }}
        disabled={value <= 0}
        onPress={() => onChange(value - 1)}
        style={({ pressed }) => [
          styles.stepperButton,
          {
            backgroundColor: pressed ? theme.primarySoft : theme.surface,
            borderColor: theme.border,
          },
          value <= 0 && styles.stepperDisabled,
        ]}>
        <ThemedText type="smallBold" themeColor="primary">
          −
        </ThemedText>
      </Pressable>
      <ThemedText type="smallBold" style={styles.stepperValue}>
        {value}
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase weight"
        onPress={() => onChange(value + 1)}
        style={({ pressed }) => [
          styles.stepperButton,
          {
            backgroundColor: pressed ? theme.primarySoft : theme.surface,
            borderColor: theme.border,
          },
        ]}>
        <ThemedText type="smallBold" themeColor="primary">
          +
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rows: {
    gap: Spacing.one,
  },
  // Pulled up out of `container`'s own `gap` — a caption under the card it
  // reports on reads as attached to it, not as a sibling block of its own.
  allocationStatus: {
    marginTop: -(Spacing.three - Spacing.one),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    // Fixed rather than left to the tallest child: the stepper (shares mode)
    // and the amount field (fixed-amount mode) aren't the same height, and a
    // row that grew or shrank with the mode made every row jump when the
    // Shares / Fixed switch was toggled.
    minHeight: 48,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
  },
  memberInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minWidth: 0,
  },
  name: {
    flex: 1,
  },
  shareControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  previewAmount: {
    minWidth: 52,
    textAlign: 'right',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDisabled: {
    opacity: 0.3,
  },
  stepperValue: {
    minWidth: 18,
    textAlign: 'center',
  },
  amountControl: {
    width: 104,
    height: 40,
    fontSize: 15,
  },
});
