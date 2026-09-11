import { describe, expect, it } from 'vitest';

import {
  categoryDefinition,
  TRANSACTION_CATEGORIES,
  transactionCategorySchema,
} from './categories.js';

describe('transactionCategorySchema', () => {
  it('accepts every preset key', () => {
    for (const category of TRANSACTION_CATEGORIES) {
      expect(transactionCategorySchema.safeParse(category.key).success).toBe(true);
    }
  });

  it('rejects an unknown category', () => {
    expect(transactionCategorySchema.safeParse('crypto').success).toBe(false);
  });
});

describe('TRANSACTION_CATEGORIES', () => {
  it('has no duplicate keys', () => {
    const keys = TRANSACTION_CATEGORIES.map((category) => category.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every category a non-empty emoji and label', () => {
    for (const category of TRANSACTION_CATEGORIES) {
      expect(category.emoji.length).toBeGreaterThan(0);
      expect(category.label.length).toBeGreaterThan(0);
    }
  });
});

describe('categoryDefinition', () => {
  it('resolves a known key', () => {
    expect(categoryDefinition('groceries')).toEqual({
      key: 'groceries',
      emoji: '🛒',
      label: 'Groceries',
    });
  });

  it('returns undefined for null or undefined', () => {
    expect(categoryDefinition(null)).toBeUndefined();
    expect(categoryDefinition(undefined)).toBeUndefined();
  });
});
