import type {
  GroupMember,
  NetPosition,
  ReimbursementScope,
  SuggestedReimbursement,
} from '@splitcount/shared';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { centsToText } from '@/features/transactions/amount-input';
import { balanceTone } from '@/features/transactions/balance-display';
import { useTheme } from '@/hooks/use-theme';

import { useReimbursements } from './use-reimbursements';

export interface ReimbursementsScreenProps {
  groupId: string;
  /** Drives the sub-groups toggle: a group with none has nothing to include. */
  hasSubgroups: boolean;
  /** Who can still be a party to a transfer here — a former member cannot. */
  members: readonly GroupMember[];
  viewerId: string | null;
  /** Itself or an ancestor archived: the plan is readable, nothing is recordable. */
  readOnly: boolean;
  /** Record the suggested payment — opens the transfer form, pre-filled. */
  onRecord: (suggestion: SuggestedReimbursement) => void;
  onClose: () => void;
}

/** "X pays Y", from the viewer's point of view rather than in bare ids. */
function sentence(suggestion: SuggestedReimbursement, viewerId: string | null): string {
  if (suggestion.from.id === viewerId) {
    return `You pay ${suggestion.to.name}`;
  }
  if (suggestion.to.id === viewerId) {
    return `${suggestion.from.name} pays you`;
  }
  return `${suggestion.from.name} pays ${suggestion.to.name}`;
}

/**
 * Why a suggestion cannot be recorded, or `null` when it can. A dead tap
 * with no explanation would read as a bug; this is the line shown instead.
 */
function blockedReason(
  suggestion: SuggestedReimbursement,
  readOnly: boolean,
  memberIds: ReadonlySet<string>,
): string | null {
  if (readOnly) {
    return 'Reopen the group to record it.';
  }
  const gone = [suggestion.from, suggestion.to].find((party) => !memberIds.has(party.id));
  if (gone) {
    return `${gone.name} has left this group, so this can’t be recorded here.`;
  }
  return null;
}

/**
 * Who should pay whom to clear the group, and where everyone stands
 * (`docs/specs/reimbursements.md`) — the answer first, its justification
 * below it, collapsed.
 *
 * The plan is built from net positions, so a chain of debts becomes one
 * payment instead of one per pair; tapping a payment records it as an
 * ordinary transfer, which is the only thing that actually settles anything
 * in this product.
 */
