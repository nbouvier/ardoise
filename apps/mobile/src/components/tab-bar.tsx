import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface TabOption<Key extends string> {
  key: Key;
  label: string;
}

export interface TabBarProps<Key extends string> {
  tabs: readonly TabOption<Key>[];
  selected: Key;
  onSelect: (key: Key) => void;
}

/**
 * The tabs *within* a screen — an underlined row, one of which is always
 * selected. Not the app's bottom tabs: those switch between screens, these
 * switch between the parts of one (a group's transactions, balances,
 * statistics and management). Stretches to fill the width when it fits and
 * scrolls sideways when it does not, so a long label or a narrow phone never
 * squeezes one out.
 */
export function TabBar<Key extends string>({ tabs, selected, onSelect }: TabBarProps<Key>) {
  const theme = useTheme();

  return (
    <View style={[styles.wrapper, { borderBottomColor: theme.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityRole="tablist">
        {tabs.map((tab) => {
          const active = tab.key === selected;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(tab.key)}
              style={({ pressed }) => [
                styles.tab,
                { borderBottomColor: active ? theme.primary : 'transparent' },
                pressed && styles.pressed,
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
    // Sits on the wrapper's own rule, so the selected tab's line replaces it.
    borderBottomWidth: 2,
    marginBottom: -StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.6,
  },
});
