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

  it('gives every category its own hex colour', () => {
    const colors = TRANSACTION_CATEGORIES.map((category) => category.color);

    for (const color of colors) {
      expect(color).toMatch(/^#[0-9A-F]{6}$/);
    }
    // A shared colour would make two slices of the same chart indistinguishable.
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe('categoryDefinition', () => {
  it('resolves a known key', () => {
    expect(categoryDefinition('groceries')).toEqual({
      key: 'groceries',
      emoji: '🛒',
      label: 'Groceries',
      color: '#3FA96B',
    });
  });

  it('returns undefined for null or undefined', () => {
    expect(categoryDefinition(null)).toBeUndefined();
    expect(categoryDefinition(undefined)).toBeUndefined();
  });
});
