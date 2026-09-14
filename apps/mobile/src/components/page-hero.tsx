import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeroWash } from '@/components/hero-wash';
import { MaxContentWidth, Spacing } from '@/constants/theme';

export interface PageHeroProps {
  children: ReactNode;
}

/**
 * The app's decorative wash, bled to a tab screen's own edges, behind
 * `ScreenHeader`'s identity — SplitCount's own brand mark and the page name.
 * The one place this bleed and its top safe-area inset are computed, so
 * every header that carries it behaves identically instead of each screen
 * re-deriving its own margins (`docs/specs/home.md`).
 *
 * Belongs as a screen's very first element, before any padded content
 * wrapper — nesting it inside one reintroduces the padding it exists to
 * bleed past.
 */
export function PageHero({ children }: PageHeroProps) {
  return (
    <View style={styles.hero}>
      <HeroWash />
      <SafeAreaView edges={['top']}>
        <View style={styles.content}>{children}</View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    overflow: 'hidden',
  },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
  },
});
