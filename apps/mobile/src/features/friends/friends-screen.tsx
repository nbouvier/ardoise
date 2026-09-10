import type { FriendSummary } from '@splitcount/shared';
import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { errorFields, logger } from '@/lib/logger';

import { InviteScreen } from './invite-screen';
import { pendingInvite } from './pending-invite';
import { useFriends } from './use-friends';

function FriendRow({
  friend,
  onRemove,
}: {
  friend: FriendSummary;
  onRemove: (friend: FriendSummary) => void;
}) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.row}>
      {friend.picture ? (
        <Image source={{ uri: friend.picture }} style={styles.avatar} contentFit="cover" />
      ) : (
        <ThemedView type="backgroundElement" style={[styles.avatar, styles.avatarFallback]}>
          <ThemedText>{friend.name.charAt(0).toUpperCase()}</ThemedText>
        </ThemedView>
      )}
      <ThemedText style={styles.rowName}>{friend.name}</ThemedText>
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
  const theme = useTheme();
  const [inviting, setInviting] = useState(false);
  const [code, setCode] = useState('');

  function handleRemove(friend: FriendSummary) {
    Alert.alert('Remove friend', `Remove ${friend.name} from your friends?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          remove(friend.id).catch((error: unknown) => {
            logger.warn('friends.remove.failed', errorFields(error));
            Alert.alert('Could not remove', 'Please try again.');
          });
        },
      },
    ]);
  }

  function handleUseCode() {
    pendingInvite.set(code);
    setCode('');
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
            renderItem={({ item }) => <FriendRow friend={item} onRemove={handleRemove} />}
          />
        )}

        <ThemedView style={styles.footer}>
          <Button label="Invite a friend" onPress={() => setInviting(true)} />

          <ThemedText type="small" themeColor="textSecondary">
            Got an invitation code?
          </ThemedText>
          <ThemedView style={styles.codeRow}>
            <TextInput
              accessibilityLabel="Invitation code"
              placeholder="Paste it here"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              value={code}
              onChangeText={setCode}
              onSubmitEditing={handleUseCode}
              style={[
                styles.codeInput,
                { color: theme.text, backgroundColor: theme.backgroundElement },
              ]}
            />
            <Button
              label="Open"
              variant="secondary"
              disabled={code.trim().length === 0}
              onPress={handleUseCode}
            />
          </ThemedView>
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
  rowName: {
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  footer: {
    gap: Spacing.two,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  codeInput: {
    flex: 1,
    height: 52,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
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
