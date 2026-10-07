import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  deletedAccounts,
  groupMembers,
  groups,
  transactionParticipants,
  transactions,
  users,
} from '../../db/schema.js';
import { createTestContext } from '../../test/app.js';
import { signInAs, type TestUser } from '../../test/auth.js';
import { fakeGoogleVerifier } from '../../test/google.js';
import { TransactionError } from '../transactions/errors.js';
import { createTransactionsRepository, type TransactionFields } from '../transactions/repository.js';

const google = fakeGoogleVerifier({
  ada: { sub: 'google-ada', email: 'ada@example.com', name: 'Ada Lovelace' },
  grace: { sub: 'google-grace', email: 'grace@example.com', name: 'Grace Hopper' },
  alan: { sub: 'google-alan', email: 'alan@example.com', name: 'Alan Turing' },
});

const clock = new Date('2026-10-05T12:00:00.000Z');

interface ListedTransaction {
  id: string;
  kind: string;
  title: string;
  amountCents: number;
  occurredOn: string;
  payer: { id: string } | null;
  participants: { user: { id: string } | null; shareCents: number; weight: number | null }[];
  createdBy: string | null;
}

/** `docs/specs/account-deletion.md`, end to end against the real schema. */
describe('account deletion', () => {
  let app: FastifyInstance;
  let reset: () => Promise<void>;

  beforeAll(async () => {
    ({ app, reset } = await createTestContext({
      auth: { googleVerifier: google },
      invites: { now: () => clock, inviteTtlSeconds: 3600, publicBaseUrl: 'https://ardoise.test' },
      groups: { now: () => clock },
      transactions: { now: () => clock },
      account: { contact: 'privacy@example.com' },
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
    await app.inject({ method: 'POST', url: `/invites/${invite.code}/accept`, headers: b.headers });
  }

  async function createdGroup(
    user: TestUser,
    name: string,
    memberIds: string[] = [],
    parentId?: string,
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/groups',
      headers: user.headers,
      payload: { name, memberIds, ...(parentId ? { parentId } : {}) },
    });
    expect(response.statusCode).toBe(201);
    return response.json().group.id as string;
  }

  async function addMembers(user: TestUser, groupId: string, memberIds: string[]) {
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/members`,
      headers: user.headers,
      payload: { memberIds },
    });
    expect(response.statusCode).toBe(200);
  }

  async function pairGroupOf(user: TestUser, friendId: string): Promise<string> {
    const response = await app.inject({ method: 'GET', url: '/friends', headers: user.headers });
    const { friends } = response.json() as { friends: { id: string; groupId: string }[] };
    return friends.find((friend) => friend.id === friendId)!.groupId;
  }

  async function createdTx(user: TestUser, groupId: string, payload: Record<string, unknown>) {
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/transactions`,
      headers: user.headers,
      payload: { title: 'Groceries', occurredOn: '2026-10-01', ...payload },
    });
    expect(response.statusCode).toBe(201);
    return response.json().transaction as ListedTransaction;
  }

  const equalExpense = (payerId: string | null, participantIds: (string | null)[], amount: number) => ({
    kind: 'expense',
    amount,
    payerId,
    split: { mode: 'shares', participants: participantIds.map((userId) => ({ userId, weight: 1 })) },
  });

  const transfer = (payerId: string | null, toUserId: string | null, amount: number) => ({
    kind: 'transfer',
    amount,
    payerId,
    toUserId,
  });

  async function listTx(user: TestUser, groupId: string): Promise<ListedTransaction[]> {
    const response = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}/transactions`,
      headers: user.headers,
    });
    expect(response.statusCode).toBe(200);
    return response.json().transactions;
  }

  async function balancesOf(user: TestUser, groupId: string): Promise<Map<string, number>> {
    const response = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}/transactions/balances`,
      headers: user.headers,
    });
    expect(response.statusCode).toBe(200);
    const { balances } = response.json() as {
      balances: { userId: string; amountCents: number }[];
    };
    return new Map(balances.map((balance) => [balance.userId, balance.amountCents]));
  }

  const deleteAccount = (user: TestUser) =>
    app.inject({ method: 'DELETE', url: '/me', headers: user.headers });

  async function deleted(user: TestUser): Promise<void> {
    const response = await deleteAccount(user);
    expect(response.statusCode).toBe(204);
  }

  const ownerOf = async (groupId: string) => {
    const [owner] = await app.db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.role, 'owner')));
    return owner?.userId;
  };

  const groupExists = async (groupId: string) =>
    (await app.db.select({ id: groups.id }).from(groups).where(eq(groups.id, groupId))).length > 0;

  describe('DELETE /me', () => {
    it('ends every session: the access token and the refresh token are both refused', async () => {
      const signedIn = (
        await app.inject({ method: 'POST', url: '/auth/google', payload: { idToken: 'ada' } })
      ).json();
      const headers = { authorization: `Bearer ${signedIn.accessToken}` };

      expect((await app.inject({ method: 'DELETE', url: '/me', headers })).statusCode).toBe(204);

      // Still within its lifetime: a check of the token alone would let it through.
      expect((await app.inject({ method: 'GET', url: '/auth/me', headers })).statusCode).toBe(401);
      expect((await app.inject({ method: 'GET', url: '/groups', headers })).statusCode).toBe(401);
      const refreshed = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: signedIn.refreshToken },
      });
      expect(refreshed.statusCode).toBe(401);
    });

    it('refuses a second deletion as unauthenticated, the account being gone', async () => {
      const ada = await signIn('ada');
      await deleted(ada);

      expect((await deleteAccount(ada)).statusCode).toBe(401);
    });

    it('requires authentication', async () => {
      expect((await app.inject({ method: 'DELETE', url: '/me' })).statusCode).toBe(401);
    });

    it('ends every friendship, with the group shared with that friend and its sub-groups', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const pairId = await pairGroupOf(grace, ada.userId);
      const subId = await createdGroup(grace, 'Weekend', [], pairId);
      await createdTx(grace, pairId, equalExpense(grace.userId, [ada.userId, grace.userId], 1000));
      await createdTx(ada, subId, equalExpense(ada.userId, [ada.userId, grace.userId], 400));

      await deleted(ada);

      const friends = await app.inject({ method: 'GET', url: '/friends', headers: grace.headers });
      expect(friends.json().friends).toEqual([]);
      expect(await groupExists(pairId)).toBe(false);
      expect(await groupExists(subId)).toBe(false);
      expect(await app.db.select().from(transactions)).toEqual([]);
    });

    it('turns the user into Others in shared groups, leaving everything else as it was', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      await befriend(ada, alan);
      const groupId = await createdGroup(ada, 'Flat', [grace.userId, alan.userId]);

      const paidByAda = await createdTx(
        ada,
        groupId,
        equalExpense(ada.userId, [ada.userId, grace.userId, alan.userId], 900),
      );
      const paidByGrace = await createdTx(
        grace,
        groupId,
        equalExpense(grace.userId, [ada.userId, grace.userId, alan.userId], 300),
      );
      await createdTx(ada, groupId, transfer(ada.userId, grace.userId, 100));
      await createdTx(alan, groupId, transfer(alan.userId, ada.userId, 50));

      await deleted(ada);

      const after = await listTx(grace, groupId);
      expect(after).toHaveLength(4);
      // Ada's name, and her id, appear nowhere in what the others see.
      const seen = JSON.stringify(after);
      expect(seen).not.toContain('Ada');
      expect(seen).not.toContain(ada.userId);

      const byId = new Map(after.map((tx) => [tx.id, tx]));
      const adaPaid = byId.get(paidByAda.id)!;
      expect(adaPaid.payer).toBeNull();
      expect(adaPaid.createdBy).toBeNull();
      expect(adaPaid.amountCents).toBe(900);
      expect(adaPaid.title).toBe('Groceries');
      expect(adaPaid.occurredOn).toBe('2026-10-01');
      expect(adaPaid.participants.map((p) => [p.user?.id ?? null, p.shareCents]).sort()).toEqual(
        [
          [alan.userId, 300],
          [grace.userId, 300],
          [null, 300],
        ].sort(),
      );
      const gracePaid = byId.get(paidByGrace.id)!;
      expect(gracePaid.payer?.id).toBe(grace.userId);
      expect(gracePaid.createdBy).toBe(grace.userId);

      // What concerned Ada is settled outside the group now: Grace paid 300
      // for three, of which Alan's 100 is the only share still owed to her.
      expect(await balancesOf(grace, groupId)).toEqual(
        new Map([
          [grace.userId, 100],
          [alan.userId, -100],
        ]),
      );
    });

    it("adds the user's share to an Others share the transaction already had", async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const groupId = await createdGroup(grace, 'Trip', [ada.userId]);
      const byShares = await createdTx(grace, groupId, {
        kind: 'expense',
        amount: 400,
        payerId: grace.userId,
        split: {
          mode: 'shares',
          participants: [
            { userId: ada.userId, weight: 1 },
            { userId: grace.userId, weight: 1 },
            { userId: null, weight: 2 },
          ],
        },
      });
      const byAmounts = await createdTx(grace, groupId, {
        kind: 'income',
        amount: 500,
        payerId: grace.userId,
        split: {
          mode: 'amount',
          participants: [
            { userId: ada.userId, amount: 150 },
            { userId: grace.userId, amount: 100 },
            { userId: null, amount: 250 },
          ],
        },
      });

      await deleted(ada);

      const byId = new Map((await listTx(grace, groupId)).map((tx) => [tx.id, tx]));
      const others = (id: string) => byId.get(id)!.participants.filter((p) => p.user === null);
      expect(others(byShares.id)).toEqual([{ user: null, shareCents: 300, weight: 3 }]);
      expect(others(byAmounts.id)).toEqual([{ user: null, shareCents: 400, weight: null }]);
      expect(byId.get(byShares.id)!.participants).toHaveLength(2);
      expect(byId.get(byAmounts.id)!.participants).toHaveLength(2);
    });

    it('deletes a transfer that would be Others to Others, and keeps an expense only Others is on', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const groupId = await createdGroup(grace, 'Trip', [ada.userId]);
      await createdTx(grace, groupId, transfer(ada.userId, null, 100));
      await createdTx(grace, groupId, transfer(null, ada.userId, 200));
      const allOthers = await createdTx(grace, groupId, equalExpense(null, [ada.userId], 300));

      await deleted(ada);

      const after = await listTx(grace, groupId);
      expect(after.map((tx) => tx.id)).toEqual([allOthers.id]);
      expect(after[0]!.payer).toBeNull();
      expect(after[0]!.participants).toEqual([{ user: null, shareCents: 300, weight: 1 }]);
    });

    it('passes each group the user owned to the member who joined it earliest', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      await befriend(ada, alan);
      await befriend(grace, alan);
      const flat = await createdGroup(ada, 'Flat');
      await addMembers(ada, flat, [alan.userId]);
      await addMembers(ada, flat, [grace.userId]);
      // A sub-group Ada owns under a group Grace owns: each is handled alone.
      const trip = await createdGroup(grace, 'Trip', [ada.userId, alan.userId]);
      const corsica = await createdGroup(ada, 'Corsica', [alan.userId], trip);

      await deleted(ada);

      expect(await ownerOf(flat)).toBe(alan.userId);
      expect(await ownerOf(trip)).toBe(grace.userId);
      expect(await ownerOf(corsica)).toBe(alan.userId);
      const removed = await app.inject({
        method: 'DELETE',
        url: `/groups/${flat}`,
        headers: alan.headers,
      });
      expect(removed.statusCode).toBe(204);
    });

    it('deletes a group, and its sub-groups, where the user was alone', async () => {
      const ada = await signIn('ada');
      const solo = await createdGroup(ada, 'Savings');
      const nested = await createdGroup(ada, 'Holidays', [], solo);
      await createdTx(ada, solo, equalExpense(ada.userId, [ada.userId], 500));

      await deleted(ada);

      expect(await groupExists(solo)).toBe(false);
      expect(await groupExists(nested)).toBe(false);
    });

    it("stops the user's invitation links working", async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const groupId = await createdGroup(ada, 'Flat', [grace.userId]);
      const { invite: friendInvite } = (
        await app.inject({ method: 'POST', url: '/friends/invite', headers: ada.headers })
      ).json();
      const { invite: groupInvite } = (
        await app.inject({ method: 'POST', url: `/groups/${groupId}/invite`, headers: ada.headers })
      ).json();

      await deleted(ada);

      for (const code of [friendInvite.code, groupInvite.code]) {
        expect((await app.inject({ method: 'GET', url: `/invites/${code}` })).statusCode).toBe(404);
      }
    });

    it('keeps only the account id, and a new sign-in starts a new, empty account', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      await createdGroup(ada, 'Flat', [grace.userId]);

      await deleted(ada);

      expect(await app.db.select().from(users).where(eq(users.id, ada.userId))).toEqual([]);
      const listed = await app.db.select().from(deletedAccounts);
      expect(listed.map((row) => row.userId)).toEqual([ada.userId]);

      const again = await signIn('ada');
      expect(again.userId).not.toBe(ada.userId);
      const friends = await app.inject({ method: 'GET', url: '/friends', headers: again.headers });
      expect(friends.json().friends).toEqual([]);
      const list = await app.inject({ method: 'GET', url: '/groups', headers: again.headers });
      expect(list.json().groups).toEqual([]);
    });

    it('is all-or-nothing: a failure at the last step leaves everything as it was', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const groupId = await createdGroup(ada, 'Flat', [grace.userId]);
      await createdTx(ada, groupId, equalExpense(ada.userId, [ada.userId, grace.userId], 800));
      const before = await listTx(grace, groupId);

      // Deleting the user row is the very last write: fail it, after every
      // anonymisation step has already run inside the same transaction.
      await app.db.execute(sql`create function refuse_user_delete() returns trigger
        language plpgsql as $$ begin raise exception 'refused for the test'; end $$`);
      await app.db.execute(sql`create trigger refuse_user_delete before delete on users
        for each row execute function refuse_user_delete()`);
      try {
        const response = await deleteAccount(ada);
        expect(response.statusCode).toBe(500);
      } finally {
        await app.db.execute(sql`drop trigger refuse_user_delete on users`);
        await app.db.execute(sql`drop function refuse_user_delete()`);
      }

      expect(await listTx(grace, groupId)).toEqual(before);
      expect(await ownerOf(groupId)).toBe(ada.userId);
      expect(await app.db.select().from(deletedAccounts)).toEqual([]);
      const friends = await app.inject({ method: 'GET', url: '/friends', headers: grace.headers });
      expect(friends.json().friends.map((f: { id: string }) => f.id)).toEqual([ada.userId]);
      expect((await app.inject({ method: 'GET', url: '/auth/me', headers: ada.headers })).statusCode).toBe(200);
    });
  });

  describe('the database', () => {
    it('refuses to delete a user still named as a payer or a share', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const groupId = await createdGroup(grace, 'Flat', [ada.userId]);
      await createdTx(grace, groupId, equalExpense(ada.userId, [grace.userId], 100));
      await createdTx(grace, groupId, equalExpense(grace.userId, [ada.userId], 100));

      await expect(app.db.delete(users).where(eq(users.id, ada.userId))).rejects.toThrow();
      expect(await app.db.select().from(transactions)).toHaveLength(2);
    });

    it('refuses a transaction naming an account deleted meanwhile as "not a member"', async () => {
      const grace = await signIn('grace');
      const groupId = await createdGroup(grace, 'Flat');
      const gone = '00000000-0000-4000-8000-000000000000';
      const repository = createTransactionsRepository(app.db);
      const fields: Omit<TransactionFields, 'payerId'> = {
        groupId,
        kind: 'expense',
        title: 'Groceries',
        amountCents: 100,
        occurredOn: '2026-10-01',
        comment: null,
        category: 'other',
        splitMode: 'amount',
      };

      await expect(
        repository.create({ ...fields, payerId: gone }, grace.userId, [
          { userId: grace.userId, shareCents: 100, weight: null },
        ]),
      ).rejects.toEqual(new TransactionError('not_group_member'));
      await expect(
        repository.create({ ...fields, payerId: grace.userId }, grace.userId, [
          { userId: gone, shareCents: 100, weight: null },
        ]),
      ).rejects.toEqual(new TransactionError('not_group_member'));
      expect(
        await app.db.select().from(transactionParticipants).where(isNull(transactionParticipants.userId)),
      ).toEqual([]);
    });
  });

  describe('GET /me/deletion-preview', () => {
    it('lists every group where the balance is not zero, what the user is owed first', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      await befriend(ada, alan);
      const flat = await createdGroup(ada, 'Flat', [grace.userId, alan.userId]);
      const trip = await createdGroup(ada, 'Trip', [grace.userId]);
      await createdGroup(ada, 'Settled', [grace.userId]);
      const pairWithGrace = await pairGroupOf(ada, grace.userId);
      await createdTx(ada, flat, equalExpense(ada.userId, [ada.userId, grace.userId, alan.userId], 900));
      await createdTx(grace, trip, equalExpense(grace.userId, [ada.userId, grace.userId], 200));
      await createdTx(grace, pairWithGrace, equalExpense(grace.userId, [ada.userId], 50));

      const response = await app.inject({
        method: 'GET',
        url: '/me/deletion-preview',
        headers: ada.headers,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        friendCount: 2,
        balances: [
          { groupId: flat, kind: 'standard', name: 'Flat', balanceCents: 600 },
          { groupId: pairWithGrace, kind: 'pair', name: 'Grace Hopper', balanceCents: -50 },
          { groupId: trip, kind: 'standard', name: 'Trip', balanceCents: -100 },
        ],
      });
    });

    it('lists nothing when every balance is zero', async () => {
      const ada = await signIn('ada');
      await createdGroup(ada, 'Flat');

      const response = await app.inject({
        method: 'GET',
        url: '/me/deletion-preview',
        headers: ada.headers,
      });

      expect(response.json()).toEqual({ friendCount: 0, balances: [] });
    });

    it('requires authentication', async () => {
      const response = await app.inject({ method: 'GET', url: '/me/deletion-preview' });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /delete-account', () => {
    it('describes deletion publicly: the in-app path, what goes, what stays, how long backups keep it', async () => {
      const response = await app.inject({ method: 'GET', url: '/delete-account' });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.headers['content-security-policy']).toContain("default-src 'none'");
      expect(response.body).toContain('<strong>Account</strong>, then <strong>Delete account</strong>');
      expect(response.body).toContain('What is deleted');
      expect(response.body).toContain('What stays');
      expect(response.body).toContain('12 months');
      expect(response.body).toContain('mailto:privacy@example.com');
    });

    it('is in French for a browser that prefers French, with the legal footer', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/delete-account',
        headers: { 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' },
      });

      expect(response.headers.vary).toContain('Accept-Language');
      expect(response.body).toContain('<html lang="fr">');
      expect(response.body).toContain('Ce qui est supprimé');
      expect(response.body).toContain('jusqu’à 12 mois');
      expect(response.body).toContain('mailto:privacy@example.com');
      expect(response.body).toContain('href="/privacy?lang=fr"');
      expect(response.body).toContain('href="/delete-account?lang=en"');
    });
  });
});
