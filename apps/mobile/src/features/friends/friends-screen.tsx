import type { FriendSummary } from '@splitcount/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { groupsChanged } from '@/features/groups/groups-changed';
import { InvitationCodeEntry } from '@/features/invites/invitation-code-entry';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/features/auth/use-auth';
import { fetchPairGroup } from '@/lib/api/groups';
import { errorFields, logger } from '@/lib/logger';

import { InviteScreen } from './invite-screen';
import { useFriends } from './use-friends';

function FriendRow({
  friend,
  busy,
  onOpen,
  onRemove,
}: {
  friend: FriendSummary;
  busy: boolean;
  onOpen: (friend: FriendSummary) => void;
  onRemove: (friend: FriendSummary) => void;
}) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.row}>
      {/* The row opens the group the two share; "Remove" stays a separate hit area. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open your shared group with ${friend.name}`}
        disabled={busy}
        onPress={() => onOpen(friend)}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
        <Avatar name={friend.name} picture={friend.picture} />
        <ThemedText style={styles.rowName}>{friend.name}</ThemedText>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${friend.name}`}
        onPress={() => onRemove(friend)}
        style={({ pressed }) => pressed && styles.pressed}>
        <ThemedText type="small" themeColor="textSecondary" style={{ color: theme.textSecondary }}>
          Remove
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

export function FriendsScreen() {
  const { status, friends, refresh, remove } = useFriends();
  const { authorizedFetch } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [inviting, setInviting] = useState(false);
  const [opening, setOpening] = useState(false);

  /**
   * Open the group shared with a friend. It is created on first access, so
   * from here it has simply always existed.
   */
  function handleOpen(friend: FriendSummary) {
    setOpening(true);
    fetchPairGroup(authorizedFetch, friend.id)
      .then((group) => router.push({ pathname: '/groups/[id]', params: { id: group.id } }))
      .catch((error: unknown) => {
        logger.warn('groups.pair.open.failed', errorFields(error));
        Alert.alert('Can’t open', 'Check your connection and try again.');
      })
      .finally(() => setOpening(false));
  }

  function handleRemove(friend: FriendSummary) {
    Alert.alert(
      'Remove friend',
      `Remove ${friend.name} from your friends? The group you share with them, and everything in it, is deleted for you both.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            remove(friend.id)
              // The pair group went with the friendship.
              .then(() => groupsChanged.notify())
              .catch((error: unknown) => {
                logger.warn('friends.remove.failed', errorFields(error));
                Alert.alert('Could not remove', 'Please try again.');
              });
          },
        },
      ],
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Friends</ThemedText>

        {status === 'loading' ? (
          <ThemedView style={styles.centered}>
            <ActivityIndicator testID="friends-loading" color={theme.text} />
          </ThemedView>
        ) : status === 'error' ? (
          <ThemedView style={styles.centered}>
            <ThemedText themeColor="textSecondary" style={styles.centeredText}>
              We couldn’t load your friends. Check your connection and try again.
            </ThemedText>
            <Button label="Try again" variant="secondary" onPress={refresh} />
          </ThemedView>
        ) : friends.length === 0 ? (
          <ThemedView style={styles.centered}>
            <ThemedText type="subtitle">No friends yet</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.centeredText}>
              Invite someone with a link and they’ll show up here.
            </ThemedText>
          </ThemedView>
        ) : (
          <FlatList
            data={friends}
            keyExtractor={(friend) => friend.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <FriendRow
                friend={item}
                busy={opening}
                onOpen={handleOpen}
                onRemove={handleRemove}
              />
            )}
          />
        )}

        <ThemedView style={styles.footer}>
          <Button label="Invite a friend" onPress={() => setInviting(true)} />
          <InvitationCodeEntry />
        </ThemedView>
      </SafeAreaView>

      <Modal
        visible={inviting}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setInviting(false)}>
        <ThemedView style={styles.modal}>
          <SafeAreaView style={styles.modalSafeArea}>
            <InviteScreen />
            <ThemedView style={styles.modalFooter}>
              <Button label="Done" variant="secondary" onPress={() => setInviting(false)} />
            </ThemedView>
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
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowName: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  footer: {
    gap: Spacing.two,
  },
  modal: {
    flex: 1,
  },
  modalSafeArea: {
    flex: 1,
  },
  modalFooter: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
});
