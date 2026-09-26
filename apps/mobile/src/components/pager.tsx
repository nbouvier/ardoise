import { useEffect, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** How much of a page a swipe must cover to turn it… */
export const TURN_FRACTION = 0.4;
/** …or how fast (pt/s) it must be flicked, past a small part of it. */
export const TURN_VELOCITY = 800;
const FLICK_FRACTION = 0.12;
/** Past either end the pages still follow the finger, this much. */
const EDGE_RESISTANCE = 0.25;
/** How far sideways the finger goes before the pages take the gesture. */
const ACTIVATE_X = 24;
/** How far up or down it may go first before the gesture is left to scrolling. */
const FAIL_Y = 12;
const SETTLE = { duration: 280, easing: Easing.out(Easing.cubic) };

/**
 * Where the pages are, in pages, while dragged from `start` by `translationX`:
 * one to one with the finger, and with resistance past either end, where there
 * is nothing to reveal.
 */
export function dragPosition(
  start: number,
  count: number,
  translationX: number,
  width: number,
): number {
  'worklet';
  const raw = start - translationX / width;
  const last = count - 1;
  if (raw < 0) {
    return raw * EDGE_RESISTANCE;
  }
  if (raw > last) {
    return last + (raw - last) * EDGE_RESISTANCE;
  }
  return raw;
}

/**
 * The page a finished swipe settles on, from `index` among `count`: the next
 * one when dragged `offset` pages towards it (positive) far enough, or flicked
 * towards it past a little; the previous one the same way; otherwise `index`
 * again — including when a long drag ends with a flick back. One page at most.
 */
export function pageAfterSwipe(
  index: number,
  count: number,
  offset: number,
  velocityX: number,
): number {
  'worklet';
  const flickNext = velocityX < -TURN_VELOCITY;
  const flickPrevious = velocityX > TURN_VELOCITY;
  let step = 0;
  if (
    offset > 0 &&
    ((offset > TURN_FRACTION && !flickPrevious) || (offset > FLICK_FRACTION && flickNext))
  ) {
    step = 1;
  } else if (
    offset < 0 &&
    ((-offset > TURN_FRACTION && !flickNext) || (-offset > FLICK_FRACTION && flickPrevious))
  ) {
    step = -1;
  }
  return Math.min(count - 1, Math.max(0, index + step));
}

/** The pages from `from` to `to`, each widened by one on both sides and kept within `count`. */
function around(from: number, to: number, count: number): number[] {
  const pages: number[] = [];
  for (let page = Math.max(0, from - 1); page <= Math.min(count - 1, to + 1); page++) {
    pages.push(page);
  }
  return pages;
}

export interface PagerProps {
  /** The page shown. */
  index: number;
  count: number;
  /** A swipe settled on another page. */
  onIndexChange: (index: number) => void;
  renderPage: (index: number) => ReactNode;
  /**
   * Where the pages are, in pages (1.5 = halfway from the second to the
   * third), updated every frame — for a tab bar's indicator to follow.
   */
  position?: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
  pageStyle?: StyleProp<ViewStyle>;
}

/**
 * Sibling pages side by side (the app's bottom tabs, a group's own tabs): the
 * pages follow the finger, so the next one shows as it is pulled in, and they
 * settle on a page when let go. A page is drawn once it is shown or next to
 * the one shown, and then kept. See "Motion" in docs/DESIGN.md.
 */
export function Pager({
  index,
  count,
  onIndexChange,
  renderPage,
  position: sharedPosition,
  style,
  pageStyle,
}: PagerProps) {
  const window = useWindowDimensions();
  const [width, setWidth] = useState(window.width);
  const pageWidth = useSharedValue(window.width);
  const ownPosition = useSharedValue(index);
  const position = sharedPosition ?? ownPosition;
  // Where the pages rest, or are settling: the index as the pager knows it.
  const heading = useSharedValue(index);
  const start = useSharedValue(index);

  // Pages drawn so far. A jump (a tap on a far tab) passes every page between,
  // so those are drawn too rather than flashing by empty.
  const [drawn, setDrawn] = useState(() => ({
    index,
    pages: new Set(around(index, index, count)),
  }));
  if (drawn.index !== index) {
    const pages = new Set(drawn.pages);
    for (const page of around(Math.min(drawn.index, index), Math.max(drawn.index, index), count)) {
      pages.add(page);
    }
    setDrawn({ index, pages });
  }

  // Tapped rather than swiped: slide there.
  useEffect(() => {
    if (heading.get() !== index) {
      heading.set(index);
      position.set(withTiming(index, SETTLE));
    }
  }, [index, heading, position]);

  function onLayout(event: LayoutChangeEvent) {
    const measured = event.nativeEvent.layout.width;
    if (measured > 0 && measured !== pageWidth.get()) {
      pageWidth.set(measured);
      setWidth(measured);
    }
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-ACTIVATE_X, ACTIVATE_X])
    .failOffsetY([-FAIL_Y, FAIL_Y])
    .onStart(() => {
      cancelAnimation(position);
      start.set(position.get());
    })
    .onUpdate((event) => {
      position.set(dragPosition(start.get(), count, event.translationX, pageWidth.get()));
    })
    .onEnd((event) => {
      const from = heading.get();
      const offset = start.get() - event.translationX / pageWidth.get() - from;
      const target = pageAfterSwipe(from, count, offset, event.velocityX);
      heading.set(target);
      position.set(withTiming(target, SETTLE));
      if (target !== from) {
        scheduleOnRN(onIndexChange, target);
      }
    })
    .withTestId('pager');

  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: -position.get() * pageWidth.get() }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.viewport, style]} onLayout={onLayout} collapsable={false}>
        <Animated.View style={[styles.row, { width: width * count }, slide]}>
          {Array.from({ length: count }, (_, page) => (
            <View
              key={page}
              style={[styles.page, { width }, pageStyle]}
              // Only the page shown is there for a screen reader (and a test).
              accessibilityElementsHidden={page !== index}
              importantForAccessibility={page === index ? 'auto' : 'no-hide-descendants'}>
              {drawn.pages.has(page) ? renderPage(page) : null}
            </View>
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  page: {
    height: '100%',
  },
});
