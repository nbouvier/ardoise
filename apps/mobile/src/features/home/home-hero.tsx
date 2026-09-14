import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HeroWash } from '@/components/hero-wash';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/** What the product is about, in one line. See `docs/specs/home.md`. */
const TAGLINE = 'Settle up, stay friends.';

/** The share of the screen the identity takes, before its content forces more. */
const HEIGHT_RATIO = 0.25;

/**
 * The top of the home screen: the app's name and its tagline, centred over a
 * decorative wash, taking about a quarter of the screen (`docs/specs/home.md`).
 * Pure identity — nothing in it is tappable, and it never carries a figure or
 * a status.
 */
export function HomeHero() {
  const { height } = useWindowDimensions();

  return (
    <View style={[styles.hero, { minHeight: Math.round(height * HEIGHT_RATIO) }]}>
      {/* Behind the inset, not below it: the wash runs to the very top of the
          screen, with the status bar sitting over it. */}
      <HeroWash />
      <SafeAreaView edges={['top']} style={styles.content}>
        <View style={styles.text}>
          <ThemedText type="title" style={styles.centeredText}>
            SplitCount
          </ThemedText>
          <ThemedText type="sectionTitle" themeColor="textSecondary" style={styles.centeredText}>
            {TAGLINE}
          </ThemedText>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    overflow: 'hidden',
    justifyContent: 'center',
  },
  content: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
  },
  text: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  centeredText: {
    textAlign: 'center',
  },
});
