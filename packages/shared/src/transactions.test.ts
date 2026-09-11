import { describe, expect, it } from 'vitest';

import { createTransactionRequestSchema, splitByShares, splitInputSchema, splitSumsTo } from './transactions.js';

describe('splitByShares', () => {
  it('splits evenly when the total divides exactly', () => {
    const result = splitByShares(400, [
      { userId: 'a', weight: 1 },
      { userId: 'b', weight: 1 },
      { userId: 'c', weight: 2 },
    ]);

    expect(result).toEqual([
      { userId: 'a', shareCents: 100 },
      { userId: 'b', shareCents: 100 },
      { userId: 'c', shareCents: 200 },
    ]);
  });

  it('distributes the remainder to the largest fractional remainders', () => {
    // 10.00 / 3 = 3.33(3) each: one of the three gets the extra cent.
    const result = splitByShares(1000, [
      { userId: 'a', weight: 1 },
      { userId: 'b', weight: 1 },
      { userId: 'c', weight: 1 },
    ]);

    expect(result).toEqual([
      { userId: 'a', shareCents: 334 },
      { userId: 'b', shareCents: 333 },
      { userId: 'c', shareCents: 333 },
    ]);
  });

  it('breaks a remainder tie by userId, deterministically', () => {
    // Every remainder is identical (0.2); only one participant gets the cent.
    const result = splitByShares(1, [
      { userId: 'zebra', weight: 1 },
      { userId: 'alpha', weight: 1 },
      { userId: 'mid', weight: 1 },
      { userId: 'delta', weight: 1 },
      { userId: 'bravo', weight: 1 },
    ]);

    expect(result.find((r) => r.userId === 'alpha')?.shareCents).toBe(1);
    expect(result.filter((r) => r.shareCents === 0)).toHaveLength(4);
  });

  it('keeps the caller’s participant order in the result', () => {
    const result = splitByShares(300, [
      { userId: 'c', weight: 1 },
      { userId: 'a', weight: 1 },
      { userId: 'b', weight: 1 },
    ]);

    expect(result.map((r) => r.userId)).toEqual(['c', 'a', 'b']);
  });

  it('always sums to exactly the total, across totals, weights and group sizes', () => {
    for (let total = 0; total <= 97; total += 1) {
      for (let count = 1; count <= 7; count += 1) {
        const participants = Array.from({ length: count }, (_, index) => ({
          userId: `user-${index}`,
          // Vary weights so unequal splits are covered too, not just 1s.
          weight: ((index * 3 + total) % 5) + 1,
        }));

        const result = splitByShares(total, participants);
        expect(splitSumsTo(total, result)).toBe(true);
      }
    }
  });

  it('rejects an empty participant list', () => {
    expect(() => splitByShares(100, [])).toThrow();
  });

  it('rejects a total weight of zero', () => {
    expect(() =>
      splitByShares(100, [
        { userId: 'a', weight: 0 },
        { userId: 'b', weight: 0 },
      ]),
    ).toThrow();
  });
});

describe('splitSumsTo', () => {
  it('is true when shares sum to the total', () => {
    expect(splitSumsTo(500, [{ userId: 'a', shareCents: 300 }, { userId: 'b', shareCents: 200 }])).toBe(true);
  });

  it('is false otherwise', () => {
    expect(splitSumsTo(500, [{ userId: 'a', shareCents: 300 }, { userId: 'b', shareCents: 199 }])).toBe(false);
  });
});

describe('splitInputSchema', () => {
  it('accepts a valid shares split', () => {
    const result = splitInputSchema.safeParse({
      mode: 'shares',
      participants: [{ userId: '11111111-1111-4111-8111-111111111111', weight: 1 }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid amount split', () => {
    const result = splitInputSchema.safeParse({
      mode: 'amount',
      participants: [{ userId: '11111111-1111-4111-8111-111111111111', amount: 500 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a duplicate participant', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const result = splitInputSchema.safeParse({
      mode: 'shares',
      participants: [
        { userId: id, weight: 1 },
        { userId: id, weight: 2 },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('createTransactionRequestSchema', () => {
  const payerId = '11111111-1111-4111-8111-111111111111';
  const otherId = '22222222-2222-4222-8222-222222222222';

  it('accepts an expense with a shares split', () => {
    const result = createTransactionRequestSchema.safeParse({
      kind: 'expense',
      title: 'Groceries',
      amount: 4250,
      occurredOn: '2026-09-11',
      payerId,
      split: { mode: 'shares', participants: [{ userId: payerId, weight: 1 }, { userId: otherId, weight: 1 }] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a transfer with a single recipient and no split', () => {
    const result = createTransactionRequestSchema.safeParse({
      kind: 'transfer',
      title: 'Reimbursement',
      amount: 2000,
      occurredOn: '2026-09-11',
      payerId,
      toUserId: otherId,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a transfer missing toUserId', () => {
    const result = createTransactionRequestSchema.safeParse({
      kind: 'transfer',
      title: 'Reimbursement',
      amount: 2000,
      occurredOn: '2026-09-11',
      payerId,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive amount', () => {
    const result = createTransactionRequestSchema.safeParse({
      kind: 'expense',
      title: 'Groceries',
      amount: 0,
      occurredOn: '2026-09-11',
      payerId,
      split: { mode: 'shares', participants: [{ userId: payerId, weight: 1 }] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty title', () => {
    const result = createTransactionRequestSchema.safeParse({
      kind: 'expense',
      title: '',
      amount: 100,
      occurredOn: '2026-09-11',
      payerId,
      split: { mode: 'shares', participants: [{ userId: payerId, weight: 1 }] },
    });
    expect(result.success).toBe(false);
  });
});
