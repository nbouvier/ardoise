import type { SplitInput, Transaction, TransactionCategory, UpdateTransactionRequest } from '@splitcount/shared';

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

/**
 * Rebuilds a full-replace update request from a transaction as it stands,
 * with just `category` overridden — for the category badge's quick edit,
 * which changes nothing else. `PATCH` has no partial shape (see
 * `docs/API.md`), so even a one-field change has to resend the whole thing.
 */
export function toUpdateRequest(
  transaction: Transaction,
  overrides: { category: TransactionCategory },
): UpdateTransactionRequest {
  const common = {
    title: transaction.title,
    amount: transaction.amountCents,
    occurredOn: transaction.occurredOn,
    comment: transaction.comment,
    category: overrides.category,
    payerId: transaction.payer.id,
  };

  if (transaction.kind === 'transfer') {
    // A transfer's one participant is who it was sent to.
    return { kind: 'transfer', ...common, toUserId: transaction.participants[0]!.user.id };
  }

  return { kind: transaction.kind, ...common, split: splitFrom(transaction) };
}
