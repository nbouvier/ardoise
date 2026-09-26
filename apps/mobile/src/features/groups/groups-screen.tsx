import type { GroupSummary } from '@splitcount/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ListDivider } from '@/components/list-divider';
import { RefreshableScrollView } from '@/components/refreshable-scroll-view';
import { ScreenHeader } from '@/components/screen-header';
import { SheetModal } from '@/components/sheet-modal';
import { TextAction } from '@/components/text-action';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { CreateGroupScreen } from './create-group-screen';
import { GroupRow } from './group-row';
import { useGroupRowActions } from './use-group-row-actions';
import { useGroups } from './use-groups';

export function GroupsScreen() {
  const {
    status,
    active,
    archived,
    refresh,
    pullRefresh,
    refreshing,
    toggleFavorite,
    favoriteBusyId,
  } = useGroups();
  const rowActions = useGroupRowActions();
  const router = useRouter();
  const theme = useTheme();
  const [creating, setCreating] = useState(false);
  // Archived groups are out of the way by default: the list is about what is
  // still going on.
  const [showArchived, setShowArchived] = useState(false);

  // A star moves a group between the two at once — the move is its feedback.
  const favorites = active.filter((group) => group.favorite);
  const others = active.filter((group) => !group.favorite);

  const open = (group: GroupSummary) =>
    router.push({ pathname: '/groups/[id]', params: { id: group.id } });

  const manage = (group: GroupSummary) =>
    router.push({ pathname: '/groups/[id]', params: { id: group.id, tab: 'manage' } });

  function handleCreated(group: GroupSummary) {
    setCreating(false);
    open(group);
  }

  /** The archived section, below the active groups and behind a toggle. */
  const archivedSection =
    archived.length === 0 ? null : (
      <View style={styles.archivedSection}>
        <TextAction
          label={showArchived ? 'Hide archived' : `Show archived (${archived.length})`}
          onPress={() => setShowArchived((shown) => !shown)}
          style={styles.toggle}
        />

        {showArchived ? (
          <View style={styles.archivedList}>
            {archived.map((group) => (
              <GroupRow
                key={group.id}
                group={group}
                onPress={open}
                onToggleFavorite={toggleFavorite}
                onManage={manage}
                onArchiveToggle={rowActions.archiveToggle}
                onLeave={rowActions.confirmLeave}
                onDelete={rowActions.confirmDelete}
                favoriteBusy={favoriteBusyId === group.id}
                actionsBusy={rowActions.busyId === group.id}
                muted
              />
            ))}
          </View>
        ) : null}
      </View>
    );

  function body() {
    if (status === 'loading') {
      return (
        <View style={styles.centered}>
          <ActivityIndicator testID="groups-loading" color={theme.primary} />
        </View>
      );
    }

    if (status === 'error') {
      return (
        <View style={styles.centered}>
          <ThemedText themeColor="textSecondary" style={styles.centeredText}>
            We couldn’t load your groups. Check your connection and try again.
          </ThemedText>
          <Button label="Try again" variant="secondary" onPress={refresh} />
        </View>
      );
    }

    if (active.length === 0 && archived.length === 0) {
      return (
        <View style={styles.centered}>
          <Card tone="brand" style={styles.empty}>
            <ThemedText style={styles.emptyGlyph}>👥</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.centeredText}>
              No groups yet. Create one, or join one with a code, to start tracking what you share.
            </ThemedText>
          </Card>
        </View>
      );
    }

    const row = (group: GroupSummary) => (
      <GroupRow
        key={group.id}
        group={group}
        onPress={open}
        onToggleFavorite={toggleFavorite}
        onManage={manage}
        onArchiveToggle={rowActions.archiveToggle}
        onLeave={rowActions.confirmLeave}
        onDelete={rowActions.confirmDelete}
        favoriteBusy={favoriteBusyId === group.id}
        actionsBusy={rowActions.busyId === group.id}
      />
    );

    return (
      <RefreshableScrollView
        testID="groups-list"
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={pullRefresh}>
        {favorites.map(row)}
        {favorites.length > 0 && others.length > 0 ? <ListDivider /> : null}
        {others.map(row)}
        {archivedSection}
      </RefreshableScrollView>
    );
  }

  const activeCount =
    active.length === 0 ? undefined : active.length === 1 ? '1 group' : `${active.length} groups`;

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title="Groups" caption={activeCount} wash />

      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.actionRow}>
          <TextAction label="+ Join or Create" onPress={() => setCreating(true)} />
        </View>

        <View style={styles.body}>{body()}</View>
      </SafeAreaView>

      <SheetModal visible={creating} onClose={() => setCreating(false)}>
        <CreateGroupScreen onCreated={handleCreated} onClose={() => setCreating(false)} />
      </SheetModal>

      {rowActions.dialog}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  centeredText: {
    textAlign: 'center',
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  emptyGlyph: {
    fontSize: 40,
    lineHeight: 48,
  },
  list: {
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  body: {
    flex: 1,
  },
  actionRow: {
    alignItems: 'flex-end',
  },
  archivedSection: {
    marginTop: Spacing.three,
    gap: Spacing.two,
  },
  archivedList: {
    gap: Spacing.two,
  },
  toggle: {
    alignSelf: 'flex-start',
    marginVertical: Spacing.one,
  },
});
