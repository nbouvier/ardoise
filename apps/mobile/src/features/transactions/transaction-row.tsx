import { categoryDefinition, type RecentTransaction, type Transaction } from '@ardoise/shared';
import { StyleSheet, View } from 'react-native';

import { Breadcrumb } from '@/components/breadcrumb';
import { Card } from '@/components/card';
import { MedallionBadge } from '@/components/medallion-badge';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

import { centsToText } from './amount-input';
import { balanceTone } from './balance-display';

export interface TransactionRowProps {
  transaction: Transaction;
  /** The signed-in member, to compute "what this one means for me". */
  viewerId: string;
  /** Omitted (e.g. on an archived, read-only group) renders a plain, unpressable row. */
  onPress?: (transaction: Transaction) => void;
  /**
   * Where it happened, for a list that spans several groups — the home
   * screen's own (`docs/specs/home.md`). Omitted inside a group, where every
   * row is from the same one and saying so would be noise.
   */
  group?: RecentTransaction['group'];
}

const kindLabels: Record<Transaction['kind'], string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
};

/** "11 Sep" — parsed as local midnight, so no time-zone day shift. */
function formatOccurredOn(occurredOn: string): string {
  return new Date(`${occurredOn}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

/**
 * What this transaction means for the viewer, in the same sign convention as
 * the group's balances: positive means it moved money toward them.
 */
function myShareCents(transaction: Transaction, viewerId: string): number {
  const sign = transaction.kind === 'income' ? -1 : 1;
  let net = 0;
  if (transaction.payer.id === viewerId) {
    net += sign * transaction.amountCents;
  }
  const participant = transaction.participants.find((p) => p.user.id === viewerId);
  if (participant) {
    net -= sign * participant.shareCents;
  }
  return net;
}

/**
 * One card of a group's transaction list — or of the home's, which passes
 * `group` so each row says where it happened. The category badge carries the
 * category's own colour, so a list reads as a spread of spending before a
 * single word of it is read.
 */
export function TransactionRow({
  transaction,
  viewerId,
  onPress,
  group,
}: TransactionRowProps) {
  const myShare = myShareCents(transaction, viewerId);
  const category = categoryDefinition(transaction.category);

  const content = (
    <View style={styles.row}>
      <MedallionBadge
        seed={transaction.id}
        content={category?.emoji ?? '🧾'}
        color={category?.color}
        size={40}
      />
      <View style={styles.text}>
        {/* The group, with its own ancestors before it: one trail reading
            "Corsica 2026 › Beach day", not a name with no place. */}
        {group ? <Breadcrumb ancestors={[...group.ancestors, { id: group.id, name: group.name }]} /> : null}
        <ThemedText numberOfLines={1}>{transaction.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatOccurredOn(transaction.occurredOn)} · {kindLabels[transaction.kind]} ·{' '}
          {transaction.payer.name}
        </ThemedText>
      </View>
      <ThemedText type="smallBold" themeColor={balanceTone(myShare)}>
        {myShare === 0 ? '—' : `${myShare > 0 ? '+' : '−'}${centsToText(Math.abs(myShare))}`}
      </ThemedText>
    </View>
  );

  if (!onPress) {
    return <Card>{content}</Card>;
  }

  return (
    <Card accessibilityLabel={transaction.title} onPress={() => onPress(transaction)}>
      {content}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
});
