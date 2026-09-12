import { z } from 'zod';

/**
 * A transaction's category: a fixed, closed preset list — there is no way to
 * create, rename or reorder one yet (see `docs/specs/transactions.md`). Kept
 * here, not in a database table, since nothing today needs that flexibility;
 * promote it to a table if custom categories are ever added.
 */
export const transactionCategorySchema = z.enum([
  'groceries',
  'restaurant',
  'leisure',
  'housing',
  'transport',
  'travel',
  'health',
  'shopping',
  'bills',
  'gifts',
  'education',
  'pets',
  'other',
]);
export type TransactionCategory = z.infer<typeof transactionCategorySchema>;

/** What an uncategorised transaction is recorded and returned as. */
export const DEFAULT_TRANSACTION_CATEGORY: TransactionCategory = 'other';

export interface CategoryDefinition {
  key: TransactionCategory;
  /** What identifies the category at a glance, next to its label everywhere it appears. */
  emoji: string;
  label: string;
  /**
   * The category's own colour, part of its identity rather than a per-screen
   * choice: a statistics chart and its legend must agree on it. Mid-lightness
   * on purpose, so every value reads on both the light and the dark theme.
   * Never the only carrier of meaning — the emoji and label always come along.
   */
  color: string;
}

/** Display order for any category picker or legend — deliberately not alphabetical. */
export const TRANSACTION_CATEGORIES: readonly CategoryDefinition[] = [
  { key: 'groceries', emoji: '🛒', label: 'Groceries', color: '#3FA96B' },
  { key: 'restaurant', emoji: '🍽️', label: 'Bar & Restaurant', color: '#E4633C' },
  { key: 'leisure', emoji: '🎉', label: 'Leisure', color: '#A45CD6' },
  { key: 'housing', emoji: '🏠', label: 'Housing', color: '#3D7FD1' },
  { key: 'transport', emoji: '🚗', label: 'Transport', color: '#DD9B26' },
  { key: 'travel', emoji: '✈️', label: 'Travel', color: '#29AEC0' },
  { key: 'health', emoji: '💊', label: 'Health', color: '#DE4C7E' },
  { key: 'shopping', emoji: '🛍️', label: 'Shopping', color: '#6C63D8' },
  { key: 'bills', emoji: '💡', label: 'Bills & Utilities', color: '#9FAE2B' },
  { key: 'gifts', emoji: '🎁', label: 'Gifts', color: '#D4404A' },
  { key: 'education', emoji: '📚', label: 'Education', color: '#2FB093' },
  { key: 'pets', emoji: '🐾', label: 'Pets', color: '#A9744E' },
  { key: 'other', emoji: '🧾', label: 'Other', color: '#8A9199' },
];

const categoryByKey: ReadonlyMap<TransactionCategory, CategoryDefinition> = new Map(
  TRANSACTION_CATEGORIES.map((category) => [category.key, category]),
);

/** The emoji + label for a category key, or `undefined` for `null` / no category. */
export function categoryDefinition(
  key: TransactionCategory | null | undefined,
): CategoryDefinition | undefined {
  return key ? categoryByKey.get(key) : undefined;
}
