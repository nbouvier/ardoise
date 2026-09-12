/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, type Theme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

function resolved(scheme: ReturnType<typeof useColorScheme>) {
  return scheme === 'unspecified' || scheme == null ? 'light' : scheme;
}

export function useTheme(): Theme {
  return Colors[resolved(useColorScheme())];
}

/**
 * Whether the dark palette is in use. Needed by the handful of tokens that are
 * a function of the scheme rather than a colour — `cardShadow`, a medallion's
 * two halves — and never as a licence to branch on the scheme inline.
 */
export function useIsDark(): boolean {
  return resolved(useColorScheme()) === 'dark';
}
