import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface TabOption<Key extends string> {
  key: Key;
  label: string;
}

export interface TabBarProps<Key extends string> {
  tabs: readonly TabOption<Key>[];
  selected: Key;
  onSelect: (key: Key) => void;
  /**
   * Where the content below is, in tabs (1.5 = halfway from the second to the
   * third) — the `Pager`'s own. The underline follows it, so it slides along
   * with a swipe; without it, the underline slides on its own to a new tab.
   */
  position?: SharedValue<number>;
}

interface TabLayout {
  x: number;
  width: number;
}

/**
 * The tabs *within* a screen — an underlined row, one of which is always
 * selected. Not the app's bottom tabs: those switch between screens, these
 * switch between the parts of one (a group's transactions, balances,
 * statistics and management). Stretches to fill the width when it fits and
 * scrolls sideways when it does not, so a long label or a narrow phone never
 * squeezes one out.
 */
export function TabBar<Key extends string>({
  tabs,
  selected,
  onSelect,
  position,
}: TabBarProps<Key>) {
  const theme = useTheme();
  const selectedIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === selected),
  );
  const ownPosition = useSharedValue(selectedIndex);
  const track = position ?? ownPosition;
  const [layouts, setLayouts] = useState<(TabLayout | undefined)[]>([]);

  useEffect(() => {
    if (!position) {
      ownPosition.set(
        withTiming(selectedIndex, {
          duration: 280,
          easing: Easing.out(Easing.cubic),
        }),
      );
    }
  }, [position, ownPosition, selectedIndex]);

  function measure(index: number, layout: TabLayout) {
    setLayouts((current) => {
      const previous = current[index];
      if (previous && previous.x === layout.x && previous.width === layout.width) {
        return current;
      }
      const next = [...current];
      next[index] = layout;
      return next;
    });
  }

  const measured =
    layouts.length === tabs.length && layouts.every((layout) => layout !== undefined)
      ? (layouts as TabLayout[])
      : null;

  // Computed here, in plain arrays, and only *read* by the worklet below: a
  // callback written inside a worklet (`measured.map((layout) => …)`) is hoisted
  // out of it by the React Compiler and then fails on the UI thread.
  const steps: number[] = [];
  const widths: number[] = [];
  const offsets: number[] = [];
  if (measured) {
    for (let index = 0; index < measured.length; index++) {
      steps.push(index);
      widths.push(measured[index]!.width);
      offsets.push(measured[index]!.x);
    }
  }
  const ready = measured !== null;

  const underline = useAnimatedStyle(() => {
    if (!ready) {
      return { opacity: 0 };
    }
    if (steps.length === 1) {
      return { opacity: 1, width: widths[0]!, transform: [{ translateX: offsets[0]! }] };
    }
    return {
      opacity: 1,
      width: interpolate(track.get(), steps, widths, Extrapolation.CLAMP),
      transform: [{ translateX: interpolate(track.get(), steps, offsets, Extrapolation.CLAMP) }],
    };
  });

  return (
    <View style={[styles.wrapper, { borderBottomColor: theme.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityRole="tablist">
        {tabs.map((tab, index) => {
          const active = tab.key === selected;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(tab.key)}
              onLayout={(event) => measure(index, event.nativeEvent.layout)}
              style={({ pressed }) => [
                styles.tab,
                pressed && { backgroundColor: theme.primarySoft },
              ]}>
              <ThemedText
                type="smallBold"
                themeColor={active ? 'primary' : 'textSecondary'}
                numberOfLines={1}>
                {tab.label}
              </ThemedText>
            </Pressable>
          );
        })}
        <Animated.View
          pointerEvents="none"
          style={[styles.underline, { backgroundColor: theme.primary }, underline]}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexGrow: 1,
  },
  tab: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    // Room for the underline, which sits on the wrapper's own rule.
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -StyleSheet.hairlineWidth,
    borderTopLeftRadius: Radius.small,
    borderTopRightRadius: Radius.small,
  },
  underline: {
    position: 'absolute',
    left: 0,
    bottom: -StyleSheet.hairlineWidth,
    height: 2,
  },
});
