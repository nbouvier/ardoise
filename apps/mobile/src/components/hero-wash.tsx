import { useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Medallions } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Soft, out-of-focus colour behind a block of identity: three overlapping
 * ellipses, each a radial gradient fading to nothing, over a washed brand
 * ground. Fills whatever it is placed in — the caller owns the size and
 * whether it clips (`docs/specs/home.md`).
 *
 * Drawn rather than blurred: a real blur needs a native module on one
 * platform and a CSS filter on another, and would still have to be fed
 * something to blur. Gradients fading to transparent give the same
 * out-of-focus read from the palette itself, identically everywhere, and
 * follow the theme like every other colour in the app.
 */
export function HeroWash() {
  const theme = useTheme();
  // Every mount needs its own gradient ids: on web, react-native-svg renders
  // real `<svg>` elements, and two instances sharing an id (the home screen
  // and a pushed group screen can both be mounted at once) would have the
  // second `url(#…)` resolve to whichever the browser saw first.
  const uid = useId();

  return (
    <Svg
      style={StyleSheet.absoluteFill}
      // Stretched to the block's own shape: these are washes, not figures, so
      // there is nothing here for an aspect ratio to protect.
      viewBox="0 0 100 100"
      preserveAspectRatio="none">
      <Defs>
        <RadialGradient id={`${uid}-brand`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={theme.primary} stopOpacity={0.55} />
          <Stop offset="1" stopColor={theme.primary} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${uid}-accent`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={theme.accent} stopOpacity={0.45} />
          <Stop offset="1" stopColor={theme.accent} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${uid}-third`} cx="50%" cy="50%" r="50%">
          {/* A third hue from the medallion family, so the wash reads as the
              app's palette rather than as two brand colours meeting. */}
          <Stop offset="0" stopColor={Medallions[3]!.ink} stopOpacity={0.35} />
          <Stop offset="1" stopColor={Medallions[3]!.ink} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      <Rect x="0" y="0" width="100" height="100" fill={theme.primarySoft} />
      <Ellipse cx="18" cy="18" rx="62" ry="58" fill={`url(#${uid}-brand)`} />
      <Ellipse cx="92" cy="34" rx="55" ry="62" fill={`url(#${uid}-accent)`} />
      <Ellipse cx="58" cy="104" rx="70" ry="52" fill={`url(#${uid}-third)`} />
    </Svg>
  );
}
