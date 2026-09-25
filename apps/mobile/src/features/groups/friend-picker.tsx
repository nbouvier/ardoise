import type { FriendSummary } from '@splitcount/shared';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useFriends } from '@/features/friends/use-friends';
import { useTheme } from '@/hooks/use-theme';

export interface FriendPickerProps {
  /** Ids currently selected. */
  selected: ReadonlySet<string>;
  onToggle: (friendId: string) => void;
  /** Friends already in the group: shown ticked, and not togglable. */
  lockedIds?: ReadonlySet<string>;
  /** Shown when there is nobody left to pick. */
  emptyLabel?: string;
}

/**
 * Pick friends to put in a group. Only friends: anyone else joins through a
 * link they accept themselves, which the server enforces.
 */
export function FriendPicker({
  selected,
  onToggle,
  lockedIds,
  emptyLabel = 'Invite someone from the Friends tab first.',
}: FriendPickerProps) {
  const { status, friends, refresh } = useFriends();
  const theme = useTheme();

  if (status === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator testID="friend-picker-loading" color={theme.primary} />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.centered}>
        <ThemedText themeColor="textSecondary" style={styles.centeredText}>
          We couldn’t load your friends.
        </ThemedText>
        <Button label="Try again" variant="secondary" onPress={refresh} />
      </View>
    );
  }

  if (friends.length === 0) {
    return (
      <View style={styles.centered}>
        <ThemedText themeColor="textSecondary" style={styles.centeredText}>
          {emptyLabel}
        </ThemedText>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {friends.map((friend) => (
        <FriendOption
          key={friend.id}
          friend={friend}
          locked={lockedIds?.has(friend.id) ?? false}
          checked={(lockedIds?.has(friend.id) ?? false) || selected.has(friend.id)}
          onPress={() => onToggle(friend.id)}
        />
      ))}
    </ScrollView>
  );
}

function FriendOption({
  friend,
  checked,
  locked,
  onPress,
}: {
  friend: FriendSummary;
  checked: boolean;
  locked: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: locked }}
      disabled={locked}
      accessibilityLabel={friend.name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: checked ? theme.primarySoft : 'transparent' },
        locked && styles.locked,
        pressed && styles.pressed,
      ]}>
      <Avatar name={friend.name} picture={friend.picture} seed={friend.id} />
      <ThemedText style={styles.name}>{friend.name}</ThemedText>
      <View
        style={[
          styles.checkbox,
          { borderColor: checked ? theme.primary : theme.border },
          checked && { backgroundColor: theme.primary },
        ]}>
        {checked ? (
          <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
            ✓
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  centeredText: {
    textAlign: 'center',
  },
  list: {
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
  },
  locked: {
    opacity: 0.55,
  },
  name: {
    flex: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
