import {
  categoryDefinition,
  type GroupMember,
  type StatisticsType,
  type SubgroupSummary,
  type TransactionCategory,
} from '@ardoise/shared';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AsyncState } from '@/components/async-state';
import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { Icon } from '@/components/icon';
import { MeTag } from '@/components/me-tag';
import { SegmentedSwitch } from '@/components/segmented-switch';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { centsToText } from '@/features/transactions/amount-input';
import { DateRangeField } from '@/features/transactions/date-range-field';
import { useTheme } from '@/hooks/use-theme';
import type { StatisticsFilter } from '@/lib/api/transactions';
import { toggleInSet } from '@/lib/sets';

import { DonutChart } from './donut-chart';
import { MultiSelectField } from './multi-select-field';
import { useFollowAllSelection } from './use-follow-all-selection';
import { useGroupStatistics } from './use-group-statistics';

export interface StatisticsScreenProps {
  groupId: string;
  /**
   * The group's own direct sub-groups — drives whether the subgroups field
   * shows at all. Empty for a group with none (`docs/specs/group-statistics.md`).
   */
  subgroups: readonly SubgroupSummary[];
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
function emptyMessage(
  type: StatisticsType,
  everyoneSelected: boolean,
  dateRangeActive: boolean,
): string {
  if (!everyoneSelected && dateRangeActive) {
    return type === 'spending'
      ? 'None of this group’s spending concerns the selected participants in this date range.'
      : 'None of this group’s income concerns the selected participants in this date range.';
  }
  if (!everyoneSelected) {
    return type === 'spending'
      ? 'None of this group’s spending concerns the selected participants.'
      : 'None of this group’s income concerns the selected participants.';
  }
  if (dateRangeActive) {
    return type === 'spending'
      ? 'Nothing spent in the selected date range.'
      : 'Nothing recorded as income in the selected date range.';
  }
  return type === 'spending'
    ? // "between members": true too of a group whose spending all went to Others.
      'Nothing spent between members yet. Transfers don’t count — they only move money around.'
    : 'Nothing recorded as income yet.';
}

/** A group's money, broken down by category (`docs/specs/group-statistics.md`). */
export function StatisticsScreen({
  groupId,
  subgroups,
  members,
  viewerId,
}: StatisticsScreenProps) {
  const hasSubgroups = subgroups.length > 0;
  const [type, setType] = useState<StatisticsType>('spending');
  // Every direct sub-group is included by default — the natural reading of
  // "this trip's spending" is the whole trip. This is the one view in the
  // product that crosses into sub-groups, and it says so on the field:
  // balances and the reimbursement plan are each scoped to one group
  // (`docs/specs/balances.md`).
  // Follows sub-groups created while this tab stays mounted (see the hook).
  const [selectedSubgroupIds, setSelectedSubgroupIds] = useFollowAllSelection(
    subgroups.map((subgroup) => subgroup.id),
  );
  const allSubgroupsSelected = selectedSubgroupIds.size === subgroups.length;
  // Everyone is selected by default — this is what makes the group's total
  // match "the group" scope the feature started with.
  // Follows members who join or leave while this tab stays mounted.
  const [selectedMemberIds, setSelectedMemberIds] = useFollowAllSelection(
    members.map((member) => member.id),
  );
  const [selected, setSelected] = useState<TransactionCategory | null>(null);
  // `null` means "no bound" — the breakdown covers every date.
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  // Collapsed by default — participants, sub-groups and the date range are
  // secondary to the type switch, which stays visible above them
  // (`docs/specs/group-statistics.md`).
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false);
  const theme = useTheme();

  const everyoneSelected = selectedMemberIds.size === members.length;
  const dateRangeActive = fromDate !== null || toDate !== null;

  const filter = useMemo<StatisticsFilter>(
    () => ({
      type,
      // `null` for "everyone" rather than every member id lets the server
      // apply its own rule — the members' shares, never Others' — instead of
      // summing whichever ids happen to be listed. Sorted, so the same
      // selection is the same cached read whatever order it was ticked in.
      participantIds: everyoneSelected ? null : [...selectedMemberIds].sort(),
      // Likewise `null` for every branch, sub-groups created since included.
      subgroupIds: allSubgroupsSelected ? null : [...selectedSubgroupIds].sort(),
      from: fromDate,
      to: toDate,
    }),
    [
      type,
      everyoneSelected,
      selectedMemberIds,
      allSubgroupsSelected,
      selectedSubgroupIds,
      fromDate,
      toDate,
    ],
  );
  const { status, breakdown, excludedSubgroupCount, refresh } = useGroupStatistics(
    groupId,
    filter,
  );

