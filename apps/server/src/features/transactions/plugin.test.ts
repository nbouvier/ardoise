import { categoryBreakdown, type StatisticsType, type Transaction } from '@ardoise/shared';
import { eq, sql } from 'drizzle-orm';
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
      invites: { now: () => clock, inviteTtlSeconds: 3600, publicBaseUrl: 'https://ardoise.test' },
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

  /**
   * The group `user` shares with `friendId` — created the moment the two
   * became friends, so this is a lookup through the friend list, not a
   * get-or-create call.
   */
  async function pairGroupOf(user: TestUser, friendId: string) {
    const response = await app.inject({ method: 'GET', url: '/friends', headers: user.headers });
    const { friends } = response.json() as { friends: { id: string; groupId: string }[] };
    const friend = friends.find((f) => f.id === friendId);
    return { id: friend!.groupId };
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

  /** A page of the list; an `undefined` query value is left out. */
  const listTx = (
    user: TestUser,
    groupId: string,
    query: Record<string, string | undefined> = {},
  ) =>
    app.inject({
      method: 'GET',
      url: `/groups/${groupId}/transactions`,
      query: Object.fromEntries(
        Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined),
      ),
      headers: user.headers,
    });

  const getStatistics = (user: TestUser, groupId: string, query: Record<string, string>) =>
    app.inject({
      method: 'GET',
      url: `/groups/${groupId}/statistics`,
      query,
      headers: user.headers,
    });

  /** The group as the caller sees it — carrying their own balance in it. */
  async function getGroupOf(user: TestUser, groupId: string) {
    const response = await app.inject({ method: 'GET', url: `/groups/${groupId}`, headers: user.headers });
    expect(response.statusCode).toBe(200);
    return response.json().group as { viewerBalanceCents: number };
  }

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

  const listRecent = (user: TestUser, limit?: number) =>
    app.inject({
      method: 'GET',
      url: `/me/transactions${limit === undefined ? '' : `?limit=${limit}`}`,
      headers: user.headers,
    });

  function expense(payerId: string | null, participantIds: string[], amount = 900) {
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
    const idsOf = (response: { json: () => unknown }) =>
      (response.json() as { transactions: { id: string }[] }).transactions.map((t) => t.id);

    /** Every page, following `nextCursor` until there is none. */
    async function everyPage(user: TestUser, groupId: string, limit: number) {
      const pages: string[][] = [];
      let cursor: string | undefined;
      do {
        const response = await listTx(user, groupId, { limit: String(limit), cursor });
        expect(response.statusCode).toBe(200);
        pages.push(idsOf(response));
        cursor = response.json().nextCursor ?? undefined;
      } while (cursor);
      return pages;
    }

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

      expect(idsOf(response)).toEqual([third.id, second.id, first.id]);
      // Everything fits in the first page.
      expect(response.json().nextCursor).toBeNull();
    });

    it('pages through the list without repeating or skipping a row', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      for (let day = 1; day <= 7; day += 1) {
        // Two days share a date, so the order leans on recording order too.
        await createdTx(ada, group.id, {
          ...expense(ada.userId, [ada.userId]),
          occurredOn: `2026-09-0${Math.min(day, 6)}`,
        });
      }

      const pages = await everyPage(ada, group.id, 3);

      expect(pages.map((page) => page.length)).toEqual([3, 3, 1]);
      expect(pages.flat()).toEqual(idsOf(await listTx(ada, group.id)));
    });

    it('takes 30 to a page by default', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      for (let i = 0; i < 31; i += 1) {
        await createdTx(ada, group.id, expense(ada.userId, [ada.userId]));
      }

      const first = await listTx(ada, group.id);
      expect(idsOf(first)).toHaveLength(30);
      const second = await listTx(ada, group.id, { cursor: first.json().nextCursor });
      expect(idsOf(second)).toHaveLength(1);
      expect(second.json().nextCursor).toBeNull();
    });

    it('keeps rows recorded within the same millisecond apart', async () => {
      // `created_at` holds microseconds; a cursor rounded to milliseconds
      // would skip the rows sharing the last one's millisecond.
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      const created = [];
      for (let i = 0; i < 3; i += 1) {
        created.push(await createdTx(ada, group.id, expense(ada.userId, [ada.userId])));
      }
      for (const [index, transaction] of created.entries()) {
        await app.db
          .update(transactions)
          .set({ createdAt: sql`${`2026-09-11T12:00:00.12340${index}Z`}::timestamptz` })
          .where(eq(transactions.id, transaction.id));
      }

      const pages = await everyPage(ada, group.id, 1);

      expect(pages.flat()).toEqual(created.map((transaction) => transaction.id).reverse());
    });

    it('neither repeats nor skips a row when one is recorded between two pages', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      for (let i = 0; i < 4; i += 1) {
        await createdTx(ada, group.id, expense(ada.userId, [ada.userId]));
      }
      const before = idsOf(await listTx(ada, group.id));

      const first = await listTx(ada, group.id, { limit: '2' });
      await createdTx(ada, group.id, expense(ada.userId, [ada.userId]));
      const second = await listTx(ada, group.id, { limit: '2', cursor: first.json().nextCursor });

      expect([...idsOf(first), ...idsOf(second)]).toEqual(before);
    });

    it("leaves sub-groups' transactions out", async () => {
      const ada = await signIn('ada');
      const root = await createdGroup(ada, 'Corsica 2026');
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');
      const inRoot = await createdTx(ada, root.id, expense(ada.userId, [ada.userId]));
      await createdTx(ada, sub.id, expense(ada.userId, [ada.userId]));

      expect(idsOf(await listTx(ada, root.id))).toEqual([inRoot.id]);
    });

    it('refuses a malformed cursor or an unusable page size', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');

      for (const query of [{ cursor: 'not-a-cursor' }, { limit: '0' }, { limit: '101' }]) {
        const response = await listTx(ada, group.id, query);
        expect(response.statusCode).toBe(400);
        expect(response.json().error).toBe('invalid_request');
      }
    });

    it('answers a non-member with not found', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const group = await createdGroup(ada, 'Trip');

      expect((await listTx(alan, group.id)).statusCode).toBe(404);
    });
  });

  describe('GET /groups/:groupId/statistics', () => {
    /** An expense of `amount` in `category`, for `participantIds` in equal shares. */
    const spent = (
      payerId: string | null,
      participantIds: string[],
      amount: number,
      category = 'groceries',
      occurredOn = '2026-09-11',
    ) => ({ ...expense(payerId, participantIds, amount), category, occurredOn });

    async function totalOf(user: TestUser, groupId: string, query: Record<string, string> = {}) {
      const response = await getStatistics(user, groupId, { type: 'spending', ...query });
      expect(response.statusCode).toBe(200);
      return response.json().totalCents as number;
    }

    it('breaks the members’ shares down by category, largest first', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      await createdTx(ada, group.id, spent(ada.userId, [ada.userId], 300, 'groceries'));
      await createdTx(ada, group.id, spent(ada.userId, [ada.userId], 900, 'restaurant'));
      await createdTx(ada, group.id, spent(ada.userId, [ada.userId], 300, 'groceries'));

      const response = await getStatistics(ada, group.id, { type: 'spending' });

      expect(response.json()).toEqual({
        totalCents: 1500,
        slices: [
          { category: 'restaurant', amountCents: 900, percent: 60 },
          { category: 'groceries', amountCents: 600, percent: 40 },
        ],
        excludedSubgroupCount: 0,
      });
    });

    it('keeps spending, income and transfers apart, and never counts Others', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);
      await createdTx(ada, group.id, {
        ...spent(ada.userId, [], 6000),
        split: {
          mode: 'amount',
          participants: [
            { userId: grace.userId, amount: 2000 },
            { userId: null, amount: 4000 },
          ],
        },
      });
      await createdTx(ada, group.id, { ...spent(ada.userId, [ada.userId], 500), kind: 'income' });
      await createdTx(ada, group.id, {
        kind: 'transfer',
        title: 'Paying back',
        amount: 700,
        occurredOn: '2026-09-11',
        payerId: grace.userId,
        toUserId: ada.userId,
      });

      expect(await totalOf(ada, group.id)).toBe(2000);
      expect(await totalOf(ada, group.id, { type: 'income' })).toBe(500);
    });

    it('counts only the selected participants’ shares', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);
      await createdTx(ada, group.id, spent(ada.userId, [ada.userId, grace.userId], 1000));
      await createdTx(ada, group.id, spent(ada.userId, [grace.userId], 300));

      expect(await totalOf(ada, group.id, { participantIds: ada.userId })).toBe(500);
      expect(await totalOf(ada, group.id, { participantIds: grace.userId })).toBe(800);
      expect(
        await totalOf(ada, group.id, { participantIds: `${ada.userId},${grace.userId}` }),
      ).toBe(1300);
      expect(await totalOf(ada, group.id, { participantIds: '' })).toBe(0);
    });

    it('keeps the date range’s bounds inclusive', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      for (const [day, amount] of [['01', 1], ['05', 10], ['10', 100], ['15', 1000]] as const) {
        await createdTx(
          ada,
          group.id,
          spent(ada.userId, [ada.userId], amount, 'groceries', `2026-09-${day}`),
        );
      }

      expect(await totalOf(ada, group.id, { from: '2026-09-05', to: '2026-09-10' })).toBe(110);
      expect(await totalOf(ada, group.id, { from: '2026-09-10' })).toBe(1100);
      expect(await totalOf(ada, group.id, { to: '2026-09-05' })).toBe(11);
    });

    it('counts every sub-group by default, with no excluded count', async () => {
      const ada = await signIn('ada');
      const root = await createdGroup(ada, 'Corsica 2026');
      const child = await createdSubgroup(ada, root.id, 'Ajaccio weekend');
      const grandchild = await createdSubgroup(ada, child.id, 'Beach day');
      await createdTx(ada, root.id, spent(ada.userId, [ada.userId], 1));
      await createdTx(ada, child.id, spent(ada.userId, [ada.userId], 10));
      await createdTx(ada, grandchild.id, spent(ada.userId, [ada.userId], 100));

      const response = await getStatistics(ada, root.id, { type: 'spending' });

      expect(response.json().totalCents).toBe(111);
      expect(response.json().excludedSubgroupCount).toBe(0);
    });

    it('leaves out a sub-group the caller has not joined, and reports it', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      // Ada never joins the sub-group grace creates under the same root.
      const sub = await createdSubgroup(grace, root.id, 'Just grace');
      await createdTx(grace, sub.id, spent(grace.userId, [grace.userId], 10));
      await createdTx(ada, root.id, spent(ada.userId, [ada.userId], 1));

      const response = await getStatistics(ada, root.id, { type: 'spending' });

      expect(response.json().totalCents).toBe(1);
      expect(response.json().excludedSubgroupCount).toBe(1);
    });

    it('narrows to the named branches, each with its own nested sub-groups', async () => {
      const ada = await signIn('ada');
      const root = await createdGroup(ada, 'Corsica 2026');
      const branchA = await createdSubgroup(ada, root.id, 'Ajaccio weekend');
      const branchAChild = await createdSubgroup(ada, branchA.id, 'Beach day');
      const branchB = await createdSubgroup(ada, root.id, 'Bastia weekend');
      await createdTx(ada, root.id, spent(ada.userId, [ada.userId], 1));
      await createdTx(ada, branchA.id, spent(ada.userId, [ada.userId], 10));
      await createdTx(ada, branchAChild.id, spent(ada.userId, [ada.userId], 100));
      await createdTx(ada, branchB.id, spent(ada.userId, [ada.userId], 1000));

      expect(await totalOf(ada, root.id, { subgroupIds: branchA.id })).toBe(111);
      // None named: the group's own transactions only.
      expect(await totalOf(ada, root.id, { subgroupIds: '' })).toBe(1);
    });

    it('drops an id that is not a descendant of the group', async () => {
      const ada = await signIn('ada');
      const root = await createdGroup(ada, 'Corsica 2026');
      const other = await createdGroup(ada, 'Unrelated');
      await createdTx(ada, root.id, spent(ada.userId, [ada.userId], 1));
      await createdTx(ada, other.id, spent(ada.userId, [ada.userId], 10));

      expect(await totalOf(ada, root.id, { subgroupIds: other.id })).toBe(1);
    });

    it('refuses a malformed query', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');

      const queries: Record<string, string>[] = [
        {},
        { type: 'transfer' },
        { type: 'spending', participantIds: 'x' },
      ];
      for (const query of queries) {
        const response = await getStatistics(ada, group.id, query);
        expect(response.statusCode).toBe(400);
        expect(response.json().error).toBe('invalid_request');
      }
    });

    it('answers a non-member with not found', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const group = await createdGroup(ada, 'Trip');

      expect((await getStatistics(alan, group.id, { type: 'spending' })).statusCode).toBe(404);
    });

    it('agrees with the readable rule it implements', async () => {
      // The SQL aggregate and `categoryBreakdown` are two statements of the
      // same rule; this is what stops them drifting apart.
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      await befriend(ada, alan);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId, alan.userId]);
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend', [grace.userId]);

      const people = [ada, grace, alan];
      const categories = ['groceries', 'restaurant', 'travel', 'leisure'];
      for (let i = 0; i < 24; i += 1) {
        const groupId = i % 4 === 3 ? sub.id : root.id;
        const members = groupId === sub.id ? [ada, grace] : people;
        const payer = members[i % members.length]!;
        const concerned = members
          .filter((_, index) => (i + index) % 3 !== 0)
          .map((person) => person.userId);
        await createdTx(ada, groupId, {
          ...spent(
            i % 5 === 4 ? null : payer.userId,
            concerned.length > 0 ? concerned : [payer.userId],
            137 * (i + 1),
            categories[i % categories.length],
            `2026-09-${String((i % 20) + 1).padStart(2, '0')}`,
          ),
          kind: i % 6 === 5 ? 'income' : 'expense',
        });
      }
      // Others' share, which must never count.
      await createdTx(ada, root.id, {
        ...spent(ada.userId, [], 5000, 'travel'),
        split: {
          mode: 'amount',
          participants: [
            { userId: grace.userId, amount: 1000 },
            { userId: null, amount: 4000 },
          ],
        },
      });

      const every = [
        ...(await listTx(ada, root.id, { limit: '100' })).json().transactions,
        ...(await listTx(ada, sub.id, { limit: '100' })).json().transactions,
      ] as Transaction[];
      const filters: {
        type: StatisticsType;
        participantIds?: string[];
        from?: string;
        to?: string;
      }[] = [
        { type: 'spending' },
        { type: 'income' },
        { type: 'spending', participantIds: [grace.userId] },
        { type: 'spending', participantIds: [ada.userId, alan.userId] },
        { type: 'spending', from: '2026-09-05', to: '2026-09-12' },
        { type: 'income', participantIds: [alan.userId], from: '2026-09-08' },
      ];

      for (const { type, participantIds, from, to } of filters) {
        const inRange = every.filter(
          (t) => (!from || t.occurredOn >= from) && (!to || t.occurredOn <= to),
        );
        const expected = categoryBreakdown(inRange, { type, participantIds: participantIds ?? null });
        const query: Record<string, string> = {
          type,
          ...(participantIds ? { participantIds: participantIds.join(',') } : {}),
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        };

        const response = await getStatistics(ada, root.id, query);

        expect(response.json()).toEqual({ ...expected, excludedSubgroupCount: 0 });
      }
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

    describe('naming someone who has left the group since', () => {
      async function groupGraceLeft(ada: TestUser, grace: TestUser) {
        await befriend(ada, grace);
        const group = await createdGroup(ada, 'Trip', [grace.userId]);
        return {
          group,
          leave: () =>
            app.inject({
              method: 'DELETE',
              url: `/groups/${group.id}/members/${grace.userId}`,
              headers: grace.headers,
            }),
        };
      }

      it('keeps them as a participant', async () => {
        const ada = await signIn('ada');
        const grace = await signIn('grace');
        const { group, leave } = await groupGraceLeft(ada, grace);
        const tx = await createdTx(ada, group.id, expense(ada.userId, [ada.userId, grace.userId], 1000));
        expect((await leave()).statusCode).toBe(204);

        const response = await updateTx(ada, group.id, tx.id, {
          ...expense(ada.userId, [ada.userId, grace.userId], 1200),
          title: 'Groceries (corrected)',
        });

        expect(response.statusCode).toBe(200);
        expect(
          response.json().transaction.participants.map((p: { user: { id: string } }) => p.user.id),
        ).toContain(grace.userId);
      });

      it('keeps them as the payer', async () => {
        const ada = await signIn('ada');
        const grace = await signIn('grace');
        const { group, leave } = await groupGraceLeft(ada, grace);
        const tx = await createdTx(ada, group.id, expense(grace.userId, [ada.userId, grace.userId], 1000));
        expect((await leave()).statusCode).toBe(204);

        const response = await updateTx(ada, group.id, tx.id, expense(grace.userId, [ada.userId], 1000));

        expect(response.statusCode).toBe(200);
        expect(response.json().transaction.payer.id).toBe(grace.userId);
      });

      it('still refuses adding them to a transaction that did not name them', async () => {
        const ada = await signIn('ada');
        const grace = await signIn('grace');
        const { group, leave } = await groupGraceLeft(ada, grace);
        const tx = await createdTx(ada, group.id, expense(ada.userId, [ada.userId], 1000));
        expect((await leave()).statusCode).toBe(204);

        const response = await updateTx(ada, group.id, tx.id, expense(ada.userId, [ada.userId, grace.userId], 1000));

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({ error: 'not_group_member' });
      });
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
      // Grace pays her 450 back: unfriending is refused while money is owed.
      await createdTx(grace, pair.id, expense(grace.userId, [ada.userId], 450));

      const removal = await app.inject({
        method: 'DELETE',
        url: `/friends/${grace.userId}`,
        headers: ada.headers,
      });

      expect(removal.statusCode).toBe(204);
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

  describe('Others (people outside the group)', () => {
    const balancesOf = async (user: TestUser, groupId: string) =>
      new Map<string, number>(
        (await getBalances(user, groupId))
          .json()
          .balances.map((b: { userId: string; amountCents: number }) => [b.userId, b.amountCents]),
      );

    async function trio() {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      await befriend(ada, alan);
      const group = await createdGroup(ada, 'Trip', [grace.userId, alan.userId]);
      return { ada, grace, alan, group };
    }

    it('takes a share without it ever reaching a balance', async () => {
      const { ada, grace, alan, group } = await trio();

      // The spec's example: 60 € paid by Ada, 10 € each for her, Grace and
      // Alan, 30 € for Others — the group owes Ada 20 €, not 50 €.
      const tx = await createdTx(ada, group.id, {
        ...expense(ada.userId, [], 6000),
        split: {
          mode: 'amount',
          participants: [
            { userId: ada.userId, amount: 1000 },
            { userId: grace.userId, amount: 1000 },
            { userId: alan.userId, amount: 1000 },
            { userId: null, amount: 3000 },
          ],
        },
      });

      const others = tx.participants.find((p: { user: unknown }) => p.user === null);
      expect(others).toEqual({ user: null, shareCents: 3000, weight: null });

      const balances = await balancesOf(ada, group.id);
      expect(balances).toEqual(
        new Map([
          [ada.userId, 2000],
          [grace.userId, -1000],
          [alan.userId, -1000],
        ]),
      );
      // The group's own figure, aggregated separately, says the same.
      expect((await getGroupOf(ada, group.id)).viewerBalanceCents).toBe(2000);
    });

    it('takes a weight in a shares split, like any member', async () => {
      const { ada, grace, group } = await trio();

      const tx = await createdTx(ada, group.id, {
        ...expense(ada.userId, [], 900),
        split: {
          mode: 'shares',
          participants: [
            { userId: grace.userId, weight: 1 },
            { userId: null, weight: 2 },
          ],
        },
      });

      const shares = new Map(
        tx.participants.map((p: { user: { id: string } | null; shareCents: number }) => [
          p.user?.id ?? null,
          p.shareCents,
        ]),
      );
      expect(shares).toEqual(
        new Map([
          [grace.userId, 300],
          [null, 600],
        ]),
      );
      expect((await balancesOf(ada, group.id)).get(ada.userId)).toBe(300);
    });

    it('accepts a split whose only participant is Others, moving no balance', async () => {
      const { ada, group } = await trio();

      const response = await createTx(ada, group.id, {
        ...expense(ada.userId, [], 4000),
        split: { mode: 'shares', participants: [{ userId: null, weight: 1 }] },
      });

      expect(response.statusCode).toBe(201);
      expect([...(await balancesOf(ada, group.id)).values()]).toEqual([0, 0, 0]);
    });

    it('accepts Others as the payer, moving no balance', async () => {
      const { ada, grace, group } = await trio();

      const tx = await createdTx(ada, group.id, expense(null, [ada.userId, grace.userId], 800));

      expect(tx.payer).toBeNull();
      expect([...(await balancesOf(ada, group.id)).values()]).toEqual([0, 0, 0]);
      // Still Ada's, as one of the people it concerns.
      const recent = (await listRecent(ada)).json().transactions as {
        transaction: { id: string; payer: unknown };
      }[];
      expect(recent.map((entry) => [entry.transaction.id, entry.transaction.payer])).toEqual([
        [tx.id, null],
      ]);
    });

    it('accepts Others at either end of a transfer, moving no balance', async () => {
      const { ada, grace, group } = await trio();
      const transfer = { kind: 'transfer', title: 'Paid back', amount: 500, occurredOn: '2026-09-11' };

      const toOthers = await createdTx(ada, group.id, {
        ...transfer,
        payerId: ada.userId,
        toUserId: null,
      });
      const fromOthers = await createdTx(ada, group.id, {
        ...transfer,
        payerId: null,
        toUserId: grace.userId,
      });

      expect(toOthers.participants).toEqual([{ user: null, shareCents: 500, weight: null }]);
      expect(fromOthers.payer).toBeNull();
      expect([...(await balancesOf(ada, group.id)).values()]).toEqual([0, 0, 0]);
    });

    it('refuses a transfer from Others to Others', async () => {
      const { ada, group } = await trio();

      const response = await createTx(ada, group.id, {
        kind: 'transfer',
        title: 'Nothing',
        amount: 500,
        occurredOn: '2026-09-11',
        payerId: null,
        toUserId: null,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_split' });
    });

    it('refuses Others twice in one split', async () => {
      const { ada, group } = await trio();

      const response = await createTx(ada, group.id, {
        ...expense(ada.userId, [], 900),
        split: {
          mode: 'shares',
          participants: [
            { userId: null, weight: 1 },
            { userId: null, weight: 2 },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_request' });
    });

    it('is guaranteed at most one row per transaction by the database itself', async () => {
      const { ada, group } = await trio();
      const tx = await createdTx(ada, group.id, {
        ...expense(ada.userId, [], 900),
        split: { mode: 'shares', participants: [{ userId: null, weight: 1 }] },
      });

      await expect(
        app.db
          .insert(transactionParticipants)
          .values({ transactionId: tx.id, userId: null, shareCents: 0, weight: null }),
      ).rejects.toThrow();
    });

    it('is available in the implicit pair group too', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const pair = await pairGroupOf(ada, grace.userId);

      const response = await createTx(ada, pair.id, {
        ...expense(ada.userId, [], 900),
        split: {
          mode: 'shares',
          participants: [
            { userId: grace.userId, weight: 1 },
            { userId: null, weight: 2 },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('stays where it was when the transaction is edited', async () => {
      const { ada, grace, group } = await trio();
      const tx = await createdTx(ada, group.id, expense(null, [grace.userId], 800));

      const edited = await updateTx(ada, group.id, tx.id, {
        ...expense(null, [], 1000),
        split: {
          mode: 'shares',
          participants: [
            { userId: grace.userId, weight: 1 },
            { userId: null, weight: 1 },
          ],
        },
      });
      expect(edited.statusCode).toBe(200);

      const fetched = (await getTx(ada, group.id, tx.id)).json().transaction;
      expect(fetched.payer).toBeNull();
      expect(
        fetched.participants.map((p: { user: { id: string } | null }) => p.user?.id ?? null).sort(),
      ).toEqual([grace.userId, null].sort());
    });

    it('never makes a friend owe for Others, and agrees with the group figure', async () => {
      // A mixed ledger in one group: the friend list's per-friend aggregate,
      // the group list's per-group aggregate and the group's own balances are
      // three separate computations; with Others on every side, they must
      // still tell the same story.
      const { ada, grace, alan, group } = await trio();
      await createdTx(ada, group.id, {
        ...expense(ada.userId, [], 6000),
        split: {
          mode: 'amount',
          participants: [
            { userId: ada.userId, amount: 1000 },
            { userId: grace.userId, amount: 1000 },
            { userId: alan.userId, amount: 1000 },
            { userId: null, amount: 3000 },
          ],
        },
      });
      await createdTx(grace, group.id, {
        ...expense(grace.userId, [], 999),
        split: {
          mode: 'shares',
          participants: [
            { userId: ada.userId, weight: 1 },
            { userId: null, weight: 2 },
          ],
        },
      });
      await createdTx(alan, group.id, expense(null, [ada.userId, alan.userId], 700));
      await createdTx(ada, group.id, {
        kind: 'income',
        title: 'Refund',
        amount: 500,
        occurredOn: '2026-09-12',
        payerId: ada.userId,
        split: {
          mode: 'amount',
          participants: [
            { userId: alan.userId, amount: 200 },
            { userId: null, amount: 300 },
          ],
        },
      });

      const balances = await balancesOf(ada, group.id);
      expect([...balances.values()].reduce((sum, value) => sum + value, 0)).toBe(0);
      for (const user of [ada, grace, alan]) {
        expect((await getGroupOf(user, group.id)).viewerBalanceCents).toBe(balances.get(user.userId));
      }

      // Ada: +2000 (60 € example) − 333 (Grace's 9.99 €, a third hers)
      // − 200 (the refund she holds for Alan) = 1467.
      expect(balances.get(ada.userId)).toBe(1467);
      const friends = (
        await app.inject({ method: 'GET', url: '/friends', headers: ada.headers })
      ).json().friends as { id: string; balanceCents: number }[];
      expect(new Map(friends.map((friend) => [friend.id, friend.balanceCents]))).toEqual(
        new Map([
          [grace.userId, 1000 - 333],
          [alan.userId, 1000 - 200],
        ]),
      );
    });
  });

  describe('GET /me/transactions', () => {
    it('lists what involves the caller across every group they belong to', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      const sub = await createdSubgroup(ada, root.id, 'Beach day', [grace.userId]);
      const pair = await pairGroupOf(ada, grace.userId);

      // One in each kind of space the caller belongs to, oldest first.
      await createdTx(ada, root.id, {
        ...expense(ada.userId, [ada.userId, grace.userId]),
        title: 'Ferry',
        occurredOn: '2026-09-01',
      });
      await createdTx(grace, sub.id, {
        ...expense(grace.userId, [ada.userId, grace.userId]),
        title: 'Parasol',
        occurredOn: '2026-09-05',
      });
      await createdTx(ada, pair.id, {
        ...expense(ada.userId, [ada.userId, grace.userId]),
        title: 'Cinema',
        occurredOn: '2026-09-09',
      });

      const response = await listRecent(ada);

      expect(response.statusCode).toBe(200);
      const listed = response.json().transactions as {
        transaction: { title: string };
        group: { id: string; name: string; ancestors: { id: string; name: string }[] };
      }[];
      // Most recent first, and each one says where it happened — the pair
      // group under the other member's name, the sub-group under its own
      // with its parent above it.
      expect(
        listed.map((entry) => [entry.transaction.title, entry.group.name]),
      ).toEqual([
        ['Cinema', 'Grace Hopper'],
        ['Parasol', 'Beach day'],
        ['Ferry', 'Corsica 2026'],
      ]);
      expect(listed[1]!.group.ancestors).toEqual([{ id: root.id, name: 'Corsica 2026' }]);
      expect(listed[0]!.group.ancestors).toEqual([]);
    });

    it('leaves out a transaction between two other members', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      await befriend(ada, alan);
      const group = await createdGroup(ada, 'Corsica 2026', [grace.userId, alan.userId]);

      await createdTx(grace, group.id, {
        ...expense(grace.userId, [grace.userId, alan.userId]),
        title: 'Not mine',
      });
      const mine = await createdTx(grace, group.id, {
        ...expense(grace.userId, [ada.userId, grace.userId]),
        title: 'Mine',
      });

      const listed = (await listRecent(ada)).json().transactions as {
        transaction: { id: string; title: string };
      }[];

      // Ada's own group, but she is neither payer nor participant of the
      // first one: the section answers "what moved my money".
      expect(listed.map((entry) => entry.transaction.id)).toEqual([mine.id]);
    });

    it('never reaches into a group the caller has left', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      await createdTx(ada, group.id, expense(ada.userId, [ada.userId, grace.userId]));

      expect((await listRecent(grace)).json().transactions).toHaveLength(1);
      await app.inject({
        method: 'DELETE',
        url: `/groups/${group.id}/members/${grace.userId}`,
        headers: grace.headers,
      });

      // Still a participant of that transaction; no longer a member of its
      // group, which is what decides.
      expect((await listRecent(grace)).json().transactions).toEqual([]);
    });

    it('caps the list, newest first, with same-day ties in recording order', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      for (const title of ['first', 'second', 'third']) {
        await createdTx(ada, group.id, {
          ...expense(ada.userId, [ada.userId]),
          title,
          occurredOn: '2026-09-11',
        });
      }

      const capped = (await listRecent(ada, 2)).json().transactions as {
        transaction: { title: string };
      }[];

      expect(capped.map((entry) => entry.transaction.title)).toEqual(['third', 'second']);
      // An unusable limit falls back to the default rather than failing.
      expect((await listRecent(ada, 0)).statusCode).toBe(200);
      expect((await listRecent(ada, 0)).json().transactions).toHaveLength(3);
    });

    it('is empty for an account with nothing, and requires authentication', async () => {
      const ada = await signIn('ada');

      expect((await listRecent(ada)).json()).toEqual({ transactions: [] });
      expect((await app.inject({ method: 'GET', url: '/me/transactions' })).statusCode).toBe(401);
    });
  });

});
