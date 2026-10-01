import { TRANSACTION_CATEGORIES, type TransactionCategory } from '@splitcount/shared';
import { Fragment } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface CategoryPickerProps {
  value: TransactionCategory;
  onChange: (value: TransactionCategory) => void;
}

/**
 * The fixed preset categories as a dropdown list, one row per category —
 * the same row-and-divider language as a group's own "⋮" menu, rather than a
 * grid of pills. The current pick is a tinted row, like every other
 * single-select list in the form: no separate checkmark. Every transaction
 * has a category (`Other` when none was chosen), so there is no "clear"
 * gesture — picking `Other` itself is the neutral option. The list itself is
 * closed (`@splitcount/shared`'s `categories.ts`).
 */
export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  const theme = useTheme();

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      {TRANSACTION_CATEGORIES.map((category, index) => {
        const selected = category.key === value;
        return (
          <Fragment key={category.key}>
            {index > 0 ? <View style={[styles.divider, { backgroundColor: theme.border }]} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={category.label}
              accessibilityState={{ selected }}
              onPress={() => onChange(category.key)}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: selected
                    ? theme.primarySoft
                    : pressed
                      ? theme.backgroundSelected
                      : 'transparent',
                },
              ]}>
              <ThemedText style={styles.emoji}>{category.emoji}</ThemedText>
              <ThemedText type="smallBold">{category.label}</ThemedText>
            </Pressable>
          </Fragment>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 320,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
  },
  emoji: {
    width: 24,
    fontSize: 18,
    textAlign: 'center',
  },
  divider: {
    height: 1,
  },
});
