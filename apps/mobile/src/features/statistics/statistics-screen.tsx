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

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { Pill } from '@/components/pill';
import { SegmentedSwitch } from '@/components/segmented-switch';
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
  /** The signed-in member, marked "Me" in the participant picker. */
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
  const [pickingParticipants, setPickingParticipants] = useState(false);
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

  function setAllMembers(ids: ReadonlySet<string>) {
    setSelected(null);
    setSelectedMemberIds(ids);
  }

  if (pickingParticipants) {
    return (
      <ParticipantsPicker
        members={members}
        viewerId={viewerId}
        selectedMemberIds={selectedMemberIds}
        onToggle={toggleMember}
        onSetAll={setAllMembers}
        onDone={() => setPickingParticipants(false)}
      />
    );
  }

  const selectedSlice = breakdown.slices.find((slice) => slice.category === selected);

  return (
    <View style={styles.panel}>
      <View style={styles.toggles}>
        <View style={styles.fieldsRow}>
          <View style={styles.fieldColumn}>
            <ThemedText type="overline" themeColor="textSecondary">
              Participants
            </ThemedText>
            <ParticipantsField
              members={members}
              selectedMemberIds={selectedMemberIds}
              onPress={() => setPickingParticipants(true)}
            />
          </View>
          {hasSubgroups ? (
            <View style={styles.fieldColumn}>
              <ThemedText type="overline" themeColor="textSecondary">
                Subgroups
              </ThemedText>
              <SubgroupsField scope={scope} onPress={toggleScope} />
            </View>
          ) : null}
        </View>
        <SegmentedSwitch
          options={[
            { key: 'spending', label: typeLabels.spending },
            { key: 'income', label: typeLabels.income },
          ]}
          value={type}
          onChange={changeType}
        />
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

/** First name only — a chip-sized label has no room for a surname. */
function firstName(name: string): string {
  return name.split(' ')[0] ?? name;
}

function participantsLabel(
  members: readonly GroupMember[],
  selectedMemberIds: ReadonlySet<string>,
): string {
  if (selectedMemberIds.size === 0) {
    return 'No one selected';
  }
  if (selectedMemberIds.size === members.length) {
    return 'Everybody';
  }
  return members
    .filter((member) => selectedMemberIds.has(member.id))
    .map((member) => firstName(member.name))
    .join(', ');
}

function ParticipantsField({
  members,
  selectedMemberIds,
  onPress,
}: {
  members: readonly GroupMember[];
  selectedMemberIds: ReadonlySet<string>;
  onPress: () => void;
}) {
  const theme = useTheme();
  const label = participantsLabel(members, selectedMemberIds);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Participants: ${label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectField,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
      ]}>
      <ThemedText numberOfLines={1} style={styles.selectFieldLabel}>
        {label}
      </ThemedText>
      <Icon name="collapse" size={16} color={theme.textSecondary} />
    </Pressable>
  );
}

/**
 * Same field shape as the participants selector — a labelled, fixed-size
 * pill — since including sub-groups is just as much "who counts" as which
 * members are. Only two states, so tapping flips it directly rather than
 * opening a page of its own (`docs/specs/group-statistics.md`).
 */
function SubgroupsField({
  scope,
  onPress,
}: {
  scope: TransactionsListScope;
  onPress: () => void;
}) {
  const theme = useTheme();
  const label = scope === 'subtree' ? 'All' : 'None';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Subgroups: ${label}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectField,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
      ]}>
      <ThemedText numberOfLines={1} style={styles.selectFieldLabel}>
        {label}
      </ThemedText>
      <Icon name="collapse" size={16} color={theme.textSecondary} />
    </Pressable>
  );
}

type SelectionPreset = 'all' | 'none' | 'onlyMe' | null;

function selectionPreset(
  members: readonly GroupMember[],
  selectedMemberIds: ReadonlySet<string>,
  viewerId: string | null,
): SelectionPreset {
  if (selectedMemberIds.size === members.length) {
    return 'all';
  }
  if (selectedMemberIds.size === 0) {
    return 'none';
  }
  if (viewerId && selectedMemberIds.size === 1 && selectedMemberIds.has(viewerId)) {
    return 'onlyMe';
  }
  return null;
}

/**
 * Who the breakdown counts, picked on a page of its own — swapped in for the
 * chart the way "+ Invite" swaps in `InvitePanel` on the Manage tab — rather
 * than a row of chips that would not fit a group of any size
 * (`docs/specs/group-statistics.md`).
 */
function ParticipantsPicker({
  members,
  viewerId,
  selectedMemberIds,
  onToggle,
  onSetAll,
  onDone,
}: {
  members: readonly GroupMember[];
  viewerId: string | null;
  selectedMemberIds: ReadonlySet<string>;
  onToggle: (memberId: string) => void;
  onSetAll: (ids: ReadonlySet<string>) => void;
  onDone: () => void;
}) {
  const preset = selectionPreset(members, selectedMemberIds, viewerId);

  return (
    <View style={styles.pickerPanel}>
      <View style={styles.pickerPresets}>
        <Pill
          label="Everybody"
          selected={preset === 'all'}
          onPress={() => onSetAll(new Set(members.map((member) => member.id)))}
        />
        <Pill label="Nobody" selected={preset === 'none'} onPress={() => onSetAll(new Set())} />
        {viewerId ? (
          <Pill
            label="Only you"
            selected={preset === 'onlyMe'}
            onPress={() => onSetAll(new Set([viewerId]))}
          />
        ) : null}
      </View>

      <ScrollView style={styles.pickerScroll} contentContainerStyle={styles.pickerList}>
        {members.map((member) => (
          <ParticipantOption
            key={member.id}
            member={member}
            isViewer={member.id === viewerId}
            selected={selectedMemberIds.has(member.id)}
            onPress={() => onToggle(member.id)}
          />
        ))}
      </ScrollView>

      <Button label="Done" variant="secondary" onPress={onDone} />
    </View>
  );
}

function ParticipantOption({
  member,
  isViewer,
  selected,
  onPress,
}: {
  member: GroupMember;
  isViewer: boolean;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={member.name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.participantRow,
        selected && { backgroundColor: theme.primarySoft },
        pressed && styles.pressed,
      ]}>
      <Avatar name={member.name} picture={member.picture} size={36} seed={member.id} />
      <ThemedText style={styles.participantName} numberOfLines={1}>
        {member.name}
      </ThemedText>
      {isViewer ? (
        <View style={[styles.meTag, { backgroundColor: theme.accentSoft }]}>
          <ThemedText type="overline" themeColor="onAccentSoft">
            Me
          </ThemedText>
        </View>
      ) : null}
      <View
        style={[
          styles.checkbox,
          { borderColor: selected ? theme.primary : theme.border },
          selected && { backgroundColor: theme.primary },
        ]}>
        {selected ? <Icon name="check" size={14} color={theme.onPrimary} /> : null}
      </View>
    </Pressable>
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
    gap: Spacing.three,
  },
  fieldsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  fieldColumn: {
    flex: 1,
    alignItems: 'flex-start',
    gap: Spacing.one,
  },
  selectField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    gap: Spacing.two,
    height: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
  },
  selectFieldLabel: {
    flexShrink: 1,
  },
  pickerPanel: {
    flex: 1,
    gap: Spacing.three,
  },
  pickerPresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pickerScroll: {
    flex: 1,
  },
  pickerList: {
    gap: Spacing.one,
    paddingBottom: Spacing.four,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
  },
  participantName: {
    flex: 1,
  },
  meTag: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: Radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
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
