import { desc, eq, inArray } from 'drizzle-orm';

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
  };
}