  /** Switching what is measured makes any selected slice meaningless. */
  function changeType(value: StatisticsType) {
    setSelected(null);
    setType(value);
  }

  function changeFromDate(value: string | null) {
    setSelected(null);
    setFromDate(value);
  }

  function changeToDate(value: string | null) {
    setSelected(null);
    setToDate(value);
  }

  function toggleSubgroup(subgroupId: string) {
    setSelected(null);
    setSelectedSubgroupIds((current) => toggleInSet(current, subgroupId));
  }

  function setAllSubgroups(ids: ReadonlySet<string>) {
    setSelected(null);
    setSelectedSubgroupIds(ids);
  }

  function toggleMember(memberId: string) {
    setSelected(null);
    setSelectedMemberIds((current) => toggleInSet(current, memberId));
  }

  function setAllMembers(ids: ReadonlySet<string>) {
    setSelected(null);
    setSelectedMemberIds(ids);
  }

  const selectedSlice = breakdown.slices.find((slice) => slice.category === selected);
  const memberPresets = [
    { label: 'Everybody', ids: new Set(members.map((member) => member.id)) },
    ...(viewerId ? [{ label: 'Only you', ids: new Set([viewerId]) }] : []),
    { label: 'Nobody', ids: new Set<string>() },
  ];

  return (
    <View style={styles.panel}>
      <View style={styles.optionsSection}>
        <View style={styles.switchRow}>
          <SegmentedSwitch
            options={[
              { key: 'spending', label: typeLabels.spending },
              { key: 'income', label: typeLabels.income },
            ]}
            value={type}
            onChange={changeType}
          />
          <FiltersToggle
            open={moreOptionsOpen}
            onPress={() => setMoreOptionsOpen((open) => !open)}
          />
        </View>
        <Collapsible open={moreOptionsOpen}>
          <View style={styles.toggles}>
            <View style={styles.fieldsRow}>
              <View style={styles.fieldColumn}>
                <ThemedText type="overline" themeColor="textSecondary">
                  Participants
                </ThemedText>
                <MultiSelectField
                  name="Participants"
                  label={participantsLabel(members, selectedMemberIds)}
                  items={members}
                  idOf={(member) => member.id}
                  itemLabel={(member) => member.name}
                  renderItem={(member) => (
                    <>
                      <Avatar name={member.name} picture={member.picture} size={36} seed={member.id} />
                      <ThemedText style={styles.optionName} numberOfLines={1}>
                        {member.name}
                      </ThemedText>
                      {member.id === viewerId ? <MeTag /> : null}
                    </>
                  )}
                  presets={memberPresets}
                  selectedIds={selectedMemberIds}
                  onToggle={toggleMember}
                  onSetAll={setAllMembers}
                />
              </View>
              {hasSubgroups ? (
                <View style={styles.fieldColumn}>
                  <ThemedText type="overline" themeColor="textSecondary">
                    Subgroups
                  </ThemedText>
                  {/* Ticking one includes it and everything nested under it
                      (`docs/specs/group-statistics.md`). */}
                  <MultiSelectField
                    name="Subgroups"
                    label={subgroupsLabel(subgroups, selectedSubgroupIds)}
                    items={subgroups}
                    idOf={(subgroup) => subgroup.id}
                    itemLabel={(subgroup) => subgroup.name}
                    renderItem={(subgroup) => (
                      <ThemedText style={styles.optionName} numberOfLines={1}>
                        {subgroup.name}
                      </ThemedText>
                    )}
                    presets={[
                      { label: 'All', ids: new Set(subgroups.map((subgroup) => subgroup.id)) },
                      { label: 'None', ids: new Set() },
                    ]}
                    selectedIds={selectedSubgroupIds}
                    onToggle={toggleSubgroup}
                    onSetAll={setAllSubgroups}
                  />
                </View>
              ) : null}
            </View>
            <View style={styles.fieldsRow}>
              <DateFieldColumn label="From" value={fromDate} onChange={changeFromDate} />
              <DateFieldColumn label="To" value={toDate} onChange={changeToDate} />
            </View>
            {excludedSubgroupCount > 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {excludedSubgroupCount === 1
                  ? '1 sub-group you’re not in isn’t included.'
                  : `${excludedSubgroupCount} sub-groups you’re not in aren’t included.`}
              </ThemedText>
            ) : null}
          </View>
        </Collapsible>
      </View>

