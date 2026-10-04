import Svg, { Circle, ClipPath, Defs, G, Rect } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

export interface BrandMarkProps {
  size?: number;
}

/**
 * Ardoise's mark: a rounded tile split down the middle, one half brand, one
 * half accent, with a coin on the seam — the product in one glyph, "one thing,
 * divided between people".
 *
 * Drawn rather than shipped as a bitmap so it follows the palette: the whole
 * identity lives in `constants/theme.ts`, and a redesign never leaves a stale
 * PNG behind.
 */
export function BrandMark({ size = 96 }: BrandMarkProps) {
  const theme = useTheme();

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel="Ardoise">
      <Defs>
        <ClipPath id="ardoise-tile">
          <Rect x="0" y="0" width="100" height="100" rx="28" />
        </ClipPath>
      </Defs>
      <G clipPath="url(#ardoise-tile)">
        <Rect x="0" y="0" width="100" height="100" fill={theme.primary} />
        {/* The right half, in the accent hue: the same tile, split. */}
        <Rect x="50" y="0" width="50" height="100" fill={theme.accent} />
      </G>
      {/* The coin sitting on the split — what is being divided. */}
      <Circle cx="50" cy="50" r="21" fill={theme.surface} />
      <Circle cx="50" cy="50" r="8.5" fill={theme.primary} />
    </Svg>
  );
}
