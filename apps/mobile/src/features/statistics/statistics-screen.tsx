import {
  categoryBreakdown,
  categoryDefinition,
  type GroupMember,
  type StatisticsType,
  type TransactionCategory,
  type TransactionsListScope,
} from '@splitcount/shared';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Pill } from '@/components/pill';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { centsToText } from '@/features/transactions/amount-input';
import { useTransactions } from '@/features/transactions/use-transactions';
import { useTheme } from '@/hooks/use-theme';

import { DonutChart } from './donut-chart';

export interface StatisticsScreenProps {
  groupId: string;
  /**
   * Whether the group has any sub-groups at all — drives whether the
   * "Include sub-groups" toggle shows. A group with none has nothing for it
   * to change (`docs/specs/group-statistics.md`).
   */
  hasSubgroups: boolean;
  /** Who can be selected, everyone included by default. */
  members: readonly GroupMember[];
  /** The signed-in member, labelled "You" in the participant list. */
  viewerId: string | null;
}

const CHART_SIZE = 220;
const CHART_THICKNESS = 44;

const typeLabels: Record<StatisticsType, string> = {
  spending: 'Spending',
  income: 'Income',
};

/**
 * Why there is nothing to show, said precisely: "no income recorded" must not
 * read as "no transactions", or the viewer goes looking for a bug.
 */
function emptyMessage(type: StatisticsType, everyoneSelected: boolean): string {
  if (!everyoneSelected) {
    return type === 'spending'
      ? 'None of this group’s spending concerns the selected participants.'
      : 'None of this group’s income concerns the selected participants.';
  }
  return type === 'spending'
    ? 'Nothing spent yet. Transfers between members don’t count — they only move money around.'
    : 'Nothing recorded as income yet.';
}

