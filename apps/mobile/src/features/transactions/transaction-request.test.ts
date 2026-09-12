import type { Transaction } from '@splitcount/shared';
import { describe, expect, it } from '@jest/globals';

import { splitFrom, toUpdateRequest } from './transaction-request';

const ada = { id: 'ada', name: 'Ada Lovelace', picture: null };
const grace = { id: 'grace', name: 'Grace Hopper', picture: null };

const sharesExpense: Transaction = {
  id: 'tx-1',
  groupId: 'group-1',
  kind: 'expense',
  title: 'Groceries',
  amountCents: 1000,
  occurredOn: '2026-09-11',
  comment: 'Weekly run',
  category: 'groceries',
  payer: ada,
  splitMode: 'shares',
  participants: [
    { user: ada, shareCents: 600, weight: 2 },
    { user: grace, shareCents: 400, weight: 1 },
  ],
  createdBy: ada.id,
  createdAt: '2026-09-11T12:00:00.000Z',
  updatedAt: '2026-09-11T12:00:00.000Z',
};

const transfer: Transaction = {
  ...sharesExpense,
  kind: 'transfer',
  splitMode: 'amount',
  participants: [{ user: grace, shareCents: 1000, weight: null }],
};

describe('splitFrom', () => {
  it('rebuilds a shares split with each participant’s weight', () => {
    expect(splitFrom(sharesExpense)).toEqual({
      mode: 'shares',
      participants: [
        { userId: ada.id, weight: 2 },
        { userId: grace.id, weight: 1 },
      ],
    });
  });

  it('rebuilds an amount split from each participant’s share', () => {
    const amountExpense: Transaction = {
      ...sharesExpense,
      splitMode: 'amount',
      participants: [
        { user: ada, shareCents: 700, weight: null },
        { user: grace, shareCents: 300, weight: null },
      ],
    };

    expect(splitFrom(amountExpense)).toEqual({
      mode: 'amount',
      participants: [
        { userId: ada.id, amount: 700 },
        { userId: grace.id, amount: 300 },
      ],
    });
  });
});

describe('toUpdateRequest', () => {
  it('carries every field over unchanged, with the category overridden', () => {
    expect(toUpdateRequest(sharesExpense, { category: 'restaurant' })).toEqual({
      kind: 'expense',
      title: 'Groceries',
      amount: 1000,
      occurredOn: '2026-09-11',
      comment: 'Weekly run',
      category: 'restaurant',
      payerId: ada.id,
      split: {
        mode: 'shares',
        participants: [
          { userId: ada.id, weight: 2 },
          { userId: grace.id, weight: 1 },
        ],
      },
    });
  });

  it('rebuilds a transfer with its single recipient instead of a split', () => {
    expect(toUpdateRequest(transfer, { category: 'other' })).toEqual({
      kind: 'transfer',
      title: 'Groceries',
      amount: 1000,
      occurredOn: '2026-09-11',
      comment: 'Weekly run',
      category: 'other',
      payerId: ada.id,
      toUserId: grace.id,
    });
  });
});
