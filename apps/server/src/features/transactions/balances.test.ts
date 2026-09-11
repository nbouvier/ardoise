import { describe, expect, it } from 'vitest';

import type { TransactionParticipantRow, TransactionRow } from '../../db/schema.js';

import { computeBalances, groupParticipantsByTransaction } from './balances.js';

const now = new Date('2026-09-11T12:00:00.000Z');

function transaction(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 'tx-1',
    groupId: 'group-1',
    kind: 'expense',
    title: 'Groceries',
    amountCents: 1000,
    occurredOn: '2026-09-11',
    comment: null,
    payerId: 'alice',
    splitMode: 'shares',
    createdBy: 'alice',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function participant(overrides: Partial<TransactionParticipantRow>): TransactionParticipantRow {
  return {
    id: `${overrides.transactionId}-${overrides.userId}`,
    transactionId: 'tx-1',
    userId: 'alice',
    shareCents: 0,
    weight: null,
    ...overrides,
  };
}

function byTx(participants: TransactionParticipantRow[]) {
  return groupParticipantsByTransaction(participants);
}

describe('computeBalances', () => {
  it('credits the payer and debits each participant, for an expense', () => {
    const tx = transaction({ id: 'tx-1', payerId: 'alice', amountCents: 900 });
    const participants = [
      participant({ transactionId: 'tx-1', userId: 'alice', shareCents: 300 }),
      participant({ transactionId: 'tx-1', userId: 'bob', shareCents: 300 }),
      participant({ transactionId: 'tx-1', userId: 'carole', shareCents: 300 }),
    ];

    const balances = computeBalances([tx], byTx(participants));

    // Alice paid 900 and owes 300 of it herself: net +600.
    expect(balances.get('alice')).toBe(600);
    expect(balances.get('bob')).toBe(-300);
    expect(balances.get('carole')).toBe(-300);
  });

  it('reverses the sign for an income', () => {
    const tx = transaction({ id: 'tx-1', kind: 'income', payerId: 'alice', amountCents: 900 });
    const participants = [
      participant({ transactionId: 'tx-1', userId: 'bob', shareCents: 450 }),
      participant({ transactionId: 'tx-1', userId: 'carole', shareCents: 450 }),
    ];

    const balances = computeBalances([tx], byTx(participants));

    expect(balances.get('alice')).toBe(-900);
    expect(balances.get('bob')).toBe(450);
    expect(balances.get('carole')).toBe(450);
  });

  it('behaves like a plain expense with one participant, for a transfer', () => {
    const tx = transaction({ id: 'tx-1', kind: 'transfer', payerId: 'alice', amountCents: 500 });
    const participants = [participant({ transactionId: 'tx-1', userId: 'bob', shareCents: 500 })];

    const balances = computeBalances([tx], byTx(participants));

    expect(balances.get('alice')).toBe(500);
    expect(balances.get('bob')).toBe(-500);
  });

  it('sums to zero across a mix of transactions, always', () => {
    const rows = [
      transaction({ id: 'tx-1', kind: 'expense', payerId: 'alice', amountCents: 1000 }),
      transaction({ id: 'tx-2', kind: 'income', payerId: 'bob', amountCents: 400 }),
      transaction({ id: 'tx-3', kind: 'transfer', payerId: 'carole', amountCents: 250 }),
    ];
    const participants = [
      participant({ transactionId: 'tx-1', userId: 'alice', shareCents: 334 }),
      participant({ transactionId: 'tx-1', userId: 'bob', shareCents: 333 }),
      participant({ transactionId: 'tx-1', userId: 'carole', shareCents: 333 }),
      participant({ transactionId: 'tx-2', userId: 'alice', shareCents: 200 }),
      participant({ transactionId: 'tx-2', userId: 'carole', shareCents: 200 }),
      participant({ transactionId: 'tx-3', userId: 'alice', shareCents: 250 }),
    ];

    const balances = computeBalances(rows, byTx(participants));
    const total = [...balances.values()].reduce((sum, value) => sum + value, 0);

    expect(total).toBe(0);
  });

  it('keeps a departed member’s balance from transactions recorded while they were in the group', () => {
    // The caller only passes rows and participants — there is no notion of
    // "current membership" here, so a former member's contribution is not
    // silently dropped; that guarantee lives one layer up (the service adds
    // current members who are still missing, but never removes an entry).
    const tx = transaction({ id: 'tx-1', payerId: 'alice', amountCents: 600 });
    const participants = [
      participant({ transactionId: 'tx-1', userId: 'alice', shareCents: 300 }),
      participant({ transactionId: 'tx-1', userId: 'departed', shareCents: 300 }),
    ];

    const balances = computeBalances([tx], byTx(participants));

    expect(balances.get('departed')).toBe(-300);
  });
});

describe('groupParticipantsByTransaction', () => {
  it('groups participants under their transaction id', () => {
    const participants = [
      participant({ transactionId: 'tx-1', userId: 'alice' }),
      participant({ transactionId: 'tx-1', userId: 'bob' }),
      participant({ transactionId: 'tx-2', userId: 'carole' }),
    ];

    const grouped = groupParticipantsByTransaction(participants);

    expect(grouped.get('tx-1')).toHaveLength(2);
    expect(grouped.get('tx-2')).toHaveLength(1);
    expect(grouped.get('tx-3')).toBeUndefined();
  });
});
