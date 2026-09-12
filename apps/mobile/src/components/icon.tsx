import Svg, { Path } from 'react-native-svg';

export type IconName = 'plus' | 'link' | 'close';

/** Stroke paths on a 24×24 grid — plain geometry, no icon font. */
const paths: Record<IconName, string> = {
  plus: 'M12 5v14M5 12h14',
  link: 'M10 14l4-4M9 8.5a3 3 0 0 1 4.24 0l.7.7a3 3 0 0 1 0 4.24l-1.2 1.2M15 15.5a3 3 0 0 1-4.24 0l-.7-.7a3 3 0 0 1 0-4.24l1.2-1.2',
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
