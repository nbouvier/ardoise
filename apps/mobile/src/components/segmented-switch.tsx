import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface SegmentedSwitchOption<Key extends string> {
  key: Key;
  label: string;
}

export interface SegmentedSwitchProps<Key extends string> {
  /** Two or more positions — the sliding thumb divides evenly among them. */
  options: readonly SegmentedSwitchOption<Key>[];
  value: Key;
  onChange: (key: Key) => void;
  /** `small` for a switch sitting beside a section title, not its own line. */
  size?: 'default' | 'small';
}

const SIZES = {
  default: { height: 44, paddingHorizontal: Spacing.four },
  small: { height: 32, paddingHorizontal: Spacing.three },
} as const;
const INSET = 3;
const SETTLE = { duration: 220, easing: Easing.out(Easing.cubic) };

/**
 * A switch with its own options named inside it — "Spending" / "Income",
 * "Expense" / "Income" / "Transfer" — rather than look-alike `Pill`s next to
 * each other, which reads as "pick any of these" instead of "one setting,
 * a fixed set of positions". Its own height is fixed rather than left to
 * wrap its content. Two options or more; for a "pick one of many" row
 * instead, reach for `Pill` or `TabBar`.
 *
 * Each option is sized to its own label, measured via `onLayout`, rather than
 * split evenly across a shared width: a track with no explicit width of its
 * own (as when it sits beside a heading rather than alone on its own line)
 * has nothing to divide `flex: 1` options into, and they collapse to zero —
 * the label disappears. Measuring each option's own width sidesteps that
 * regardless of what row it sits in.
 */
export function SegmentedSwitch<Key extends string>({
  options,
  value,
  onChange,
  size = 'default',
}: SegmentedSwitchProps<Key>) {
  const theme = useTheme();
  const { height, paddingHorizontal } = SIZES[size];
  const [widths, setWidths] = useState<number[]>(() => options.map(() => 0));
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.key === value),
  );
  const ready = widths.length === options.length && widths.every((width) => width > 0);

  const left = useSharedValue(0);
  const thumbWidth = useSharedValue(0);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const offset = widths.slice(0, selectedIndex).reduce((sum, w) => sum + w, 0);
    left.set(withTiming(offset, SETTLE));
    thumbWidth.set(withTiming(widths[selectedIndex]!, SETTLE));
  }, [ready, widths, selectedIndex, left, thumbWidth]);

  const thumbStyle = useAnimatedStyle(() => ({
    width: thumbWidth.get(),
    transform: [{ translateX: left.get() }],
  }));

  function reportWidth(index: number, event: LayoutChangeEvent) {
    const measured = event.nativeEvent.layout.width;
    setWidths((previous) => {
      if (previous[index] === measured) {
        return previous;
      }
      const next = [...previous];
      next[index] = measured;
      return next;
    });
  }

  return (
    <View style={[styles.track, { backgroundColor: theme.backgroundElement, height }]}>
      {ready ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.thumb, { backgroundColor: theme.primary }, thumbStyle]}
        />
      ) : null}
      {options.map((option, index) => {
        const active = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.key)}
            onLayout={(event) => reportWidth(index, event)}
            style={[styles.option, { paddingHorizontal }]}>
            <ThemedText
              type={size === 'small' ? 'small' : 'smallBold'}
              numberOfLines={1}
              style={[
                size === 'small' && styles.smallLabel,
                { color: active ? theme.onPrimary : theme.textSecondary },
              ]}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    alignSelf: 'center',
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: INSET,
  },
  thumb: {
    position: 'absolute',
    top: INSET,
    bottom: INSET,
    left: INSET,
    borderRadius: Radius.pill,
  },
  option: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A notch smaller than `small`'s own 14/20 — this switch sits beside a
  // section title rather than holding one of its own, so its label reads as
  // quieter than ordinary body text, not just smaller geometry.
  smallLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
});
