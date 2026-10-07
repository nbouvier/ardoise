import type { Transaction } from '@ardoise/shared';
import type { ReactElement } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { AsyncState, EmptyState } from '@/components/async-state';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { TransactionRow } from '@/features/transactions/transaction-row';
import type { UseTransactionsResult } from '@/features/transactions/use-transactions';
import { useTheme } from '@/hooks/use-theme';

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

/**
 * A group's own transactions, most recent first, under whatever `header` is.
 * The next page is asked for as the end comes near (`docs/specs/transactions.md`).
 */
export function TransactionList({ result, viewerId, archived, onOpen, header }: TransactionListProps) {
  const { status, transactions, refresh, loadMore } = result;
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
      ListFooterComponent={rows.length > 0 ? <MoreFooter result={result} /> : null}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
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

/**
 * Under the last row: a spinner while the next page is on its way, so it
 * reads as "more is coming" rather than the end of the list; what went wrong
 * with a way to try again if it failed; nothing once everything is in.
 */
function MoreFooter({ result }: { result: UseTransactionsResult }) {
  const theme = useTheme();

  if (result.moreStatus === 'loading') {
    return (
      <View style={styles.footer}>
        <ActivityIndicator testID="transactions-loading-more" color={theme.primary} />
      </View>
    );
  }
  if (result.moreStatus === 'error') {
    return (
      <View style={styles.footer}>
        <ThemedText themeColor="textSecondary" style={styles.footerText}>
          We couldn’t load more transactions.
        </ThemedText>
        <Button label="Try again" variant="secondary" onPress={result.retryMore} />
      </View>
    );
  }
  return null;
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
  footer: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  footerText: {
    textAlign: 'center',
  },
});
