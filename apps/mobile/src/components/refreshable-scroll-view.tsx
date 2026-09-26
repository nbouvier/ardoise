import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Icon } from '@/components/icon';
import { useTheme } from '@/hooks/use-theme';

/** The pull, past which letting go refreshes — 192 pt of finger travel. */
export const REFRESH_PULL = 96;
/** The pull is half the finger's travel: it resists. */
const DRAG_RATE = 0.5;
const MAX_PULL = 140;
/** Where the spinner waits while the refresh runs. */
const RESTING = 56;
const INDICATOR = 40;
/** A pull only starts from the top, going down, after this much travel. */
const START_PULL = 14;

/** Whether letting go after dragging `translationY` down refreshes. */
export function refreshesOnRelease(translationY: number): boolean {
  'worklet';
  return translationY * DRAG_RATE >= REFRESH_PULL;
}

export interface RefreshableScrollViewProps extends Omit<ScrollViewProps, 'refreshControl'> {
  refreshing: boolean;
  onRefresh: () => void;
}

/**
 * A scroll view that refreshes when pulled down from its top — deliberately:
 * a long pull, started at the top (not a scroll up that runs into it). iOS's
 * own control already asks for that; Android's triggers after a short tug and
 * cannot be told otherwise, so it gets this drawn one. See "Motion" in
 * docs/DESIGN.md.
 */
export function RefreshableScrollView(props: RefreshableScrollViewProps) {
  return Platform.OS === 'android' ? (
    <PullToRefreshScrollView {...props} />
  ) : (
    <NativeRefreshScrollView {...props} />
  );
}

function NativeRefreshScrollView({ refreshing, onRefresh, ...props }: RefreshableScrollViewProps) {
  const theme = useTheme();
  return (
    <ScrollView
      {...props}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.primary}
          colors={[theme.primary]}
        />
      }
    />
  );
}

/** The drawn pull-to-refresh (Android's). Exported for its tests. */
export function PullToRefreshScrollView({
  refreshing,
  onRefresh,
  style,
  ...props
}: RefreshableScrollViewProps) {
  const theme = useTheme();
  const scrollY = useSharedValue(0);
  const pull = useSharedValue(0);
  const busy = useSharedValue(false);
  const touchStart = useSharedValue({ x: 0, y: 0 });
  // Let go past the mark: the spinner stays for a moment even before the
  // owner's own `refreshing` comes back true — and goes if it never does.
  const [released, setReleased] = useState(false);
  const shown = refreshing || released;

  useEffect(() => {
    if (!released) {
      return;
    }
    const timer = setTimeout(() => setReleased(false), 400);
    return () => clearTimeout(timer);
  }, [released]);

  useEffect(() => {
    busy.set(shown);
    pull.set(withTiming(shown ? RESTING : 0, { duration: 220 }));
  }, [shown, busy, pull]);

  function release() {
    setReleased(true);
    onRefresh();
  }

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });

  const gesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((event) => {
      const touch = event.allTouches[0];
      if (touch) {
        touchStart.set({ x: touch.absoluteX, y: touch.absoluteY });
      }
    })
    .onTouchesMove((event, manager) => {
      const touch = event.allTouches[0];
      if (!touch) {
        return;
      }
      const dx = touch.absoluteX - touchStart.get().x;
      const dy = touch.absoluteY - touchStart.get().y;
      // Only from the very top, straight down, and not while already refreshing.
      if (scrollY.get() > 0.5 || busy.get() || dy < -START_PULL / 2 || Math.abs(dx) > START_PULL) {
        manager.fail();
      } else if (dy > START_PULL && dy > Math.abs(dx)) {
        manager.activate();
      }
    })
    .onStart(() => {
      cancelAnimation(pull);
    })
    .onUpdate((event) => {
      pull.set(Math.min(MAX_PULL, Math.max(0, event.translationY * DRAG_RATE)));
    })
    .onEnd((event) => {
      if (refreshesOnRelease(event.translationY)) {
        pull.set(withTiming(RESTING, { duration: 180 }));
        scheduleOnRN(release);
      } else {
        pull.set(withTiming(0, { duration: 180 }));
      }
    })
    .withTestId('pull-to-refresh');

  const indicator = useAnimatedStyle(() => ({
    opacity: interpolate(pull.get(), [0, 24], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: pull.get() - INDICATOR },
      { scale: interpolate(pull.get(), [0, REFRESH_PULL], [0.6, 1], Extrapolation.CLAMP) },
    ],
  }));

  // The arrow winds up as it is pulled, and brightens once letting go would refresh.
  const arrow = useAnimatedStyle(() => ({
    opacity: pull.get() >= REFRESH_PULL ? 1 : 0.45,
    transform: [{ rotate: `${(pull.get() / REFRESH_PULL) * 300}deg` }],
  }));

  return (
    <View style={[styles.container, style]}>
      <GestureDetector gesture={gesture}>
        <Animated.ScrollView
          {...props}
          style={styles.container}
          onScroll={onScroll}
          scrollEventThrottle={16}
          overScrollMode="never"
        />
      </GestureDetector>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          { backgroundColor: theme.surface, borderColor: theme.border },
          indicator,
        ]}>
        {shown ? (
          <ActivityIndicator testID="pull-to-refresh-spinner" color={theme.primary} />
        ) : (
          <Animated.View style={arrow}>
            <Icon name="refresh" size={20} color={theme.primary} />
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    width: INDICATOR,
    height: INDICATOR,
    borderRadius: INDICATOR / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
});
