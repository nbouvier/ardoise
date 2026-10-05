import { splitByShares } from '@ardoise/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../../db/client.js';
import {
  groupMembers,
  groups,
  transactionParticipants,
  transactions,
  users,
  type TransactionParticipantRow,
  type TransactionRow,
} from '../../db/schema.js';
import { createTestDatabase } from '../../test/database.js';
import { computeBalances, groupParticipantsByTransaction } from '../transactions/balances.js';
import { createTransactionsRepository } from '../transactions/repository.js';

import { createGroupsRepository } from './repository.js';

/** A participant reduced to what a claim may change, for comparison. */
type Share = [userId: string | null, shareCents: number, weight: number | null];

const sharesOf = (rows: readonly TransactionParticipantRow[]): Share[] =>
  rows
    .map((row): Share => [row.userId, row.shareCents, row.weight])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

/**
 * The same ledger as if `claimer` had stood where `placeholder` did from the
 * start — the rule of `docs/specs/placeholder-members.md`, written the plain
 * way: its payments are the claimer's, its share is the claimer's (added to
 * theirs when they already have one), a transfer between the two does not
 * exist.
 */
function asIfClaimed(
  placeholder: string,
  claimer: string,
  rows: readonly TransactionRow[],
  byTransaction: ReadonlyMap<string, readonly TransactionParticipantRow[]>,
): { rows: TransactionRow[]; byTransaction: Map<string, TransactionParticipantRow[]> } {
  const kept: TransactionRow[] = [];
  const keptShares = new Map<string, TransactionParticipantRow[]>();

  for (const row of rows) {
    const payerId = row.payerId === placeholder ? claimer : row.payerId;
    const merged: TransactionParticipantRow[] = [];
    for (const share of byTransaction.get(row.id) ?? []) {
      const userId = share.userId === placeholder ? claimer : share.userId;
      const existing = merged.find((m) => m.userId === userId);
      if (existing) {
        existing.shareCents += share.shareCents;
        existing.weight =
          existing.weight === null || share.weight === null ? null : existing.weight + share.weight;
      } else {
        merged.push({ ...share, userId });
      }
    }
    if (row.kind === 'transfer' && payerId === claimer && merged[0]?.userId === claimer) {
      continue;
    }
    kept.push({ ...row, payerId });
    keptShares.set(row.id, merged);
  }

  return { rows: kept, byTransaction: keptShares };
}

describe('claiming a placeholder on a generated ledger', () => {
  let handle: DatabaseHandle;

  beforeAll(async () => {
    handle = await createTestDatabase();
  });

  afterAll(async () => {
    await handle.close();
  });

  async function readLedger(groupId: string) {
    const rows = (await handle.db.select().from(transactions)).filter(
      (row) => row.groupId === groupId,
    );
    const participants = await handle.db.select().from(transactionParticipants);
    return { rows, byTransaction: groupParticipantsByTransaction(participants) };
  }

  it('leaves everyone exactly where the ledger written with the account from the start would', async () => {
    // Every payer (the placeholder, the claimer, another member, Others)
    // against every non-empty set of concerned parties, in both split modes:
    // the merge with the claimer's own share, the transfer between the two
    // and the plain replacement all occur, in every combination.
    const [group] = await handle.db
      .insert(groups)
      .values({ kind: 'standard', name: 'Generated' })
      .returning({ id: groups.id });
    const people = await handle.db
      .insert(users)
      .values(
        ['claimer', 'bob'].map((name) => ({
          googleSub: `google-${name}`,
          email: `${name}@example.com`,
          name,
        })),
      )
      .returning({ id: users.id });
    const [placeholder] = await handle.db
      .insert(users)
      .values({ kind: 'placeholder', name: 'Alex', placeholderGroupId: group!.id })
      .returning({ id: users.id });
    const claimer = people[0]!.id;
    const members = [placeholder!.id, claimer, people[1]!.id];
    await handle.db.insert(groupMembers).values(
      members.map((userId, position) => ({
        groupId: group!.id,
        userId,
        role: position === 1 ? 'owner' : 'member',
      })),
    );

    const ledger = createTransactionsRepository(handle.db);
    const parties: (string | null)[] = [...members, null];
    let index = 0;
    for (const amountCents of [7, 1234]) {
      for (const payerId of parties) {
        for (let mask = 1; mask < 1 << parties.length; mask += 1) {
          const concerned = parties.filter((_, bit) => (mask & (1 << bit)) !== 0);
          const isTransfer = concerned.length === 1 && concerned[0] !== payerId;
          const byAmounts = isTransfer || (index += 1) % 3 === 0;
          const shares = splitByShares(
            amountCents,
            concerned.map((userId, position) => ({
              userId,
              weight: ((position * 3 + amountCents) % 5) + 1,
            })),
          );
          await ledger.create(
            {
              groupId: group!.id,
              kind: isTransfer ? 'transfer' : index % 2 === 0 ? 'income' : 'expense',
              title: 'Generated',
              amountCents,
              occurredOn: '2026-10-01',
              comment: null,
              category: 'other',
              payerId,
              splitMode: byAmounts ? 'amount' : 'shares',
            },
            claimer,
            shares.map((share, position) => ({
              userId: share.userId,
              shareCents: share.shareCents,
              weight: byAmounts ? null : ((position * 3 + amountCents) % 5) + 1,
            })),
          );
        }
      }
    }

    const before = await readLedger(group!.id);
    const expected = asIfClaimed(placeholder!.id, claimer, before.rows, before.byTransaction);

    const claimed = await createGroupsRepository(handle.db).claimPlaceholder(
      group!.id,
      placeholder!.id,
      claimer,
      new Date('2026-10-05T12:00:00.000Z'),
    );

    const after = await readLedger(group!.id);
    expect(claimed.transfersDeleted).toBe(before.rows.length - expected.rows.length);
    expect(after.rows.map((row) => row.id).sort()).toEqual(
      expected.rows.map((row) => row.id).sort(),
    );
    for (const row of after.rows) {
      const shares = after.byTransaction.get(row.id) ?? [];
      expect(row.payerId).toBe(expected.rows.find((other) => other.id === row.id)!.payerId);
      expect(sharesOf(shares)).toEqual(sharesOf(expected.byTransaction.get(row.id)!));
      // Still a valid transaction: shares add up, at most one share each.
      expect(shares.reduce((sum, share) => sum + share.shareCents, 0)).toBe(row.amountCents);
      expect(new Set(shares.map((share) => share.userId)).size).toBe(shares.length);
    }

    const balances = computeBalances(after.rows, after.byTransaction);
    expect(balances).toEqual(computeBalances(expected.rows, expected.byTransaction));
    expect(balances.has(placeholder!.id)).toBe(false);
    expect([...balances.values()].reduce((sum, value) => sum + value, 0)).toBe(0);
    expect(await handle.db.select().from(users).where(eq(users.id, placeholder!.id))).toEqual([]);
  });
});
