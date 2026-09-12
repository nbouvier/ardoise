import Svg, { Path } from 'react-native-svg';

export type IconName = 'plus' | 'key' | 'close';

/** Stroke paths on a 24×24 grid — plain geometry, no icon font. */
const paths: Record<IconName, string> = {
  plus: 'M12 5v14M5 12h14',
  // A key: the ring you hold, the shaft, and its teeth — reads as "enter a
  // code to get in", clearer for "join" than an abstract link/chain.
  key: 'M9 14a4 4 0 1 1 2.83-6.83A4 4 0 0 1 9 14zm2.83-6.83L20 15.34V19h-3v-2h-2v-2h-1.17',
  close: 'M6 6l12 12M18 6L6 18',
};

export interface IconProps {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
}

/**
 * The app's small set of glyphs, drawn as strokes rather than shipped as an
 * icon font — the same reasoning as `BrandMark`: one visual language driven by
 * `theme`, nothing that can go stale.
 */
export function Icon({ name, size = 20, color, strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={paths[name]}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
