import type { ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** How far the banner must be pulled down for the page to close. */
export const DISMISS_DISTANCE = 120;
/** …or how fast it must be flicked down, past a small distance. */
export const DISMISS_VELOCITY = 900;

/** Whether a finished downward drag of the banner closes the page. */
export function dismissesPage(translationY: number, velocityY: number): boolean {
  'worklet';
  return translationY > DISMISS_DISTANCE || (translationY > 24 && velocityY > DISMISS_VELOCITY);
}

/** A page slides back into place like this when the drag falls short. */
const SPRING_BACK = { damping: 22, stiffness: 260 };

export interface DismissiblePageProps {
  /** The banner: dragging it down pulls the whole page along, and far enough closes it. */
  header: ReactNode;
  children: ReactNode;
  onClose: () => void;
  /**
   * iOS presents these pages as native sheets, which already follow the
   * finger down and close — a second gesture would fight it.
   */
  enabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A page that opened from the bottom (a group, a friend, "New group"…) and
 * goes back the same way: pull its banner down and the page follows the
 * finger, then either closes or springs back. See "Motion" in docs/DESIGN.md.
 */
export function DismissiblePage({
  header,
  children,
  onClose,
  enabled = Platform.OS !== 'ios',
  style,
}: DismissiblePageProps) {
  const { height } = useWindowDimensions();
  const offset = useSharedValue(0);

  function close() {
    onClose();
    // Were the page to stay (nowhere to go back to), it must not stay off-screen.
    setTimeout(() => {
      offset.value = 0;
    }, 1200);
  }

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetY(10)
    .failOffsetX([-24, 24])
    .onUpdate((event) => {
      offset.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (dismissesPage(event.translationY, event.velocityY)) {
        offset.value = withTiming(height, { duration: 180 }, (finished) => {
          if (finished) {
            scheduleOnRN(close);
          }
        });
      } else {
        offset.value = withSpring(0, SPRING_BACK);
      }
    })
    .withTestId('dismiss-page');

  const followFinger = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  return (
    <Animated.View style={[styles.page, style, followFinger]}>
      <GestureDetector gesture={pan}>
        <View collapsable={false}>{header}</View>
      </GestureDetector>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
});
