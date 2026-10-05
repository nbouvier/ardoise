import {
  aliasedTable,
  and,
  eq,
  inArray,
  isNull,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';

import type { Database } from '../../db/client.js';
import { transactionParticipants, transactions } from '../../db/schema.js';

/** A database transaction, as `Database.transaction` hands it to its callback. */
export type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface ReplacedParty {
  /** Transactions that named `from` and now name `to` instead. */
  transactionsRewritten: number;
  /** Transfers between `from` and `to` themselves, deleted: they moved nothing any more. */
  transfersDeleted: number;
}

/** `column` names `party`, where `null` is Others. */
const names = (column: AnyColumn, party: string | null): SQL =>
  party === null ? isNull(column) : eq(column, party);

/**
 * Make every transaction that names `from` — as payer, as a concerned party,
 * at either end of a transfer — name `to` instead, `null` being Others. The
 * one rewrite both account deletion (`to` is Others,
 * `docs/specs/account-deletion.md`) and claiming or removing a placeholder
 * (`docs/specs/placeholder-members.md`) rest on, so the ledger rule is written
 * once:
 *
 * - a transfer between `from` and `to` would run from someone to themselves:
 *   it moves nothing and is deleted;
 * - a transaction has at most one share per party, so where `to` already has
 *   one, `from`'s share is added to it — amounts and weights alike (both set
 *   for a split by shares, both `NULL` for a split by amounts);
 * - every other share and payment simply changes hands.
 *
 * Every member's balance afterwards is what it would be had `to` stood in
 * `from`'s place from the start. Runs inside the caller's transaction, which
 * is expected to delete `from` afterwards if it no longer exists.
 */
export async function replaceParty(
  tx: DatabaseTransaction,
  from: string,
  to: string | null,
): Promise<ReplacedParty> {
  const doomedTransfers = await tx
    .select({ id: transactions.id })
    .from(transactions)
    .innerJoin(transactionParticipants, eq(transactionParticipants.transactionId, transactions.id))
    .where(
      and(
        eq(transactions.kind, 'transfer'),
        or(
          and(eq(transactions.payerId, from), names(transactionParticipants.userId, to)),
          and(names(transactions.payerId, to), eq(transactionParticipants.userId, from)),
        ),
      ),
    );
  if (doomedTransfers.length > 0) {
    await tx.delete(transactions).where(
      inArray(
        transactions.id,
        doomedTransfers.map((row) => row.id),
      ),
    );
  }

  const rewritten = new Set<string>();

  const existing = aliasedTable(transactionParticipants, 'existing');
  const merges = await tx
    .select({
      fromRowId: transactionParticipants.id,
      toRowId: existing.id,
      transactionId: transactionParticipants.transactionId,
      shareCents: transactionParticipants.shareCents,
      weight: transactionParticipants.weight,
    })
    .from(transactionParticipants)
    .innerJoin(
      existing,
      and(
        eq(existing.transactionId, transactionParticipants.transactionId),
        names(existing.userId, to),
      ),
    )
    .where(eq(transactionParticipants.userId, from));
  for (const merge of merges) {
    await tx
      .update(transactionParticipants)
      .set({
        shareCents: sql`${transactionParticipants.shareCents} + ${merge.shareCents}`,
        weight:
          merge.weight === null ? null : sql`${transactionParticipants.weight} + ${merge.weight}`,
      })
      .where(eq(transactionParticipants.id, merge.toRowId));
    rewritten.add(merge.transactionId);
  }
  if (merges.length > 0) {
    await tx.delete(transactionParticipants).where(
      inArray(
        transactionParticipants.id,
        merges.map((merge) => merge.fromRowId),
      ),
    );
  }

  const shares = await tx
    .update(transactionParticipants)
    .set({ userId: to })
    .where(eq(transactionParticipants.userId, from))
    .returning({ transactionId: transactionParticipants.transactionId });
  const payments = await tx
    .update(transactions)
    .set({ payerId: to })
    .where(eq(transactions.payerId, from))
    .returning({ id: transactions.id });
  for (const row of shares) {
    rewritten.add(row.transactionId);
  }
  for (const row of payments) {
    rewritten.add(row.id);
  }

  return { transactionsRewritten: rewritten.size, transfersDeleted: doomedTransfers.length };
}
