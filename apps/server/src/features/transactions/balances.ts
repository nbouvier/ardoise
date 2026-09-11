import type { TransactionParticipantRow, TransactionRow } from '../../db/schema.js';

/** Every participant of a set of transactions, grouped by transaction id. */
export function groupParticipantsByTransaction(
  participants: readonly TransactionParticipantRow[],
): Map<string, TransactionParticipantRow[]> {
  const byTransactionId = new Map<string, TransactionParticipantRow[]>();
  for (const participant of participants) {
    const list = byTransactionId.get(participant.transactionId);
    if (list) {
      list.push(participant);
    } else {
      byTransactionId.set(participant.transactionId, [participant]);
    }
  }
  return byTransactionId;
}

/**
 * Net balance per user across a group's transactions. Positive: the group
 * owes them. Negative: they owe the group.
 *
 * An expense or a transfer credits the payer by the amount and debits each
 * participant by their share; an income is the reverse. The payer and a
 * participant can be the same person, and the two contributions simply add.
 * Every transaction's shares sum to its amount by construction, so the
 * result always sums to zero — see `docs/specs/transactions.md`.
 */
export function computeBalances(
  transactions: readonly TransactionRow[],
  participantsByTransactionId: ReadonlyMap<string, readonly TransactionParticipantRow[]>,
): Map<string, number> {
  const balances = new Map<string, number>();
  const add = (userId: string, deltaCents: number) => {
    balances.set(userId, (balances.get(userId) ?? 0) + deltaCents);
  };

  for (const transaction of transactions) {
    const sign = transaction.kind === 'income' ? -1 : 1;
    add(transaction.payerId, sign * transaction.amountCents);
    for (const participant of participantsByTransactionId.get(transaction.id) ?? []) {
      add(participant.userId, -sign * participant.shareCents);
    }
  }

  return balances;
}
