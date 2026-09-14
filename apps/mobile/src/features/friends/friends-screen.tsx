import type { FriendEntry } from '@splitcount/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddMenuButton } from '@/components/add-menu-button';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { FavoriteStar } from '@/components/favorite-star';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { groupsChanged } from '@/features/groups/groups-changed';
import { InvitationCodeEntry } from '@/features/invites/invitation-code-entry';
import { balanceTone, balanceWithPerson } from '@/features/transactions/balance-display';
import { useTheme } from '@/hooks/use-theme';
import { errorFields, logger } from '@/lib/logger';

import { InviteScreen } from './invite-screen';
import { useFriends } from './use-friends';

function FriendRow({
  friend,
  favoriteBusy,
  onOpen,
  onRemove,
  onToggleFavorite,
}: {
  friend: FriendEntry;
  /** Disables the star while its own toggle request is in flight. */
  favoriteBusy: boolean;
  onOpen: (friend: FriendEntry) => void;
  onRemove: (friend: FriendEntry) => void;
  onToggleFavorite: (friend: FriendEntry) => void;
}) {
  return (
    <Card>
      <View style={styles.row}>
        {/* The row opens the group the two share; "Remove" stays a separate hit area. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open your shared group with ${friend.name}`}
          onPress={() => onOpen(friend)}
          style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
          <Avatar name={friend.name} picture={friend.picture} size={44} seed={friend.id} />
          <View style={styles.rowText}>
            <ThemedText numberOfLines={1}>{friend.name}</ThemedText>
            {/* Netted across every group the two share — see docs/specs/balances.md. */}
            <ThemedText type="smallBold" themeColor={balanceTone(friend.balanceCents)}>
              {balanceWithPerson(friend.balanceCents)}
            </ThemedText>
          </View>
        </Pressable>

        <FavoriteStar
          favorite={friend.favorite}
          label={friend.name}
          disabled={favoriteBusy}
          onToggle={() => onToggleFavorite(friend)}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${friend.name}`}
          onPress={() => onRemove(friend)}
          style={({ pressed }) => [styles.remove, pressed && styles.pressed]}>
          <ThemedText type="small" themeColor="textSecondary">
            Remove
          </ThemedText>
        </Pressable>
      </View>
    </Card>
  );
}

export function FriendsScreen() {
  const { status, friends, refresh, remove, toggleFavorite, favoriteBusyId } = useFriends();
  const router = useRouter();
  const theme = useTheme();
  const [inviting, setInviting] = useState(false);
  const [joining, setJoining] = useState(false);

  /** Open the group shared with a friend — it always exists by now. */
  function handleOpen(friend: FriendEntry) {
    router.push({ pathname: '/groups/[id]', params: { id: friend.groupId } });
  }

  function handleRemove(friend: FriendEntry) {
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

  const friendCount =
    friends.length === 0
      ? undefined
      : friends.length === 1
        ? '1 friend'
        : `${friends.length} friends`;

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title="Friends" caption={friendCount} wash />

      <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.body}>
          {status === 'loading' ? (
            <View style={styles.centered}>
              <ActivityIndicator testID="friends-loading" color={theme.primary} />
            </View>
          ) : status === 'error' ? (
            <View style={styles.centered}>
              <ThemedText themeColor="textSecondary" style={styles.centeredText}>
                We couldn’t load your friends. Check your connection and try again.
              </ThemedText>
              <Button label="Try again" variant="secondary" onPress={refresh} />
            </View>
          ) : friends.length === 0 ? (
            <View style={styles.centered}>
              <Card tone="brand" style={styles.empty}>
                <ThemedText style={styles.emptyGlyph}>🤝</ThemedText>
                <ThemedText type="sectionTitle">No friends yet</ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.centeredText}>
                  Invite someone with a link and they’ll show up here.
                </ThemedText>
              </Card>
            </View>
          ) : (
            <FlatList
              data={friends}
              keyExtractor={(friend) => friend.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <FriendRow
                  friend={item}
                  favoriteBusy={favoriteBusyId === item.id}
                  onOpen={handleOpen}
                  onRemove={handleRemove}
                  onToggleFavorite={toggleFavorite}
                />
              )}
            />
          )}
        </View>

        <AddMenuButton
          label="Add a friend"
          options={[
            { icon: 'plus', label: 'Invite a friend', onPress: () => setInviting(true) },
            { icon: 'key', label: 'Enter a code', onPress: () => setJoining(true) },
          ]}
        />
      </SafeAreaView>

      <Modal
        visible={inviting}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setInviting(false)}>
        <ThemedView style={styles.modal}>
          <SafeAreaView style={styles.modalSafeArea}>
            <InviteScreen />
            <View style={styles.modalFooter}>
              <Button label="Done" variant="secondary" onPress={() => setInviting(false)} />
            </View>
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
              <ThemedText type="subtitle">Enter a code</ThemedText>
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
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  body: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    // The star aligns with the name line specifically, not the row's full
    // height (`docs/specs/favorites.md`) — the row also carries a balance
    // beneath the name.
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  remove: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  pressed: {
    opacity: 0.6,
  },
  sheetContent: {
    flex: 1,
    gap: Spacing.three,
    padding: Spacing.four,
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
