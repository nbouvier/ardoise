import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Radius, Spacing, cardShadow } from '@/constants/theme';
import { useIsDark, useTheme } from '@/hooks/use-theme';

export interface CardProps {
  children: ReactNode;
  /** Makes the whole card the hit area. */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Draws the card in the brand wash instead of on `surface` — for the one thing on a screen that matters most. */
  tone?: 'surface' | 'brand';
  /** Archived, left, not joined: still readable, visibly out of the way. */
  muted?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
}

/**
 * The app's unit of content: everything that is a row, a group of fields or a
 * standalone block sits in one, so lists read as a stack of objects rather than
 * as runs of text separated by hairlines.
 */
export function Card({
  children,
  onPress,
  accessibilityLabel,
  tone = 'surface',
  muted = false,
  disabled = false,
  style,
  testID,
}: CardProps) {
  const theme = useTheme();
  const dark = useIsDark();

  const surface: ViewStyle = {
    backgroundColor: tone === 'brand' ? theme.primarySoft : theme.surface,
    borderColor: tone === 'brand' ? 'transparent' : theme.border,
    borderWidth: tone === 'brand' ? 0 : StyleSheet.hairlineWidth,
    ...cardShadow(dark),
  };

  const composed = [styles.card, surface, muted && styles.muted, style];

  if (!onPress) {
    return (
      <View style={composed} testID={testID}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [...composed, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    padding: Spacing.three,
  },
  muted: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
});
