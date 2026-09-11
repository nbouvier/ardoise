import type { GroupSummary } from '@splitcount/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { InvitationCodeEntry } from '@/features/invites/invitation-code-entry';
import { useTheme } from '@/hooks/use-theme';

import { CreateGroupScreen } from './create-group-screen';
import { GroupRow } from './group-row';
import { useGroups } from './use-groups';

export function GroupsScreen() {
  const { status, active, archived, refresh } = useGroups();
  const router = useRouter();
  const theme = useTheme();
  const [creating, setCreating] = useState(false);
  // Archived groups are out of the way by default: the list is about what is
  // still going on.
  const [showArchived, setShowArchived] = useState(false);

  const open = (group: GroupSummary) =>
    router.push({ pathname: '/groups/[id]', params: { id: group.id } });

  function handleCreated(group: GroupSummary) {
    setCreating(false);
    open(group);
  }

  /** The archived section, below the active groups and behind a toggle. */
  const archivedSection =
    archived.length === 0 ? null : (
      <ThemedView style={styles.archivedSection}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowArchived((shown) => !shown)}
          style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
          <ThemedText type="small" themeColor="textSecondary">
            {showArchived
              ? 'Hide archived'
              : `Show archived (${archived.length})`}
          </ThemedText>
        </Pressable>

        {showArchived
          ? archived.map((group) => (
              <GroupRow key={group.id} group={group} onPress={open} muted />
            ))
          : null}
      </ThemedView>
    );

  function body() {
    if (status === 'loading') {
      return (
        <ThemedView style={styles.centered}>
          <ActivityIndicator testID="groups-loading" color={theme.text} />
        </ThemedView>
      );
    }

    if (status === 'error') {
      return (
        <ThemedView style={styles.centered}>
          <ThemedText themeColor="textSecondary" style={styles.centeredText}>
            We couldn’t load your groups. Check your connection and try again.
          </ThemedText>
          <Button label="Try again" variant="secondary" onPress={refresh} />
        </ThemedView>
      );
    }

    if (active.length === 0 && archived.length === 0) {
      return (
        <ThemedView style={styles.centered}>
          <ThemedText type="subtitle">No groups yet</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.centeredText}>
            A group is where you and other people track what you share.
          </ThemedText>
        </ThemedView>
      );
    }

    return (
      <FlatList
        data={active}
        keyExtractor={(group) => group.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <GroupRow group={item} onPress={open} />}
        ListFooterComponent={archivedSection}
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Groups</ThemedText>

        {body()}

        <ThemedView style={styles.footer}>
          <Button label="Create a group" onPress={() => setCreating(true)} />
          <InvitationCodeEntry />
        </ThemedView>
      </SafeAreaView>

      <Modal
        visible={creating}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCreating(false)}>
        <ThemedView style={styles.modal}>
          <SafeAreaView style={styles.modal}>
            <CreateGroupScreen
              onCreated={handleCreated}
              onCancel={() => setCreating(false)}
            />
          </SafeAreaView>
        </ThemedView>
      </Modal>
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
    paddingBottom: BottomTabInset + Spacing.three,
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
  list: {
    paddingVertical: Spacing.two,
  },
  footer: {
    gap: Spacing.two,
  },
  archivedSection: {
    marginTop: Spacing.three,
  },
  toggle: {
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.6,
  },
  modal: {
    flex: 1,
  },
});
