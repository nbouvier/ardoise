import type { SplitInput, Transaction } from '@splitcount/shared';

/** Rebuilds a `SplitInput` from a stored transaction's participants. */
export function splitFrom(transaction: Transaction): SplitInput {
  if (transaction.splitMode === 'shares') {
    return {
      mode: 'shares',
      participants: transaction.participants.map((p) => ({
        userId: p.user.id,
        weight: p.weight ?? 1,
      })),
    };
  }
  return {
    mode: 'amount',
    participants: transaction.participants.map((p) => ({ userId: p.user.id, amount: p.shareCents })),
  };
}
