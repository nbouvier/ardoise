import { categoryDefinition, type Transaction } from '@splitcount/shared';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { centsToText } from './amount-input';
import { balanceTone } from './balance-display';

export interface TransactionRowProps {
  transaction: Transaction;
  /** The signed-in member, to compute "what this one means for me". */
  viewerId: string;
  /** Omitted (e.g. on an archived, read-only group) renders a plain, unpressable row. */
  onPress?: (transaction: Transaction) => void;
  /** Tapping the category badge — a faster path than opening the full edit sheet. Omitted disables it, same as `onPress`. */
  onCategoryPress?: (transaction: Transaction) => void;
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

/** One row of a group's transaction list. */
export function TransactionRow({ transaction, viewerId, onPress, onCategoryPress }: TransactionRowProps) {
  const theme = useTheme();
  const myShare = myShareCents(transaction, viewerId);
  // Every transaction has a category (`other` when none was chosen); the
  // fallback emoji only guards against a key this build doesn't recognise.
  const category = categoryDefinition(transaction.category);

  const content = (
    <>
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <ThemedText numberOfLines={1} style={styles.title}>
            {transaction.title}
          </ThemedText>
          {onCategoryPress ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Category: ${category?.label ?? 'Other'}`}
              onPress={() => onCategoryPress(transaction)}
              style={[styles.categoryBadge, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.categoryEmoji}>{category?.emoji ?? '🧾'}</ThemedText>
            </Pressable>
          ) : (
            <View style={[styles.categoryBadge, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.categoryEmoji}>{category?.emoji ?? '🧾'}</ThemedText>
            </View>
          )}
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {formatOccurredOn(transaction.occurredOn)} · {kindLabels[transaction.kind]} ·{' '}
          {transaction.payer.name}
        </ThemedText>
      </View>
      <ThemedText type="smallBold" themeColor={balanceTone(myShare)}>
        {myShare === 0 ? '—' : `${myShare > 0 ? '+' : '−'}${centsToText(Math.abs(myShare))}`}
      </ThemedText>
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={transaction.title}
      onPress={() => onPress(transaction)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    flexShrink: 1,
  },
  categoryBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: {
    fontSize: 13,
  },
  pressed: {
    opacity: 0.6,
  },
});
