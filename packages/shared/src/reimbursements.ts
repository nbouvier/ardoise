import type { Balance } from './transactions.js';

/** One suggested payment: `fromUserId` pays `toUserId` that amount. */
export interface SuggestedReimbursement {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
}

/** A debtor's or a creditor's side of the plan, as it is drawn down. */
interface Party {
  userId: string;
  remainingCents: number;
}

/**
 * Largest remaining first, the user id breaking ties — so a plan never
 * depends on the order the balances happened to arrive in.
 */
function byAmountThenId(parties: readonly Party[]): Party[] {
  return [...parties].sort(
    (a, b) =>
      b.remainingCents - a.remainingCents ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  );
}

/**
 * The payments that clear a group — "who pays whom" — derived from its
 * balances and nothing else (`docs/specs/reimbursements.md`).
 *
 * Netting is the whole point: if Alice owes Bob 10 and Bob owes Carole 10,
 * this is one payment (Alice pays Carole 10), where reimbursing each recorded
 * debt pairwise would be two. Anyone at exactly zero is left out.
 *
 * Built in two passes: a debtor whose debt *equals* a creditor's credit is
 * paired off first — one payment settling both sides at once, which no
 * further netting could improve on — then, repeatedly, the largest remaining
 * debtor pays the largest remaining creditor the smaller of the two amounts.
 * That leaves **at most one payment fewer than the number of people with a
 * non-zero balance**, and usually fewer.
 *
 * It is *not* a proven minimum: finding the provably smallest set of payments
 * is NP-hard, and the product promises a short, stable, explainable plan
 * rather than an optimal one.
 *
 * A group's balances always sum to zero, so the plan always clears them
 * exactly. Should they somehow not, it stops when either side runs out
 * rather than inventing a payment; nothing here can produce a payment of
 * zero or a negative one.
 *
 * Pure arithmetic over figures the client already has, like `splitByShares`:
 * the plan is derived wherever the balances are read, and there is no second
 * server-side notion of it that could disagree.
 *
 * The result is in canonical order (largest payment first, ties on the
 * parties' ids), so two members reading the same group see the same plan.
 */
export function planReimbursements(balances: readonly Balance[]): SuggestedReimbursement[] {
  const debtors: Party[] = [];
  const creditors: Party[] = [];
  for (const { userId, amountCents } of balances) {
    if (amountCents < 0) {
      debtors.push({ userId, remainingCents: -amountCents });
    } else if (amountCents > 0) {
      creditors.push({ userId, remainingCents: amountCents });
    }
  }

  const plan: SuggestedReimbursement[] = [];
  const pay = (debtor: Party, creditor: Party) => {
    const amountCents = Math.min(debtor.remainingCents, creditor.remainingCents);
    debtor.remainingCents -= amountCents;
    creditor.remainingCents -= amountCents;
    plan.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amountCents });
  };

  // Exact matches first. A creditor drawn down to zero can never equal a
  // debtor's remaining debt, which is always positive here, so no separate
  // "already used" bookkeeping is needed.
  for (const debtor of byAmountThenId(debtors)) {
    if (debtor.remainingCents === 0) {
      continue;
    }
    const match = byAmountThenId(creditors).find(
      (creditor) => creditor.remainingCents === debtor.remainingCents,
    );
    if (match) {
      pay(debtor, match);
    }
  }

  // Then largest against largest. Re-sorting each round is what keeps that
  // true: paying part of a debt changes who the largest debtor is. The
  // parties are one group's members, so this stays small.
  for (;;) {
    const [debtor] = byAmountThenId(debtors);
    const [creditor] = byAmountThenId(creditors);
    if (!debtor || !creditor || debtor.remainingCents === 0 || creditor.remainingCents === 0) {
      break;
    }
    pay(debtor, creditor);
  }

  return plan.sort(
    (a, b) =>
      b.amountCents - a.amountCents ||
      compareIds(a.fromUserId, b.fromUserId) ||
      compareIds(a.toUserId, b.toUserId),
  );
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
