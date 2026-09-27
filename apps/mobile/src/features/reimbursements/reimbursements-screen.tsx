import { planReimbursements, type Balance, type GroupMember } from '@splitcount/shared';
import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { centsToText } from '@/features/transactions/amount-input';
import { balanceTone } from '@/features/transactions/balance-display';
import type { UseBalancesResult } from '@/features/transactions/use-balances';
import { useTheme } from '@/hooks/use-theme';

/** One suggested payment, resolved to the people it names. */
export interface Suggestion {
  from: { id: string; name: string; picture: string | null };
  to: { id: string; name: string; picture: string | null };
  amountCents: number;
}

export interface ReimbursementsScreenProps {
  /**
   * The group's balances, loaded once by the group screen: the plan is
   * derived from them here, so the two can never disagree about what is
   * owed (`docs/specs/reimbursements.md`).
   */
  balances: UseBalancesResult;
  /** Who can still be a party to a transfer here — a former member cannot. */
  members: readonly GroupMember[];
  viewerId: string | null;
  /** Itself or an ancestor archived: the plan is readable, nothing is recordable. */
  readOnly: boolean;
  /** Record the suggested payment — opens the transfer form, pre-filled. */
  onRecord: (suggestion: Suggestion) => void;
}

/** A balance's party, named from the group's members where it still can be. */
function partyOf(
  userId: string,
  byId: ReadonlyMap<string, GroupMember>,
): Suggestion['from'] {
  const member = byId.get(userId);
  // Someone who left the group can still hold an unsettled balance, exactly
  // as in the per-member list, which has no membership left to read a name
  // from either.
  return {
    id: userId,
    name: member?.name ?? 'Former member',
    picture: member?.picture ?? null,
  };
}

/** "X pays Y", from the viewer's point of view rather than in bare ids. */
function sentence(suggestion: Suggestion, viewerId: string | null): string {
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
  suggestion: Suggestion,
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

/** Owed first, owing next, settled last — and stable between reads. */
function forDisplay(balances: readonly Balance[]): Balance[] {
  return [...balances].sort(
    (a, b) =>
      Number(a.amountCents === 0) - Number(b.amountCents === 0) ||
      b.amountCents - a.amountCents ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  );
}

/**
 * Who should pay whom to clear **this group**, and where everyone stands
 * (`docs/specs/reimbursements.md`) — the answer first, the balances it comes
 * from below it.
 *
 * The plan is built from net balances, so a chain of debts becomes one
 * payment instead of one per pair; tapping a payment records it as an
 * ordinary transfer, which is the only thing that actually settles anything
 * in this product.
 */
export function ReimbursementsScreen({
  balances,
  members,
  viewerId,
  readOnly,
  onRecord,
}: ReimbursementsScreenProps) {
  const theme = useTheme();
  const { status, balances: loaded, refresh } = balances;
  const byId = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const memberIds = useMemo(() => new Set(members.map((member) => member.id)), [members]);

  const suggestions = useMemo(
    () =>
      planReimbursements(loaded)
        .map((payment) => ({
          from: partyOf(payment.fromUserId, byId),
          to: partyOf(payment.toUserId, byId),
          amountCents: payment.amountCents,
        }))
        // The viewer's own payments first — what *they* have to do is the
        // reason they opened this. The rest keep the planner's own
        // canonical order, so everyone reads the same plan.
        .sort((a, b) => Number(involves(b, viewerId)) - Number(involves(a, viewerId))),
    [loaded, byId, viewerId],
  );
  const settled = loaded.every((balance) => balance.amountCents === 0);

  return (
    <View style={styles.panel}>
      {status === 'loading' ? (
        <View style={styles.centeredBody}>
          <ActivityIndicator testID="reimbursements-loading" color={theme.primary} />
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
            <ThemedText type="overline" themeColor="textSecondary">
              Where everyone stands
            </ThemedText>
            <Card style={styles.standings}>
              {forDisplay(loaded).map((balance) => (
                <BalanceRow
                  key={balance.userId}
                  party={partyOf(balance.userId, byId)}
                  amountCents={balance.amountCents}
                  isViewer={balance.userId === viewerId}
                />
              ))}
            </Card>
          </View>

          <View style={styles.section}>
            <ThemedText type="overline" themeColor="textSecondary">
              Suggested reimbursements
            </ThemedText>
            {suggestions.map((suggestion) => (
              <SuggestionRow
                key={`${suggestion.from.id}-${suggestion.to.id}-${suggestion.amountCents}`}
                suggestion={suggestion}
                viewerId={viewerId}
                blocked={blockedReason(suggestion, readOnly, memberIds)}
                onPress={() => onRecord(suggestion)}
              />
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              Tap to reimburse.
            </ThemedText>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function involves(suggestion: Suggestion, viewerId: string | null): boolean {
  return suggestion.from.id === viewerId || suggestion.to.id === viewerId;
}

function SuggestionRow({
  suggestion,
  viewerId,
  blocked,
  onPress,
}: {
  suggestion: Suggestion;
  viewerId: string | null;
  /** Why it cannot be recorded, or `null` when tapping records it. */
  blocked: string | null;
  onPress: () => void;
}) {
  const label = sentence(suggestion, viewerId);
  const amount = centsToText(suggestion.amountCents);

  return (
    <Card
      accessibilityLabel={`${label} ${amount}`}
      disabled={blocked !== null}
      muted={blocked !== null}
      onPress={onPress}
      style={styles.suggestion}>
      <View style={styles.cardRow}>
        <Avatar
          name={suggestion.from.name}
          picture={suggestion.from.picture}
          size={36}
          seed={suggestion.from.id}
        />
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
    </Card>
  );
}

/** One person's balance in the group, worded as the balance list words it. */
function BalanceRow({
  party,
  amountCents,
  isViewer,
}: {
  party: Suggestion['from'];
  amountCents: number;
  isViewer: boolean;
}) {
  const theme = useTheme();
  const amount =
    amountCents === 0
      ? 'settled up'
      : `${amountCents > 0 ? '+' : '−'}${centsToText(Math.abs(amountCents))}`;

  return (
    <View style={styles.row}>
      <Avatar name={party.name} picture={party.picture} size={32} seed={party.id} />
      <ThemedText style={styles.name} numberOfLines={1}>
        {party.name}
      </ThemedText>
      {isViewer ? (
        <View style={[styles.meTag, { backgroundColor: theme.accentSoft }]}>
          <ThemedText type="overline" themeColor="onAccentSoft">
            Me
          </ThemedText>
        </View>
      ) : null}
      <ThemedText type="smallBold" themeColor={balanceTone(amountCents)}>
        {amount}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    gap: Spacing.three,
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
  suggestion: {
    gap: Spacing.one,
  },
  standings: {
    gap: Spacing.two,
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
  meTag: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  pressed: {
    opacity: 0.6,
  },
});
