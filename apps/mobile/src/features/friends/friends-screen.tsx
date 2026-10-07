import type { FriendEntry } from '@ardoise/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { ListDivider } from '@/components/list-divider';
import { RefreshableScrollView } from '@/components/refreshable-scroll-view';
import { FavoriteStar } from '@/components/favorite-star';
import { IconMenuButton } from '@/components/icon-menu-button';
import { ScreenHeader } from '@/components/screen-header';
import { SheetModal } from '@/components/sheet-modal';
import { TextAction } from '@/components/text-action';
import { ThemedText } from '@/components/themed-text';
import { useDialog } from '@/components/use-dialog';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { balanceTone, balanceWithPerson } from '@/features/transactions/balance-display';
import { useTheme } from '@/hooks/use-theme';
import { errorFields, logger } from '@/lib/logger';
import { useInvalidation } from '@/lib/query/use-invalidation';

import { NewFriendScreen } from './new-friend-screen';
import {
  isUnsettledRemoval,
  UNSETTLED_REMOVAL_TITLE,
  unsettledRemovalMessage,
} from './unsettled-removal';
import { useFriends } from './use-friends';

function FriendRow({
  friend,
  favoriteBusy,
  onOpen,
  onManage,
  onRemove,
  onToggleFavorite,
}: {
  friend: FriendEntry;
  /** Disables the star while its own toggle request is in flight. */
  favoriteBusy: boolean;
  onOpen: (friend: FriendEntry) => void;
  onManage: (friend: FriendEntry) => void;
  onRemove: (friend: FriendEntry) => void;
  onToggleFavorite: (friend: FriendEntry) => void;
}) {
  return (
    <Card>
      <View style={styles.row}>
        {/* The row opens the group the two share; the star and "⋮" stay separate hit areas. */}
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

        <IconMenuButton
          accessibilityLabel={`Actions for ${friend.name}`}
          options={[
            { icon: 'manage', label: 'Manage', onPress: () => onManage(friend) },
            {
              icon: 'trash',
              label: 'Delete friend',
              destructive: true,
              onPress: () => onRemove(friend),
            },
          ]}
        />
      </View>
    </Card>
  );
}

export function FriendsScreen() {
  const {
    status,
    friends,
    refresh,
    pullRefresh,
    refreshing,
    remove,
    toggleFavorite,
    favoriteBusyId,
  } = useFriends();
  const router = useRouter();
  const theme = useTheme();
  const [adding, setAdding] = useState(false);
  const { dialog, confirm, inform } = useDialog();
  const invalidation = useInvalidation();

  /** Open the group shared with a friend — it always exists by now. */
  function handleOpen(friend: FriendEntry) {
    router.push({ pathname: '/groups/[id]', params: { id: friend.groupId } });
  }

  /** Same destination as the "⋮" menus elsewhere: the shared group's Manage tab. */
  function handleManage(friend: FriendEntry) {
    router.push({
      pathname: '/groups/[id]',
      params: { id: friend.groupId, tab: 'manage' },
    });
  }

  function handleRemove(friend: FriendEntry) {
    confirm({
      title: 'Delete friend',
      message: `Delete ${friend.name} from your friends? The group you share with them, and everything in it, is deleted for you both.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: () => {
        remove(friend.id)
          // The pair group went with the friendship.
          .then(() => invalidation.groupsChanged())
          .catch((error: unknown) => {
            logger.warn('friends.remove.failed', errorFields(error));
            if (isUnsettledRemoval(error)) {
              inform(UNSETTLED_REMOVAL_TITLE, unsettledRemovalMessage(friend.name));
            } else {
              inform('Could not remove', 'Please try again.');
            }
          });
      },
    });
  }

  // A star moves a friend between the two at once — the move is its feedback.
  const favorites = friends.filter((friend) => friend.favorite);
  const others = friends.filter((friend) => !friend.favorite);

  const row = (friend: FriendEntry) => (
    <FriendRow
      key={friend.id}
      friend={friend}
      favoriteBusy={favoriteBusyId === friend.id}
      onOpen={handleOpen}
      onManage={handleManage}
      onRemove={handleRemove}
      onToggleFavorite={toggleFavorite}
    />
  );

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
        <View style={styles.actionRow}>
          <TextAction label="+ Add or Invite" onPress={() => setAdding(true)} />
        </View>

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
                <ThemedText themeColor="textSecondary" style={styles.centeredText}>
                  No friends yet. Invite someone with a link and they’ll show up here.
                </ThemedText>
              </Card>
            </View>
          ) : (
            <RefreshableScrollView
              contentContainerStyle={styles.list}
              refreshing={refreshing}
              onRefresh={pullRefresh}>
              {favorites.map(row)}
              {favorites.length > 0 && others.length > 0 ? <ListDivider /> : null}
              {others.map(row)}
            </RefreshableScrollView>
          )}
        </View>
      </SafeAreaView>

      <SheetModal visible={adding} onClose={() => setAdding(false)}>
        <NewFriendScreen onClose={() => setAdding(false)} />
      </SheetModal>

      {dialog}
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
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  body: {
    flex: 1,
  },
  actionRow: {
    alignItems: 'flex-end',
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
  pressed: {
    opacity: 0.6,
  },
});
