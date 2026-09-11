import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import type { Database } from '../../db/client.js';
import {
  transactionParticipants,
  transactions,
  type NewTransactionParticipantRow,
  type TransactionParticipantRow,
  type TransactionRow,
} from '../../db/schema.js';

/** The core fields of a transaction, independent of its participants. */
export interface TransactionFields {
  groupId: string;
  kind: string;
  title: string;
  amountCents: number;
  occurredOn: string;
  comment: string | null;
  payerId: string;
  splitMode: string;
}

export interface ParticipantInput {
  userId: string;
  shareCents: number;
  weight: number | null;
}

export interface CreatedTransaction {
  transaction: TransactionRow;
  participants: TransactionParticipantRow[];
}

export interface TransactionsRepository {
  findById(transactionId: string): Promise<TransactionRow | undefined>;
  /** A group's transactions, most recent first (by date, then by creation). */
  listByGroup(groupId: string): Promise<TransactionRow[]>;
  /** Every participant of the given transactions, in one query. */
  listParticipants(transactionIds: readonly string[]): Promise<TransactionParticipantRow[]>;
  create(
    fields: TransactionFields,
    createdBy: string,
    participants: readonly ParticipantInput[],
  ): Promise<CreatedTransaction>;
  /** Replaces the core fields and the full set of participants together. */
  update(
    transactionId: string,
    fields: Omit<TransactionFields, 'groupId'>,
    participants: readonly ParticipantInput[],
    at: Date,
  ): Promise<CreatedTransaction>;
  remove(transactionId: string): Promise<void>;
  /**
   * Net balance between `userId` and each person they share a transaction
   * with, across every group. Positive: that person owes `userId`.
   */
  balancesWith(userId: string): Promise<Map<string, number>>;
}

function toParticipantRows(
  transactionId: string,
  participants: readonly ParticipantInput[],
): NewTransactionParticipantRow[] {
  return participants.map((p) => ({
    transactionId,
    userId: p.userId,
    shareCents: p.shareCents,
    weight: p.weight,
  }));
}

export function createTransactionsRepository(db: Database): TransactionsRepository {
  return {
    async findById(transactionId) {
      const [row] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, transactionId));
      return row;
    },

    async listByGroup(groupId) {
      return db
        .select()
        .from(transactions)
        .where(eq(transactions.groupId, groupId))
        .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt));
    },

    async listParticipants(transactionIds) {
      if (transactionIds.length === 0) {
        return [];
      }
      return db
        .select()
        .from(transactionParticipants)
        .where(inArray(transactionParticipants.transactionId, [...transactionIds]));
    },

    async create(fields, createdBy, participants) {
      return db.transaction(async (tx) => {
        const [transaction] = await tx
          .insert(transactions)
          .values({ ...fields, createdBy })
          .returning();

        const rows = await tx
          .insert(transactionParticipants)
          .values(toParticipantRows(transaction!.id, participants))
          .returning();

        return { transaction: transaction!, participants: rows };
      });
    },

    async update(transactionId, fields, participants, at) {
      return db.transaction(async (tx) => {
        const [transaction] = await tx
          .update(transactions)
          .set({ ...fields, updatedAt: at })
          .where(eq(transactions.id, transactionId))
          .returning();

        await tx
          .delete(transactionParticipants)
          .where(eq(transactionParticipants.transactionId, transactionId));

        const rows = await tx
          .insert(transactionParticipants)
          .values(toParticipantRows(transactionId, participants))
          .returning();

        return { transaction: transaction!, participants: rows };
      });
    },

    async remove(transactionId) {
      await db.delete(transactions).where(eq(transactions.id, transactionId));
    },

    async balancesWith(userId) {
      // Aggregated in the database, unlike a group's balance: this one spans
      // the caller's whole history across every group, so pulling the rows
      // into the application would grow with the account's lifetime.
      //
      // No group filter is needed — being on a transaction already implies
      // having shared its group — and none is wanted: filtering on *current*
      // membership would drop what someone who has since left still owes.
      // See `computePairwiseBalances` in `balances.ts` for the rule in
      // readable form; the two are cross-checked by test.
      //
      // Two passes rather than one union: each is a single indexed lookup
      // (`transactions_payer_id_idx`, `transaction_participants_user_id_idx`)
      // and merging two small maps is cheaper to read than a subquery.
      const signedShare = sql`case when ${transactions.kind} = 'income'
        then -${transactionParticipants.shareCents}
        else ${transactionParticipants.shareCents} end`;

      // What the caller paid: each other participant owes them their share.
      const owedToCaller = await db
        .select({
          counterpartyId: transactionParticipants.userId,
          deltaCents: sql<number>`sum(${signedShare})::int`,
        })
        .from(transactions)
        .innerJoin(
          transactionParticipants,
          eq(transactionParticipants.transactionId, transactions.id),
        )
        .where(
          and(
            eq(transactions.payerId, userId),
            // Paying for oneself is not a debt to oneself.
            ne(transactionParticipants.userId, userId),
          ),
        )
        .groupBy(transactionParticipants.userId);

      // What someone else paid: the caller owes that payer their own share.
      const owedByCaller = await db
        .select({
          counterpartyId: transactions.payerId,
          deltaCents: sql<number>`sum(${signedShare})::int`,
        })
        .from(transactions)
        .innerJoin(
          transactionParticipants,
          eq(transactionParticipants.transactionId, transactions.id),
        )
        .where(
          and(
            ne(transactions.payerId, userId),
            eq(transactionParticipants.userId, userId),
          ),
        )
        .groupBy(transactions.payerId);

      const balances = new Map<string, number>();
      const add = (counterpartyId: string, deltaCents: number) => {
        balances.set(counterpartyId, (balances.get(counterpartyId) ?? 0) + deltaCents);
      };

      for (const row of owedToCaller) {
        add(row.counterpartyId, Number(row.deltaCents));
      }
      for (const row of owedByCaller) {
        add(row.counterpartyId, -Number(row.deltaCents));
      }

      return balances;
    },
  };
}

