import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BrandMark } from '@/components/brand-mark';
import { HeroWash } from '@/components/hero-wash';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const BRAND_MARK_SIZE = 40;

export interface ScreenHeaderProps {
  title: string;
  /** One quiet trailing note: what this screen counts, appended after the title. */
  caption?: string;
  /** An action that belongs to the screen as a whole, aligned with the header. */
  action?: ReactNode;
  /** Draws the home screen's decorative wash behind the header (`docs/specs/home.md`). */
  wash?: boolean;
}

/**
 * The top of a tab screen: the app's own identity (mark + name) first, the
 * current page named underneath it in smaller type. The mark stands as tall
 * as those two lines together, so it reads as one identity block rather than
 * being sized to just the wordmark. See "App header" in docs/DESIGN.md.
 */
export function ScreenHeader({ title, caption, action, wash = false }: ScreenHeaderProps) {
  return (
    <View style={[styles.header, wash && styles.headerWash]}>
      {wash ? <HeroWash /> : null}
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
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerWash: {
    // Bleeds to the edges of whatever padded container it sits in, like the
    // home screen's own hero, rather than sitting inset within it.
    marginHorizontal: -Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    overflow: 'hidden',
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
});
