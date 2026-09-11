import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestContext } from '../../test/app.js';
import { signInAs, type TestUser } from '../../test/auth.js';
import { fakeGoogleVerifier } from '../../test/google.js';
import {
  computeBalances,
  computePairwiseBalances,
  groupParticipantsByTransaction,
} from '../transactions/balances.js';
import { createTransactionsRepository } from '../transactions/repository.js';

const google = fakeGoogleVerifier({
  ada: { sub: 'google-ada', email: 'ada@example.com', name: 'Ada Lovelace' },
  grace: { sub: 'google-grace', email: 'grace@example.com', name: 'Grace Hopper' },
  alan: { sub: 'google-alan', email: 'alan@example.com', name: 'Alan Turing' },
});

const clock = new Date('2026-09-11T12:00:00.000Z');

/**
 * What the friend list says about where the caller stands with each friend —
 * the cross-group balance of `docs/specs/balances.md`, end to end.
 */
describe('friend balances', () => {
  let app: FastifyInstance;
  let reset: () => Promise<void>;

  beforeAll(async () => {
    ({ app, reset } = await createTestContext({
      auth: { googleVerifier: google },
      invites: {
        now: () => clock,
        inviteTtlSeconds: 3600,
        publicBaseUrl: 'https://splitcount.test',
      },
      groups: { now: () => clock },
      transactions: { now: () => clock },
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await reset();
  });

  const signIn = (idToken: string) => signInAs(app, idToken);

  async function befriend(a: TestUser, b: TestUser): Promise<void> {
    const { invite } = (
      await app.inject({ method: 'POST', url: '/friends/invite', headers: a.headers })
    ).json();
    const accepted = await app.inject({
      method: 'POST',
      url: `/invites/${invite.code}/accept`,
      headers: b.headers,
    });
    expect(accepted.statusCode).toBe(200);
  }

  async function createdGroup(user: TestUser, name: string, memberIds: string[] = []) {
    const response = await app.inject({
      method: 'POST',
      url: '/groups',
      headers: user.headers,
      payload: { name, memberIds },
    });
    expect(response.statusCode).toBe(201);
    return response.json().group as { id: string };
  }

  async function pairGroupOf(user: TestUser, friendId: string) {
    const response = await app.inject({
      method: 'POST',
      url: `/groups/pair/${friendId}`,
      headers: user.headers,
    });
    expect(response.statusCode).toBe(200);
    return response.json().group as { id: string };
  }

  async function createdTx(
    user: TestUser,
    groupId: string,
    payload: Record<string, unknown>,
  ) {
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/transactions`,
      headers: user.headers,
      payload,
    });
    expect(response.statusCode).toBe(201);
    return response.json().transaction as { id: string };
  }

  /** An expense `payer` covers, split equally between `concernedIds`. */
  const equalExpense = (
    payer: TestUser,
    amount: number,
    concernedIds: string[],
    title = 'Groceries',
  ) => ({
    kind: 'expense',
    title,
    amount,
    occurredOn: '2026-09-11',
    payerId: payer.userId,
    split: {
      mode: 'shares',
      participants: concernedIds.map((userId) => ({ userId, weight: 1 })),
    },
  });

  async function friendsOf(user: TestUser) {
    const response = await app.inject({
      method: 'GET',
      url: '/friends',
      headers: user.headers,
    });
    expect(response.statusCode).toBe(200);
    return response.json().friends as {
      id: string;
      name: string;
      balanceCents: number;
    }[];
  }

  /** What the friend list says `user` stands at with `friendId`. */
  async function balanceOf(user: TestUser, friendId: string): Promise<number> {
    const friends = await friendsOf(user);
    const entry = friends.find((friend) => friend.id === friendId);
    expect(entry).toBeDefined();
    return entry!.balanceCents;
  }

  it('reads as settled for a friend with no shared transaction', async () => {
    const ada = await signIn('ada');
    const grace = await signIn('grace');
    await befriend(ada, grace);

    expect(await balanceOf(ada, grace.userId)).toBe(0);
  });

  it('has each side owing the other the exact opposite', async () => {
    const ada = await signIn('ada');
    const grace = await signIn('grace');
    await befriend(ada, grace);
    const group = await createdGroup(ada, 'Corsica 2026', [grace.userId]);

    await createdTx(ada, group.id, equalExpense(ada, 1000, [ada.userId, grace.userId]));

    expect(await balanceOf(ada, grace.userId)).toBe(500);
    expect(await balanceOf(grace, ada.userId)).toBe(-500);
  });

  it('adds up every group the two share, pair group included', async () => {
    const ada = await signIn('ada');
    const grace = await signIn('grace');
    await befriend(ada, grace);
    const trip = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
    const flat = await createdGroup(ada, 'Flatshare', [grace.userId]);
    const pair = await pairGroupOf(ada, grace.userId);

    await createdTx(ada, trip.id, equalExpense(ada, 1000, [ada.userId, grace.userId]));
    await createdTx(ada, flat.id, equalExpense(ada, 700, [ada.userId, grace.userId]));
    // Grace paid this one: it goes the other way.
    await createdTx(grace, pair.id, equalExpense(grace, 200, [ada.userId, grace.userId]));

    // 500 + 350 - 100
    expect(await balanceOf(ada, grace.userId)).toBe(750);
  });

  it('counts a group that has since been archived', async () => {
    const ada = await signIn('ada');
    const grace = await signIn('grace');
    await befriend(ada, grace);
    const group = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
    await createdTx(ada, group.id, equalExpense(ada, 1000, [ada.userId, grace.userId]));

    const archived = await app.inject({
      method: 'PATCH',
      url: `/groups/${group.id}`,
      headers: ada.headers,
      payload: { archived: true },
    });
    expect(archived.statusCode).toBe(200);

    // Archiving stops new transactions; it does not forgive a debt.
    expect(await balanceOf(ada, grace.userId)).toBe(500);
  });

  it('counts a group the friend has since left', async () => {
    const ada = await signIn('ada');
    const grace = await signIn('grace');
    await befriend(ada, grace);
    const group = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
    await createdTx(ada, group.id, equalExpense(ada, 1000, [ada.userId, grace.userId]));

    const removed = await app.inject({
      method: 'DELETE',
      url: `/groups/${group.id}/members/${grace.userId}`,
      headers: ada.headers,
    });
    expect(removed.statusCode).toBe(204);

    expect(await balanceOf(ada, grace.userId)).toBe(500);
  });

  it('is not moved by a transaction that concerns only one of the two', async () => {
    const ada = await signIn('ada');
    const grace = await signIn('grace');
    const alan = await signIn('alan');
    await befriend(ada, grace);
    await befriend(ada, alan);
    await befriend(grace, alan);
    const group = await createdGroup(ada, 'Flatshare', [grace.userId, alan.userId]);

    // Alan pays for himself and Grace. Ada is a member of the group but not
    // on the transaction, so nothing changes between Ada and either of them —
    // even though it moves both their *group* balances.
    await createdTx(alan, group.id, equalExpense(alan, 800, [alan.userId, grace.userId]));

    expect(await balanceOf(ada, grace.userId)).toBe(0);
    expect(await balanceOf(ada, alan.userId)).toBe(0);
    expect(await balanceOf(grace, alan.userId)).toBe(-400);
  });

  it('creates no debt between two people who merely share a payer', async () => {
    const ada = await signIn('ada');
    const grace = await signIn('grace');
    const alan = await signIn('alan');
    await befriend(ada, grace);
    await befriend(ada, alan);
    await befriend(grace, alan);
    const group = await createdGroup(ada, 'Flatshare', [grace.userId, alan.userId]);

    // Ada paid for Grace and Alan. Both owe Ada; neither owes the other.
    await createdTx(ada, group.id, equalExpense(ada, 900, [grace.userId, alan.userId]));

    expect(await balanceOf(ada, grace.userId)).toBe(450);
    expect(await balanceOf(ada, alan.userId)).toBe(450);
    expect(await balanceOf(grace, alan.userId)).toBe(0);
  });

  it('cancels a debt when the friend transfers the amount back', async () => {
    const ada = await signIn('ada');
    const grace = await signIn('grace');
    await befriend(ada, grace);
    const group = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
    await createdTx(ada, group.id, equalExpense(ada, 1000, [ada.userId, grace.userId]));

    expect(await balanceOf(ada, grace.userId)).toBe(500);

    await createdTx(grace, group.id, {
      kind: 'transfer',
      title: 'Paying you back',
      amount: 500,
      occurredOn: '2026-09-12',
      payerId: grace.userId,
      toUserId: ada.userId,
    });

    expect(await balanceOf(ada, grace.userId)).toBe(0);
    expect(await balanceOf(grace, ada.userId)).toBe(0);
  });

  it('reverses the direction for an income', async () => {
    const ada = await signIn('ada');
    const grace = await signIn('grace');
    await befriend(ada, grace);
    const group = await createdGroup(ada, 'Corsica 2026', [grace.userId]);

    // Ada received a 600 refund on behalf of the two of them: she owes Grace half.
    await createdTx(ada, group.id, {
      kind: 'income',
      title: 'Deposit refund',
      amount: 600,
      occurredOn: '2026-09-11',
      payerId: ada.userId,
      split: {
        mode: 'shares',
        participants: [
          { userId: ada.userId, weight: 1 },
          { userId: grace.userId, weight: 1 },
        ],
      },
    });

    expect(await balanceOf(ada, grace.userId)).toBe(-300);
  });

  it('follows an edited transaction, and goes with a deleted one', async () => {
    const ada = await signIn('ada');
    const grace = await signIn('grace');
    await befriend(ada, grace);
    const group = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
    const tx = await createdTx(
      ada,
      group.id,
      equalExpense(ada, 1000, [ada.userId, grace.userId]),
    );

    const edited = await app.inject({
      method: 'PATCH',
      url: `/groups/${group.id}/transactions/${tx.id}`,
      headers: ada.headers,
      payload: equalExpense(ada, 400, [ada.userId, grace.userId]),
    });
    expect(edited.statusCode).toBe(200);
    expect(await balanceOf(ada, grace.userId)).toBe(200);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/groups/${group.id}/transactions/${tx.id}`,
      headers: ada.headers,
    });
    expect(deleted.statusCode).toBe(204);
    expect(await balanceOf(ada, grace.userId)).toBe(0);
  });

  it('never counts a transaction the caller is not party to', async () => {
    const ada = await signIn('ada');
    const grace = await signIn('grace');
    const alan = await signIn('alan');
    await befriend(ada, grace);
    // Grace and Alan share a group Ada knows nothing about.
    await befriend(grace, alan);
    const theirs = await createdGroup(grace, 'Their trip', [alan.userId]);
    await createdTx(grace, theirs.id, equalExpense(grace, 5000, [grace.userId, alan.userId]));

    // Ada is not on any of it, so her list shows only what she is party to.
    expect(await balanceOf(ada, grace.userId)).toBe(0);
    const adaFriends = await friendsOf(ada);
    expect(adaFriends.map((friend) => friend.id)).toEqual([grace.userId]);
  });

  it('agrees with the readable rule it implements, across groups', async () => {
    // The SQL aggregate and `computePairwiseBalances` are two statements of
    // the same rule; this is what stops them drifting apart.
    const ada = await signIn('ada');
    const grace = await signIn('grace');
    const alan = await signIn('alan');
    await befriend(ada, grace);
    await befriend(ada, alan);
    const trip = await createdGroup(ada, 'Corsica 2026', [grace.userId, alan.userId]);
    const pair = await pairGroupOf(ada, grace.userId);

    await createdTx(ada, trip.id, equalExpense(ada, 999, [ada.userId, grace.userId, alan.userId]));
    await createdTx(grace, trip.id, equalExpense(grace, 77, [ada.userId, grace.userId]));
    await createdTx(alan, trip.id, equalExpense(alan, 1234, [ada.userId, alan.userId]));
    await createdTx(ada, pair.id, equalExpense(ada, 43, [ada.userId, grace.userId]));
    await createdTx(ada, trip.id, {
      kind: 'income',
      title: 'Refund',
      amount: 500,
      occurredOn: '2026-09-12',
      payerId: ada.userId,
      split: {
        mode: 'shares',
        participants: [
          { userId: grace.userId, weight: 2 },
          { userId: alan.userId, weight: 1 },
        ],
      },
    });

    const repository = createTransactionsRepository(app.db);
    const rows = [
      ...(await repository.listByGroup(trip.id)),
      ...(await repository.listByGroup(pair.id)),
    ];
    const participants = await repository.listParticipants(rows.map((row) => row.id));
    const byTransaction = groupParticipantsByTransaction(participants);

    for (const viewer of [ada, grace, alan]) {
      const expected = computePairwiseBalances(viewer.userId, rows, byTransaction);
      for (const friend of await friendsOf(viewer)) {
        expect(friend.balanceCents).toBe(expected.get(friend.id) ?? 0);
      }
    }

    // And the consistency property, on the group that holds all three: a
    // member's balances with the others sum to their balance in the group.
    const tripRows = await repository.listByGroup(trip.id);
    const tripParticipants = groupParticipantsByTransaction(
      await repository.listParticipants(tripRows.map((row) => row.id)),
    );
    const groupBalances = computeBalances(tripRows, tripParticipants);
    for (const viewer of [ada, grace, alan]) {
      const pairwise = computePairwiseBalances(viewer.userId, tripRows, tripParticipants);
      const total = [...pairwise.values()].reduce((sum, value) => sum + value, 0);
      expect(total).toBe(groupBalances.get(viewer.userId));
    }
  });
});
