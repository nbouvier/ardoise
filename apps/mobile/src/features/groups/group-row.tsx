import type { GroupSummary } from '@splitcount/shared';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export interface GroupRowProps {
  group: GroupSummary;
  onPress: (group: GroupSummary) => void;
  /** Muted rendering for an archived group. */
  muted?: boolean;
}

/** One line of the group list: name, size, and the fact that it is over. */
export function GroupRow({ group, onPress, muted = false }: GroupRowProps) {
  const members =
    group.memberCount === 1 ? '1 member' : `${group.memberCount} members`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={group.name}
      onPress={() => onPress(group)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <ThemedView style={[styles.text, muted && styles.muted]}>
        <ThemedText numberOfLines={1}>{group.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {muted ? `${members} · archived` : members}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: Spacing.three,
  },
  text: {
    gap: Spacing.half,
  },
  muted: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.6,
  },
});
