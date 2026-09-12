import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Radius, medallionFor } from '@/constants/theme';
import { useIsDark } from '@/hooks/use-theme';

export interface MedallionBadgeProps {
  /** What the colour is derived from — the same id always gets the same colour. */
  seed: string;
  /** Drawn inside: an emoji, or one or two letters. */
  content: string;
  size?: number;
  /** A fixed colour instead of one derived from the seed — a category owns its own. */
  color?: string;
  style?: ViewStyle;
}

/**
 * A coloured disc standing in for something that has no picture: a group, a
 * category, a person without an avatar. What makes a list of otherwise
 * identical rows tell itself apart at a glance.
 */
export function MedallionBadge({
  seed,
  content,
  size = 44,
  color,
  style,
}: MedallionBadgeProps) {
  const dark = useIsDark();
  const medallion = medallionFor(seed);
  const background = color ? withAlpha(color, dark ? 0.22 : 0.16) : dark ? medallion.dark : medallion.light;
  const ink = color ?? (dark ? medallion.inkDark : medallion.ink);

  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: Radius.card, backgroundColor: background },
        style,
      ]}>
      <Text style={[styles.content, { fontSize: size * 0.44, color: ink }]}>{content}</Text>
    </View>
  );
}

/** `#RRGGBB` plus an opacity, as an `#RRGGBBAA` a native view accepts. */
function withAlpha(hex: string, alpha: number): string {
  const byte = Math.round(Math.min(Math.max(alpha, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${byte}`;
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    fontWeight: '700',
  },
});
