import type { Transaction } from '@ardoise/shared';
import { describe, expect, it } from '@jest/globals';

import { formParties, splitFrom } from './transaction-request';

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

describe('formParties', () => {
  const alan = { id: 'alan', name: 'Alan Turing', picture: null };

  it('offers the current members on a new transaction', () => {
    expect(formParties([ada, grace], undefined)).toEqual([ada, grace]);
  });

  it('adds whoever the edited transaction names but has left the group, once', () => {
    const named: Transaction = {
      ...sharesExpense,
      payer: grace,
      participants: [
        { user: ada, shareCents: 500, weight: 1 },
        { user: grace, shareCents: 500, weight: 1 },
        { user: null, shareCents: 0, weight: 1 },
      ],
    };

    expect(formParties([ada, alan], named)).toEqual([ada, alan, grace]);
  });
});

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