export function ReimbursementsScreen({
  groupId,
  hasSubgroups,
  members,
  viewerId,
  readOnly,
  onRecord,
  onClose,
}: ReimbursementsScreenProps) {
  const theme = useTheme();
  // Sub-groups are included by default: it is the scope that actually
  // minimises payments, and it matches the rolled-up balance the group
  // screen already shows.
  const [scope, setScope] = useState<ReimbursementScope>(hasSubgroups ? 'subtree' : 'group');
  const { status, positions, reimbursements, refresh } = useReimbursements(groupId, scope);
  const memberIds = new Set(members.map((member) => member.id));

  // The viewer's own payments first — what *they* have to do is the reason
  // they opened this. Otherwise the server's canonical order is kept, so
  // everyone reads the same plan.
  const ordered = [...reimbursements].sort(
    (a, b) => Number(involves(b, viewerId)) - Number(involves(a, viewerId)),
  );
  const settled = positions.every((position) => position.amountCents === 0);

  return (
    <ThemedView style={styles.sheet}>
      <ThemedText type="subtitle">Reimbursements</ThemedText>

      {hasSubgroups ? (
        <View style={styles.toggleRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: scope === 'subtree' }}
            onPress={() => setScope((current) => (current === 'subtree' ? 'group' : 'subtree'))}
            style={[
              styles.toggle,
              { borderColor: theme.text },
              scope === 'subtree' && { backgroundColor: theme.text },
            ]}>
            <ThemedText
              type="small"
              style={scope === 'subtree' ? { color: theme.background } : undefined}>
              Include sub-groups
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {status === 'loading' ? (
        <View style={styles.centeredBody}>
          <ActivityIndicator testID="reimbursements-loading" color={theme.text} />
        </View>
      ) : status === 'error' ? (
        <View style={styles.centeredBody}>
          <ThemedText themeColor="textSecondary" style={styles.centeredText}>
            We couldn’t work out who owes what. Check your connection and try again.
          </ThemedText>
          <Button label="Try again" variant="secondary" onPress={refresh} />
        </View>
      ) : settled ? (
        <View style={styles.centeredBody}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            You’re all settled up
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centeredText}>
            Nobody owes anybody here.
          </ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.section}>
            <ThemedText type="smallBold">Suggested reimbursements</ThemedText>
            {ordered.map((suggestion) => (
              <SuggestionRow
                key={`${suggestion.from.id}-${suggestion.to.id}-${suggestion.amountCents}`}
                suggestion={suggestion}
                viewerId={viewerId}
                blocked={blockedReason(suggestion, readOnly, memberIds)}
                onPress={() => onRecord(suggestion)}
              />
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              {ordered.length === 1
                ? 'One payment clears everything.'
                : `${ordered.length} payments clear everything.`}
            </ThemedText>
          </View>

          <View style={styles.section}>
            <ThemedText type="smallBold">Where everyone stands</ThemedText>
            {positions.map((position) => (
              <PositionRow
                key={position.user.id}
                position={position}
                isViewer={position.user.id === viewerId}
              />
            ))}
          </View>
        </ScrollView>
      )}

      <ThemedView style={styles.footer}>
        <Button label="Close" variant="secondary" onPress={onClose} />
      </ThemedView>
    </ThemedView>
  );
}

function involves(suggestion: SuggestedReimbursement, viewerId: string | null): boolean {
  return suggestion.from.id === viewerId || suggestion.to.id === viewerId;
}

function SuggestionRow({
  suggestion,
  viewerId,
  blocked,
  onPress,
}: {
  suggestion: SuggestedReimbursement;
  viewerId: string | null;
  /** Why it cannot be recorded, or `null` when tapping records it. */
  blocked: string | null;
  onPress: () => void;
}) {
  const label = sentence(suggestion, viewerId);
  const amount = centsToText(suggestion.amountCents);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${amount}`}
      accessibilityState={{ disabled: blocked !== null }}
      disabled={blocked !== null}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.cardRow}>
        <Avatar name={suggestion.from.name} picture={suggestion.from.picture} size={32} />
        <ThemedText style={styles.cardLabel} numberOfLines={2}>
          {label}
        </ThemedText>
        <ThemedText type="smallBold">{amount}</ThemedText>
      </View>
      {blocked === null ? null : (
        <ThemedText type="small" themeColor="textSecondary">
          {blocked}
        </ThemedText>
      )}
    </Pressable>
  );
}

/**
 * One person's net position, expandable to the groups it comes from. The
 * breakdown starts collapsed: the plan above is the answer, this is only the
 * justification, and showing every group at once would bury the first.
 */
function PositionRow({ position, isViewer }: { position: NetPosition; isViewer: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const name = isViewer ? 'You' : position.user.name;
  const amount =
    position.amountCents === 0
      ? 'settled up'
      : `${position.amountCents > 0 ? '+' : '−'}${centsToText(Math.abs(position.amountCents))}`;
  // A single source says nothing the position itself does not.
  const explainable = position.sources.length > 1;

  return (
    <View>
      <Pressable
        accessibilityRole={explainable ? 'button' : 'text'}
        accessibilityLabel={`${name}, ${amount}`}
        accessibilityState={explainable ? { expanded } : undefined}
        disabled={!explainable}
        onPress={() => setExpanded((shown) => !shown)}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <Avatar name={position.user.name} picture={position.user.picture} size={32} />
        <ThemedText style={styles.name} numberOfLines={1}>
          {name}
        </ThemedText>
        {explainable ? (
          <ThemedText type="small" themeColor="textSecondary">
            {expanded ? 'Hide' : 'Details'}
          </ThemedText>
        ) : null}
        <ThemedText type="smallBold" themeColor={balanceTone(position.amountCents)}>
          {amount}
        </ThemedText>
      </Pressable>

      {expanded
        ? position.sources.map((source) => (
            <View key={source.groupId} style={styles.sourceRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.name} numberOfLines={1}>
                {source.groupName}
              </ThemedText>
              <ThemedText type="small" themeColor={balanceTone(source.amountCents)}>
                {`${source.amountCents > 0 ? '+' : '−'}${centsToText(Math.abs(source.amountCents))}`}
              </ThemedText>
            </View>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  toggle: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: {
    gap: Spacing.four,
    paddingBottom: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  centeredBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  centeredText: {
    textAlign: 'center',
  },
  card: {
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  cardLabel: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  name: {
    flex: 1,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingLeft: Spacing.three + 32,
    paddingVertical: Spacing.one,
  },
  pressed: {
    opacity: 0.6,
  },
  footer: {
    paddingTop: Spacing.two,
  },
});
