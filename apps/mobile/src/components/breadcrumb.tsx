import type { GroupAncestor } from '@splitcount/shared';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

export interface BreadcrumbProps {
  /** Every ancestor of the group, root first. Renders nothing when empty. */
  ancestors: readonly GroupAncestor[];
  /**
   * Makes each ancestor its own hit area. Omitted, the trail is plain text —
   * what a row in a list wants, where the row itself is already the target
   * and a nested pressable would steal the tap.
   */
  onOpen?: (groupId: string) => void;
}

/**
 * Where a sub-group sits, above its name: its ancestors root first, separated
 * by chevrons, in the quietest type the app has. Shown wherever a group is
 * named away from its parent — its own page's header, and its row in any list
 * that can mix depths (`docs/specs/home.md`).
 */
export function Breadcrumb({ ancestors, onOpen }: BreadcrumbProps) {
  if (ancestors.length === 0) {
    return null;
  }

  return (
    <View style={styles.trail}>
      {ancestors.map((ancestor, index) => (
        <View key={ancestor.id} style={styles.item}>
          {index > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {' › '}
            </ThemedText>
          ) : null}
          {onOpen ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ancestor.name}
              onPress={() => onOpen(ancestor.id)}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedText type="smallBold" themeColor="primary" numberOfLines={1}>
                {ancestor.name}
              </ThemedText>
            </Pressable>
          ) : (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {ancestor.name}
            </ThemedText>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  trail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.5,
  },
});
