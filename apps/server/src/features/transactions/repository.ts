import { and, desc, eq, exists, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';

import type { Database } from '../../db/client.js';
import {
  groupMembers,
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
  category: string;
  /** `null` is Others — see `docs/specs/transactions.md`. */
  payerId: string | null;
  splitMode: string;
}

export interface ParticipantInput {
  /** `null` is Others. */
  userId: string | null;
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
  /**
   * The transactions of several groups at once, most recent first — the
   * `scope=subtree` statistics view (`docs/specs/group-statistics.md`), which
   * reads a group's own transactions together with those of its
   * member-visible descendants in one call rather than one per group.
   */
  listByGroups(groupIds: readonly string[]): Promise<TransactionRow[]>;
  /**
   * The `limit` most recent transactions that **involve** `userId` — they
   * paid, or they are one of the people it concerns — across every group and
   * sub-group they currently belong to, most recent first
   * (`docs/specs/home.md`). Membership is part of the query, not a filter
   * applied after: having been a participant in a group since left is never
   * enough to be served its rows.
   */
  listRecentForUser(userId: string, limit: number): Promise<TransactionRow[]>;
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
  /**
   * `userId`'s own net balance in each of `groupIds`, keyed by group id — the
   * same rule as a group's balance (`computeBalances`), aggregated in SQL and
   * scoped to a specific set of groups rather than one — what the group list
   * needs to show every group's own figure in one read. A group absent from
   * the result has no transaction `userId` is party to; the caller
   * (`docs/specs/balances.md`) treats that as zero.
   */
  balancesByGroup(userId: string, groupIds: readonly string[]): Promise<Map<string, number>>;
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

    async listByGroups(groupIds) {
      if (groupIds.length === 0) {
        return [];
      }
      return db
        .select()
        .from(transactions)
        .where(inArray(transactions.groupId, [...groupIds]))
        .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt));
    },

    async listRecentForUser(userId, limit) {
      const rows = await db
        .select({ transaction: transactions })
        .from(transactions)
        // The join *is* the authorization: only groups `userId` belongs to
        // right now contribute a row at all.
        .innerJoin(
          groupMembers,
          and(
            eq(groupMembers.groupId, transactions.groupId),
            eq(groupMembers.userId, userId),
          ),
        )
        .where(
          or(
            eq(transactions.payerId, userId),
            exists(
              db
                .select({ id: transactionParticipants.id })
                .from(transactionParticipants)
                .where(
                  and(
                    eq(transactionParticipants.transactionId, transactions.id),
                    eq(transactionParticipants.userId, userId),
                  ),
                ),
            ),
          ),
        )
        // The same ordering a group's own list uses: the date it is *for*
        // first, then the order they were recorded, so same-day entries are
        // deterministic and the ceiling below always cuts at the same place.
        .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
        .limit(limit);

      return rows.map((row) => row.transaction);
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
      //
      // Others (a `NULL` payer or participant) is never a counterparty: what
      // concerns people outside the group is settled outside the app. The
      // `<>` comparisons below would already drop a `NULL`, but by accident
      // of SQL's three-valued logic — the explicit `is not null` says it.
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
            isNotNull(transactionParticipants.userId),
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
            isNotNull(transactions.payerId),
            ne(transactions.payerId, userId),
            eq(transactionParticipants.userId, userId),
          ),
        )
        .groupBy(transactions.payerId);

      const balances = new Map<string, number>();
      const add = (counterpartyId: string | null, deltaCents: number) => {
        // Unreachable given the filters above; narrows the column type.
        if (counterpartyId === null) {
          return;
        }
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

    async balancesByGroup(userId, groupIds) {
      if (groupIds.length === 0) {
        return new Map();
      }
      const scope = [...groupIds];

      const signedShare = sql`case when ${transactions.kind} = 'income'
        then -${transactionParticipants.shareCents} else ${transactionParticipants.shareCents} end`;

      // Credited: what `userId` paid for members in each group (reversed for
      // an income) — the members' shares, not the amount: Others' share is
      // settled outside the group and owed to no one in it.
      const paid = await db
        .select({
          groupId: transactions.groupId,
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
            isNotNull(transactionParticipants.userId),
            inArray(transactions.groupId, scope),
          ),
        )
        .groupBy(transactions.groupId);

      // Debited: `userId`'s own share as a concerned participant, in each
      // group. Paying for oneself is not omitted here the way the per-friend
      // aggregate omits it — it is the same transaction's payer credit
      // netting against this debit, exactly as `computeBalances` does it.
      // A transaction Others paid debits no one: no member is owed for it.
      const owed = await db
        .select({
          groupId: transactions.groupId,
          deltaCents: sql<number>`sum(${signedShare})::int`,
        })
        .from(transactions)
        .innerJoin(
          transactionParticipants,
          eq(transactionParticipants.transactionId, transactions.id),
        )
        .where(
          and(
            eq(transactionParticipants.userId, userId),
            isNotNull(transactions.payerId),
            inArray(transactions.groupId, scope),
          ),
        )
        .groupBy(transactions.groupId);

      const balances = new Map<string, number>();
      const add = (groupId: string, deltaCents: number) => {
        balances.set(groupId, (balances.get(groupId) ?? 0) + deltaCents);
      };

      for (const row of paid) {
        add(row.groupId, Number(row.deltaCents));
      }
      for (const row of owed) {
        add(row.groupId, -Number(row.deltaCents));
      }

      return balances;
    },
  };
}

