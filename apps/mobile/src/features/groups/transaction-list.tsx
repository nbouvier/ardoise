import type { Transaction } from '@ardoise/shared';
import type { ReactElement } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { AsyncState, EmptyState } from '@/components/async-state';
import { Spacing } from '@/constants/theme';
import { TransactionRow } from '@/features/transactions/transaction-row';
import type { UseTransactionsResult } from '@/features/transactions/use-transactions';

export interface TransactionListProps {
  result: UseTransactionsResult;
  viewerId: string | null;
  archived: boolean;
  onOpen: (transaction: Transaction) => void;
  /**
   * What sits above the rows — the sub-groups and the list's own heading.
   * Part of the list, so it scrolls away with it rather than taking a fixed
   * share of the screen however many sub-groups there are.
   */
  header: ReactElement;
}

/** A group's own transactions, most recent first, under whatever `header` is. */
export function TransactionList({ result, viewerId, archived, onOpen, header }: TransactionListProps) {
  const { status, transactions, refresh } = result;
  const rows = status === 'ready' && viewerId ? transactions : [];

  return (
    <FlatList
      testID="transactions-list"
      data={rows}
      keyExtractor={(transaction) => transaction.id}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.header}
      // Loading, failed, or nothing recorded yet: in the space below the header.
      ListEmptyComponent={
        <AsyncState
          status={status}
          loadingTestID="transactions-loading"
          failure="We couldn’t load the transactions. Check your connection and try again."
          onRetry={refresh}
          style={styles.state}>
          <EmptyState
            glyph="🧾"
            message={
              archived
                ? 'This group has no transactions.'
                : 'No transactions yet. Add one to start tracking what you share.'
            }
            style={styles.state}
          />
        </AsyncState>
      }
      contentContainerStyle={styles.content}
      renderItem={({ item }) => (
        <TransactionRow
          transaction={item}
          viewerId={viewerId!}
          onPress={archived ? undefined : onOpen}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  // Grows to the full height, so an empty state can centre itself in what is
  // left below the header.
  content: {
    flexGrow: 1,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
  header: {
    gap: Spacing.three,
    paddingBottom: Spacing.one,
  },
  state: {
    padding: Spacing.four,
  },
});
