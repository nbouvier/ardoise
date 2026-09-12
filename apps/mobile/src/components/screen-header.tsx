import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export interface ScreenHeaderProps {
  title: string;
  /** One quiet line under the title: what this screen is for, or what it counts. */
  caption?: string;
  /** An action that belongs to the screen as a whole, aligned with the title. */
  action?: ReactNode;
}

/**
 * The top of a tab screen: a large title, an optional caption, and room for a
 * single screen-level action. Every tab opens the same way, so switching tabs
 * never feels like switching apps.
 */
export function ScreenHeader({ title, caption, action }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.text}>
        <ThemedText type="subtitle">{title}</ThemedText>
        {caption ? (
          <ThemedText type="small" themeColor="textSecondary">
            {caption}
          </ThemedText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
});
