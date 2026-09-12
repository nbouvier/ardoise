import { describe, expect, it } from 'vitest';

import { planReimbursements, type PlannedReimbursement } from './reimbursements.js';

/** The positions a plan leaves behind — all zero, for a correct plan. */
function applied(
  positions: ReadonlyMap<string, number>,
  plan: readonly PlannedReimbursement[],
): Map<string, number> {
  const remaining = new Map(positions);
  const add = (userId: string, deltaCents: number) => {
    remaining.set(userId, (remaining.get(userId) ?? 0) + deltaCents);
  };
  for (const payment of plan) {
    // Paying down a debt moves the payer up and the recipient down.
    add(payment.fromUserId, payment.amountCents);
    add(payment.toUserId, -payment.amountCents);
  }
  return remaining;
}

function expectClears(positions: ReadonlyMap<string, number>): PlannedReimbursement[] {
  const plan = planReimbursements(positions);
  for (const [userId, amountCents] of applied(positions, plan)) {
    expect(amountCents, `${userId} is not settled by the plan`).toBe(0);
  }
  const unsettled = [...positions.values()].filter((amount) => amount !== 0).length;
  expect(plan.length).toBeLessThanOrEqual(Math.max(unsettled - 1, 0));
  for (const payment of plan) {
    expect(payment.amountCents).toBeGreaterThan(0);
    expect(payment.fromUserId).not.toBe(payment.toUserId);
  }
  return plan;
}

/**
 * A deterministic pseudo-random generator: the properties below are checked
 * over many generated position sets, and a failure has to be reproducible.
 */
function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

/** Positions summing to zero, the way a set of group balances always does. */
function generatePositions(random: () => number, people: number): Map<string, number> {
  const positions = new Map<string, number>();
  let total = 0;
  for (let index = 0; index < people - 1; index += 1) {
    const amount = Math.round((random() - 0.5) * 20_000);
    positions.set(`user-${index}`, amount);
    total += amount;
  }
  positions.set(`user-${people - 1}`, -total);
  return positions;
}

describe('planReimbursements', () => {
  it('has nothing to suggest when everyone is settled', () => {
    expect(planReimbursements(new Map([['alice', 0], ['bob', 0]]))).toEqual([]);
  });

  it('suggests the single payment that clears a pair', () => {
    const plan = expectClears(new Map([['alice', -2500], ['bob', 2500]]));

    expect(plan).toEqual([{ fromUserId: 'alice', toUserId: 'bob', amountCents: 2500 }]);
  });

  it('nets a chain of debts into one payment', () => {
    // Alice owes Bob 10, Bob owes Carole 10: Bob is at zero overall, so he
    // is not in the plan at all — this is the reason the plan is built from
    // net positions instead of from who owes whom.
    const plan = expectClears(
      new Map([['alice', -1000], ['bob', 0], ['carole', 1000]]),
    );

    expect(plan).toEqual([{ fromUserId: 'alice', toUserId: 'carole', amountCents: 1000 }]);
  });

  it('pairs off exact matches rather than splitting them across creditors', () => {
    // Greedy largest-against-largest alone would send Bob's 3000 to Carole
    // and leave two more payments behind; the exact match settles it in one.
    const plan = expectClears(
      new Map([
        ['alice', -3000],
        ['bob', -1000],
        ['carole', 3000],
        ['dan', 1000],
      ]),
    );

    expect(plan).toEqual([
      { fromUserId: 'alice', toUserId: 'carole', amountCents: 3000 },
      { fromUserId: 'bob', toUserId: 'dan', amountCents: 1000 },
    ]);
  });

  it('splits one debtor across several creditors when nothing matches', () => {
    const plan = expectClears(
      new Map([['alice', -5000], ['bob', 3000], ['carole', 2000]]),
    );

    expect(plan).toEqual([
      { fromUserId: 'alice', toUserId: 'bob', amountCents: 3000 },
      { fromUserId: 'alice', toUserId: 'carole', amountCents: 2000 },
    ]);
  });

  it('leaves out everyone already at zero', () => {
    const plan = expectClears(
      new Map([['alice', -400], ['bob', 400], ['carole', 0], ['dan', 0]]),
    );

    expect(plan.flatMap((payment) => [payment.fromUserId, payment.toUserId])).not.toContain(
      'carole',
    );
  });

  it('does not depend on the order the positions arrive in', () => {
    const entries: [string, number][] = [
      ['alice', -1500],
      ['bob', 2500],
      ['carole', -3000],
      ['dan', 2000],
    ];
    const reversed = [...entries].reverse();

    expect(planReimbursements(new Map(reversed))).toEqual(planReimbursements(new Map(entries)));
  });

  it('clears any set of positions that sums to zero, within the payment bound', () => {
    const random = generator(20_260_912);
    for (let round = 0; round < 200; round += 1) {
      const people = 2 + (round % 9);
      expectClears(generatePositions(random, people));
    }
  });
});
