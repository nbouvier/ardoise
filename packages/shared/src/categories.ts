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

export interface CategoryDefinition {
  key: TransactionCategory;
  /** What identifies the category at a glance, next to its label everywhere it appears. */
  emoji: string;
  label: string;
}

/** Display order for any category picker or legend — deliberately not alphabetical. */
export const TRANSACTION_CATEGORIES: readonly CategoryDefinition[] = [
  { key: 'groceries', emoji: '🛒', label: 'Groceries' },
  { key: 'restaurant', emoji: '🍽️', label: 'Bar & Restaurant' },
  { key: 'leisure', emoji: '🎉', label: 'Leisure' },
  { key: 'housing', emoji: '🏠', label: 'Housing' },
  { key: 'transport', emoji: '🚗', label: 'Transport' },
  { key: 'travel', emoji: '✈️', label: 'Travel' },
  { key: 'health', emoji: '💊', label: 'Health' },
  { key: 'shopping', emoji: '🛍️', label: 'Shopping' },
  { key: 'bills', emoji: '💡', label: 'Bills & Utilities' },
  { key: 'gifts', emoji: '🎁', label: 'Gifts' },
  { key: 'education', emoji: '📚', label: 'Education' },
  { key: 'pets', emoji: '🐾', label: 'Pets' },
  { key: 'other', emoji: '🧾', label: 'Other' },
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
