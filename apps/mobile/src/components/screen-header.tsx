import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandMark } from '@/components/brand-mark';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const BRAND_MARK_SIZE = 24;

export interface ScreenHeaderProps {
  title: string;
  /** One quiet trailing note: what this screen counts, appended after the title. */
  caption?: string;
  /** An action that belongs to the screen as a whole, aligned with the header. */
  action?: ReactNode;
}

/**
 * The top of a tab screen: the app's own identity (mark + name) first, the
 * current page named underneath it in smaller type. The page name no longer
 * carries the header — every tab reads as SplitCount first, this section of
 * it second. See "App header" in docs/DESIGN.md.
 */
export function ScreenHeader({ title, caption, action }: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.text}>
        <View style={styles.brandRow}>
          <BrandMark size={BRAND_MARK_SIZE} />
          <ThemedText type="sectionTitle">SplitCount</ThemedText>
        </View>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.pageTitle}>
          {caption ? `${title} · ${caption}` : title}
        </ThemedText>
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
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pageTitle: {
    marginLeft: BRAND_MARK_SIZE + Spacing.two,
  },
});
