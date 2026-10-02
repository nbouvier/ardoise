import { withLayoutContext } from 'expo-router';
import {
  CommonActions,
  TabRouter,
  useNavigationBuilder,
  type DefaultNavigatorOptions,
  type EventMapBase,
  type ParamListBase,
  type TabActionHelpers,
  type TabNavigationState,
  type TabRouterOptions,
} from 'expo-router/react-navigation';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Pager } from '@/components/pager';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface PagerTabsOptions {
  /** The tab's label in the bar. */
  title?: string;
  icon?: IconName;
  /** Draws something other than a glyph in the icon's slot — the Account tab's own avatar. */
  renderIcon?: (props: { color: string; active: boolean }) => ReactNode;
}

type PagerTabsProps = DefaultNavigatorOptions<
  ParamListBase,
  string | undefined,
  TabNavigationState<ParamListBase>,
  PagerTabsOptions,
  EventMapBase,
  unknown
> &
  TabRouterOptions;

/** The pill behind the selected tab's icon. */
const PILL_WIDTH = 64;
const PILL_HEIGHT = 32;

/**
 * The app's bottom tabs as pages side by side: a sideways swipe drags the
 * next tab's page in (it is drawn already, so it shows as it comes), and the
 * pill in the bar travels with it. Tapping a tab slides there the same way.
 * See "Motion" in docs/DESIGN.md.
 */
function PagerTabsNavigator({
  id,
  initialRouteName,
  backBehavior,
  children,
  screenListeners,
  screenOptions,
}: PagerTabsProps) {
  const { state, navigation, descriptors, NavigationContent } = useNavigationBuilder<
    TabNavigationState<ParamListBase>,
    TabRouterOptions,
    TabActionHelpers<ParamListBase>,
    PagerTabsOptions,
    EventMapBase
  >(TabRouter, { id, initialRouteName, backBehavior, children, screenListeners, screenOptions });
  const position = useSharedValue(state.index);

  function select(index: number) {
    const route = state.routes[index];
    if (route && index !== state.index) {
      navigation.dispatch({
        ...CommonActions.navigate(route.name, route.params),
        target: state.key,
      });
    }
  }

  return (
    <NavigationContent>
      <View style={styles.container}>
        <Pager
          index={state.index}
          count={state.routes.length}
          position={position}
          onIndexChange={select}
          renderPage={(index) => descriptors[state.routes[index]!.key]!.render()}
        />
        <BottomBar
          tabs={state.routes.map((route) => {
            const { options } = descriptors[route.key]!;
            return {
              key: route.key,
              title: options.title ?? route.name,
              icon: options.icon,
              renderIcon: options.renderIcon,
            };
          })}
          index={state.index}
          position={position}
          onSelect={select}
        />
      </View>
    </NavigationContent>
  );
}

function BottomBar({
  tabs,
  index,
  position,
  onSelect,
}: {
  tabs: {
    key: string;
    title: string;
    icon?: IconName;
    renderIcon?: PagerTabsOptions['renderIcon'];
  }[];
  index: number;
  position: SharedValue<number>;
  onSelect: (index: number) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const width = useSharedValue(0);

  const pill = useAnimatedStyle(() => {
    const item = width.get() / tabs.length;
    return {
      opacity: width.get() > 0 ? 1 : 0,
      transform: [{ translateX: position.get() * item + (item - PILL_WIDTH) / 2 }],
    };
  });

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          paddingBottom: insets.bottom,
        },
      ]}>
      <View
        style={styles.items}
        onLayout={(event) => {
          width.set(event.nativeEvent.layout.width);
        }}>
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, { backgroundColor: theme.primarySoft }, pill]}
        />
        {tabs.map((tab, tabIndex) => {
          const active = tabIndex === index;
          const color = active ? theme.primary : theme.textSecondary;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.title}
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(tabIndex)}
              style={styles.item}>
              {({ pressed }) => (
                <>
                  <View style={styles.iconSlot}>
                    {/* Pressed, a lighter pill shows where the real one is about to go. */}
                    {pressed && !active ? (
                      <View
                        style={[
                          StyleSheet.absoluteFill,
                          styles.wash,
                          { backgroundColor: theme.primarySoft },
                        ]}
                      />
                    ) : null}
                    {tab.renderIcon ? (
                      tab.renderIcon({ color, active })
                    ) : tab.icon ? (
                      <Icon
                        name={tab.icon}
                        size={24}
                        strokeWidth={active ? 2.2 : 1.9}
                        color={color}
                      />
                    ) : null}
                  </View>
                  <ThemedText
                    type={active ? 'smallBold' : 'small'}
                    themeColor={active ? 'primary' : 'textSecondary'}
                    numberOfLines={1}>
                    {tab.title}
                  </ThemedText>
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * The navigator for `app/(tabs)`, in place of the native tab bar, whose
 * screens cannot be dragged in and whose indicator cannot follow a finger.
 */
export const PagerTabs = withLayoutContext<
  PagerTabsOptions,
  typeof PagerTabsNavigator,
  TabNavigationState<ParamListBase>,
  EventMapBase
>(PagerTabsNavigator);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  items: {
    flexDirection: 'row',
  },
  pill: {
    position: 'absolute',
    left: 0,
    top: Spacing.two + Spacing.one,
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    borderRadius: Radius.pill,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
    paddingTop: Spacing.two + Spacing.one,
    paddingBottom: Spacing.three,
  },
  iconSlot: {
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wash: {
    borderRadius: Radius.pill,
    opacity: 0.5,
  },
});