/** A group's money, broken down by category (`docs/specs/group-statistics.md`). */
export function StatisticsScreen({
  groupId,
  hasSubgroups,
  members,
  viewerId,
}: StatisticsScreenProps) {
  const [type, setType] = useState<StatisticsType>('spending');
  // Sub-groups are included by default — the natural reading of "this trip's
  // spending" is the whole trip. This is the one view in the product that
  // crosses into sub-groups, and it says so on the toggle: balances and the
  // reimbursement plan are each scoped to one group
  // (`docs/specs/balances.md`).
  const [scope, setScope] = useState<TransactionsListScope>(hasSubgroups ? 'subtree' : 'group');
  const { status, transactions, excludedSubgroupCount, refresh } = useTransactions(
    groupId,
    scope,
  );
  // Everyone is selected by default — this is what makes the group's total
  // match "the group" scope the feature started with.
  const [selectedMemberIds, setSelectedMemberIds] = useState<ReadonlySet<string>>(
    () => new Set(members.map((member) => member.id)),
  );
  const [selected, setSelected] = useState<TransactionCategory | null>(null);
  const theme = useTheme();

  const everyoneSelected = selectedMemberIds.size === members.length;

  const breakdown = useMemo(
    () =>
      categoryBreakdown(transactions, {
        type,
        // Passing `null` for "everyone" rather than every member id keeps the
        // group total exactly `transaction.amountCents`, immune to any
        // rounding remainder a shares split assigned only to some of them.
        participantIds: everyoneSelected ? null : [...selectedMemberIds],
      }),
    [transactions, type, everyoneSelected, selectedMemberIds],
  );

  /** Switching what is measured makes any selected slice meaningless. */
  function changeType(value: StatisticsType) {
    setSelected(null);
    setType(value);
  }

  function toggleScope() {
    setSelected(null);
    setScope((current) => (current === 'subtree' ? 'group' : 'subtree'));
  }

  function toggleMember(memberId: string) {
    setSelected(null);
    setSelectedMemberIds((current) => {
      const next = new Set(current);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  }

  const selectedSlice = breakdown.slices.find((slice) => slice.category === selected);

  return (
    <View style={styles.panel}>
      <View style={styles.toggles}>
        <View style={styles.toggleRow}>
          {(['spending', 'income'] as const).map((option) => (
            <Pill
              key={option}
              label={typeLabels[option]}
              selected={type === option}
              onPress={() => changeType(option)}
            />
          ))}
          {hasSubgroups ? (
            <Pill
              label="Include sub-groups"
              selected={scope === 'subtree'}
              onPress={toggleScope}
            />
          ) : null}
        </View>
        <View style={styles.toggleRow}>
          {members.map((member) => (
            <Pill
              key={member.id}
              label={member.id === viewerId ? 'You' : member.name}
              selected={selectedMemberIds.has(member.id)}
              onPress={() => toggleMember(member.id)}
            />
          ))}
        </View>
        {excludedSubgroupCount > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {excludedSubgroupCount === 1
              ? '1 sub-group you’re not in isn’t included.'
              : `${excludedSubgroupCount} sub-groups you’re not in aren’t included.`}
          </ThemedText>
        ) : null}
      </View>

      {status === 'loading' ? (
        <View style={styles.centeredBody}>
          <ActivityIndicator testID="statistics-loading" color={theme.primary} />
        </View>
      ) : status === 'error' ? (
        <View style={styles.centeredBody}>
          <ThemedText themeColor="textSecondary" style={styles.centeredText}>
            We couldn’t load this group’s transactions. Check your connection and try
            again.
          </ThemedText>
          <Button label="Try again" variant="secondary" onPress={refresh} />
        </View>
      ) : selectedMemberIds.size === 0 ? (
        <View style={styles.centeredBody}>
          <ThemedText themeColor="textSecondary" style={styles.centeredText}>
            Select at least one participant to see a breakdown.
          </ThemedText>
        </View>
      ) : breakdown.slices.length === 0 ? (
        <View style={styles.centeredBody}>
          <ThemedText themeColor="textSecondary" style={styles.centeredText}>
            {emptyMessage(type, everyoneSelected)}
          </ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <DonutChart
            size={CHART_SIZE}
            thickness={CHART_THICKNESS}
            slices={breakdown.slices.map((slice) => {
              const category = categoryDefinition(slice.category);
              return {
                key: slice.category,
                value: slice.amountCents,
                color: category?.color ?? '#8A9199',
                label: `${category?.label ?? slice.category}, ${centsToText(
                  slice.amountCents,
                )}, ${slice.percent}%`,
              };
            })}
            selectedKey={selected}
            onSelect={(key) =>
              setSelected((current) => (current === key ? null : (key as TransactionCategory)))
            }>
            <Centre
              label={
                selectedSlice
                  ? `${categoryDefinition(selectedSlice.category)?.emoji ?? ''} ${
                      categoryDefinition(selectedSlice.category)?.label ?? ''
                    }`
                  : `Total ${typeLabels[type].toLowerCase()}`
              }
              amountCents={selectedSlice ? selectedSlice.amountCents : breakdown.totalCents}
              percent={selectedSlice?.percent ?? null}
            />
          </DonutChart>

          <Card style={styles.legend}>
            {breakdown.slices.map((slice) => (
              <LegendRow
                key={slice.category}
                category={slice.category}
                amountCents={slice.amountCents}
                percent={slice.percent}
                selected={selected === slice.category}
                onPress={() =>
                  setSelected((current) => (current === slice.category ? null : slice.category))
                }
              />
            ))}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

function Centre({
  label,
  amountCents,
  percent,
}: {
  label: string;
  amountCents: number;
  percent: number | null;
}) {
  return (
    <>
      <ThemedText
        testID="statistics-centre-label"
        type="small"
        themeColor="textSecondary"
        style={styles.centeredText}
        numberOfLines={2}>
        {label}
      </ThemedText>
      <ThemedText testID="statistics-centre-amount" type="amount">
        {centsToText(amountCents)}
      </ThemedText>
      {percent === null ? null : (
        <ThemedText testID="statistics-centre-percent" type="small" themeColor="textSecondary">
          {percent}%
        </ThemedText>
      )}
    </>
  );
}

function LegendRow({
  category,
  amountCents,
  percent,
  selected,
  onPress,
}: {
  category: TransactionCategory;
  amountCents: number;
  percent: number;
  selected: boolean;
  onPress: () => void;
}) {
  const definition = categoryDefinition(category);
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${definition?.label ?? category}, ${centsToText(amountCents)}, ${percent}%`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.legendRow,
        // The selected slice is named in the donut's hole; the row it came
        // from says so too, so the two never disagree.
        selected && { backgroundColor: theme.backgroundElement },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.swatch, { backgroundColor: definition?.color ?? '#8A9199' }]} />
      <ThemedText style={styles.legendLabel} numberOfLines={1}>
        {definition ? `${definition.emoji} ${definition.label}` : category}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {percent}%
      </ThemedText>
      <ThemedText type={selected ? 'smallBold' : 'small'} style={styles.legendAmount}>
        {centsToText(amountCents)}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    gap: Spacing.three,
  },
  toggles: {
    gap: Spacing.two,
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  body: {
    gap: Spacing.four,
    paddingBottom: Spacing.four,
  },
  centeredBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  centeredText: {
    textAlign: 'center',
  },
  legend: {
    gap: Spacing.one,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
  },
  legendLabel: {
    flex: 1,
  },
  legendAmount: {
    minWidth: 72,
    textAlign: 'right',
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  pressed: {
    opacity: 0.6,
  },
});
