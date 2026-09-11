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
    const sign = signOf(transaction);
    add(transaction.payerId, sign * transaction.amountCents);
    for (const participant of participantsByTransactionId.get(transaction.id) ?? []) {
      add(participant.userId, -sign * participant.shareCents);
    }
  }

  return balances;
}

/** An income moves money the other way; an expense and a transfer do not. */
function signOf(transaction: TransactionRow): 1 | -1 {
  return transaction.kind === 'income' ? -1 : 1;
}

/**
 * Net balance between `userId` and every other person they share a transaction
 * with. Positive: that person owes `userId`. Negative: `userId` owes them.
 *
 * A group balance is a net against the *group* — it cannot say who owes whom.
 * This attributes the very same rule to the pair instead: what `userId` paid,
 * each other participant owes them their share of; what someone else paid,
 * `userId` owes that payer their own share of. An income reverses both, and a
 * transfer needs no special case — reimbursing someone is simply a transaction
 * where they are the single participant, so it cancels the debt by its amount.
 *
 * A transaction only ever involves people who shared its group, so the caller
 * does not have to filter by group: doing so on *current* membership would
 * wrongly drop what someone who has since left still owes.
 *
 * Summing the result over everyone gives back `computeBalances`'s entry for
 * `userId` — see `docs/specs/balances.md`. This is the readable statement of
 * the rule and the oracle the cross-group SQL aggregate in
 * `repository.ts` is tested against; the two must never disagree.
 */
export function computePairwiseBalances(
  userId: string,
  transactions: readonly TransactionRow[],
  participantsByTransactionId: ReadonlyMap<string, readonly TransactionParticipantRow[]>,
): Map<string, number> {
  const balances = new Map<string, number>();
  const add = (otherId: string, deltaCents: number) => {
    balances.set(otherId, (balances.get(otherId) ?? 0) + deltaCents);
  };

  for (const transaction of transactions) {
    const sign = signOf(transaction);
    const participants = participantsByTransactionId.get(transaction.id) ?? [];

    if (transaction.payerId === userId) {
      for (const participant of participants) {
        // Paying for oneself is not a debt to oneself; it nets out.
        if (participant.userId !== userId) {
          add(participant.userId, sign * participant.shareCents);
        }
      }
      continue;
    }

    for (const participant of participants) {
      if (participant.userId === userId) {
        add(transaction.payerId, -sign * participant.shareCents);
      }
    }
  }

  return balances;
}
