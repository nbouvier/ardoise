import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { transactionParticipants, transactions } from '../../db/schema.js';
import { createTestContext } from '../../test/app.js';
import { signInAs, type TestUser } from '../../test/auth.js';
import { fakeGoogleVerifier } from '../../test/google.js';

const google = fakeGoogleVerifier({
  ada: { sub: 'google-ada', email: 'ada@example.com', name: 'Ada Lovelace' },
  grace: { sub: 'google-grace', email: 'grace@example.com', name: 'Grace Hopper' },
  alan: { sub: 'google-alan', email: 'alan@example.com', name: 'Alan Turing' },
});

let clock = new Date('2026-09-11T12:00:00.000Z');

describe('transactions routes', () => {
  let app: FastifyInstance;
  let reset: () => Promise<void>;

  beforeAll(async () => {
    ({ app, reset } = await createTestContext({
      auth: { googleVerifier: google },
      invites: { now: () => clock, inviteTtlSeconds: 3600, publicBaseUrl: 'https://splitcount.test' },
      groups: { now: () => clock },
      transactions: { now: () => clock },
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    clock = new Date('2026-09-11T12:00:00.000Z');
    await reset();
  });

  const signIn = (idToken: string) => signInAs(app, idToken);

  async function befriend(a: TestUser, b: TestUser): Promise<void> {
    const { invite } = (
      await app.inject({ method: 'POST', url: '/friends/invite', headers: a.headers })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/invites/${invite.code}/accept`,
      headers: b.headers,
    });
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
    return response.json().group as { id: string };
  }

  async function createdSubgroup(
    user: TestUser,
    parentId: string,
    name: string,
    memberIds: string[] = [],
  ) {
    const response = await app.inject({
      method: 'POST',
      url: '/groups',
      headers: user.headers,
      payload: { name, memberIds, parentId },
    });
    expect(response.statusCode).toBe(201);
    return response.json().group as { id: string };
  }

  const archiveGroup = (user: TestUser, groupId: string, archived: boolean) =>
    app.inject({
      method: 'PATCH',
      url: `/groups/${groupId}`,
      headers: user.headers,
      payload: { archived },
    });

  const createTx = (user: TestUser, groupId: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/groups/${groupId}/transactions`,
      headers: user.headers,
      payload,
    });

  async function createdTx(user: TestUser, groupId: string, payload: Record<string, unknown>) {
    const response = await createTx(user, groupId, payload);
    expect(response.statusCode).toBe(201);
    return response.json().transaction;
  }

  const listTx = (user: TestUser, groupId: string, scope?: string) =>
    app.inject({
      method: 'GET',
      url: `/groups/${groupId}/transactions${scope ? `?scope=${scope}` : ''}`,
      headers: user.headers,
    });

  const getTx = (user: TestUser, groupId: string, txId: string) =>
    app.inject({
      method: 'GET',
      url: `/groups/${groupId}/transactions/${txId}`,
      headers: user.headers,
    });

  const updateTx = (user: TestUser, groupId: string, txId: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH',
      url: `/groups/${groupId}/transactions/${txId}`,
      headers: user.headers,
      payload,
    });

  const deleteTx = (user: TestUser, groupId: string, txId: string) =>
    app.inject({
      method: 'DELETE',
      url: `/groups/${groupId}/transactions/${txId}`,
      headers: user.headers,
    });

  const getBalances = (user: TestUser, groupId: string) =>
    app.inject({
      method: 'GET',
      url: `/groups/${groupId}/transactions/balances`,
      headers: user.headers,
    });

  function expense(payerId: string, participantIds: string[], amount = 900) {
    return {
      kind: 'expense',
      title: 'Groceries',
      amount,
      occurredOn: '2026-09-11',
      payerId,
      split: {
        mode: 'shares',
        participants: participantIds.map((userId) => ({ userId, weight: 1 })),
      },
    };
  }

  describe('POST /groups/:groupId/transactions', () => {
    it('records an expense with an equal shares split', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Corsica 2026', [grace.userId]);

      const tx = await createdTx(ada, group.id, expense(ada.userId, [ada.userId, grace.userId], 1001));

      expect(tx.kind).toBe('expense');
      expect(tx.amountCents).toBe(1001);
      expect(tx.splitMode).toBe('shares');
      expect(tx.payer.id).toBe(ada.userId);
      const participants = tx.participants as { user: { id: string }; shareCents: number }[];
      const adaShare = participants.find((p) => p.user.id === ada.userId)!.shareCents;
      const graceShare = participants.find((p) => p.user.id === grace.userId)!.shareCents;
      // 1001 / 2: one of the two gets the extra cent.
      expect([adaShare, graceShare].sort((a, b) => a - b)).toEqual([500, 501]);
      expect(adaShare + graceShare).toBe(1001);
    });

    it('records a category, and defaults to "other" when none is given', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');

      const categorised = await createdTx(ada, group.id, {
        ...expense(ada.userId, [ada.userId]),
        category: 'groceries',
      });
      expect(categorised.category).toBe('groceries');

      const uncategorised = await createdTx(ada, group.id, expense(ada.userId, [ada.userId]));
      expect(uncategorised.category).toBe('other');
    });

    it('rejects an unknown category', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');

      const response = await createTx(ada, group.id, {
        ...expense(ada.userId, [ada.userId]),
        category: 'crypto',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_request' });
    });

    it('records a transaction in the implicit pair group, unlike every membership action', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const pair = await pairGroupOf(ada, grace.userId);

      const response = await createTx(ada, pair.id, expense(ada.userId, [ada.userId, grace.userId], 400));

      expect(response.statusCode).toBe(201);
      expect(response.json().transaction.amountCents).toBe(400);
    });

    it('defaults the payer to whoever is picked, and allows a payer who is not a participant', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      await befriend(ada, alan);
      const group = await createdGroup(ada, 'Trip', [grace.userId, alan.userId]);

      const tx = await createdTx(ada, group.id, expense(ada.userId, [grace.userId, alan.userId], 1000));

      expect(tx.payer.id).toBe(ada.userId);
      expect(tx.participants.map((p: { user: { id: string } }) => p.user.id).sort()).toEqual(
        [grace.userId, alan.userId].sort(),
      );
    });

    it('records an income with a fixed-amount split', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);

      const tx = await createdTx(ada, group.id, {
        kind: 'income',
        title: 'Refund',
        amount: 500,
        occurredOn: '2026-09-11',
        payerId: ada.userId,
        split: {
          mode: 'amount',
          participants: [
            { userId: ada.userId, amount: 200 },
            { userId: grace.userId, amount: 300 },
          ],
        },
      });

      expect(tx.kind).toBe('income');
      expect(tx.splitMode).toBe('amount');
    });

    it('records a transfer as a single-participant amount split', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);

      const tx = await createdTx(ada, group.id, {
        kind: 'transfer',
        title: 'Reimbursement',
        amount: 750,
        occurredOn: '2026-09-11',
        payerId: ada.userId,
        toUserId: grace.userId,
      });

      expect(tx.kind).toBe('transfer');
      expect(tx.splitMode).toBe('amount');
      expect(tx.participants).toHaveLength(1);
      expect(tx.participants[0].user.id).toBe(grace.userId);
      expect(tx.participants[0].shareCents).toBe(750);
    });

    it('refuses a transfer to the payer themselves', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Solo');

      const response = await createTx(ada, group.id, {
        kind: 'transfer',
        title: 'Reimbursement',
        amount: 100,
        occurredOn: '2026-09-11',
        payerId: ada.userId,
        toUserId: ada.userId,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_split' });
    });

    it('refuses a fixed-amount split that does not sum to the total', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);

      const response = await createTx(ada, group.id, {
        kind: 'expense',
        title: 'Groceries',
        amount: 1000,
        occurredOn: '2026-09-11',
        payerId: ada.userId,
        split: {
          mode: 'amount',
          participants: [
            { userId: ada.userId, amount: 400 },
            { userId: grace.userId, amount: 500 },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_split' });
    });

    it('refuses a payer who is not a member of the group', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const group = await createdGroup(ada, 'Trip');

      const response = await createTx(ada, group.id, expense(alan.userId, [ada.userId]));

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'not_group_member' });
    });

    it('refuses a concerned member who is not a member of the group', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const group = await createdGroup(ada, 'Trip');

      const response = await createTx(ada, group.id, expense(ada.userId, [ada.userId, alan.userId]));

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'not_group_member' });
    });

    it('refuses recording on an archived group', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      await archiveGroup(ada, group.id, true);

      const response = await createTx(ada, group.id, expense(ada.userId, [ada.userId]));

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'group_archived' });
    });

    it('refuses recording on a sub-group whose ancestor is archived', async () => {
      const ada = await signIn('ada');
      const root = await createdGroup(ada, 'Corsica 2026');
      const sub = await app.inject({
        method: 'POST',
        url: '/groups',
        headers: ada.headers,
        payload: { name: 'Ajaccio weekend', parentId: root.id },
      });
      await archiveGroup(ada, root.id, true);

      const response = await createTx(ada, sub.json().group.id, expense(ada.userId, [ada.userId]));

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'group_archived' });
    });

    it('answers a non-member with not found, never a hint the group exists', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const group = await createdGroup(ada, 'Trip');

      const response = await createTx(alan, group.id, expense(alan.userId, [alan.userId]));

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'group_not_found' });
    });

    it('rejects a malformed request', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');

      const response = await createTx(ada, group.id, { kind: 'expense', title: '', amount: 0 });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_request' });
    });
  });

  describe('GET /groups/:groupId/transactions', () => {
    it('lists most recent first, by date then by recording order', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');

      const first = await createdTx(ada, group.id, {
        ...expense(ada.userId, [ada.userId]),
        title: 'First',
        occurredOn: '2026-09-01',
      });
      const second = await createdTx(ada, group.id, {
        ...expense(ada.userId, [ada.userId]),
        title: 'Second',
        occurredOn: '2026-09-05',
      });
      const third = await createdTx(ada, group.id, {
        ...expense(ada.userId, [ada.userId]),
        title: 'Third, same day as second but recorded later',
        occurredOn: '2026-09-05',
      });

      const response = await listTx(ada, group.id);
      const ids = response.json().transactions.map((t: { id: string }) => t.id);

      expect(ids).toEqual([third.id, second.id, first.id]);
    });

    it('answers a non-member with not found', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const group = await createdGroup(ada, 'Trip');

      expect((await listTx(alan, group.id)).statusCode).toBe(404);
    });

    describe('scope=subtree', () => {
      it("adds a sub-group's transactions, with no excluded count", async () => {
        const ada = await signIn('ada');
        const root = await createdGroup(ada, 'Corsica 2026');
        const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');
        const inRoot = await createdTx(ada, root.id, expense(ada.userId, [ada.userId]));
        const inSub = await createdTx(ada, sub.id, expense(ada.userId, [ada.userId]));

        const plain = await listTx(ada, root.id);
        const subtree = await listTx(ada, root.id, 'subtree');

        expect(plain.json().transactions.map((t: { id: string }) => t.id)).toEqual([
          inRoot.id,
        ]);
        expect(plain.json().excludedSubgroupCount).toBe(0);

        const subtreeIds = subtree.json().transactions.map((t: { id: string }) => t.id);
        expect(subtreeIds.sort()).toEqual([inRoot.id, inSub.id].sort());
        expect(subtree.json().excludedSubgroupCount).toBe(0);
      });

      it('excludes a sub-group the caller has not joined, and reports it', async () => {
        const ada = await signIn('ada');
        const grace = await signIn('grace');
        await befriend(ada, grace);
        const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
        // Ada never joins the sub-group grace creates under the same root.
        const sub = await createdSubgroup(grace, root.id, 'Just grace');
        await createdTx(grace, sub.id, expense(grace.userId, [grace.userId]));
        const inRoot = await createdTx(ada, root.id, expense(ada.userId, [ada.userId]));

        const response = await listTx(ada, root.id, 'subtree');

        expect(response.json().transactions.map((t: { id: string }) => t.id)).toEqual([
          inRoot.id,
        ]);
        expect(response.json().excludedSubgroupCount).toBe(1);
      });

      it('rolls up several levels of nesting', async () => {
        const ada = await signIn('ada');
        const root = await createdGroup(ada, 'Corsica 2026');
        const child = await createdSubgroup(ada, root.id, 'Ajaccio weekend');
        const grandchild = await createdSubgroup(ada, child.id, 'Beach day');
        const rootTx = await createdTx(ada, root.id, expense(ada.userId, [ada.userId]));
        const childTx = await createdTx(ada, child.id, expense(ada.userId, [ada.userId]));
        const grandchildTx = await createdTx(
          ada,
          grandchild.id,
          expense(ada.userId, [ada.userId]),
        );

        const response = await listTx(ada, root.id, 'subtree');

        const ids = response.json().transactions.map((t: { id: string }) => t.id);
        expect(ids.sort()).toEqual([rootTx.id, childTx.id, grandchildTx.id].sort());
      });
    });
  });

  describe('GET /groups/:groupId/transactions/:transactionId', () => {
    it('refuses a transaction id that belongs to a different group', async () => {
      const ada = await signIn('ada');
      const groupA = await createdGroup(ada, 'Group A');
      const groupB = await createdGroup(ada, 'Group B');
      const tx = await createdTx(ada, groupA.id, expense(ada.userId, [ada.userId]));

      const response = await getTx(ada, groupB.id, tx.id);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'transaction_not_found' });
    });

    it('answers a non-member with not found', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const group = await createdGroup(ada, 'Trip');
      const tx = await createdTx(ada, group.id, expense(ada.userId, [ada.userId]));

      expect((await getTx(alan, group.id, tx.id)).statusCode).toBe(404);
    });
  });

  describe('PATCH /groups/:groupId/transactions/:transactionId', () => {
    it('lets any member edit a transaction they did not create', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);
      const tx = await createdTx(ada, group.id, expense(ada.userId, [ada.userId, grace.userId], 1000));

      const response = await updateTx(grace, group.id, tx.id, {
        ...expense(ada.userId, [ada.userId, grace.userId], 2000),
        title: 'Groceries (corrected)',
      });

      expect(response.statusCode).toBe(200);
      const updated = response.json().transaction;
      expect(updated.title).toBe('Groceries (corrected)');
      expect(updated.amountCents).toBe(2000);
    });

    it('changes the category, and resets to "other" when none is given', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      const tx = await createdTx(ada, group.id, expense(ada.userId, [ada.userId]));

      const categorised = await updateTx(ada, group.id, tx.id, {
        ...expense(ada.userId, [ada.userId]),
        category: 'restaurant',
      });
      expect(categorised.json().transaction.category).toBe('restaurant');

      const reset = await updateTx(ada, group.id, tx.id, expense(ada.userId, [ada.userId]));
      expect(reset.json().transaction.category).toBe('other');
    });

    it('refuses editing on an archived group', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      const tx = await createdTx(ada, group.id, expense(ada.userId, [ada.userId]));
      await archiveGroup(ada, group.id, true);

      const response = await updateTx(ada, group.id, tx.id, expense(ada.userId, [ada.userId], 500));

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'group_archived' });
    });

    it('refuses a transaction id from a different group', async () => {
      const ada = await signIn('ada');
      const groupA = await createdGroup(ada, 'Group A');
      const groupB = await createdGroup(ada, 'Group B');
      const tx = await createdTx(ada, groupA.id, expense(ada.userId, [ada.userId]));

      const response = await updateTx(ada, groupB.id, tx.id, expense(ada.userId, [ada.userId], 500));

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'transaction_not_found' });
    });
  });

  describe('DELETE /groups/:groupId/transactions/:transactionId', () => {
    it('lets any member delete a transaction they did not create', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);
      const tx = await createdTx(ada, group.id, expense(ada.userId, [ada.userId, grace.userId]));

      const response = await deleteTx(grace, group.id, tx.id);

      expect(response.statusCode).toBe(204);
      expect((await getTx(ada, group.id, tx.id)).statusCode).toBe(404);
    });

    it('refuses deleting on an archived group', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      const tx = await createdTx(ada, group.id, expense(ada.userId, [ada.userId]));
      await archiveGroup(ada, group.id, true);

      const response = await deleteTx(ada, group.id, tx.id);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'group_archived' });
    });
  });

  describe('cascade deletion', () => {
    it('deletes a group’s transactions along with it', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      await createdTx(ada, group.id, expense(ada.userId, [ada.userId]));

      await app.inject({ method: 'DELETE', url: `/groups/${group.id}`, headers: ada.headers });

      expect(await app.db.select().from(transactions)).toHaveLength(0);
      expect(await app.db.select().from(transactionParticipants)).toHaveLength(0);
    });

    it('deletes the pair group’s transactions when the friendship ends', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const pair = await pairGroupOf(ada, grace.userId);
      await createdTx(ada, pair.id, expense(ada.userId, [ada.userId, grace.userId]));

      await app.inject({
        method: 'DELETE',
        url: `/friends/${grace.userId}`,
        headers: ada.headers,
      });

      expect(await app.db.select().from(transactions)).toHaveLength(0);
      expect(await app.db.select().from(transactionParticipants)).toHaveLength(0);
    });
  });

  describe('GET /groups/:groupId/transactions/balances', () => {
    it('sums to zero and reflects who owes what', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);

      // Ada pays 1000, split evenly: Ada +500, Grace -500.
      await createdTx(ada, group.id, expense(ada.userId, [ada.userId, grace.userId], 1000));

      const response = await getBalances(ada, group.id);
      const balances = new Map(
        response.json().balances.map((b: { userId: string; amountCents: number }) => [b.userId, b.amountCents]),
      );

      expect(balances.get(ada.userId)).toBe(500);
      expect(balances.get(grace.userId)).toBe(-500);
      expect([...balances.values()].reduce((sum: number, v) => sum + (v as number), 0)).toBe(0);
    });

    it('includes every current member, even with no transactions', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);

      const response = await getBalances(ada, group.id);
      const balances = new Map(
        response.json().balances.map((b: { userId: string; amountCents: number }) => [b.userId, b.amountCents]),
      );

      expect(balances.get(ada.userId)).toBe(0);
      expect(balances.get(grace.userId)).toBe(0);
    });

    it('keeps a departed member’s unsettled balance', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);
      await createdTx(ada, group.id, expense(ada.userId, [ada.userId, grace.userId], 1000));

      await app.inject({
        method: 'DELETE',
        url: `/groups/${group.id}/members/${grace.userId}`,
        headers: ada.headers,
      });

      const response = await getBalances(ada, group.id);
      const balances = new Map(
        response.json().balances.map((b: { userId: string; amountCents: number }) => [b.userId, b.amountCents]),
      );

      expect(balances.get(grace.userId)).toBe(-500);
    });

    it('answers a non-member with not found', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const group = await createdGroup(ada, 'Trip');

      expect((await getBalances(alan, group.id)).statusCode).toBe(404);
    });
  });

  describe('GET /groups/:groupId/transactions/reimbursements', () => {
    interface Party {
      id: string;
      name: string;
    }
    interface Plan {
      scope: string;
      positions: {
        user: Party;
        amountCents: number;
        sources: { groupId: string; groupName: string; amountCents: number }[];
      }[];
      reimbursements: { from: Party; to: Party; amountCents: number }[];
    }

    const getPlan = (user: TestUser, groupId: string, scope?: string) =>
      app.inject({
        method: 'GET',
        url: `/groups/${groupId}/transactions/reimbursements${scope ? `?scope=${scope}` : ''}`,
        headers: user.headers,
      });

    async function plan(user: TestUser, groupId: string, scope?: string): Promise<Plan> {
      const response = await getPlan(user, groupId, scope);
      expect(response.statusCode).toBe(200);
      return response.json() as Plan;
    }

    const positionOf = (read: Plan, userId: string) =>
      read.positions.find((position) => position.user.id === userId);

    it('nets a chain of debts into a single payment', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      await befriend(ada, alan);
      const group = await createdGroup(ada, 'Trip', [grace.userId, alan.userId]);

      // Grace covers 1000 for Ada; Alan covers 1000 for Grace. Grace comes
      // out even, so the plan must not ask her to pay or be paid at all.
      await createdTx(grace, group.id, expense(grace.userId, [ada.userId], 1000));
      await createdTx(alan, group.id, expense(alan.userId, [grace.userId], 1000));

      const read = await plan(ada, group.id);

      expect(read.reimbursements).toEqual([
        {
          from: { id: ada.userId, name: 'Ada Lovelace', picture: null },
          to: { id: alan.userId, name: 'Alan Turing', picture: null },
          amountCents: 1000,
        },
      ]);
      expect(positionOf(read, grace.userId)?.amountCents).toBe(0);
    });

    it('reads as settled, with every member at zero, when nothing is owed', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);

      const read = await plan(ada, group.id);

      expect(read.reimbursements).toEqual([]);
      expect(read.positions.map((position) => position.amountCents)).toEqual([0, 0]);
    });

    it('covers a sub-group the caller has not joined, under scope=subtree', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      await befriend(ada, alan);
      await befriend(grace, alan);
      const trip = await createdGroup(ada, 'Trip', [grace.userId, alan.userId]);
      // Grace's own sub-group: she and Alan are in it, Ada is not.
      const corsica = await createdSubgroup(grace, trip.id, 'Corsica', [alan.userId]);
      await createdTx(grace, corsica.id, expense(grace.userId, [alan.userId], 1000));

      const own = await plan(ada, trip.id);
      expect(own.reimbursements).toEqual([]);

      const subtree = await plan(ada, trip.id, 'subtree');
      expect(subtree.scope).toBe('subtree');
      expect(subtree.reimbursements).toEqual([
        {
          from: { id: alan.userId, name: 'Alan Turing', picture: null },
          to: { id: grace.userId, name: 'Grace Hopper', picture: null },
          amountCents: 1000,
        },
      ]);
      // The debt is attributed to the sub-group it arose in, by name.
      expect(positionOf(subtree, alan.userId)?.sources).toEqual([
        { groupId: corsica.id, groupName: 'Corsica', amountCents: -1000 },
      ]);
    });

    it('leaves the roll-up and the transaction sub-tree scope filtering by membership', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      await befriend(ada, alan);
      await befriend(grace, alan);
      const trip = await createdGroup(ada, 'Trip', [grace.userId, alan.userId]);
      const corsica = await createdSubgroup(grace, trip.id, 'Corsica', [alan.userId]);
      await createdTx(grace, corsica.id, expense(grace.userId, [alan.userId], 1000));

      // The plan is the *only* sub-tree view that crosses this boundary:
      // Ada's own rolled-up balance and her sub-tree transaction list must
      // still ignore a sub-group she is not in.
      const groups = (await app.inject({ method: 'GET', url: '/groups', headers: ada.headers }))
        .json()
        .groups as { id: string; viewerBalanceCents: number }[];
      expect(groups.find((group) => group.id === trip.id)?.viewerBalanceCents).toBe(0);

      const listed = (await listTx(ada, trip.id, 'subtree')).json();
      expect(listed.transactions).toEqual([]);
      expect(listed.excludedSubgroupCount).toBe(1);
    });

    it('attributes a position to each group it comes from, and they sum to it', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const trip = await createdGroup(ada, 'Trip', [grace.userId]);
      const corsica = await createdSubgroup(ada, trip.id, 'Corsica', [grace.userId]);
      // Ada +500 in the trip, Grace -500; then Grace +1500, Ada -1500 in Corsica.
      await createdTx(ada, trip.id, expense(ada.userId, [ada.userId, grace.userId], 1000));
      await createdTx(grace, corsica.id, expense(grace.userId, [ada.userId], 1500));

      const read = await plan(ada, trip.id, 'subtree');

      const adaPosition = positionOf(read, ada.userId)!;
      expect(adaPosition.amountCents).toBe(-1000);
      // Largest magnitude first, each naming its group.
      expect(adaPosition.sources).toEqual([
        { groupId: corsica.id, groupName: 'Corsica', amountCents: -1500 },
        { groupId: trip.id, groupName: 'Trip', amountCents: 500 },
      ]);
      expect(
        adaPosition.sources.reduce((sum, source) => sum + source.amountCents, 0),
      ).toBe(adaPosition.amountCents);
      expect(read.reimbursements).toEqual([
        {
          from: { id: ada.userId, name: 'Ada Lovelace', picture: null },
          to: { id: grace.userId, name: 'Grace Hopper', picture: null },
          amountCents: 1000,
        },
      ]);
    });

    it('counts an archived sub-group — archiving does not forgive a debt', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const trip = await createdGroup(ada, 'Trip', [grace.userId]);
      const corsica = await createdSubgroup(ada, trip.id, 'Corsica', [grace.userId]);
      await createdTx(ada, corsica.id, expense(ada.userId, [grace.userId], 800));
      expect((await archiveGroup(ada, corsica.id, true)).statusCode).toBe(200);

      const read = await plan(ada, trip.id, 'subtree');

      expect(read.reimbursements).toEqual([
        {
          from: { id: grace.userId, name: 'Grace Hopper', picture: null },
          to: { id: ada.userId, name: 'Ada Lovelace', picture: null },
          amountCents: 800,
        },
      ]);
    });

    it('stays readable on an archived group, which can still record nothing', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);
      await createdTx(ada, group.id, expense(ada.userId, [grace.userId], 600));
      await archiveGroup(ada, group.id, true);

      const read = await plan(ada, group.id);

      expect(read.reimbursements).toHaveLength(1);
      // And the transfer it suggests is refused while archived, as any write is.
      const refused = await createTx(ada, group.id, {
        kind: 'transfer',
        title: 'Reimbursement',
        amount: 600,
        occurredOn: '2026-09-11',
        payerId: grace.userId,
        toUserId: ada.userId,
      });
      expect(refused.statusCode).toBe(409);
    });

    it('is cleared by recording the transfer it suggests', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);
      await createdTx(ada, group.id, expense(ada.userId, [ada.userId, grace.userId], 1000));

      const [suggested] = (await plan(ada, group.id)).reimbursements;
      expect(suggested).toBeDefined();
      await createdTx(grace, group.id, {
        kind: 'transfer',
        title: 'Reimbursement',
        amount: suggested!.amountCents,
        occurredOn: '2026-09-11',
        payerId: suggested!.from.id,
        toUserId: suggested!.to.id,
      });

      const after = await plan(ada, group.id);
      expect(after.reimbursements).toEqual([]);
      expect(after.positions.every((position) => position.amountCents === 0)).toBe(true);
    });

    it('leaves the remainder in the plan when only part is reimbursed', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);
      await createdTx(ada, group.id, expense(ada.userId, [grace.userId], 1000));

      await createdTx(grace, group.id, {
        kind: 'transfer',
        title: 'Part of it',
        amount: 400,
        occurredOn: '2026-09-11',
        payerId: grace.userId,
        toUserId: ada.userId,
      });

      const after = await plan(ada, group.id);
      expect(after.reimbursements).toEqual([
        {
          from: { id: grace.userId, name: 'Grace Hopper', picture: null },
          to: { id: ada.userId, name: 'Ada Lovelace', picture: null },
          amountCents: 600,
        },
      ]);
    });

    it('keeps a departed member in the plan, named as the balance list names them', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);
      await createdTx(ada, group.id, expense(ada.userId, [grace.userId], 700));
      await app.inject({
        method: 'DELETE',
        url: `/groups/${group.id}/members/${grace.userId}`,
        headers: ada.headers,
      });

      const read = await plan(ada, group.id);

      expect(positionOf(read, grace.userId)?.amountCents).toBe(-700);
      expect(read.reimbursements[0]?.from.id).toBe(grace.userId);
    });

    it('falls back to the group alone on an unrecognised scope', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const trip = await createdGroup(ada, 'Trip', [grace.userId]);
      const corsica = await createdSubgroup(ada, trip.id, 'Corsica', [grace.userId]);
      await createdTx(ada, corsica.id, expense(ada.userId, [grace.userId], 900));

      const read = await plan(ada, trip.id, 'everything');

      expect(read.scope).toBe('group');
      expect(read.reimbursements).toEqual([]);
    });

    it('answers a non-member with not found', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const group = await createdGroup(ada, 'Trip');

      expect((await getPlan(alan, group.id)).statusCode).toBe(404);
      expect((await getPlan(alan, group.id, 'subtree')).statusCode).toBe(404);
    });
  });
});