      <AsyncState
        status={status}
        loadingTestID="statistics-loading"
        failure="We couldn’t load this group’s statistics. Check your connection and try again."
        onRetry={refresh}>
        {selectedMemberIds.size === 0 ? (
          <View style={styles.centeredBody}>
            <ThemedText themeColor="textSecondary" style={styles.centeredText}>
              Select at least one participant to see a breakdown.
            </ThemedText>
          </View>
        ) : breakdown.slices.length === 0 ? (
          <ScrollView contentContainerStyle={styles.body}>
            <DonutChart
              size={CHART_SIZE}
              thickness={CHART_THICKNESS}
              slices={[{ key: 'empty', value: 1, color: theme.border, label: 'No data' }]}>
              <Centre
                label={`Total ${typeLabels[type].toLowerCase()}`}
                amountCents={0}
                percent={null}
              />
            </DonutChart>
            <ThemedText themeColor="textSecondary" style={styles.centeredText}>
              {emptyMessage(type, everyoneSelected, dateRangeActive)}
            </ThemedText>
          </ScrollView>
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
      </AsyncState>
    </View>
  );
}

/**
 * The "Filters" icon at the right end of the type switch's row: opens and
 * closes the participants / sub-groups / date fields. Icon only; open, it is
 * tinted brand so it reads as "on" (`docs/specs/group-statistics.md`).
 */
function FiltersToggle({ open, onPress }: { open: boolean; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel="Filters"
      hitSlop={6}
      onPress={onPress}
      style={[styles.filtersButton, open && { backgroundColor: theme.primarySoft }]}>
      <Icon name="filters" size={20} color={open ? theme.primary : theme.textSecondary} />
    </Pressable>
  );
}

/**
 * Animates its own height and opacity between 0 and its content's natural
 * size. The content is measured through `position: absolute` so the
 * animated height never constrains its own layout while collapsing
 * (`docs/specs/group-statistics.md`).
 */
function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  const [contentHeight, setContentHeight] = useState(0);
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    progress.set(withTiming(open ? 1 : 0, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [open, progress]);

  const containerStyle = useAnimatedStyle(() => ({
    height: contentHeight * progress.get(),
    opacity: progress.get(),
  }));

  return (
    <Animated.View style={[styles.collapsible, containerStyle]}>
      <View
        style={styles.collapsibleContent}
        onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}>
        {children}
      </View>
    </Animated.View>
  );
}

function DateFieldColumn({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <View style={styles.fieldColumn}>
      <View style={styles.fieldLabelRow}>
        <ThemedText type="overline" themeColor="textSecondary">
          {label}
        </ThemedText>
        {value !== null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label.toLowerCase()}`}
            onPress={() => onChange(null)}>
            <ThemedText type="overline" themeColor="primary">
              Clear
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      <DateRangeField label={label} value={value} onChange={onChange} />
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

function subgroupsLabel(
  subgroups: readonly SubgroupSummary[],
  selectedSubgroupIds: ReadonlySet<string>,
): string {
  if (selectedSubgroupIds.size === 0) {
    return 'None';
  }
  if (selectedSubgroupIds.size === subgroups.length) {
    return 'All';
  }
  return subgroups
    .filter((subgroup) => selectedSubgroupIds.has(subgroup.id))
    .map((subgroup) => subgroup.name)
    .join(', ');
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
  optionName: {
    flex: 1,
  },
  panel: {
    flex: 1,
    gap: Spacing.three,
  },
  // The divider that used to sit here is gone, but the breathing room it
  // gave the chart underneath stays — this is that room, now carried by the
  // section above rather than a line between the two.
  optionsSection: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  // The switch stays centred; the filters button is pinned to the right edge
  // out of the flow, so it never pushes the switch off-centre.
  switchRow: {
    justifyContent: 'center',
  },
  filtersButton: {
    position: 'absolute',
    right: 0,
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsible: {
    overflow: 'hidden',
  },
  collapsibleContent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  // The presets, at the head of a dropdown, inset like its option rows.
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
