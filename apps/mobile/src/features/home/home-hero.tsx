import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';

import { BrandMark } from '@/components/brand-mark';
import { ThemedText } from '@/components/themed-text';
import { Medallions, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** What the product is about, in one line. See `docs/specs/home.md`. */
const TAGLINE = 'Settle up, stay friends.';

/** The share of the screen the identity takes, before its content forces more. */
const HEIGHT_RATIO = 0.25;

const BRAND_MARK_SIZE = 52;

/**
 * Soft, out-of-focus colour behind the identity: three overlapping ellipses,
 * each a radial gradient fading to nothing, over a washed brand ground.
 *
 * Drawn rather than blurred: a real blur needs a native module on one
 * platform and a CSS filter on another, and would still have to be fed
 * something to blur. Gradients fading to transparent give the same
 * out-of-focus read from the palette itself, identically everywhere, and
 * follow the theme like every other colour in the app.
 */
function HeroBackground() {
  const theme = useTheme();

  return (
    <Svg
      style={StyleSheet.absoluteFill}
      // Stretched to the block's own shape: these are washes, not figures, so
      // there is nothing here for an aspect ratio to protect.
      viewBox="0 0 100 100"
      preserveAspectRatio="none">
      <Defs>
        <RadialGradient id="home-hero-brand" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={theme.primary} stopOpacity={0.55} />
          <Stop offset="1" stopColor={theme.primary} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="home-hero-accent" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={theme.accent} stopOpacity={0.45} />
          <Stop offset="1" stopColor={theme.accent} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="home-hero-third" cx="50%" cy="50%" r="50%">
          {/* A third hue from the medallion family, so the wash reads as the
              app's palette rather than as two brand colours meeting. */}
          <Stop offset="0" stopColor={Medallions[3]!.ink} stopOpacity={0.35} />
          <Stop offset="1" stopColor={Medallions[3]!.ink} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      <Rect x="0" y="0" width="100" height="100" fill={theme.primarySoft} />
      <Ellipse cx="18" cy="18" rx="62" ry="58" fill="url(#home-hero-brand)" />
      <Ellipse cx="92" cy="34" rx="55" ry="62" fill="url(#home-hero-accent)" />
      <Ellipse cx="58" cy="104" rx="70" ry="52" fill="url(#home-hero-third)" />
    </Svg>
  );
}

/**
 * The top of the home screen: the app's mark, its name and its tagline over a
 * decorative wash, taking about a quarter of the screen
 * (`docs/specs/home.md`). Pure identity — nothing in it is tappable, and it
 * never carries a figure or a status.
 */
export function HomeHero() {
  const { height } = useWindowDimensions();

  return (
    <View style={[styles.hero, { minHeight: Math.round(height * HEIGHT_RATIO) }]}>
      {/* Behind the inset, not below it: the wash runs to the very top of the
          screen, with the status bar sitting over it. */}
      <HeroBackground />
      <SafeAreaView edges={['top']} style={styles.content}>
        <BrandMark size={BRAND_MARK_SIZE} />
        <View style={styles.text}>
          <ThemedText type="title">SplitCount</ThemedText>
          <ThemedText type="sectionTitle" themeColor="textSecondary">
            {TAGLINE}
          </ThemedText>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    // Rounded off at the bottom only: it is anchored to the top of the
    // screen, and the sections below sit on the plain canvas.
    borderBottomLeftRadius: Radius.large,
    borderBottomRightRadius: Radius.large,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  content: {
    justifyContent: 'flex-end',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
  },
  text: {
    gap: Spacing.one,
  },
});
