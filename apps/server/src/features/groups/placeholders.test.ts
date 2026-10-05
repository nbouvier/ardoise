import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { groupMembers, groups, users } from '../../db/schema.js';
import { createTestContext } from '../../test/app.js';
import { signInAs, type TestUser } from '../../test/auth.js';
import { fakeGoogleVerifier } from '../../test/google.js';

const google = fakeGoogleVerifier({
  ada: { sub: 'google-ada', email: 'ada@example.com', name: 'Ada Lovelace' },
  grace: { sub: 'google-grace', email: 'grace@example.com', name: 'Grace Hopper' },
  alan: { sub: 'google-alan', email: 'alan@example.com', name: 'Alan Turing' },
});

const clock = new Date('2026-10-05T12:00:00.000Z');

interface Member {
  id: string;
  name: string;
  role: string;
  placeholder?: true;
}

interface ListedTransaction {
  id: string;
  payer: { id: string; placeholder?: true } | null;
  participants: { user: { id: string } | null; shareCents: number }[];
}

/** `docs/specs/placeholder-members.md`, end to end. */
describe('placeholder members', () => {
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
    await reset();
  });

  const signIn = (idToken: string) => signInAs(app, idToken);

  async function befriend(a: TestUser, b: TestUser): Promise<void> {
    const { invite } = (
      await app.inject({ method: 'POST', url: '/friends/invite', headers: a.headers })
    ).json();
    await app.inject({ method: 'POST', url: `/invites/${invite.code}/accept`, headers: b.headers });
  }

  const create = (user: TestUser, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/groups', headers: user.headers, payload });

  async function created(user: TestUser, payload: Record<string, unknown>) {
    const response = await create(user, payload);
    expect(response.statusCode).toBe(201);
    return response.json().group as { id: string; memberCount: number; members: Member[] };
  }

  const getGroup = async (user: TestUser, groupId: string) => {
    const response = await app.inject({
      method: 'GET',
      url: `/groups/${groupId}`,
      headers: user.headers,
    });
    expect(response.statusCode).toBe(200);
    return response.json().group as {
      memberCount: number;
      members: Member[];
      viewerCanClaim: boolean;
    };
  };

  const placeholderId = (group: { members: Member[] }, name: string) =>
    group.members.find((member) => member.placeholder && member.name === name)!.id;

  const addMembers = (user: TestUser, groupId: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: `/groups/${groupId}/members`,
      headers: user.headers,
      payload,
    });

  const listPlaceholders = (user: TestUser, groupId: string) =>
    app.inject({ method: 'GET', url: `/groups/${groupId}/placeholders`, headers: user.headers });

  const claim = (user: TestUser, groupId: string, id: string) =>
    app.inject({
      method: 'POST',
      url: `/groups/${groupId}/placeholders/${id}/claim`,
      headers: user.headers,
    });

  const rename = (user: TestUser, groupId: string, id: string, name: string) =>
    app.inject({
      method: 'PATCH',
      url: `/groups/${groupId}/placeholders/${id}`,
      headers: user.headers,
      payload: { name },
    });

  const removeMember = (user: TestUser, groupId: string, id: string) =>
    app.inject({
      method: 'DELETE',
      url: `/groups/${groupId}/members/${id}`,
      headers: user.headers,
    });

  async function joinThroughLink(owner: TestUser, joiner: TestUser, groupId: string) {
    const { invite } = (
      await app.inject({
        method: 'POST',
        url: `/groups/${groupId}/invite`,
        headers: owner.headers,
      })
    ).json();
    const response = await app.inject({
      method: 'POST',
      url: `/invites/${invite.code}/accept`,
      headers: joiner.headers,
    });
    expect(response.statusCode).toBe(200);
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

  const userExists = async (id: string) =>
    (await app.db.select({ id: users.id }).from(users).where(eq(users.id, id))).length > 0;

  const groupExists = async (groupId: string) =>
    (await app.db.select({ id: groups.id }).from(groups).where(eq(groups.id, groupId))).length > 0;

  const isMember = async (groupId: string, userId: string) =>
    (
      await app.db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    ).length > 0;

  describe('adding them', () => {
    it('creates a group with friends and placeholders, all counted as members', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);

      const group = await created(ada, {
        name: 'Trip',
        memberIds: [grace.userId],
        placeholderNames: ['Alex', ' Sam '],
      });

      expect(group.memberCount).toBe(4);
      const placeholders = group.members.filter((member) => member.placeholder);
      expect(placeholders.map((member) => member.name).sort()).toEqual(['Alex', 'Sam']);
      expect(placeholders.every((member) => member.role === 'member')).toBe(true);
      // Accounts carry no flag at all.
      expect(group.members.find((member) => member.id === ada.userId)).not.toHaveProperty(
        'placeholder',
      );
      // Grace sees them too.
      expect((await getGroup(grace, group.id)).memberCount).toBe(4);
    });

    it('adds more later, and refuses a name the tree already has, whatever the case', async () => {
      const ada = await signIn('ada');
      const group = await created(ada, { name: 'Trip', placeholderNames: ['Alex'] });

      const added = await addMembers(ada, group.id, { placeholderNames: ['Sam'] });
      expect(added.statusCode).toBe(200);
      expect(added.json().group.memberCount).toBe(3);

      const taken = await addMembers(ada, group.id, { placeholderNames: ['alex'] });
      expect(taken.statusCode).toBe(409);
      expect(taken.json()).toEqual({ error: 'placeholder_name_taken' });

      const twice = await addMembers(ada, group.id, { placeholderNames: ['Kim', 'KIM'] });
      expect(twice.statusCode).toBe(400);
    });

    it('lets a sub-group take its parent’s placeholders and new ones, which join the parent too', async () => {
      const ada = await signIn('ada');
      const trip = await created(ada, { name: 'Trip', placeholderNames: ['Alex', 'Sam'] });
      const alex = placeholderId(trip, 'Alex');

      const corsica = await created(ada, {
        name: 'Corsica',
        parentId: trip.id,
        memberIds: [alex],
        placeholderNames: ['Kim'],
      });

      expect(corsica.members.filter((m) => m.placeholder).map((m) => m.name).sort()).toEqual([
        'Alex',
        'Kim',
      ]);
      const tripAfter = await getGroup(ada, trip.id);
      expect(tripAfter.members.filter((m) => m.placeholder).map((m) => m.name).sort()).toEqual([
        'Alex',
        'Kim',
        'Sam',
      ]);
      // A name is unique across the whole tree.
      const taken = await addMembers(ada, corsica.id, { placeholderNames: ['Sam'] });
      expect(taken.json()).toEqual({ error: 'placeholder_name_taken' });
    });

    it('refuses another tree’s placeholder as if it were a stranger', async () => {
      const ada = await signIn('ada');
      const trip = await created(ada, { name: 'Trip', placeholderNames: ['Alex'] });
      const flat = await created(ada, { name: 'Flat' });

      const response = await addMembers(ada, flat.id, { memberIds: [placeholderId(trip, 'Alex')] });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'not_friends' });
    });

    it('refuses placeholders anywhere in a friendship’s tree', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const { friends } = (
        await app.inject({ method: 'GET', url: '/friends', headers: ada.headers })
      ).json() as { friends: { groupId: string }[] };
      const pairId = friends[0]!.groupId;

      expect((await addMembers(ada, pairId, { placeholderNames: ['Alex'] })).statusCode).toBe(409);
      const sub = await create(ada, { name: 'Weekend', parentId: pairId, placeholderNames: ['Alex'] });
      expect(sub.statusCode).toBe(409);
      expect(sub.json()).toEqual({ error: 'pair_group_immutable' });
    });
  });

  describe('taking part', () => {
    it('pays, shares and counts in balances like any member', async () => {
      const ada = await signIn('ada');
      const group = await created(ada, { name: 'Trip', placeholderNames: ['Alex'] });
      const alex = placeholderId(group, 'Alex');

      const paid = await createdTx(ada, group.id, equalExpense(alex, [ada.userId, alex], 1000));
      await createdTx(ada, group.id, transfer(ada.userId, alex, 200));

      expect(paid.payer).toEqual(expect.objectContaining({ id: alex, placeholder: true }));
      const balances = await balancesOf(ada, group.id);
      expect(balances.get(alex)).toBe(300);
      expect(balances.get(ada.userId)).toBe(-300);
    });
  });

  describe('never counting as someone left', () => {
    it('lets the owner leave when only placeholders remain, deleting the group with them', async () => {
      const ada = await signIn('ada');
      const group = await created(ada, { name: 'Trip', placeholderNames: ['Alex'] });
      const alex = placeholderId(group, 'Alex');
      await createdTx(ada, group.id, equalExpense(alex, [ada.userId, alex], 1000));

      expect((await removeMember(ada, group.id, ada.userId)).statusCode).toBe(204);

      expect(await groupExists(group.id)).toBe(false);
      expect(await userExists(alex)).toBe(false);
    });

    it('still keeps the owner from leaving other accounts behind', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await created(ada, {
        name: 'Trip',
        memberIds: [grace.userId],
        placeholderNames: ['Alex'],
      });

      const response = await removeMember(ada, group.id, ada.userId);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'owner_cannot_leave' });
    });

    it('deletes a group, placeholders on transactions and all', async () => {
      const ada = await signIn('ada');
      const group = await created(ada, { name: 'Trip', placeholderNames: ['Alex'] });
      const alex = placeholderId(group, 'Alex');
      await createdTx(ada, group.id, equalExpense(alex, [ada.userId, alex], 1000));

      const response = await app.inject({
        method: 'DELETE',
        url: `/groups/${group.id}`,
        headers: ada.headers,
      });

      expect(response.statusCode).toBe(204);
      expect(await userExists(alex)).toBe(false);
    });

    it('is never handed ownership when the owner’s account is deleted', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      // Alex joins first; Grace, the only other account, joins later.
      const group = await created(ada, { name: 'Trip', placeholderNames: ['Alex'] });
      await addMembers(ada, group.id, { memberIds: [grace.userId] });
      const solo = await created(ada, { name: 'Solo', placeholderNames: ['Kim'] });

      expect((await app.inject({ method: 'DELETE', url: '/me', headers: ada.headers })).statusCode).toBe(
        204,
      );

      const after = await getGroup(grace, group.id);
      expect(after.members.find((member) => member.role === 'owner')?.id).toBe(grace.userId);
      expect(await groupExists(solo.id)).toBe(false);
    });

    it('has no Google identity nor e-mail to sign in with', async () => {
      const ada = await signIn('ada');
      const group = await created(ada, { name: 'Trip', placeholderNames: ['Alex'] });
      const [row] = await app.db
        .select()
        .from(users)
        .where(eq(users.id, placeholderId(group, 'Alex')));

      expect(row).toEqual(
        expect.objectContaining({ kind: 'placeholder', googleSub: null, email: null }),
      );
    });
  });

  describe('claiming', () => {
    it('offers the tree’s placeholders, with what each would bring, to whoever joins', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const trip = await created(ada, { name: 'Trip', placeholderNames: ['Alex', 'Sam'] });
      const alex = placeholderId(trip, 'Alex');
      await createdTx(ada, trip.id, equalExpense(ada.userId, [ada.userId, alex], 1000));
      await createdTx(ada, trip.id, transfer(alex, ada.userId, 100));
      const corsica = await created(ada, { name: 'Corsica', parentId: trip.id });

      // Joining the sub-group: the whole tree's placeholders are offered.
      await joinThroughLink(ada, grace, corsica.id);
      const response = await listPlaceholders(grace, corsica.id);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        viewerCanClaim: true,
        placeholders: [
          { id: alex, name: 'Alex', transactionCount: 2, balanceCents: 0 },
          { id: placeholderId(trip, 'Sam'), name: 'Sam', transactionCount: 0, balanceCents: 0 },
        ],
      });
      const inTrip = (await listPlaceholders(grace, trip.id)).json();
      expect(inTrip.placeholders[0].balanceCents).toBe(-400);
    });

    it('makes the placeholder’s transactions and memberships the account’s', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const trip = await created(ada, { name: 'Trip', placeholderNames: ['Alex'] });
      const alex = placeholderId(trip, 'Alex');
      const corsica = await created(ada, { name: 'Corsica', parentId: trip.id, memberIds: [alex] });
      await createdTx(ada, trip.id, equalExpense(alex, [ada.userId, alex], 1000));
      await createdTx(ada, corsica.id, equalExpense(ada.userId, [ada.userId, alex], 600));
      const before = await balancesOf(ada, trip.id);

      await joinThroughLink(ada, grace, trip.id);
      const response = await claim(grace, trip.id, alex);

      expect(response.statusCode).toBe(200);
      expect(response.json().group.viewerCanClaim).toBe(false);
      expect(await userExists(alex)).toBe(false);
      // A member of the sub-group the placeholder was in, without joining it.
      expect(await isMember(corsica.id, grace.userId)).toBe(true);
      const [paid] = await listTx(grace, trip.id);
      expect(paid!.payer?.id).toBe(grace.userId);
      expect(paid!.participants.map((share) => share.user?.id).sort()).toEqual(
        [ada.userId, grace.userId].sort(),
      );
      const after = await balancesOf(ada, trip.id);
      expect(after.get(grace.userId)).toBe(before.get(alex));
      expect(after.get(ada.userId)).toBe(before.get(ada.userId));
      expect((await balancesOf(grace, corsica.id)).get(grace.userId)).toBe(-300);
    });

    it('merges shares with a former member and drops transfers to oneself', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await created(ada, {
        name: 'Trip',
        memberIds: [grace.userId],
        placeholderNames: ['Alex'],
      });
      const alex = placeholderId(group, 'Alex');
      await createdTx(ada, group.id, equalExpense(ada.userId, [grace.userId, alex], 1000));
      await createdTx(ada, group.id, transfer(grace.userId, alex, 300));

      const response = await claim(grace, group.id, alex);

      expect(response.statusCode).toBe(200);
      const transactions = await listTx(ada, group.id);
      expect(transactions).toHaveLength(1);
      expect(transactions[0]!.participants).toEqual([
        expect.objectContaining({ user: expect.objectContaining({ id: grace.userId }), shareCents: 1000 }),
      ]);
      expect((await balancesOf(ada, group.id)).get(grace.userId)).toBe(-1000);
    });

    it('allows one claim per member per tree, and one claim per placeholder', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      const group = await created(ada, { name: 'Trip', placeholderNames: ['Alex', 'Sam'] });
      await joinThroughLink(ada, grace, group.id);
      await joinThroughLink(ada, alan, group.id);

      expect((await claim(grace, group.id, placeholderId(group, 'Alex'))).statusCode).toBe(200);
      const second = await claim(grace, group.id, placeholderId(group, 'Sam'));
      expect(second.statusCode).toBe(409);
      expect(second.json()).toEqual({ error: 'already_claimed' });
      expect((await listPlaceholders(grace, group.id)).json().viewerCanClaim).toBe(false);

      const taken = await claim(alan, group.id, placeholderId(group, 'Alex'));
      expect(taken.statusCode).toBe(404);
      expect(taken.json()).toEqual({ error: 'placeholder_not_found' });
    });

    it('lets only one of two racing claims win', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      const group = await created(ada, { name: 'Trip', placeholderNames: ['Alex'] });
      const alex = placeholderId(group, 'Alex');
      await createdTx(ada, group.id, equalExpense(alex, [ada.userId, alex], 1000));
      await joinThroughLink(ada, grace, group.id);
      await joinThroughLink(ada, alan, group.id);

      const results = await Promise.all([claim(grace, group.id, alex), claim(alan, group.id, alex)]);

      expect(results.map((result) => result.statusCode).sort()).toEqual([200, 404]);
      const [paid] = await listTx(ada, group.id);
      const winner = results[0]!.statusCode === 200 ? grace : alan;
      expect(paid!.payer?.id).toBe(winner.userId);
    });

    it('is refused in an archived group and to a non-member', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const group = await created(ada, { name: 'Trip', placeholderNames: ['Alex'] });
      const alex = placeholderId(group, 'Alex');

      expect((await claim(grace, group.id, alex)).statusCode).toBe(404);
      expect((await listPlaceholders(grace, group.id)).statusCode).toBe(404);

      await joinThroughLink(ada, grace, group.id);
      await app.inject({
        method: 'PATCH',
        url: `/groups/${group.id}`,
        headers: ada.headers,
        payload: { archived: true },
      });
      const archived = await claim(grace, group.id, alex);
      expect(archived.statusCode).toBe(409);
      expect(archived.json()).toEqual({ error: 'group_archived' });
    });
  });

  describe('renaming and removing', () => {
    it('renames, within the uniqueness rule', async () => {
      const ada = await signIn('ada');
      const group = await created(ada, { name: 'Trip', placeholderNames: ['Alex', 'Sam'] });
      const alex = placeholderId(group, 'Alex');

      const renamed = await rename(ada, group.id, alex, 'Alexandra');
      expect(renamed.statusCode).toBe(200);
      expect(placeholderId(renamed.json().group, 'Alexandra')).toBe(alex);

      const taken = await rename(ada, group.id, alex, 'sam');
      expect(taken.statusCode).toBe(409);
      expect(taken.json()).toEqual({ error: 'placeholder_name_taken' });
      // An account's id is no placeholder to rename.
      expect((await rename(ada, group.id, ada.userId, 'Ada')).statusCode).toBe(404);
    });

    it('turns its part into Others when removed from the root', async () => {
      const ada = await signIn('ada');
      const group = await created(ada, { name: 'Trip', placeholderNames: ['Alex'] });
      const alex = placeholderId(group, 'Alex');
      await createdTx(ada, group.id, equalExpense(ada.userId, [ada.userId, alex], 1000));
      await createdTx(ada, group.id, transfer(alex, null, 50));

      expect((await removeMember(ada, group.id, alex)).statusCode).toBe(204);

      expect(await userExists(alex)).toBe(false);
      const transactions = await listTx(ada, group.id);
      // The transfer to Others would now run from Others to Others: gone.
      expect(transactions).toHaveLength(1);
      expect(transactions[0]!.participants.map((share) => share.user?.id ?? null).sort()).toEqual(
        [ada.userId, null].sort(),
      );
      expect((await balancesOf(ada, group.id)).get(ada.userId)).toBe(0);
    });

    it('only takes it out of the branch when removed from a sub-group', async () => {
      const ada = await signIn('ada');
      const trip = await created(ada, { name: 'Trip', placeholderNames: ['Alex'] });
      const alex = placeholderId(trip, 'Alex');
      const corsica = await created(ada, { name: 'Corsica', parentId: trip.id, memberIds: [alex] });
      await createdTx(ada, corsica.id, equalExpense(ada.userId, [ada.userId, alex], 1000));

      expect((await removeMember(ada, corsica.id, alex)).statusCode).toBe(204);

      expect(await isMember(corsica.id, alex)).toBe(false);
      expect(await isMember(trip.id, alex)).toBe(true);
      const [kept] = await listTx(ada, corsica.id);
      expect(kept!.participants.some((share) => share.user?.id === alex)).toBe(true);
    });
  });
});
