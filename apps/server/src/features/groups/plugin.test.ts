import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { groupMembers, groups, invites } from '../../db/schema.js';
import { createTestContext } from '../../test/app.js';
import { signInAs, type TestUser } from '../../test/auth.js';
import { fakeGoogleVerifier } from '../../test/google.js';

const google = fakeGoogleVerifier({
  ada: { sub: 'google-ada', email: 'ada@example.com', name: 'Ada Lovelace' },
  grace: { sub: 'google-grace', email: 'grace@example.com', name: 'Grace Hopper' },
  alan: { sub: 'google-alan', email: 'alan@example.com', name: 'Alan Turing' },
  edsger: { sub: 'google-edsger', email: 'e@example.com', name: 'Edsger Dijkstra' },
});

let clock = new Date('2026-09-11T12:00:00.000Z');

describe('groups routes', () => {
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

  /** Connect two users through the real invitation flow. */
  async function befriend(inviter: TestUser, recipient: TestUser): Promise<void> {
    const { invite } = (
      await app.inject({ method: 'POST', url: '/friends/invite', headers: inviter.headers })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/invites/${invite.code}/accept`,
      headers: recipient.headers,
    });
  }

  const createGroup = (user: TestUser, name: string, memberIds: string[] = []) =>
    app.inject({
      method: 'POST',
      url: '/groups',
      headers: user.headers,
      payload: { name, memberIds },
    });

  async function createdGroup(user: TestUser, name: string, memberIds: string[] = []) {
    const response = await createGroup(user, name, memberIds);
    expect(response.statusCode).toBe(201);
    return response.json().group;
  }

  const createSubgroup = (
    user: TestUser,
    parentId: string,
    name: string,
    memberIds: string[] = [],
  ) =>
    app.inject({
      method: 'POST',
      url: '/groups',
      headers: user.headers,
      payload: { name, memberIds, parentId },
    });

  async function createdSubgroup(
    user: TestUser,
    parentId: string,
    name: string,
    memberIds: string[] = [],
  ) {
    const response = await createSubgroup(user, parentId, name, memberIds);
    expect(response.statusCode).toBe(201);
    return response.json().group;
  }

  const listGroups = (user: TestUser) =>
    app.inject({ method: 'GET', url: '/groups', headers: user.headers });

  const listFavorites = (user: TestUser) =>
    app.inject({ method: 'GET', url: '/groups/favorites', headers: user.headers });

  const getGroup = (user: TestUser, groupId: string) =>
    app.inject({ method: 'GET', url: `/groups/${groupId}`, headers: user.headers });

  const patchGroup = (user: TestUser, groupId: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH',
      url: `/groups/${groupId}`,
      headers: user.headers,
      payload,
    });

  const removeMember = (user: TestUser, groupId: string, targetId: string) =>
    app.inject({
      method: 'DELETE',
      url: `/groups/${groupId}/members/${targetId}`,
      headers: user.headers,
    });

  const joinGroup = (user: TestUser, groupId: string) =>
    app.inject({ method: 'POST', url: `/groups/${groupId}/join`, headers: user.headers });

  const addMembers = (user: TestUser, groupId: string, memberIds: string[]) =>
    app.inject({
      method: 'POST',
      url: `/groups/${groupId}/members`,
      headers: user.headers,
      payload: { memberIds },
    });

  const groupInvite = (user: TestUser, groupId: string) =>
    app.inject({
      method: 'POST',
      url: `/groups/${groupId}/invite`,
      headers: user.headers,
    });

  const acceptInvite = (user: TestUser, code: string) =>
    app.inject({ method: 'POST', url: `/invites/${code}/accept`, headers: user.headers });

  const listFriends = (user: TestUser) =>
    app.inject({ method: 'GET', url: '/friends', headers: user.headers });

  /**
   * The group `user` shares with `friendId` — created the moment the two
   * became friends (`docs/specs/friends-and-invitations.md`), so this is
   * just a lookup through the friend list, not a get-or-create call.
   */
  async function pairGroup(user: TestUser, friendId: string) {
    const { friends } = (await listFriends(user)).json();
    const friend = friends.find((f: { id: string }) => f.id === friendId);
    return getGroup(user, friend.groupId);
  }

  /** A minimal equal-shares expense, for the balance tests below. */
  function expense(payerId: string, participantIds: string[], amount = 1000) {
    return {
      kind: 'expense',
      title: 'Something',
      amount,
      occurredOn: '2026-09-11',
      payerId,
      split: {
        mode: 'shares',
        participants: participantIds.map((userId) => ({ userId, weight: 1 })),
      },
    };
  }

  async function recordExpense(
    user: TestUser,
    groupId: string,
    payerId: string,
    participantIds: string[],
    amount = 1000,
  ) {
    const response = await app.inject({
      method: 'POST',
      url: `/groups/${groupId}/transactions`,
      headers: user.headers,
      payload: expense(payerId, participantIds, amount),
    });
    expect(response.statusCode).toBe(201);
    return response.json().transaction;
  }

  describe('POST /groups', () => {
    it('creates a named group owned by its creator', async () => {
      const ada = await signIn('ada');

      const group = await createdGroup(ada, 'Corsica 2026');

      expect(group).toMatchObject({
        kind: 'standard',
        name: 'Corsica 2026',
        memberCount: 1,
        archivedAt: null,
        viewerRole: 'owner',
      });
      expect(group.members).toEqual([
        { id: ada.userId, name: 'Ada Lovelace', picture: null, role: 'owner' },
      ]);
    });

    it('adds the selected friends, who see the group straight away', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);

      const group = await createdGroup(ada, 'Flatshare', [grace.userId]);

      expect(group.memberCount).toBe(2);
      const { groups: graceGroups } = (await listGroups(grace)).json();
      expect(graceGroups).toHaveLength(1);
      expect(graceGroups[0]).toMatchObject({ id: group.id, name: 'Flatshare' });
    });

    it('refuses to pull in someone who is not a friend of the caller', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');

      const response = await createGroup(ada, 'Strangers', [alan.userId]);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'not_friends' });
      expect(await app.db.select().from(groups)).toHaveLength(0);
    });

    it('rejects an empty name', async () => {
      const ada = await signIn('ada');
      const response = await createGroup(ada, '   ');
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_request' });
    });

    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/groups',
        payload: { name: 'Nope' },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /groups', () => {
    it('starts empty', async () => {
      const ada = await signIn('ada');
      const response = await listGroups(ada);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ groups: [] });
    });

    it('lists active groups first, then archived ones', async () => {
      const ada = await signIn('ada');
      const zulu = await createdGroup(ada, 'Zulu');
      await createdGroup(ada, 'Alpha');
      const old = await createdGroup(ada, 'Bravo');
      await patchGroup(ada, old.id, { archived: true });

      const { groups: listed } = (await listGroups(ada)).json();

      expect(listed.map((group: { name: string }) => group.name)).toEqual([
        'Alpha',
        'Zulu',
        'Bravo',
      ]);
      expect(listed[2].archivedAt).not.toBeNull();
      expect(listed.find((g: { id: string }) => g.id === zulu.id).memberCount).toBe(1);
    });

    it('shows nothing of a group the caller does not belong to', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      await createdGroup(ada, 'Private');

      expect((await listGroups(alan)).json()).toEqual({ groups: [] });
    });
  });

  describe('access control', () => {
    it('answers "not found" on every route of a group the caller is not in', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const group = await createdGroup(ada, 'Private');

      const attempts = [
        app.inject({ method: 'GET', url: `/groups/${group.id}`, headers: alan.headers }),
        app.inject({
          method: 'PATCH',
          url: `/groups/${group.id}`,
          headers: alan.headers,
          payload: { name: 'Hijacked' },
        }),
        app.inject({ method: 'DELETE', url: `/groups/${group.id}`, headers: alan.headers }),
        app.inject({
          method: 'POST',
          url: `/groups/${group.id}/members`,
          headers: alan.headers,
          payload: { memberIds: [alan.userId] },
        }),
        app.inject({
          method: 'DELETE',
          url: `/groups/${group.id}/members/${ada.userId}`,
          headers: alan.headers,
        }),
        app.inject({
          method: 'POST',
          url: `/groups/${group.id}/invite`,
          headers: alan.headers,
        }),
        app.inject({
          method: 'POST',
          url: `/groups/${group.id}/invite/rotate`,
          headers: alan.headers,
        }),
        app.inject({
          method: 'DELETE',
          url: `/groups/${group.id}/invite`,
          headers: alan.headers,
        }),
      ];

      for (const response of await Promise.all(attempts)) {
        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ error: 'group_not_found' });
      }

      // Nothing was changed by any of the attempts.
      expect((await getGroup(ada, group.id)).json().group.name).toBe('Private');
    });

    it('requires authentication', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Private');
      const response = await app.inject({ method: 'GET', url: `/groups/${group.id}` });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /groups/:groupId', () => {
    it('renames a group for every member', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);

      // Any member may rename, not just the owner.
      const response = await patchGroup(grace, group.id, { name: 'Corsica' });

      expect(response.statusCode).toBe(200);
      expect((await getGroup(ada, group.id)).json().group.name).toBe('Corsica');
    });

    it('archives and unarchives without losing the members', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);

      const archived = await patchGroup(ada, group.id, { archived: true });
      expect(archived.json().group.archivedAt).toBe(clock.toISOString());
      expect(archived.json().group.memberCount).toBe(2);

      const restored = await patchGroup(ada, group.id, { archived: false });
      expect(restored.json().group.archivedAt).toBeNull();
      expect(restored.json().group.memberCount).toBe(2);
    });

    it('rejects an update with nothing in it', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      const response = await patchGroup(ada, group.id, {});
      expect(response.statusCode).toBe(400);
    });
  });

  const setFavorite = (user: TestUser, groupId: string, favorite: boolean) =>
    app.inject({
      method: favorite ? 'PUT' : 'DELETE',
      url: `/groups/${groupId}/favorite`,
      headers: user.headers,
    });

  describe('favorites', () => {
    it('toggles the caller’s own favorite marker', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      expect(group.favorite).toBe(false);

      const favorited = await setFavorite(ada, group.id, true);
      expect(favorited.statusCode).toBe(200);
      expect(favorited.json().group.favorite).toBe(true);
      expect((await getGroup(ada, group.id)).json().group.favorite).toBe(true);

      const unfavorited = await setFavorite(ada, group.id, false);
      expect(unfavorited.statusCode).toBe(200);
      expect(unfavorited.json().group.favorite).toBe(false);
      expect((await getGroup(ada, group.id)).json().group.favorite).toBe(false);
    });

    it('is idempotent', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');

      expect((await setFavorite(ada, group.id, true)).statusCode).toBe(200);
      const again = await setFavorite(ada, group.id, true);
      expect(again.statusCode).toBe(200);
      expect(again.json().group.favorite).toBe(true);

      expect((await setFavorite(ada, group.id, false)).statusCode).toBe(200);
      const againOff = await setFavorite(ada, group.id, false);
      expect(againOff.statusCode).toBe(200);
      expect(againOff.json().group.favorite).toBe(false);
    });

    it('is personal to the caller — another member is unaffected', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);

      await setFavorite(ada, group.id, true);

      expect((await getGroup(ada, group.id)).json().group.favorite).toBe(true);
      expect((await getGroup(grace, group.id)).json().group.favorite).toBe(false);
    });

    it('works the same on an archived group, without changing anything else', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      await patchGroup(ada, group.id, { archived: true });

      const response = await setFavorite(ada, group.id, true);

      expect(response.statusCode).toBe(200);
      expect(response.json().group).toMatchObject({ favorite: true, archivedAt: clock.toISOString() });
    });

    it('is refused for a group the caller does not belong to', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const group = await createdGroup(ada, 'Private');

      const response = await setFavorite(alan, group.id, true);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'group_not_found' });
    });

    it('drops the favorite when the member leaves, even if they rejoin later', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);
      await setFavorite(grace, group.id, true);

      await removeMember(grace, group.id, grace.userId);
      const rejoined = await addMembers(ada, group.id, [grace.userId]);

      expect(rejoined.json().group.memberCount).toBe(2);
      expect((await getGroup(grace, group.id)).json().group.favorite).toBe(false);
    });

    it('pins favorited groups above non-favorited ones within the active and archived sections', async () => {
      const ada = await signIn('ada');
      await createdGroup(ada, 'Alpha');
      await createdGroup(ada, 'Bravo');
      const charlie = await createdGroup(ada, 'Charlie');
      const oldAlpha = await createdGroup(ada, 'Old Alpha');
      const oldBravo = await createdGroup(ada, 'Old Bravo');
      await patchGroup(ada, oldAlpha.id, { archived: true });
      await patchGroup(ada, oldBravo.id, { archived: true });

      // Favorite the later-alphabetical group in each section.
      await setFavorite(ada, charlie.id, true);
      await setFavorite(ada, oldBravo.id, true);

      const { groups: listed } = (await listGroups(ada)).json();

      expect(listed.map((group: { name: string }) => group.name)).toEqual([
        'Charlie',
        'Alpha',
        'Bravo',
        'Old Bravo',
        'Old Alpha',
      ]);
    });

    it('pins a favorited joined sub-group above other joined ones in its parent', async () => {
      const ada = await signIn('ada');
      const root = await createdGroup(ada, 'Corsica 2026');
      const alpha = await createdSubgroup(ada, root.id, 'Alpha sub');
      const bravo = await createdSubgroup(ada, root.id, 'Bravo sub');
      await createdSubgroup(ada, root.id, 'Charlie sub'); // never joined by anyone else here

      await setFavorite(ada, bravo.id, true);

      const detail = (await getGroup(ada, root.id)).json().group;

      expect(detail.subgroups.map((sub: { name: string }) => sub.name)).toEqual([
        'Bravo sub',
        'Alpha sub',
        'Charlie sub',
      ]);
      expect(detail.subgroups.find((sub: { id: string }) => sub.id === bravo.id).favorite).toBe(
        true,
      );
      expect(detail.subgroups.find((sub: { id: string }) => sub.id === alpha.id).favorite).toBe(
        false,
      );
    });

    it('never reports favorite for a sub-group the viewer has not joined', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');

      // Grace cannot favorite a sub-group she is not a member of at all.
      const response = await setFavorite(grace, sub.id, true);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'join_required' });

      const graceView = (await getGroup(grace, root.id)).json().group;
      expect(graceView.subgroups[0]).toMatchObject({ id: sub.id, favorite: false });
    });

    describe('GET /groups/favorites', () => {
      it('gathers every kind of favorited group, active first then alphabetical', async () => {
        const ada = await signIn('ada');
        const grace = await signIn('grace');
        await befriend(ada, grace);
        const pair = (await pairGroup(ada, grace.userId)).json().group;
        const root = await createdGroup(ada, 'Corsica 2026');
        const sub = await createdSubgroup(ada, root.id, 'Beach day');
        const old = await createdGroup(ada, 'Alpine 2025');
        await patchGroup(ada, old.id, { archived: true });
        await createdGroup(ada, 'Never starred');

        for (const id of [pair.id, root.id, sub.id, old.id]) {
          expect((await setFavorite(ada, id, true)).statusCode).toBe(200);
        }

        const response = await listFavorites(ada);

        expect(response.statusCode).toBe(200);
        // A pair group is named after the other member, so it sorts under
        // that name — 'Grace Hopper' — not under a name of its own.
        expect(response.json().groups).toMatchObject([
          { id: sub.id, name: 'Beach day', kind: 'standard', favorite: true },
          { id: root.id, name: 'Corsica 2026' },
          { id: pair.id, name: 'Grace Hopper', kind: 'pair' },
          { id: old.id, name: 'Alpine 2025', archivedAt: clock.toISOString() },
        ]);
      });

      it('shows a favorited sub-group where it sits, with its own balance', async () => {
        const ada = await signIn('ada');
        const grace = await signIn('grace');
        await befriend(ada, grace);
        const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
        const sub = await createdSubgroup(ada, root.id, 'Beach day', [grace.userId]);
        await recordExpense(ada, sub.id, ada.userId, [ada.userId, grace.userId], 1000);
        await setFavorite(ada, sub.id, true);

        const [favorite] = (await listFavorites(ada)).json().groups;

        expect(favorite).toMatchObject({
          id: sub.id,
          parentId: root.id,
          depth: 1,
          memberCount: 2,
          // Ada paid 1000 and owes 500 of it: the sub-group's own figure,
          // never folded into its parent's (`docs/specs/balances.md`).
          viewerBalanceCents: 500,
        });
        expect(favorite.ancestors).toEqual([{ id: root.id, name: 'Corsica 2026' }]);
      });

      it('is empty when nothing is favorited, and never shows another member’s', async () => {
        const ada = await signIn('ada');
        const grace = await signIn('grace');
        await befriend(ada, grace);
        const group = await createdGroup(ada, 'Trip', [grace.userId]);

        expect((await listFavorites(ada)).json()).toEqual({ groups: [] });

        await setFavorite(grace, group.id, true);

        expect((await listFavorites(ada)).json()).toEqual({ groups: [] });
        expect((await listFavorites(grace)).json().groups).toHaveLength(1);
      });

      it('drops a favorite when its membership goes', async () => {
        const ada = await signIn('ada');
        const grace = await signIn('grace');
        await befriend(ada, grace);
        const group = await createdGroup(ada, 'Trip', [grace.userId]);
        await setFavorite(grace, group.id, true);
        expect((await listFavorites(grace)).json().groups).toHaveLength(1);

        await removeMember(grace, group.id, grace.userId);

        expect((await listFavorites(grace)).json()).toEqual({ groups: [] });
      });

      it('requires authentication', async () => {
        const response = await app.inject({ method: 'GET', url: '/groups/favorites' });

        expect(response.statusCode).toBe(401);
      });
    });
  });

  describe('DELETE /groups/:groupId', () => {
    it('is refused to a member who does not own the group', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);

      const response = await app.inject({
        method: 'DELETE',
        url: `/groups/${group.id}`,
        headers: grace.headers,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'not_group_owner' });
      expect((await getGroup(ada, group.id)).statusCode).toBe(200);
    });

    it('removes the group, its memberships and its invitations for everyone', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);
      const { invite } = (await groupInvite(ada, group.id)).json();

      const response = await app.inject({
        method: 'DELETE',
        url: `/groups/${group.id}`,
        headers: ada.headers,
      });

      expect(response.statusCode).toBe(204);
      expect((await listGroups(grace)).json()).toEqual({ groups: [] });
      // Only the two membership rows of ada and grace's own implicit pair
      // group are left — it is a separate group from the deleted one, and
      // exists independently of it (`docs/specs/friends-and-invitations.md`).
      expect(await app.db.select().from(groupMembers)).toHaveLength(2);
      expect(await app.db.select().from(invites)).toHaveLength(1); // only ada's friend link

      // The link went with the group, so the code is simply unknown now — a
      // dead link either way, and it does not confirm the group ever existed.
      const refused = await acceptInvite(grace, invite.code);
      expect(refused.statusCode).toBe(404);
      expect(refused.json()).toEqual({ error: 'invite_not_found' });
    });
  });

  describe('members', () => {
    it('adds a friend, ignoring one who is already a member', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip');

      const first = await app.inject({
        method: 'POST',
        url: `/groups/${group.id}/members`,
        headers: ada.headers,
        payload: { memberIds: [grace.userId] },
      });
      const again = await app.inject({
        method: 'POST',
        url: `/groups/${group.id}/members`,
        headers: ada.headers,
        payload: { memberIds: [grace.userId] },
      });

      expect(first.json().group.memberCount).toBe(2);
      expect(again.statusCode).toBe(200);
      expect(again.json().group.memberCount).toBe(2);
    });

    it('refuses someone who is not a friend of the caller', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const group = await createdGroup(ada, 'Trip');

      const response = await app.inject({
        method: 'POST',
        url: `/groups/${group.id}/members`,
        headers: ada.headers,
        payload: { memberIds: [alan.userId] },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'not_friends' });
    });

    it('refuses to add anyone to an archived group', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip');
      await patchGroup(ada, group.id, { archived: true });

      const response = await app.inject({
        method: 'POST',
        url: `/groups/${group.id}/members`,
        headers: ada.headers,
        payload: { memberIds: [grace.userId] },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'group_archived' });
    });

    it('lets a member leave', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);

      const response = await app.inject({
        method: 'DELETE',
        url: `/groups/${group.id}/members/${grace.userId}`,
        headers: grace.headers,
      });

      expect(response.statusCode).toBe(204);
      expect((await listGroups(grace)).json()).toEqual({ groups: [] });
      expect((await getGroup(ada, group.id)).json().group.memberCount).toBe(1);
    });

    it('refuses to let the owner strand the other members', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);

      const response = await app.inject({
        method: 'DELETE',
        url: `/groups/${group.id}/members/${ada.userId}`,
        headers: ada.headers,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'owner_cannot_leave' });
    });

    it('refuses to let a member remove the owner, who alone can delete', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);

      const response = await app.inject({
        method: 'DELETE',
        url: `/groups/${group.id}/members/${ada.userId}`,
        headers: grace.headers,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'cannot_remove_owner' });
      expect((await getGroup(ada, group.id)).json().group.memberCount).toBe(2);
    });

    it('treats removing someone who already left as a no-op', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);

      const remove = () =>
        app.inject({
          method: 'DELETE',
          url: `/groups/${group.id}/members/${grace.userId}`,
          headers: ada.headers,
        });

      expect((await remove()).statusCode).toBe(204);
      expect((await remove()).statusCode).toBe(204);
      expect((await getGroup(ada, group.id)).json().group.memberCount).toBe(1);
    });

    it('deletes the group when its last member leaves', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');

      const response = await app.inject({
        method: 'DELETE',
        url: `/groups/${group.id}/members/${ada.userId}`,
        headers: ada.headers,
      });

      expect(response.statusCode).toBe(204);
      expect(await app.db.select().from(groups)).toHaveLength(0);
    });
  });

  describe('sub-groups', () => {
    it('creates a sub-group under a group the caller belongs to', async () => {
      const ada = await signIn('ada');
      const root = await createdGroup(ada, 'Corsica 2026');

      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');

      expect(sub).toMatchObject({
        kind: 'standard',
        name: 'Ajaccio weekend',
        parentId: root.id,
        depth: 1,
        memberCount: 1,
        subgroupCount: 0,
        viewerRole: 'owner',
      });
      expect(sub.ancestors).toEqual([{ id: root.id, name: 'Corsica 2026' }]);

      const parentDetail = (await getGroup(ada, root.id)).json().group;
      expect(parentDetail.subgroupCount).toBe(1);
      expect(parentDetail.subgroups).toEqual([
        {
          id: sub.id,
          name: 'Ajaccio weekend',
          memberCount: 1,
          viewerIsMember: true,
          viewerBalanceCents: 0,
          favorite: false,
        },
      ]);
    });

    it('does not list a sub-group at the top level', async () => {
      const ada = await signIn('ada');
      const root = await createdGroup(ada, 'Corsica 2026');
      await createdSubgroup(ada, root.id, 'Ajaccio weekend');

      const { groups: listed } = (await listGroups(ada)).json();

      expect(listed).toHaveLength(1);
      expect(listed[0]).toMatchObject({ id: root.id, subgroupCount: 1 });
    });

    it('reports a standard sub-group as not pair-rooted', async () => {
      const ada = await signIn('ada');
      const root = await createdGroup(ada, 'Corsica 2026');
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');

      expect(root.pairRooted).toBe(false);
      expect(sub.pairRooted).toBe(false);
    });

    it('refuses to create a sub-group under a group the caller does not belong to', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const root = await createdGroup(ada, 'Private');

      const response = await createSubgroup(alan, root.id, 'Intruding');

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'group_not_found' });
    });

    it('allows nesting up to five levels and refuses a sixth', async () => {
      const ada = await signIn('ada');
      let current = await createdGroup(ada, 'Depth 0');

      for (let depth = 1; depth <= 4; depth += 1) {
        current = await createdSubgroup(ada, current.id, `Depth ${depth}`);
        expect(current.depth).toBe(depth);
      }

      const response = await createSubgroup(ada, current.id, 'Depth 5');

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'max_depth_reached' });
    });

    it('refuses to create a sub-group under an archived group', async () => {
      const ada = await signIn('ada');
      const root = await createdGroup(ada, 'Corsica 2026');
      await patchGroup(ada, root.id, { archived: true });

      const response = await createSubgroup(ada, root.id, 'Too late');

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'group_archived' });
    });

    it('refuses to create a sub-group when an ancestor (not the direct parent) is archived', async () => {
      const ada = await signIn('ada');
      const root = await createdGroup(ada, 'Corsica 2026');
      const child = await createdSubgroup(ada, root.id, 'Ajaccio weekend');
      await patchGroup(ada, root.id, { archived: true });

      const response = await createSubgroup(ada, child.id, 'Too late');

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'group_archived' });
    });

    it('adding a friend to a sub-group also adds them to its ancestors', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026');
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');

      const response = await app.inject({
        method: 'POST',
        url: `/groups/${sub.id}/members`,
        headers: ada.headers,
        payload: { memberIds: [grace.userId] },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().group.memberCount).toBe(2);

      const { groups: graceGroups } = (await listGroups(grace)).json();
      expect(graceGroups.map((g: { id: string }) => g.id)).toEqual([root.id]);
      expect((await getGroup(ada, root.id)).json().group.memberCount).toBe(2);
    });

    it('accepting a sub-group invitation also joins its ancestors', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const root = await createdGroup(ada, 'Corsica 2026');
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');

      const { invite } = (await groupInvite(ada, sub.id)).json();
      const accept = await acceptInvite(alan, invite.code);

      expect(accept.statusCode).toBe(200);
      const { groups: alanGroups } = (await listGroups(alan)).json();
      expect(alanGroups.map((g: { id: string }) => g.id)).toEqual([root.id]);
      expect((await getGroup(alan, sub.id)).statusCode).toBe(200);
    });

    it('shows every ancestor of a sub-group, root first', async () => {
      const ada = await signIn('ada');
      const root = await createdGroup(ada, 'Corsica 2026');
      const child = await createdSubgroup(ada, root.id, 'Ajaccio weekend');
      const grandchild = await createdSubgroup(ada, child.id, 'Beach day');

      const detail = (await getGroup(ada, grandchild.id)).json().group;

      expect(detail.ancestors).toEqual([
        { id: root.id, name: 'Corsica 2026' },
        { id: child.id, name: 'Ajaccio weekend' },
      ]);
    });

    it('names a pair group ancestor after the other member, per viewer', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const pair = (await pairGroup(ada, grace.userId)).json().group;
      const sub = await createdSubgroup(ada, pair.id, 'Ski trip');

      // A pair group carries no name of its own, so the breadcrumb above a
      // sub-group of one has to name it the way the friend list does — the
      // *other* member, which differs on each side.
      expect((await getGroup(ada, sub.id)).json().group.ancestors).toEqual([
        { id: pair.id, name: 'Grace Hopper' },
      ]);
      expect((await getGroup(grace, sub.id)).json().group.ancestors).toEqual([
        { id: pair.id, name: 'Ada Lovelace' },
      ]);
    });

    it('tells whoever accepts a sub-group invitation where it sits', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const root = await createdGroup(ada, 'Corsica 2026');
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');

      const { invite } = (await groupInvite(ada, sub.id)).json();

      // The preview, before joining, discloses no position in the tree; the
      // acceptance does — they have just joined every ancestor of it.
      const preview = (
        await app.inject({
          method: 'GET',
          url: `/invites/${invite.code}`,
          headers: alan.headers,
        })
      ).json();
      expect(preview.invite.group.ancestors).toBeUndefined();
      const accepted = (await acceptInvite(alan, invite.code)).json();
      expect(accepted.result.group.ancestors).toEqual([
        { id: root.id, name: 'Corsica 2026' },
      ]);
    });

    it('lists a sub-group the caller has not joined, marked as such', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');

      const graceDetail = (await getGroup(grace, root.id)).json().group;

      expect(graceDetail.subgroups).toEqual([
        {
          id: sub.id,
          name: 'Ajaccio weekend',
          memberCount: 1,
          viewerIsMember: false,
          viewerBalanceCents: 0,
          favorite: false,
        },
      ]);
    });
  });

  describe('sub-groups of a pair group', () => {
    it('creates a sub-group under the pair group two friends share, with both of them in it already', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const pair = (await pairGroup(ada, grace.userId)).json().group;

      const response = await createSubgroup(ada, pair.id, 'Ski trip');

      expect(response.statusCode).toBe(201);
      const group = response.json().group;
      expect(group).toMatchObject({
        kind: 'standard',
        name: 'Ski trip',
        parentId: pair.id,
        depth: 1,
        memberCount: 2,
        pairRooted: true,
      });
      expect(group.members.map((member: { id: string }) => member.id).sort()).toEqual(
        [ada.userId, grace.userId].sort(),
      );
    });

    it('reports the pair group itself as pair-rooted', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const pair = (await pairGroup(ada, grace.userId)).json().group;

      expect(pair.pairRooted).toBe(true);
    });

    it('starts the other friend off as a member too, with nothing to join', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const pair = (await pairGroup(ada, grace.userId)).json().group;
      const sub = await createdSubgroup(ada, pair.id, 'Ski trip');

      const graceView = (await getGroup(grace, pair.id)).json().group;
      expect(graceView.subgroups).toEqual([
        expect.objectContaining({ id: sub.id, viewerIsMember: true }),
      ]);
      expect((await getGroup(grace, sub.id)).statusCode).toBe(200);
    });

    it('refuses a third person as an initial member', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      await befriend(ada, alan);
      const pair = (await pairGroup(ada, grace.userId)).json().group;

      const response = await createSubgroup(ada, pair.id, 'Ski trip', [alan.userId]);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'pair_group_immutable' });
    });

    it('refuses to add a third person to it later', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      await befriend(ada, alan);
      const pair = (await pairGroup(ada, grace.userId)).json().group;
      const sub = await createdSubgroup(ada, pair.id, 'Ski trip');

      const response = await addMembers(ada, sub.id, [alan.userId]);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'pair_group_immutable' });
    });

    it('tolerates re-adding the partner who is already there by default', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const pair = (await pairGroup(ada, grace.userId)).json().group;
      const sub = await createdSubgroup(ada, pair.id, 'Ski trip');

      const response = await addMembers(ada, sub.id, [grace.userId]);

      expect(response.statusCode).toBe(200);
      expect(response.json().group.memberCount).toBe(2);
    });

    it('refuses to generate an invitation link for it', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const pair = (await pairGroup(ada, grace.userId)).json().group;
      const sub = await createdSubgroup(ada, pair.id, 'Ski trip');

      const response = await groupInvite(ada, sub.id);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'pair_group_immutable' });
    });

    it('keeps the two-person ceiling however deep the tree goes', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      await befriend(ada, alan);
      const pair = (await pairGroup(ada, grace.userId)).json().group;
      const sub = await createdSubgroup(ada, pair.id, 'Ski trip');
      const subsub = await createdSubgroup(ada, sub.id, 'Chalet costs');

      expect(subsub.pairRooted).toBe(true);
      const response = await addMembers(ada, subsub.id, [alan.userId]);
      expect(response.statusCode).toBe(409);
    });

    it('can still be renamed, unlike the pair group itself', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const pair = (await pairGroup(ada, grace.userId)).json().group;
      const sub = await createdSubgroup(ada, pair.id, 'Ski trip');

      const response = await patchGroup(ada, sub.id, { name: 'Renamed' });

      expect(response.statusCode).toBe(200);
      expect(response.json().group.name).toBe('Renamed');
    });
  });

  describe('sub-group membership cascade', () => {
    it('removes a leaving member from every descendant too', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend', [grace.userId]);

      const response = await removeMember(grace, root.id, grace.userId);

      expect(response.statusCode).toBe(204);
      expect((await getGroup(ada, root.id)).json().group.memberCount).toBe(1);
      expect((await getGroup(ada, sub.id)).json().group.memberCount).toBe(1);
      expect((await listGroups(grace)).json()).toEqual({ groups: [] });
    });

    it('deletes a sub-group left with nobody in it by the cascade', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      // Grace owns the sub-group and is its only member — ada never joined it.
      const sub = await createdSubgroup(grace, root.id, 'Grace solo trip');

      const response = await removeMember(grace, root.id, grace.userId);

      expect(response.statusCode).toBe(204);
      expect(await app.db.select().from(groups).where(eq(groups.id, sub.id))).toHaveLength(0);
    });

    it("refuses to let the owner leave while they solely own a populated sub-group", async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      await befriend(ada, alan);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId, alan.userId]);
      // Ada owns the sub-group; grace is also in it. Leaving root would
      // cascade ada out of the sub-group too, stranding grace there with no
      // owner and nobody able to delete it.
      await createdSubgroup(ada, root.id, 'Ajaccio weekend', [grace.userId]);

      const response = await removeMember(ada, root.id, ada.userId);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'owner_cannot_leave' });
    });

    it('refuses to remove a member who solely owns a populated sub-group', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      await befriend(ada, alan);
      await befriend(grace, alan);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId, alan.userId]);
      // Grace owns the sub-group; alan is also in it. Ada (root's owner)
      // removing grace from root would strand alan in the sub-group the same
      // way grace leaving on her own would.
      await createdSubgroup(grace, root.id, 'Ajaccio weekend', [alan.userId]);

      const response = await removeMember(ada, root.id, grace.userId);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'owner_cannot_leave' });
    });

    it('allows leaving when the owned sub-group has no other members', async () => {
      const ada = await signIn('ada');
      const root = await createdGroup(ada, 'Corsica 2026');
      // Ada is alone in both root and the sub-group — leaving root is "alone,
      // leaving is deleting" (unaffected by the new tree check), and the
      // sub-group has nobody else in it to strand.
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');

      const response = await removeMember(ada, root.id, ada.userId);

      expect(response.statusCode).toBe(204);
      expect(await app.db.select().from(groups).where(eq(groups.id, root.id))).toHaveLength(0);
      expect(await app.db.select().from(groups).where(eq(groups.id, sub.id))).toHaveLength(0);
    });
  });

  describe('joining a sub-group directly', () => {
    it('lets a member of the parent join a visible sub-group', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');

      const response = await joinGroup(grace, sub.id);

      expect(response.statusCode).toBe(200);
      expect(response.json().group).toMatchObject({ id: sub.id, memberCount: 2 });
      expect((await getGroup(grace, sub.id)).statusCode).toBe(200);
    });

    it('is idempotent and preserves an existing role', async () => {
      const ada = await signIn('ada');
      const root = await createdGroup(ada, 'Corsica 2026');
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');

      const response = await joinGroup(ada, sub.id);

      expect(response.statusCode).toBe(200);
      expect(response.json().group.viewerRole).toBe('owner');
    });

    it('refuses to join a root group directly', async () => {
      const ada = await signIn('ada');
      const root = await createdGroup(ada, 'Corsica 2026');

      const response = await joinGroup(ada, root.id);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'group_not_found' });
    });

    it('refuses a non-member of the parent, without disclosing the sub-group', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const root = await createdGroup(ada, 'Corsica 2026');
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');

      const response = await joinGroup(alan, sub.id);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'group_not_found' });
    });

    it('refuses to join an effectively archived sub-group', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');
      await patchGroup(ada, root.id, { archived: true });

      const response = await joinGroup(grace, sub.id);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'group_archived' });
    });
  });

  describe('accessing an unjoined sub-group of a group the caller belongs to', () => {
    it('answers "join required" rather than "not found"', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');

      const response = await getGroup(grace, sub.id);

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'join_required' });
    });

    it('applies the same answer to other group routes, not only GET', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');

      const attempts = [
        patchGroup(grace, sub.id, { name: 'Hijacked' }),
        app.inject({
          method: 'POST',
          url: `/groups/${sub.id}/members`,
          headers: grace.headers,
          // Any syntactically valid body: `join_required` is thrown before
          // the friend check ever runs.
          payload: { memberIds: [ada.userId] },
        }),
      ];

      for (const attempt of await Promise.all(attempts)) {
        expect(attempt.statusCode).toBe(403);
        expect(attempt.json()).toEqual({ error: 'join_required' });
      }
    });

    it('never applies transitively, to a sibling or grandchild', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      const subA = await createdSubgroup(ada, root.id, 'Ajaccio weekend');
      const subB = await createdSubgroup(ada, root.id, 'Bastia weekend');
      const grandchild = await createdSubgroup(ada, subA.id, 'Beach day');

      // Grace is a member of root and can see (and join_required into) subA
      // and subB directly, but knows nothing of subA's own child.
      expect((await getGroup(grace, subB.id)).json()).toEqual({ error: 'join_required' });
      expect((await getGroup(grace, grandchild.id)).json()).toEqual({ error: 'group_not_found' });
    });
  });

  describe('effective archive for sub-groups', () => {
    it('marks a sub-group read-only when an ancestor is archived, without touching its own flag', async () => {
      const ada = await signIn('ada');
      const root = await createdGroup(ada, 'Corsica 2026');
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');

      await patchGroup(ada, root.id, { archived: true });
      const detail = (await getGroup(ada, sub.id)).json().group;

      expect(detail.archivedAt).toBeNull();
      expect(detail.readOnly).toBe(true);

      await patchGroup(ada, root.id, { archived: false });
      const restored = (await getGroup(ada, sub.id)).json().group;
      expect(restored.readOnly).toBe(false);
    });

    it('refuses to add a member to a sub-group whose ancestor is archived', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026');
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');
      await patchGroup(ada, root.id, { archived: true });

      const response = await app.inject({
        method: 'POST',
        url: `/groups/${sub.id}/members`,
        headers: ada.headers,
        payload: { memberIds: [grace.userId] },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'group_archived' });
    });

    it('refuses to issue an invitation for a sub-group whose ancestor is archived', async () => {
      const ada = await signIn('ada');
      const root = await createdGroup(ada, 'Corsica 2026');
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');
      await patchGroup(ada, root.id, { archived: true });

      const response = await groupInvite(ada, sub.id);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'group_archived' });
    });

    it('treats a sub-group invitation as a dead link once an ancestor is archived', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const root = await createdGroup(ada, 'Corsica 2026');
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');
      const { invite } = (await groupInvite(ada, sub.id)).json();

      await patchGroup(ada, root.id, { archived: true });
      const response = await acceptInvite(alan, invite.code);

      expect(response.statusCode).toBe(410);
      expect(response.json()).toEqual({ error: 'invite_gone' });
    });
  });

  describe("a group's own balance", () => {
    it("is the viewer's net position in that group", async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      await recordExpense(ada, root.id, ada.userId, [ada.userId, grace.userId], 1000);

      const { groups: listed } = (await listGroups(ada)).json();

      // Ada paid 1000, split evenly two ways: she is owed 500.
      expect(listed[0].viewerBalanceCents).toBe(500);
      expect((await getGroup(ada, root.id)).json().group.viewerBalanceCents).toBe(500);
    });

    it("leaves a sub-group's balance in the sub-group", async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend', [grace.userId]);
      await recordExpense(ada, root.id, ada.userId, [ada.userId, grace.userId], 1000);
      await recordExpense(ada, sub.id, ada.userId, [ada.userId, grace.userId], 400);

      const { groups: listed } = (await listGroups(ada)).json();

      // The root's own 1000, split evenly: 500. The sub-group's 400 stays
      // its own 200 and is not folded into the parent.
      expect(listed[0].viewerBalanceCents).toBe(500);
      expect((await getGroup(ada, root.id)).json().group.viewerBalanceCents).toBe(500);
      expect((await getGroup(ada, sub.id)).json().group.viewerBalanceCents).toBe(200);
    });

    it("carries a joined sub-group's own balance in its parent's subgroups list", async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend', [grace.userId]);
      await recordExpense(ada, sub.id, ada.userId, [ada.userId, grace.userId], 400);

      const parentDetail = (await getGroup(ada, root.id)).json().group;

      expect(parentDetail.subgroups).toEqual([
        expect.objectContaining({ id: sub.id, viewerBalanceCents: 200 }),
      ]);
    });

    it('shows nothing for a sub-group the viewer has never joined', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      await befriend(ada, alan);
      await befriend(grace, alan);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId, alan.userId]);
      // Ada never joins the sub-group; grace and alan run up a balance in it.
      const sub = await createdSubgroup(grace, root.id, 'Just us', [alan.userId]);
      await recordExpense(ada, root.id, ada.userId, [ada.userId, grace.userId], 1000);
      await recordExpense(grace, sub.id, grace.userId, [grace.userId, alan.userId], 800);

      const detail = (await getGroup(ada, root.id)).json().group;

      expect(detail.viewerBalanceCents).toBe(500);
      expect(detail.subgroups).toEqual([
        expect.objectContaining({ id: sub.id, viewerBalanceCents: 0 }),
      ]);
    });

    it('keeps a debt run up in a sub-group out of its parent', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend', [grace.userId]);
      // Grace paid 600 in the sub-group, split with ada: ada owes 300 there.
      await recordExpense(ada, sub.id, grace.userId, [ada.userId, grace.userId], 600);

      expect((await getGroup(ada, sub.id)).json().group.viewerBalanceCents).toBe(-300);
      // Nothing was spent in the root, so that is what the root says.
      expect((await getGroup(ada, root.id)).json().group.viewerBalanceCents).toBe(0);
    });

    it('gives every level of a nested tree its own figure', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      const child = await createdSubgroup(ada, root.id, 'Ajaccio weekend', [grace.userId]);
      const grandchild = await createdSubgroup(ada, child.id, 'Beach day', [grace.userId]);
      await recordExpense(ada, root.id, ada.userId, [ada.userId, grace.userId], 200);
      await recordExpense(ada, child.id, ada.userId, [ada.userId, grace.userId], 400);
      await recordExpense(ada, grandchild.id, ada.userId, [ada.userId, grace.userId], 600);

      const rootDetail = (await getGroup(ada, root.id)).json().group;
      const childDetail = (await getGroup(ada, child.id)).json().group;
      const grandchildDetail = (await getGroup(ada, grandchild.id)).json().group;

      expect(grandchildDetail.viewerBalanceCents).toBe(300);
      expect(childDetail.viewerBalanceCents).toBe(200);
      expect(rootDetail.viewerBalanceCents).toBe(100);
    });
  });

  describe('group invitations', () => {
    it('gives every member the same link, and replaces it on rotation', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);

      const fromOwner = (await groupInvite(ada, group.id)).json().invite;
      const fromMember = (await groupInvite(grace, group.id)).json().invite;

      expect(fromMember.code).toBe(fromOwner.code);
      expect(fromOwner.url).toBe(`https://splitcount.test/i/${fromOwner.code}`);

      const rotated = (
        await app.inject({
          method: 'POST',
          url: `/groups/${group.id}/invite/rotate`,
          headers: grace.headers,
        })
      ).json().invite;

      expect(rotated.code).not.toBe(fromOwner.code);
      expect((await acceptInvite(alan, fromOwner.code)).statusCode).toBe(410);
      expect((await acceptInvite(alan, rotated.code)).statusCode).toBe(200);
    });

    it('is separate from the inviter’s friend link', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');

      const friendLink = (
        await app.inject({ method: 'POST', url: '/friends/invite', headers: ada.headers })
      ).json().invite;
      const groupLink = (await groupInvite(ada, group.id)).json().invite;

      expect(groupLink.code).not.toBe(friendLink.code);
    });

    it('adds whoever accepts, without making them a friend', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const group = await createdGroup(ada, 'Trip');
      const { invite } = (await groupInvite(ada, group.id)).json();

      const response = await acceptInvite(alan, invite.code);

      expect(response.statusCode).toBe(200);
      expect(response.json().result).toMatchObject({
        kind: 'group',
        alreadyMember: false,
        group: { id: group.id, name: 'Trip', memberCount: 2 },
      });

      const friends = (
        await app.inject({ method: 'GET', url: '/friends', headers: alan.headers })
      ).json();
      expect(friends).toEqual({ friends: [] });
    });

    it('previews the group before anyone signs in', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      const { invite } = (await groupInvite(ada, group.id)).json();

      const response = await app.inject({ method: 'GET', url: `/invites/${invite.code}` });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        invite: {
          kind: 'group',
          inviter: { id: ada.userId, name: 'Ada Lovelace', picture: null },
          group: { id: group.id, name: 'Trip', memberCount: 1 },
        },
      });
      expect(response.body).not.toContain('ada@example.com');
    });

    it('joins once when the same person accepts twice', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const group = await createdGroup(ada, 'Trip');
      const { invite } = (await groupInvite(ada, group.id)).json();

      await acceptInvite(alan, invite.code);
      const second = await acceptInvite(alan, invite.code);

      expect(second.statusCode).toBe(200);
      expect(second.json().result.alreadyMember).toBe(true);
      expect((await getGroup(ada, group.id)).json().group.memberCount).toBe(2);
    });

    it('joins once when two requests race', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const group = await createdGroup(ada, 'Trip');
      const { invite } = (await groupInvite(ada, group.id)).json();

      const responses = await Promise.all([
        acceptInvite(alan, invite.code),
        acceptInvite(alan, invite.code),
      ]);

      expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
      expect((await getGroup(ada, group.id)).json().group.memberCount).toBe(2);
    });

    it('reports a member accepting their own group link as already in', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      const { invite } = (await groupInvite(ada, group.id)).json();

      const response = await acceptInvite(ada, invite.code);

      expect(response.statusCode).toBe(200);
      expect(response.json().result.alreadyMember).toBe(true);
    });

    it('refuses a link to a group that has since been archived', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');
      const group = await createdGroup(ada, 'Trip');
      const { invite } = (await groupInvite(ada, group.id)).json();

      await patchGroup(ada, group.id, { archived: true });

      expect((await acceptInvite(alan, invite.code)).statusCode).toBe(410);
      const preview = await app.inject({ method: 'GET', url: `/invites/${invite.code}` });
      expect(preview.statusCode).toBe(410);
      expect(preview.json()).toEqual({ error: 'invite_gone' });
    });

    it('refuses to issue a link for an archived group', async () => {
      const ada = await signIn('ada');
      const group = await createdGroup(ada, 'Trip');
      await patchGroup(ada, group.id, { archived: true });

      const response = await groupInvite(ada, group.id);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'group_archived' });
    });

    it('keeps working after the member who created it leaves', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      await befriend(ada, grace);
      const group = await createdGroup(ada, 'Trip', [grace.userId]);
      const { invite } = (await groupInvite(grace, group.id)).json();

      await app.inject({
        method: 'DELETE',
        url: `/groups/${group.id}/members/${grace.userId}`,
        headers: grace.headers,
      });

      expect((await acceptInvite(alan, invite.code)).statusCode).toBe(200);
    });
  });

  describe('the implicit pair group', () => {
    it('is created the moment two people become friends, the same one for each side', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);

      const forAda = (await pairGroup(ada, grace.userId)).json().group;
      const forGrace = (await pairGroup(grace, ada.userId)).json().group;

      expect(forAda.id).toBe(forGrace.id);
      expect(await app.db.select().from(groups)).toHaveLength(1);
    });

    it('stays a single group even when the friendship is accepted twice', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      // Re-accepting an already-valid link is idempotent for the friendship
      // itself (`docs/specs/friends-and-invitations.md`) — the group it
      // materialises must stay a singleton under the same retry.
      await befriend(ada, grace);

      expect(await app.db.select().from(groups)).toHaveLength(1);
    });

    it('names the group after the other person, for each side', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);

      const forAda = (await pairGroup(ada, grace.userId)).json().group;
      const forGrace = (await pairGroup(grace, ada.userId)).json().group;

      expect(forAda).toMatchObject({ kind: 'pair', name: 'Grace Hopper', memberCount: 2 });
      expect(forGrace).toMatchObject({ kind: 'pair', name: 'Ada Lovelace' });
      expect(forAda.members.map((m: { name: string }) => m.name)).toEqual([
        'Ada Lovelace',
        'Grace Hopper',
      ]);
    });

    it('never shows up in the group list', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);

      expect((await listGroups(ada)).json()).toEqual({ groups: [] });
      expect((await listGroups(grace)).json()).toEqual({ groups: [] });
    });

    it('refuses every operation that would change who is in it', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const edsger = await signIn('edsger');
      await befriend(ada, grace);
      await befriend(ada, edsger);
      const group = (await pairGroup(ada, grace.userId)).json().group;

      const attempts = [
        patchGroup(ada, group.id, { name: 'Renamed' }),
        patchGroup(ada, group.id, { archived: true }),
        app.inject({ method: 'DELETE', url: `/groups/${group.id}`, headers: ada.headers }),
        app.inject({
          method: 'POST',
          url: `/groups/${group.id}/members`,
          headers: ada.headers,
          payload: { memberIds: [edsger.userId] },
        }),
        app.inject({
          method: 'DELETE',
          url: `/groups/${group.id}/members/${ada.userId}`,
          headers: ada.headers,
        }),
        groupInvite(ada, group.id),
      ];

      for (const response of await Promise.all(attempts)) {
        expect(response.statusCode).toBe(409);
        expect(response.json()).toEqual({ error: 'pair_group_immutable' });
      }

      expect((await getGroup(ada, group.id)).json().group).toMatchObject({
        name: 'Grace Hopper',
        memberCount: 2,
        archivedAt: null,
      });
    });

    it('disappears with the friendship, for both sides', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const group = (await pairGroup(ada, grace.userId)).json().group;

      await app.inject({
        method: 'DELETE',
        url: `/friends/${grace.userId}`,
        headers: ada.headers,
      });

      expect(await app.db.select().from(groups)).toHaveLength(0);
      expect(await app.db.select().from(groupMembers)).toHaveLength(0);
      expect((await getGroup(ada, group.id)).statusCode).toBe(404);
      expect((await getGroup(grace, group.id)).statusCode).toBe(404);
    });
  });
});
