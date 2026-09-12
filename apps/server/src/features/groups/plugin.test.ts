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

  const getGroup = (user: TestUser, groupId: string) =>
    app.inject({ method: 'GET', url: `/groups/${groupId}`, headers: user.headers });

  const patchGroup = (user: TestUser, groupId: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH',
      url: `/groups/${groupId}`,
      headers: user.headers,
      payload,
    });

  const groupInvite = (user: TestUser, groupId: string) =>
    app.inject({
      method: 'POST',
      url: `/groups/${groupId}/invite`,
      headers: user.headers,
    });

  const acceptInvite = (user: TestUser, code: string) =>
    app.inject({ method: 'POST', url: `/invites/${code}/accept`, headers: user.headers });

  const pairGroup = (user: TestUser, friendId: string) =>
    app.inject({
      method: 'POST',
      url: `/groups/pair/${friendId}`,
      headers: user.headers,
    });

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
      expect(await app.db.select().from(groupMembers)).toHaveLength(0);
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
        { id: sub.id, name: 'Ajaccio weekend', memberCount: 1, viewerIsMember: true },
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

    it('refuses to nest under a pair group', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const pair = (await pairGroup(ada, grace.userId)).json().group;

      const response = await createSubgroup(ada, pair.id, 'Nested');

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'pair_group_immutable' });
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

    it('lists a sub-group the caller has not joined, marked as such', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);
      const root = await createdGroup(ada, 'Corsica 2026', [grace.userId]);
      const sub = await createdSubgroup(ada, root.id, 'Ajaccio weekend');

      const graceDetail = (await getGroup(grace, root.id)).json().group;

      expect(graceDetail.subgroups).toEqual([
        { id: sub.id, name: 'Ajaccio weekend', memberCount: 1, viewerIsMember: false },
      ]);
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

  describe('POST /groups/pair/:friendId', () => {
    it('creates the shared group on first access and reuses it afterwards', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);

      const first = await pairGroup(ada, grace.userId);
      const second = await pairGroup(ada, grace.userId);

      expect(first.statusCode).toBe(200);
      expect(first.json().group.id).toBe(second.json().group.id);
      expect(await app.db.select().from(groups)).toHaveLength(1);
    });

    it('creates exactly one group when both devices open it at once', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      await befriend(ada, grace);

      const responses = await Promise.all([
        pairGroup(ada, grace.userId),
        pairGroup(grace, ada.userId),
      ]);

      expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
      expect(responses[0]!.json().group.id).toBe(responses[1]!.json().group.id);
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
      await pairGroup(ada, grace.userId);

      expect((await listGroups(ada)).json()).toEqual({ groups: [] });
      expect((await listGroups(grace)).json()).toEqual({ groups: [] });
    });

    it('is refused for someone who is not a friend', async () => {
      const ada = await signIn('ada');
      const alan = await signIn('alan');

      const response = await pairGroup(ada, alan.userId);

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: 'group_not_found' });
      expect(await app.db.select().from(groups)).toHaveLength(0);
    });

    it('is refused for oneself', async () => {
      const ada = await signIn('ada');
      expect((await pairGroup(ada, ada.userId)).statusCode).toBe(404);
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
