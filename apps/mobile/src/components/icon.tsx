import Svg, { Path } from 'react-native-svg';

export type IconName =
  | 'plus'
  | 'key'
  | 'close'
  | 'star'
  | 'more'
  | 'manage'
  | 'archive'
  | 'leave'
  | 'trash'
  | 'back'
  | 'share'
  | 'copy'
  | 'refresh'
  | 'check';

/** Stroke paths on a 24×24 grid — plain geometry, no icon font. */
const paths: Record<IconName, string> = {
  // The curved arrow sweeping to the right: pass this on.
  share: 'M14 5l6 6-6 6M20 11H10a6 6 0 0 0-6 6v2',
  // Two overlapping sheets.
  copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM16 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3',
  // An arc with an arrowhead: start over with a new one.
  refresh: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  back: 'M15 5l-7 7 7 7',
  plus: 'M12 5v14M5 12h14',
  // A key: the ring you hold, the shaft, and its teeth — reads as "enter a
  // code to get in", clearer for "join" than an abstract link/chain.
  key: 'M9 14a4 4 0 1 1 2.83-6.83A4 4 0 0 1 9 14zm2.83-6.83L20 15.34V19h-3v-2h-2v-2h-1.17',
  close: 'M6 6l12 12M18 6L6 18',
  star: 'M12 3.5l2.47 5.6 6.03.58-4.56 4.06 1.35 5.94L12 16.77 6.71 19.68l1.35-5.94-4.56-4.06 6.03-.58z',
  // A row's own "⋮" trigger — three dots, drawn filled.
  more: 'M12 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM12 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM12 15.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z',
  // A clipboard: "Manage" opens the group's Manage tab, which this evokes.
  manage: 'M6 7h12v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7zM9 4h6v3H9zM9 11h6M9 15h6',
  // A box with its lid line and handle: put away, not gone.
  archive: 'M3 7h18M5 7v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7M9 11h6',
  // A door with an arrow through it.
  leave: 'M9 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3M17 12H9M13 8l4 4-4 4',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M10 11v6M14 11v6',
};

export interface IconProps {
  name: IconName;
  size?: number;
  color: string;
  strokeWidth?: number;
  /** Fills the shape with `color` instead of leaving it hollow — the favorite star's "on" state. */
  filled?: boolean;
}

/**
 * The app's small set of glyphs, drawn as strokes rather than shipped as an
 * icon font — the same reasoning as `BrandMark`: one visual language driven by
 * `theme`, nothing that can go stale.
 */
export function Icon({ name, size = 20, color, strokeWidth = 2.2, filled = false }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={paths[name]}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
    </Svg>
  );
}
