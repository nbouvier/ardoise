import { describe, expect, it } from 'vitest';

import type { TransactionCategory } from './categories.js';
import { categoryBreakdown } from './statistics.js';
import type { Transaction, TransactionKind } from './transactions.js';

const alice = { id: 'alice', name: 'Alice', picture: null };
const bob = { id: 'bob', name: 'Bob', picture: null };

/** A transaction with only what a breakdown reads; the rest is plausible filler. */
function transaction(overrides: {
  kind?: TransactionKind;
  category?: TransactionCategory;
  amountCents: number;
  /** Keyed by user id; the key `others` is Others' share. */
  shares?: Record<string, number>;
  /** Defaults to Alice; `null` is Others. */
  payer?: Transaction['payer'];
}): Transaction {
  const { kind = 'expense', category = 'other', amountCents, shares, payer = alice } = overrides;
  const participants = Object.entries(shares ?? { alice: amountCents }).map(
    ([userId, shareCents]) => ({
      user:
        userId === 'others'
          ? null
          : userId === 'bob'
            ? bob
            : { ...alice, id: userId, name: userId },
      shareCents,
      weight: null,
    }),
  );

  return {
    id: `tx-${Math.random()}`,
    groupId: 'group',
    kind,
    title: 'Something',
    amountCents,
    occurredOn: '2026-01-01',
    comment: null,
    category,
    payer,
    splitMode: 'amount',
    participants,
    createdBy: alice.id,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const groupSpending = { type: 'spending' } as const;

describe('categoryBreakdown', () => {
  it('sums each category and orders the slices largest first', () => {
    const result = categoryBreakdown(
      [
        transaction({ category: 'groceries', amountCents: 1000 }),
        transaction({ category: 'restaurant', amountCents: 3000 }),
        transaction({ category: 'groceries', amountCents: 1000 }),
      ],
      groupSpending,
    );

    expect(result.totalCents).toBe(5000);
    expect(result.slices).toEqual([
      { category: 'restaurant', amountCents: 3000, percent: 60 },
      { category: 'groceries', amountCents: 2000, percent: 40 },
    ]);
  });

  it('leaves out a category nothing was spent on', () => {
    const result = categoryBreakdown(
      [transaction({ category: 'travel', amountCents: 500 })],
      groupSpending,
    );

    expect(result.slices.map((slice) => slice.category)).toEqual(['travel']);
  });

  it('counts an uncategorised transaction under Other', () => {
    const result = categoryBreakdown([transaction({ amountCents: 500 })], groupSpending);

    expect(result.slices).toEqual([{ category: 'other', amountCents: 500, percent: 100 }]);
  });

  it('ignores transfers entirely', () => {
    const result = categoryBreakdown(
      [
        transaction({ category: 'housing', amountCents: 2000 }),
        transaction({ kind: 'transfer', category: 'housing', amountCents: 9999 }),
      ],
      groupSpending,
    );

    expect(result.totalCents).toBe(2000);
  });

  it('ignores incomes when measuring spending, and expenses when measuring income', () => {
    const transactions = [
      transaction({ kind: 'expense', category: 'travel', amountCents: 2000 }),
      transaction({ kind: 'income', category: 'travel', amountCents: 700 }),
      transaction({ kind: 'transfer', category: 'travel', amountCents: 5000 }),
    ];

    expect(categoryBreakdown(transactions, groupSpending).totalCents).toBe(2000);
    expect(categoryBreakdown(transactions, { type: 'income' }).totalCents).toBe(700);
  });

  it('is empty for a group holding only transfers', () => {
    const result = categoryBreakdown(
      [transaction({ kind: 'transfer', amountCents: 4200 })],
      groupSpending,
    );

    expect(result).toEqual({ totalCents: 0, slices: [] });
  });

  it('is empty for no transactions at all', () => {
    expect(categoryBreakdown([], groupSpending)).toEqual({ totalCents: 0, slices: [] });
  });

  describe('Others (people outside the group)', () => {
    it('never counts Others’ share, even with everyone selected', () => {
      // 60 € with 30 € for Others: the group itself consumed 30 €, not 60 €.
      const result = categoryBreakdown(
        [
          transaction({
            category: 'restaurant',
            amountCents: 6000,
            shares: { alice: 1000, bob: 2000, others: 3000 },
          }),
        ],
        groupSpending,
      );

      expect(result.totalCents).toBe(3000);
      expect(result.slices).toEqual([
        { category: 'restaurant', amountCents: 3000, percent: 100 },
      ]);
    });

    it('counts the members’ shares of a transaction Others paid', () => {
      const result = categoryBreakdown(
        [transaction({ amountCents: 1500, payer: null, shares: { alice: 1000, others: 500 } })],
        groupSpending,
      );

      expect(result.totalCents).toBe(1000);
    });

    it('is empty for a transaction only Others takes part in', () => {
      const result = categoryBreakdown(
        [transaction({ amountCents: 4000, shares: { others: 4000 } })],
        groupSpending,
      );

      expect(result).toEqual({ totalCents: 0, slices: [] });
    });

    it('leaves Others out of a chosen subset', () => {
      const result = categoryBreakdown(
        [transaction({ amountCents: 3000, shares: { alice: 1000, others: 2000 } })],
        { type: 'spending', participantIds: ['alice', 'bob'] },
      );

      expect(result.totalCents).toBe(1000);
    });
  });

  describe('a chosen subset of participants', () => {
    const alicesShare = { type: 'spending', participantIds: ['alice'] } as const;

    it('counts only the selected member’s own share, not the whole amount', () => {
      const result = categoryBreakdown(
        [
          transaction({
            category: 'restaurant',
            amountCents: 3000,
            shares: { alice: 1000, bob: 2000 },
          }),
        ],
        alicesShare,
      );

      expect(result.totalCents).toBe(1000);
      expect(result.slices).toEqual([
        { category: 'restaurant', amountCents: 1000, percent: 100 },
      ]);
    });

    it('sums the shares of every selected member', () => {
      const result = categoryBreakdown(
        [
          transaction({
            category: 'restaurant',
            amountCents: 3000,
            shares: { alice: 1000, bob: 2000 },
          }),
        ],
        { type: 'spending', participantIds: ['alice', 'bob'] },
      );

      expect(result.totalCents).toBe(3000);
    });

    it('counts nothing for a transaction the selected member paid but does not take part in', () => {
      // Alice is the payer on every transaction this factory builds; here the
      // split concerns Bob alone, so her own breakdown must stay empty.
      const result = categoryBreakdown(
        [transaction({ category: 'gifts', amountCents: 2500, shares: { bob: 2500 } })],
        alicesShare,
      );

      expect(result).toEqual({ totalCents: 0, slices: [] });
    });

    it('is empty for an empty selection', () => {
      const result = categoryBreakdown([transaction({ amountCents: 500 })], {
        type: 'spending',
        participantIds: [],
      });

      expect(result).toEqual({ totalCents: 0, slices: [] });
    });
  });

  describe('percentages', () => {
    it('sums to exactly 100 when the split does not divide evenly', () => {
      const result = categoryBreakdown(
        [
          transaction({ category: 'groceries', amountCents: 1 }),
          transaction({ category: 'travel', amountCents: 1 }),
          transaction({ category: 'housing', amountCents: 1 }),
        ],
        groupSpending,
      );

      expect(result.slices.map((slice) => slice.percent)).toEqual([34, 33, 33]);
    });

    it('keeps a sliver visible with its real rounded share', () => {
      const result = categoryBreakdown(
        [
          transaction({ category: 'housing', amountCents: 100_000 }),
          transaction({ category: 'pets', amountCents: 1 }),
        ],
        groupSpending,
      );

      expect(result.slices).toEqual([
        { category: 'housing', amountCents: 100_000, percent: 100 },
        { category: 'pets', amountCents: 1, percent: 0 },
      ]);
    });

    it('always sums to 100, and amounts to the total, across many shapes', () => {
      const categories: TransactionCategory[] = [
        'groceries',
        'restaurant',
        'leisure',
        'housing',
        'transport',
        'travel',
        'health',
      ];

      for (let count = 1; count <= categories.length; count += 1) {
        for (let seed = 1; seed <= 40; seed += 1) {
          const transactions = categories.slice(0, count).map((category, index) =>
            transaction({ category, amountCents: seed * 7 + index * 13 + 1 }),
          );
          const result = categoryBreakdown(transactions, groupSpending);

          const amounts = result.slices.reduce((sum, slice) => sum + slice.amountCents, 0);
          const percents = result.slices.reduce((sum, slice) => sum + slice.percent, 0);

          expect(amounts).toBe(result.totalCents);
          expect(percents).toBe(100);
        }
      }
    });
  });

  it('breaks an equal-amount tie by the preset category order', () => {
    const result = categoryBreakdown(
      [
        transaction({ category: 'travel', amountCents: 1000 }),
        transaction({ category: 'groceries', amountCents: 1000 }),
        transaction({ category: 'housing', amountCents: 1000 }),
      ],
      groupSpending,
    );

    expect(result.slices.map((slice) => slice.category)).toEqual([
      'groceries',
      'housing',
      'travel',
    ]);
  });
});
