import type { AmountSplitParticipant, FriendSummary, SharesSplitParticipant, SplitInput } from '@splitcount/shared';
import { splitByShares } from '@splitcount/shared';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Pill } from '@/components/pill';
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
}

const MIN_WEIGHT = 1;
const MAX_WEIGHT = 1000;

/**
 * Who a transaction concerns, and how the amount is divided between them.
 * Defaulting to shares with everyone at weight 1 (an equal split) is the
 * caller's job — this component just edits whatever `value` it is given.
 */
export function SplitEditor({ members, amountCents, value, onChange }: SplitEditorProps) {
  const selectedIds = new Set(value.participants.map((p) => p.userId));

  const preview: Map<string, number> | null =
    value.mode === 'shares' && value.participants.length > 0
      ? new Map(splitByShares(amountCents, value.participants).map((s) => [s.userId, s.shareCents]))
      : null;

  function toggleMember(userId: string) {
    const isSelected = selectedIds.has(userId);
    if (value.mode === 'shares') {
      const participants: SharesSplitParticipant[] = isSelected
        ? value.participants.filter((p) => p.userId !== userId)
        : [...value.participants, { userId, weight: 1 }];
      onChange({ mode: 'shares', participants });
    } else {
      const participants: AmountSplitParticipant[] = isSelected
        ? value.participants.filter((p) => p.userId !== userId)
        : [...value.participants, { userId, amount: 0 }];
      onChange({ mode: 'amount', participants });
    }
  }

  function setMode(mode: 'shares' | 'amount') {
    if (mode === value.mode) {
      return;
    }
    if (mode === 'amount' && value.mode === 'shares') {
      const shares = value.participants.length > 0 ? splitByShares(amountCents, value.participants) : [];
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

  function setWeight(userId: string, weight: number) {
    if (value.mode !== 'shares') {
      return;
    }
    const clamped = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, weight));
    onChange({
      mode: 'shares',
      participants: value.participants.map((p) => (p.userId === userId ? { ...p, weight: clamped } : p)),
    });
  }

  function setAmount(userId: string, amount: number) {
    if (value.mode !== 'amount') {
      return;
    }
    onChange({
      mode: 'amount',
      participants: value.participants.map((p) => (p.userId === userId ? { ...p, amount } : p)),
    });
  }

  const allocated =
    value.mode === 'amount' ? value.participants.reduce((sum, p) => sum + p.amount, 0) : null;
  const remaining = allocated === null ? null : amountCents - allocated;

  return (
    <View style={styles.container}>
      <View style={styles.modeToggle}>
        <Pill label="Shares" selected={value.mode === 'shares'} onPress={() => setMode('shares')} />
        <Pill
          label="Fixed amounts"
          selected={value.mode === 'amount'}
          onPress={() => setMode('amount')}
        />
      </View>

      <View style={styles.rows}>
        {value.mode === 'shares'
          ? members.map((member) => {
              const participant = value.participants.find((p) => p.userId === member.id);
              return (
                <MemberRow
                  key={member.id}
                  member={member}
                  selected={participant !== undefined}
                  onToggle={() => toggleMember(member.id)}>
                  {participant ? (
                    <View style={styles.shareControl}>
                      <Stepper value={participant.weight} onChange={(w) => setWeight(member.id, w)} />
                      <ThemedText type="small" themeColor="textSecondary" style={styles.previewAmount}>
                        {preview ? `= ${centsToText(preview.get(member.id) ?? 0)}` : ''}
                      </ThemedText>
                    </View>
                  ) : null}
                </MemberRow>
              );
            })
          : members.map((member) => {
              const participant = value.participants.find((p) => p.userId === member.id);
              return (
                <MemberRow
                  key={member.id}
                  member={member}
                  selected={participant !== undefined}
                  onToggle={() => toggleMember(member.id)}>
                  {participant ? (
                    // Remounts only when the mode itself changes — not on
                    // every keystroke, which would reset the cursor.
                    <AmountInput
                      key={`${member.id}-amount`}
                      defaultValueCents={participant.amount}
                      onChangeCents={(cents) => setAmount(member.id, cents ?? 0)}
                      style={styles.amountControl}
                      accessibilityLabel={`${member.name}’s amount`}
                    />
                  ) : null}
                </MemberRow>
              );
            })}
      </View>

      {remaining !== null ? (
        <ThemedText type="smallBold" themeColor={remaining === 0 ? 'credit' : 'debit'}>
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
  selected,
  onToggle,
  children,
}: {
  member: FriendSummary;
  selected: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.row, selected && { backgroundColor: theme.primarySoft }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={member.name}
        onPress={onToggle}
        style={styles.memberPress}>
        <Avatar name={member.name} picture={member.picture} size={32} seed={member.id} />
        <ThemedText style={styles.name} numberOfLines={1}>
          {member.name}
        </ThemedText>
        <View
          style={[
            styles.checkbox,
            { borderColor: selected ? theme.primary : theme.border },
            selected && { backgroundColor: theme.primary },
          ]}>
          {selected ? (
            <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
              ✓
            </ThemedText>
          ) : null}
        </View>
      </Pressable>
      {selected ? children : null}
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
        disabled={value <= MIN_WEIGHT}
        onPress={() => onChange(value - 1)}
        style={[
          styles.stepperButton,
          { backgroundColor: theme.surface, borderColor: theme.border },
          value <= MIN_WEIGHT && styles.stepperDisabled,
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
        style={[styles.stepperButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
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
  modeToggle: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  rows: {
    gap: Spacing.one,
  },
  row: {
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
  },
  memberPress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  name: {
    flex: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.three,
    paddingLeft: 44,
  },
  previewAmount: {
    minWidth: 56,
    textAlign: 'right',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepperButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperDisabled: {
    opacity: 0.3,
  },
  stepperValue: {
    minWidth: 20,
    textAlign: 'center',
  },
  amountControl: {
    marginLeft: 44,
    height: 44,
    fontSize: 16,
  },
});
