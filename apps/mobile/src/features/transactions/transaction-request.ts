import type { FriendSummary, SplitInput, Transaction } from '@ardoise/shared';

/**
 * Who the form offers: the group's current members, then — when editing —
 * anyone the transaction names who has left the group since. They stay on it
 * (the server keeps them too) and can be removed, but are never offered on a
 * transaction that did not name them (`docs/specs/transactions.md`).
 */
export function formParties(
  members: readonly FriendSummary[],
  initial: Transaction | undefined,
): FriendSummary[] {
  if (!initial) {
    return [...members];
  }
  const parties = [...members];
  const known = new Set(members.map((member) => member.id));
  for (const named of [initial.payer, ...initial.participants.map((p) => p.user)]) {
    if (named && !known.has(named.id)) {
      known.add(named.id);
      parties.push(named);
    }
  }
  return parties;
}

/** Rebuilds a `SplitInput` from a stored transaction's participants. */
export function splitFrom(transaction: Transaction): SplitInput {
  if (transaction.splitMode === 'shares') {
    return {
      mode: 'shares',
      participants: transaction.participants.map((p) => ({
        userId: p.user?.id ?? null,
        weight: p.weight ?? 1,
      })),
    };
  }
  return {
    mode: 'amount',
    participants: transaction.participants.map((p) => ({ userId: p.user?.id ?? null, amount: p.shareCents })),
  };
}
