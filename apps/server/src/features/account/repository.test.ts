import { splitByShares } from '@ardoise/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DatabaseHandle } from '../../db/client.js';
import {
  deletedAccounts,
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

import { deleteAccounts } from './operator.js';
import { createAccountRepository } from './repository.js';

/** A participant reduced to what anonymisation may change, for comparison. */
type Share = [userId: string | null, shareCents: number, weight: number | null];

const sharesOf = (rows: readonly TransactionParticipantRow[]): Share[] =>
  rows
    .map((row): Share => [row.userId, row.shareCents, row.weight])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

/**
 * The same ledger as if `victim` had been Others from the start — the rule of
 * `docs/specs/account-deletion.md`, written the plain way: their payments are
 * Others', their share is Others' (added to Others' own when there is one), a
 * transfer that ends up Others to Others does not exist.
 */
function asIfOthers(
  victim: string,
  rows: readonly TransactionRow[],
  byTransaction: ReadonlyMap<string, readonly TransactionParticipantRow[]>,
): { rows: TransactionRow[]; byTransaction: Map<string, TransactionParticipantRow[]> } {
  const kept: TransactionRow[] = [];
  const keptShares = new Map<string, TransactionParticipantRow[]>();

  for (const row of rows) {
    const payerId = row.payerId === victim ? null : row.payerId;
    const merged: TransactionParticipantRow[] = [];
    for (const share of byTransaction.get(row.id) ?? []) {
      const userId = share.userId === victim ? null : share.userId;
      const others = userId === null ? merged.find((m) => m.userId === null) : undefined;
      if (others) {
        others.shareCents += share.shareCents;
        others.weight =
          others.weight === null || share.weight === null ? null : others.weight + share.weight;
      } else {
        merged.push({ ...share, userId });
      }
    }
    if (row.kind === 'transfer' && payerId === null && merged[0]?.userId === null) {
      continue;
    }
    kept.push({ ...row, payerId });
    keptShares.set(row.id, merged);
  }

  return { rows: kept, byTransaction: keptShares };
}

describe('account deletion on a generated ledger', () => {
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

  it('leaves the others exactly where the same ledger with the user as Others from the start would', async () => {
    // Every payer (Others included) against every non-empty set of concerned
    // parties, in both split modes: the merge into an existing Others share,
    // the Others-to-Others transfer and the plain replacement all occur, in
    // every combination with the other members.
    const people = await handle.db
      .insert(users)
      .values(
        ['alice', 'bob', 'carole', 'dave'].map((name) => ({
          googleSub: `google-${name}`,
          email: `${name}@example.com`,
          name,
        })),
      )
      .returning({ id: users.id });
    const members = people.map((person) => person.id);
    const victim = members[0]!;
    const [group] = await handle.db
      .insert(groups)
      .values({ kind: 'standard', name: 'Generated' })
      .returning({ id: groups.id });
    await handle.db.insert(groupMembers).values(
      members.map((userId, position) => ({
        groupId: group!.id,
        userId,
        role: position === 0 ? 'owner' : 'member',
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
            members[1]!,
            shares.map((share, position) => ({
              userId: share.userId,
              shareCents: share.shareCents,
              weight: byAmounts
                ? null
                : ((position * 3 + amountCents) % 5) + 1,
            })),
          );
        }
      }
    }

    const before = await readLedger(group!.id);
    const expected = asIfOthers(victim, before.rows, before.byTransaction);

    const summary = await createAccountRepository(handle.db).deleteAccount(victim);

    const after = await readLedger(group!.id);
    expect(summary?.transfersDeleted).toBe(before.rows.length - expected.rows.length);
    expect(after.rows.map((row) => row.id).sort()).toEqual(
      expected.rows.map((row) => row.id).sort(),
    );
    for (const row of after.rows) {
      const shares = after.byTransaction.get(row.id) ?? [];
      expect(row.payerId).toBe(expected.rows.find((other) => other.id === row.id)!.payerId);
      expect(sharesOf(shares)).toEqual(sharesOf(expected.byTransaction.get(row.id)!));
      // Still a valid transaction: shares add up, at most one Others share.
      expect(shares.reduce((sum, share) => sum + share.shareCents, 0)).toBe(row.amountCents);
      expect(shares.filter((share) => share.userId === null).length).toBeLessThanOrEqual(1);
    }

    const balances = computeBalances(after.rows, after.byTransaction);
    expect(balances).toEqual(computeBalances(expected.rows, expected.byTransaction));
    expect(balances.has(victim)).toBe(false);
    expect([...balances.values()].reduce((sum, value) => sum + value, 0)).toBe(0);
  });
});

describe('the operator deletion', () => {
  let handle: DatabaseHandle;

  beforeAll(async () => {
    handle = await createTestDatabase();
  });

  afterAll(async () => {
    await handle.close();
  });

  const silent = { info: () => undefined, warn: () => undefined };

  it('deletes accounts still here, keeps listing those already gone, and refuses what is not an id', async () => {
    const [present] = await handle.db
      .insert(users)
      .values({ googleSub: 'google-erin', email: 'erin@example.com', name: 'Erin' })
      .returning({ id: users.id });
    const gone = '00000000-0000-4000-8000-000000000001';
    const repository = createAccountRepository(handle.db);

    const results = await deleteAccounts(repository, [present!.id, gone, 'not-an-id'], silent);

    expect(results.map((result) => result.outcome)).toEqual(['deleted', 'absent', 'invalid']);
    expect(await handle.db.select().from(users)).toEqual([]);
    const listed = await handle.db.select({ userId: deletedAccounts.userId }).from(deletedAccounts);
    expect(listed.map((row) => row.userId).sort()).toEqual([present!.id, gone].sort());

    // Re-applying the same list changes nothing.
    const again = await deleteAccounts(repository, [present!.id, gone], silent);
    expect(again.map((result) => result.outcome)).toEqual(['absent', 'absent']);
    expect(await handle.db.select().from(deletedAccounts)).toHaveLength(2);
  });
});
