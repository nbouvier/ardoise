import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { Pressable, useColorScheme, useWindowDimensions, View, StyleSheet } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';

/**
 * Below this window width the wordmark and the four tabs no longer fit side by
 * side (they need about 500px), so the bar turns compact: no wordmark — the
 * home hero already says "Ardoise" — and the tabs share the whole bar.
 */
const CompactTabBarWidth = 540;

export default function AppTabs() {
  const { width } = useWindowDimensions();
  const compact = width < CompactTabBarWidth;

  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList compact={compact}>
          <TabTrigger name="home" href="/" asChild>
            <TabButton compact={compact}>Home</TabButton>
          </TabTrigger>
          <TabTrigger name="groups" href="/groups" asChild>
            <TabButton compact={compact}>Groups</TabButton>
          </TabTrigger>
          <TabTrigger name="friends" href="/friends" asChild>
            <TabButton compact={compact}>Friends</TabButton>
          </TabTrigger>
          <TabTrigger name="account" href="/account" asChild>
            <TabButton compact={compact}>Account</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({
  children,
  isFocused,
  compact,
  ...props
}: TabTriggerSlotProps & { compact?: boolean }) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [
        styles.tabButton,
        compact && styles.compactTabButton,
        pressed && styles.pressed,
      ]}>
      <ThemedView
        type={isFocused ? 'primary' : 'transparent'}
        style={[styles.tabButtonView, compact && styles.compactTabButtonView]}>
        <ThemedText
          type="smallBold"
          themeColor={isFocused ? 'onPrimary' : 'textSecondary'}
          numberOfLines={1}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList({ compact, ...props }: TabListProps & { compact?: boolean }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView
        type="surface"
        style={[
          styles.innerContainer,
          compact && styles.compactInnerContainer,
          { borderColor: colors.border },
        ]}>
        {!compact && (
          <ThemedText
            type="sectionTitle"
            themeColor="primary"
            numberOfLines={1}
            style={styles.brandText}>
            Ardoise
          </ThemedText>
        )}

        {props.children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    // Never wider than the window: a bar wider than its row would spill out on
    // both sides (it is centred), off-screen on the left and widening the page.
    flexShrink: 1,
    minWidth: 0,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  compactInnerContainer: {
    paddingHorizontal: Spacing.two,
    gap: Spacing.one,
  },
  brandText: {
    marginRight: 'auto',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButton: {
    flexShrink: 1,
    minWidth: 0,
  },
  compactTabButton: {
    flexGrow: 1,
  },
  tabButtonView: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  compactTabButtonView: {
    paddingHorizontal: Spacing.two,
  },
});
