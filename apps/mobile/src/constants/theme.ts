/**
 * SplitCount's design tokens — the single source of colour, spacing, radius and
 * elevation for the mobile client. See `docs/DESIGN.md` for the rationale and
 * for the rules every screen follows; nothing here is meant to be re-derived or
 * overridden locally.
 *
 * The palette is deliberately small: one brand hue (violet), one accent hue
 * (tangerine), and the two semantic money hues (green / red) kept out of both,
 * so a balance never reads as branding. Neutrals are tinted towards the brand
 * hue rather than grey, so no surface in the app is plain white, grey or black.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** Every colour role a screen may reach for, in either scheme. */
export interface Theme {
  text: string;
  textSecondary: string;
  background: string;
  surface: string;
  backgroundElement: string;
  backgroundSelected: string;
  border: string;
  primary: string;
  onPrimary: string;
  primarySoft: string;
  onPrimarySoft: string;
  accent: string;
  accentSoft: string;
  /** Text drawn on top of `accentSoft` — the accent itself is too light for it. */
  onAccentSoft: string;
  credit: string;
  debit: string;
  danger: string;
}

export const Colors: Record<'light' | 'dark', Theme> = {
  light: {
    /** Ink: a deep violet rather than black. */
    text: '#241C4A',
    textSecondary: '#6E6795',
    /** The app canvas — lavender-tinted, never white. */
    background: '#F4F1FE',
    /** A raised sheet of content sitting on the canvas: cards, rows, sheets. */
    surface: '#FFFFFF',
    /** A filled but unselected area: inputs, inactive pills. */
    backgroundElement: '#EAE4FC',
    /** The same, selected. */
    backgroundSelected: '#DBD1FA',
    /** Hairlines and card outlines. */
    border: '#E2DAF8',
    /** The brand hue: primary actions, active states, links. */
    primary: '#6B4EF6',
    /** Text and icons drawn on top of `primary`. */
    onPrimary: '#FFFFFF',
    /** A washed brand surface: chips, badges, highlighted rows. */
    primarySoft: '#E7E0FF',
    /** Text drawn on top of `primarySoft`. */
    onPrimarySoft: '#4B2FD6',
    /** The accent hue, used sparingly: emphasis that is not an action. */
    accent: '#FF7A45',
    accentSoft: '#FFE6DA',
    onAccentSoft: '#A63C10',
    /** A balance in the viewer's favour — money owed to them. */
    credit: '#0E9F6E',
    /** A balance against the viewer — money they owe. */
    debit: '#E0455E',
    /** Destructive actions. A different meaning that happens to share a hue. */
    danger: '#D6334B',
  },
  dark: {
    text: '#F2EEFF',
    textSecondary: '#A79ED2',
    // Deep violet-navy rather than black; surfaces lift off it.
    background: '#14102A',
    surface: '#1C1638',
    backgroundElement: '#251E4A',
    backgroundSelected: '#332A66',
    border: '#332A63',
    // Lifted off the light values, which go muddy on a dark canvas.
    primary: '#9D86FF',
    onPrimary: '#170E3A',
    primarySoft: '#2E2560',
    onPrimarySoft: '#C9B9FF',
    accent: '#FF9A63',
    accentSoft: '#3B2517',
    onAccentSoft: '#FFB98C',
    credit: '#37D39B',
    debit: '#FF7A8F',
    danger: '#FF6B7F',
  },
};

export type ThemeColor = keyof Theme;

export interface Medallion {
  /** Disc fill on the light theme, and the ink drawn on it on the dark one. */
  light: string;
  dark: string;
  ink: string;
  inkDark: string;
}

/**
 * Deterministic decoration for something that has no colour of its own — a
 * group, or someone without a profile picture. Picked from an id, so the same
 * subject keeps the same colour across screens and launches, and drawn from the
 * palette's own family so a list still reads as one app.
 */
export const Medallions: readonly Medallion[] = [
  { light: '#E7E0FF', dark: '#332A66', ink: '#5B3CE8', inkDark: '#B7A3FF' },
  { light: '#FFE6DA', dark: '#3B2517', ink: '#D95C25', inkDark: '#FFA97B' },
  { light: '#D8F1E6', dark: '#16382C', ink: '#0E8A60', inkDark: '#46D3A0' },
  { light: '#DCEBFC', dark: '#16294A', ink: '#2E6FC7', inkDark: '#79B2F5' },
  { light: '#FBE1EF', dark: '#3A1A2C', ink: '#C2418A', inkDark: '#F58FC4' },
  { light: '#FBEFD3', dark: '#372C11', ink: '#A8791A', inkDark: '#EAC15F' },
];

/** The stable medallion for an id — same subject, same colour, everywhere. */
export function medallionFor(id: string): Medallion {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 100000;
  }
  return Medallions[hash % Medallions.length];
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * Corner radii. The app is deliberately round: `card` for anything holding
 * content, `pill` for anything tapped that reads as a token.
 */
export const Radius = {
  small: 8,
  medium: 12,
  card: 18,
  large: 26,
  pill: 999,
} as const;

/**
 * A card's lift off the canvas: soft and violet-tinted rather than black, and
 * flat on the dark theme, where a shadow only muddies a dark canvas — `border`
 * carries the separation there instead.
 */
export function cardShadow(dark: boolean) {
  if (dark) {
    return {};
  }
  return {
    shadowColor: '#2C1B7A',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  };
}

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
