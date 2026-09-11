import type { FriendSummary } from '@splitcount/shared';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFriends } from '@/features/friends/use-friends';
import { useTheme } from '@/hooks/use-theme';

export interface FriendPickerProps {
  /** Ids currently selected. */
  selected: ReadonlySet<string>;
  onToggle: (friendId: string) => void;
  /** Friends already in the group — not offered again. */
  excludeIds?: ReadonlySet<string>;
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
  excludeIds,
  emptyLabel = 'Invite someone from the Friends tab first.',
}: FriendPickerProps) {
  const { status, friends, refresh } = useFriends();
  const theme = useTheme();

  if (status === 'loading') {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator testID="friend-picker-loading" color={theme.text} />
      </ThemedView>
    );
  }

  if (status === 'error') {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText themeColor="textSecondary" style={styles.centeredText}>
          We couldn’t load your friends.
        </ThemedText>
        <Button label="Try again" variant="secondary" onPress={refresh} />
      </ThemedView>
    );
  }

  const selectable = friends.filter((friend) => !excludeIds?.has(friend.id));

  if (selectable.length === 0) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText themeColor="textSecondary" style={styles.centeredText}>
          {emptyLabel}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {selectable.map((friend) => (
        <FriendOption
          key={friend.id}
          friend={friend}
          checked={selected.has(friend.id)}
          onPress={() => onToggle(friend.id)}
        />
      ))}
    </ScrollView>
  );
}

function FriendOption({
  friend,
  checked,
  onPress,
}: {
  friend: FriendSummary;
  checked: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={friend.name}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Avatar name={friend.name} picture={friend.picture} />
      <ThemedText style={styles.name}>{friend.name}</ThemedText>
      <ThemedView
        style={[
          styles.checkbox,
          { borderColor: theme.text },
          checked && { backgroundColor: theme.text },
        ]}>
        {checked ? (
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            ✓
          </ThemedText>
        ) : null}
      </ThemedView>
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
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  name: {
    flex: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
