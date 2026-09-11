import { splitByShares } from '@splitcount/shared';
import { describe, expect, it } from 'vitest';

import type { TransactionParticipantRow, TransactionRow } from '../../db/schema.js';

import {
  computeBalances,
  computePairwiseBalances,
  groupParticipantsByTransaction,
} from './balances.js';

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
    category: null,
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

describe('computePairwiseBalances', () => {
  it('makes each participant owe the payer their share of an expense', () => {
    const tx = transaction({ id: 'tx-1', payerId: 'alice', amountCents: 900 });
    const participants = [
      participant({ transactionId: 'tx-1', userId: 'alice', shareCents: 300 }),
      participant({ transactionId: 'tx-1', userId: 'bob', shareCents: 300 }),
      participant({ transactionId: 'tx-1', userId: 'carole', shareCents: 300 }),
    ];

    const fromAlice = computePairwiseBalances('alice', [tx], byTx(participants));
    const fromBob = computePairwiseBalances('bob', [tx], byTx(participants));

    expect(fromAlice.get('bob')).toBe(300);
    expect(fromAlice.get('carole')).toBe(300);
    // Alice paying for her own share is not a debt to herself.
    expect(fromAlice.has('alice')).toBe(false);
    // The two views of the same pair are exact opposites.
    expect(fromBob.get('alice')).toBe(-300);
    expect(fromBob.has('carole')).toBe(false);
  });

  it('reverses the sign for an income', () => {
    const tx = transaction({ id: 'tx-1', kind: 'income', payerId: 'alice', amountCents: 900 });
    const participants = [
      participant({ transactionId: 'tx-1', userId: 'bob', shareCents: 450 }),
      participant({ transactionId: 'tx-1', userId: 'carole', shareCents: 450 }),
    ];

    const fromAlice = computePairwiseBalances('alice', [tx], byTx(participants));

    // Alice received 900 on their behalf: she owes each of them their half.
    expect(fromAlice.get('bob')).toBe(-450);
    expect(fromAlice.get('carole')).toBe(-450);
  });

  it('cancels a debt when the person who owes it transfers the amount back', () => {
    const expense = transaction({ id: 'tx-1', payerId: 'alice', amountCents: 600 });
    const reimbursement = transaction({
      id: 'tx-2',
      kind: 'transfer',
      payerId: 'bob',
      amountCents: 300,
    });
    const participants = [
      participant({ transactionId: 'tx-1', userId: 'alice', shareCents: 300 }),
      participant({ transactionId: 'tx-1', userId: 'bob', shareCents: 300 }),
      participant({ transactionId: 'tx-2', userId: 'alice', shareCents: 300 }),
    ];

    const rows = [expense, reimbursement];
    const beforeTransfer = computePairwiseBalances('alice', [expense], byTx(participants));
    const afterTransfer = computePairwiseBalances('alice', rows, byTx(participants));

    expect(beforeTransfer.get('bob')).toBe(300);
    expect(afterTransfer.get('bob')).toBe(0);
  });

  it('leaves a third party untouched by a transaction that does not concern them', () => {
    // Alice pays for herself and Bob; Carole is in the group but not on it.
    const tx = transaction({ id: 'tx-1', payerId: 'alice', amountCents: 600 });
    const participants = [
      participant({ transactionId: 'tx-1', userId: 'alice', shareCents: 300 }),
      participant({ transactionId: 'tx-1', userId: 'bob', shareCents: 300 }),
    ];

    const fromCarole = computePairwiseBalances('carole', [tx], byTx(participants));

    expect(fromCarole.size).toBe(0);
  });

  it('creates no debt between two people who merely share a payer', () => {
    // Alice paid for Bob and Carole. Bob owes Alice, Carole owes Alice, and
    // the two of them owe each other nothing — the case a group balance
    // cannot express, and the reason this function exists.
    const tx = transaction({ id: 'tx-1', payerId: 'alice', amountCents: 600 });
    const participants = [
      participant({ transactionId: 'tx-1', userId: 'bob', shareCents: 300 }),
      participant({ transactionId: 'tx-1', userId: 'carole', shareCents: 300 }),
    ];

    const fromBob = computePairwiseBalances('bob', [tx], byTx(participants));

    expect(fromBob.get('alice')).toBe(-300);
    expect(fromBob.has('carole')).toBe(false);
  });

  it('keeps what a departed member still owes', () => {
    const tx = transaction({ id: 'tx-1', payerId: 'alice', amountCents: 600 });
    const participants = [
      participant({ transactionId: 'tx-1', userId: 'alice', shareCents: 300 }),
      participant({ transactionId: 'tx-1', userId: 'departed', shareCents: 300 }),
    ];

    const fromAlice = computePairwiseBalances('alice', [tx], byTx(participants));

    expect(fromAlice.get('departed')).toBe(300);
  });

  it('sums back to the group balance, for every member of a generated ledger', () => {
    // The load-bearing property: whatever the ledger, splitting a member's
    // group balance across their counterparties must lose nothing and invent
    // nothing. It is what keeps the per-person figure and the per-group one
    // from ever drifting apart.
    const members = ['alice', 'bob', 'carole', 'dave'];
    const rows: TransactionRow[] = [];
    const participants: TransactionParticipantRow[] = [];
    let index = 0;

    for (const amountCents of [1, 7, 100, 999, 1234]) {
      for (const payerId of members) {
        // Every non-empty subset of the members, as the people it concerns.
        for (let mask = 1; mask < 1 << members.length; mask += 1) {
          const concerned = members.filter((_, bit) => (mask & (1 << bit)) !== 0);
          const id = `tx-${(index += 1)}`;
          const isTransfer = concerned.length === 1 && concerned[0] !== payerId;

          rows.push(
            transaction({
              id,
              payerId,
              amountCents,
              kind: isTransfer ? 'transfer' : index % 2 === 0 ? 'income' : 'expense',
            }),
          );

          // Real shares, so the "shares sum to the amount" invariant that the
          // property rests on holds exactly as it does in production.
          const shares = splitByShares(
            amountCents,
            concerned.map((userId, position) => ({
              userId,
              weight: ((position * 3 + amountCents) % 5) + 1,
            })),
          );
          for (const share of shares) {
            participants.push(
              participant({
                transactionId: id,
                userId: share.userId,
                shareCents: share.shareCents,
              }),
            );
          }
        }
      }
    }

    const byTransaction = byTx(participants);
    const groupBalances = computeBalances(rows, byTransaction);

    for (const member of members) {
      const pairwise = computePairwiseBalances(member, rows, byTransaction);
      const total = [...pairwise.values()].reduce((sum, value) => sum + value, 0);

      expect(total).toBe(groupBalances.get(member));
    }
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
