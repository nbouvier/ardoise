import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandMark } from '@/components/brand-mark';
import { PageHero } from '@/components/page-hero';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const BRAND_MARK_SIZE = 40;

export interface ScreenHeaderProps {
  title: string;
  /** One quiet trailing note: what this screen counts, appended after the title. */
  caption?: string;
  /** An action that belongs to the screen as a whole, aligned with the header. */
  action?: ReactNode;
  /**
   * Wraps the header in `PageHero`'s decorative wash (`docs/specs/home.md`).
   * The header must then be the screen's own first element, outside any
   * padded wrapper — `PageHero` owns its own padding and safe-area inset.
   */
  wash?: boolean;
}

/**
 * The top of a tab screen: the app's own identity (mark + name) first, the
 * current page named underneath it in smaller type. The mark stands as tall
 * as those two lines together, so it reads as one identity block rather than
 * being sized to just the wordmark. See "App header" in docs/DESIGN.md.
 */
export function ScreenHeader({ title, caption, action, wash = false }: ScreenHeaderProps) {
  const header = (
    <View style={styles.header}>
      <BrandMark size={BRAND_MARK_SIZE} />
      <View style={styles.text}>
        <ThemedText type="sectionTitle">SplitCount</ThemedText>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {caption ? `${title} · ${caption}` : title}
        </ThemedText>
      </View>
      {action}
    </View>
  );

  return wash ? <PageHero>{header}</PageHero> : header;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
});
