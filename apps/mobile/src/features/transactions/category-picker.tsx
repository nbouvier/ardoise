import { TRANSACTION_CATEGORIES, type TransactionCategory } from '@splitcount/shared';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface CategoryPickerProps {
  value: TransactionCategory | null;
  onChange: (value: TransactionCategory | null) => void;
}

/**
 * A grid of the fixed preset categories — single-select, and tapping the
 * already-selected one clears it back to "none". No way to add one here;
 * the list is closed (`@splitcount/shared`'s `categories.ts`).
 */
export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  const theme = useTheme();

  return (
    <View style={styles.grid}>
      {TRANSACTION_CATEGORIES.map((category) => {
        const selected = category.key === value;
        return (
          <Pressable
            key={category.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={category.label}
            onPress={() => onChange(selected ? null : category.key)}
            style={[
              styles.pill,
              { borderColor: theme.text },
              selected && { backgroundColor: theme.text },
            ]}>
            <ThemedText type="small" style={selected ? { color: theme.background } : undefined}>
              {category.emoji} {category.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pill: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
