import type { GroupSummary } from '@splitcount/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { Icon, type IconName } from '@/components/icon';
import { IconButton } from '@/components/icon-button';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { InvitationCodeEntry } from '@/features/invites/invitation-code-entry';
import { useTheme } from '@/hooks/use-theme';

import { CreateGroupScreen } from './create-group-screen';
import { GroupRow } from './group-row';
import { useGroups } from './use-groups';

/** One row of the "+" action menu: a small brand-washed glyph and a label. */
function MenuRow({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}>
      <View style={[styles.menuIcon, { backgroundColor: theme.primarySoft }]}>
        <Icon name={icon} size={18} color={theme.onPrimarySoft} />
      </View>
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

export function GroupsScreen() {
  const { status, active, archived, refresh } = useGroups();
  const router = useRouter();
  const theme = useTheme();
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
      <View style={styles.archivedSection}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowArchived((shown) => !shown)}
          style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
          <ThemedText type="smallBold" themeColor="primary">
            {showArchived ? 'Hide archived' : `Show archived (${archived.length})`}
          </ThemedText>
        </Pressable>

        {showArchived ? (
          <View style={styles.archivedList}>
            {archived.map((group) => (
              <GroupRow key={group.id} group={group} onPress={open} muted />
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
            <ThemedText type="sectionTitle">No groups yet</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.centeredText}>
              A group is where you and other people track what you share.
            </ThemedText>
          </Card>
        </View>
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

  const activeCount =
    active.length === 0 ? undefined : active.length === 1 ? '1 group' : `${active.length} groups`;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Groups" caption={activeCount} />

        {body()}

        <View style={styles.footer}>
          <IconButton
            icon="plus"
            accessibilityLabel="Add a group"
            onPress={() => setMenuOpen(true)}
          />
        </View>
      </SafeAreaView>

      <Modal
        visible={menuOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuWrap}>
            <Card style={styles.menu}>
              <MenuRow
                icon="plus"
                label="Create a group"
                onPress={() => {
                  setMenuOpen(false);
                  setCreating(true);
                }}
              />
              <View style={[styles.menuDivider, { backgroundColor: theme.border }]} />
              <MenuRow
                icon="link"
                label="Join a group"
                onPress={() => {
                  setMenuOpen(false);
                  setJoining(true);
                }}
              />
            </Card>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={creating}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCreating(false)}>
        <ThemedView style={styles.modal}>
          <SafeAreaView style={styles.modal}>
            <CreateGroupScreen onCreated={handleCreated} onCancel={() => setCreating(false)} />
          </SafeAreaView>
        </ThemedView>
      </Modal>

      <Modal
        visible={joining}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setJoining(false)}>
        <ThemedView style={styles.modal}>
          <SafeAreaView style={styles.modal}>
            <View style={styles.sheetContent}>
              <ThemedText type="subtitle">Join a group</ThemedText>
              <InvitationCodeEntry onSubmitted={() => setJoining(false)} />
              <Button label="Cancel" variant="ghost" onPress={() => setJoining(false)} />
            </View>
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
  footer: {
    alignItems: 'flex-end',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three + 64,
  },
  menuWrap: {
    width: 220,
  },
  menu: {
    padding: Spacing.two,
    gap: Spacing.one,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuDivider: {
    height: 1,
  },
  sheetContent: {
    flex: 1,
    gap: Spacing.three,
    padding: Spacing.four,
  },
  archivedSection: {
    marginTop: Spacing.three,
    gap: Spacing.two,
  },
  archivedList: {
    gap: Spacing.two,
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
