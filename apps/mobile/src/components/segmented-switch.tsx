import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
  options: readonly [SegmentedSwitchOption<Key>, SegmentedSwitchOption<Key>];
  value: Key;
  onChange: (key: Key) => void;
}

/**
 * A two-way switch with its own options named inside it — "Spending" /
 * "Income" — rather than two look-alike `Pill`s next to each other, which
 * reads as "pick either" instead of "one setting, two positions".
 */
export function SegmentedSwitch<Key extends string>({
  options,
  value,
  onChange,
}: SegmentedSwitchProps<Key>) {
  const theme = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const selectedIndex = value === options[0].key ? 0 : 1;
  const position = useSharedValue(selectedIndex);

  useEffect(() => {
    position.set(withTiming(selectedIndex, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [position, selectedIndex]);

  const half = trackWidth / 2;
  const thumbStyle = useAnimatedStyle(() => ({
    width: half,
    transform: [{ translateX: position.get() * half }],
  }));

  return (
    <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
      <View
        style={styles.row}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}>
        {trackWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.thumb, { backgroundColor: theme.primary }, thumbStyle]}
          />
        ) : null}
        {options.map((option) => {
          const active = option.key === value;
          return (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: active }}
              onPress={() => onChange(option.key)}
              style={styles.option}>
              <ThemedText
                type="smallBold"
                style={{ color: active ? theme.onPrimary : theme.textSecondary }}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: Radius.pill,
    padding: 3,
  },
  row: {
    flexDirection: 'row',
  },
  thumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: Radius.pill,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
