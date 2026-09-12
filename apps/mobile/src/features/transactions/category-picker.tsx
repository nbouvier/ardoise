import { TRANSACTION_CATEGORIES, type TransactionCategory } from '@splitcount/shared';
import { StyleSheet, View } from 'react-native';

import { Pill } from '@/components/pill';
import { Spacing } from '@/constants/theme';

export interface CategoryPickerProps {
  value: TransactionCategory;
  onChange: (value: TransactionCategory) => void;
}

/**
 * A grid of the fixed preset categories — single-select. Every transaction
 * has a category (`Other` when none was chosen), so there is no "clear"
 * gesture: picking `Other` itself is how you get the neutral option. No way
 * to add one here; the list is closed (`@splitcount/shared`'s `categories.ts`).
 *
 * A selected pill fills with the category's own colour rather than the brand
 * hue — the same colour the statistics chart gives it.
 */
export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  return (
    <View style={styles.grid}>
      {TRANSACTION_CATEGORIES.map((category) => (
        <Pill
          key={category.key}
          label={`${category.emoji} ${category.label}`}
          accessibilityLabel={category.label}
          color={category.color}
          selected={category.key === value}
          onPress={() => onChange(category.key)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
