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
  | 'collapse'
  | 'share'
  | 'copy'
  | 'refresh'
  | 'check'
  | 'home'
  | 'groups'
  | 'friends'
  | 'account'
  | 'calendar'
  | 'pencil';

/** Stroke paths on a 24×24 grid — plain geometry, no icon font. */
const paths: Record<IconName, string> = {
  // The curved arrow sweeping to the right: pass this on.
  share: 'M14 5l6 6-6 6M20 11H10a6 6 0 0 0-6 6v2',
  // Two overlapping sheets.
  copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM16 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3',
  // An arc with an arrowhead: start over with a new one.
  refresh: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  // The bottom tabs' own four: a house, three people, two people, one in a circle.
  home: 'M4 10.5L12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z',
  groups:
    'M12 11.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6.5 19.5a5.5 5.5 0 0 1 11 0M6 11a2.25 2.25 0 1 1 .5-4.45M2.5 17a3.75 3.75 0 0 1 3-3.4M18 11a2.25 2.25 0 1 0-.5-4.45M21.5 17a3.75 3.75 0 0 0-3-3.4',
  friends:
    'M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M15.5 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6',
  account:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 13a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5zM6.2 18.6a6.75 6.75 0 0 1 11.6 0',
  back: 'M15 5l-7 7 7 7',
  // A chevron pointing down: fold the group away, back to where it came from.
  collapse: 'M5 9l7 7 7-7',
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
  // A page-a-day block: the body, its header rule, and the two hangers a
  // wall calendar hangs from — reads as "date" at a glance.
  calendar:
    'M4 5h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM3 10h18M8 3v4M16 3v4',
  // A pencil at rest on its tip: the shaft, and the point it writes from.
  pencil: 'M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
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
