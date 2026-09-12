import type { FriendSummary } from '@splitcount/shared';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface MemberSelectProps {
  members: FriendSummary[];
  selectedId: string | null;
  onSelect: (userId: string) => void;
  /** A member to leave out of the list — typically the payer, for "who to". */
  excludeId?: string | null;
}

/**
 * Single-select member list — who paid, or who a transfer goes to. Group
 * members, not friends: anyone currently in the group is a valid choice,
 * whether or not the caller is friends with them.
 */
export function MemberSelect({ members, selectedId, onSelect, excludeId }: MemberSelectProps) {
  const selectable = members.filter((member) => member.id !== excludeId);

  return (
    <View style={styles.list}>
      {selectable.map((member) => (
        <MemberOption
          key={member.id}
          member={member}
          selected={member.id === selectedId}
          onPress={() => onSelect(member.id)}
        />
      ))}
    </View>
  );
}

function MemberOption({
  member,
  selected,
  onPress,
}: {
  member: FriendSummary;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={member.name}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        // The selected member is a filled row, not just a filled dot: what the
        // eye lands on first when reopening a pre-filled form.
        { backgroundColor: selected ? theme.primarySoft : 'transparent' },
        pressed && styles.pressed,
      ]}>
      <Avatar name={member.name} picture={member.picture} size={32} seed={member.id} />
      <ThemedText style={styles.name}>{member.name}</ThemedText>
      <View
        style={[
          styles.radio,
          { borderColor: selected ? theme.primary : theme.border },
          selected && { backgroundColor: theme.primary },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
  },
  name: {
    flex: 1,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
  pressed: {
    opacity: 0.6,
  },
});
