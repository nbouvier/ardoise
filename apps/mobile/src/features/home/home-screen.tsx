import type { GroupSummary, RecentTransaction } from '@splitcount/shared';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { RefreshableScrollView } from '@/components/refreshable-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/use-auth';
import { GroupRow } from '@/features/groups/group-row';
import { useGroupRowActions } from '@/features/groups/use-group-row-actions';
import { TransactionRow } from '@/features/transactions/transaction-row';
import { useTheme } from '@/hooks/use-theme';

import { HomeHero } from './home-hero';
import { useFavoriteGroups } from './use-favorite-groups';
import { useRecentTransactions } from './use-recent-transactions';

/**
 * The first screen of the app: who it is, the groups the user actually opens,
 * and the last things that touched their money (`docs/specs/home.md`).
 * Every row is a shortcut into the screen that owns the thing — the home
 * holds no state and offers no action of its own beyond the favorite stars.
 */
export function HomeScreen() {
  const favorites = useFavoriteGroups();
  const recent = useRecentTransactions();
  const rowActions = useGroupRowActions();
  const { state: authState } = useAuth();
  const viewerId = authState.status === 'signedIn' ? authState.user.id : null;
  const router = useRouter();
  // Tracked separately from the two sections' own `loading`, which is also
  // what a first load looks like: the pull-to-refresh spinner belongs to the
  // gesture, and showing it on mount would double every section's own.
  const [refreshing, setRefreshing] = useState(false);

  const openGroup = (groupId: string) =>
    router.push({ pathname: '/groups/[id]', params: { id: groupId } });

  const manageGroup = (groupId: string) =>
    router.push({ pathname: '/groups/[id]', params: { id: groupId, tab: 'manage' } });

  async function refreshAll() {
    setRefreshing(true);
    try {
      // One gesture, both sections: the spinner stays until the slower of the
      // two lands.
      await Promise.all([favorites.refresh(), recent.refresh()]);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <RefreshableScrollView
        testID="home-scroll"
        contentContainerStyle={styles.content}
        // Both sections reload together: one gesture, one meaning.
        refreshing={refreshing}
        onRefresh={() => void refreshAll()}>
        <HomeHero />

        <View style={styles.sections}>
          <Section
            title="Favorites"
            status={favorites.status}
            testID="home-favorites"
            onRetry={() => void favorites.refresh()}
            failure="We couldn’t load your favorites."
            empty="Star a group — or a friend — and it waits for you here."
            isEmpty={favorites.groups.length === 0}>
            {favorites.groups.map((group: GroupSummary) => (
              <GroupRow
                key={group.id}
                group={group}
                onPress={(favorite) => openGroup(favorite.id)}
                onToggleFavorite={favorites.toggleFavorite}
                onManage={(favorite) => manageGroup(favorite.id)}
                onArchiveToggle={rowActions.archiveToggle}
                onLeave={rowActions.confirmLeave}
                onDelete={rowActions.confirmDelete}
                favoriteBusy={favorites.favoriteBusyId === group.id}
                actionsBusy={rowActions.busyId === group.id}
                muted={group.archivedAt !== null}
              />
            ))}
          </Section>

          <Section
            title="Latest"
            status={recent.status}
            testID="home-recent"
            onRetry={() => void recent.refresh()}
            failure="We couldn’t load your latest transactions."
            empty="Transactions you’re part of show up here, from every group."
            isEmpty={recent.transactions.length === 0}>
            {recent.transactions.map((entry: RecentTransaction) => (
              <TransactionRow
                key={entry.transaction.id}
                transaction={entry.transaction}
                group={entry.group}
                viewerId={viewerId ?? ''}
                // The group, not the transaction: editing one belongs where
                // its members and balances are (`docs/specs/home.md`).
                onPress={() => openGroup(entry.group.id)}
              />
            ))}
          </Section>
        </View>
      </RefreshableScrollView>
      {rowActions.dialog}
    </ThemedView>
  );
}

/**
 * One block of the home: a quiet heading, then whatever state it is in. Each
 * section fails, loads and empties on its own — one that cannot load never
 * takes the other, or the identity above it, down with it.
 */
function Section({
  title,
  status,
  isEmpty,
  empty,
  failure,
  onRetry,
  testID,
  children,
}: {
  title: string;
  status: 'loading' | 'ready' | 'error';
  isEmpty: boolean;
  /** Said when the section loaded and there is nothing in it. */
  empty: string;
  /** Said when it could not load at all. */
  failure: string;
  /** Its own reload; the promise it returns is the pull gesture's business, not this block's. */
  onRetry: () => void;
  testID: string;
  children: ReactNode;
}) {
  const theme = useTheme();

  function body() {
    if (status === 'loading') {
      return <ActivityIndicator testID={`${testID}-loading`} color={theme.primary} />;
    }

    if (status === 'error') {
      return (
        <Card>
          <View style={styles.stateCard}>
            <ThemedText themeColor="textSecondary">{failure}</ThemedText>
            <Button label="Try again" variant="secondary" onPress={onRetry} />
          </View>
        </Card>
      );
    }

    if (isEmpty) {
      return (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            {empty}
          </ThemedText>
        </Card>
      );
    }

    return children;
  }

  return (
    <View style={styles.section} testID={testID}>
      <ThemedText type="overline" themeColor="textSecondary">
        {title}
      </ThemedText>
      {body()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  // The hero runs edge to edge, so the padding sits on the sections instead
  // of on the scroll container.
  sections: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  stateCard: {
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
});
