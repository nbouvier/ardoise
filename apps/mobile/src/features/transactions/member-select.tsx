import type { FriendSummary } from '@splitcount/shared';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
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
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Avatar name={member.name} picture={member.picture} size={32} />
      <ThemedText style={styles.name}>{member.name}</ThemedText>
      <View
        style={[
          styles.radio,
          { borderColor: theme.text },
          selected && { backgroundColor: theme.text },
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
  },
  name: {
    flex: 1,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.6,
  },
});
