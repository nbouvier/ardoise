import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { friendships } from '../../db/schema.js';
import { createTestContext } from '../../test/app.js';
import { signInAs } from '../../test/auth.js';
import { fakeGoogleVerifier } from '../../test/google.js';

const google = fakeGoogleVerifier({
  ada: { sub: 'google-ada', email: 'ada@example.com', name: 'Ada Lovelace' },
  grace: { sub: 'google-grace', email: 'grace@example.com', name: 'Grace Hopper' },
  alan: { sub: 'google-alan', email: 'alan@example.com', name: 'Alan Turing' },
});

/** A movable clock so expiry is testable without waiting. */
let clock = new Date('2026-09-10T12:00:00.000Z');

describe('friends routes', () => {
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
    }));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    clock = new Date('2026-09-10T12:00:00.000Z');
    await reset();
  });

  const signIn = (idToken: string) => signInAs(app, idToken);

  const createInvite = (headers: Record<string, string>) =>
    app.inject({ method: 'POST', url: '/friends/invite', headers });

  const accept = (code: string, headers: Record<string, string>) =>
    app.inject({ method: 'POST', url: `/invites/${code}/accept`, headers });

  const listFriends = (headers: Record<string, string>) =>
    app.inject({ method: 'GET', url: '/friends', headers });

  describe('POST /friends/invite', () => {
    it('issues a shareable link built from the public base URL', async () => {
      const ada = await signIn('ada');

      const response = await createInvite(ada.headers);

      expect(response.statusCode).toBe(200);
      const { invite } = response.json();
      expect(invite.code).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(invite.url).toBe(`https://splitcount.test/i/${invite.code}`);
      expect(invite.expiresAt).toBe(new Date(clock.getTime() + 3600_000).toISOString());
    });

    it('returns the same active invitation on repeated calls', async () => {
      const ada = await signIn('ada');

      const first = (await createInvite(ada.headers)).json();
      const second = (await createInvite(ada.headers)).json();

      expect(second.invite.code).toBe(first.invite.code);
    });

    it('requires authentication', async () => {
      const response = await app.inject({ method: 'POST', url: '/friends/invite' });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /friends/invite/rotate', () => {
    it('issues a new code and kills the previous one', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const { invite: old } = (await createInvite(ada.headers)).json();

      const rotated = await app.inject({
        method: 'POST',
        url: '/friends/invite/rotate',
        headers: ada.headers,
      });

      expect(rotated.statusCode).toBe(200);
      const fresh = rotated.json().invite;
      expect(fresh.code).not.toBe(old.code);

      const rejected = await accept(old.code, grace.headers);
      expect(rejected.statusCode).toBe(410);
      expect(rejected.json()).toEqual({ error: 'invite_revoked' });

      expect((await accept(fresh.code, grace.headers)).statusCode).toBe(200);
    });
  });

  describe('DELETE /friends/invite', () => {
    it('revokes the active invitation and stays idempotent', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const { invite } = (await createInvite(ada.headers)).json();

      const first = await app.inject({
        method: 'DELETE',
        url: '/friends/invite',
        headers: ada.headers,
      });
      const second = await app.inject({
        method: 'DELETE',
        url: '/friends/invite',
        headers: ada.headers,
      });

      expect(first.statusCode).toBe(204);
      expect(second.statusCode).toBe(204);
      expect((await accept(invite.code, grace.headers)).statusCode).toBe(410);
    });
  });

  describe('GET /invites/:code for a friend invitation', () => {
    it('tells an anonymous visitor who is inviting, without the email', async () => {
      const ada = await signIn('ada');
      const { invite } = (await createInvite(ada.headers)).json();

      const response = await app.inject({ method: 'GET', url: `/invites/${invite.code}` });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        invite: {
          kind: 'friend',
          inviter: { id: ada.userId, name: 'Ada Lovelace', picture: null },
        },
      });
      expect(response.body).not.toContain('ada@example.com');
    });

    it('reports an expired code as gone', async () => {
      const ada = await signIn('ada');
      const { invite } = (await createInvite(ada.headers)).json();

      clock = new Date(clock.getTime() + 3600_001);

      const response = await app.inject({ method: 'GET', url: `/invites/${invite.code}` });
      expect(response.statusCode).toBe(410);
      expect(response.json()).toEqual({ error: 'invite_expired' });
    });
  });

  describe('POST /invites/:code/accept for a friend invitation', () => {
    it('connects both users symmetrically', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const { invite } = (await createInvite(ada.headers)).json();

      const response = await accept(invite.code, grace.headers);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        result: {
          kind: 'friend',
          friend: { id: ada.userId, name: 'Ada Lovelace', picture: null },
          alreadyFriends: false,
        },
      });

      expect((await listFriends(ada.headers)).json()).toEqual({
        friends: [{ id: grace.userId, name: 'Grace Hopper', picture: null }],
      });
      expect((await listFriends(grace.headers)).json()).toEqual({
        friends: [{ id: ada.userId, name: 'Ada Lovelace', picture: null }],
      });
    });

    it('is idempotent and creates a single relationship', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const { invite } = (await createInvite(ada.headers)).json();

      await accept(invite.code, grace.headers);
      const second = await accept(invite.code, grace.headers);

      expect(second.statusCode).toBe(200);
      expect(second.json().result.alreadyFriends).toBe(true);
      expect(await app.db.select().from(friendships)).toHaveLength(1);
    });

    it('records one relationship when both people accept concurrently', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const { invite } = (await createInvite(ada.headers)).json();

      const responses = await Promise.all([
        accept(invite.code, grace.headers),
        accept(invite.code, grace.headers),
      ]);

      expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
      expect(await app.db.select().from(friendships)).toHaveLength(1);
    });

    it('lets several people use the same still-valid link', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const alan = await signIn('alan');
      const { invite } = (await createInvite(ada.headers)).json();

      expect((await accept(invite.code, grace.headers)).statusCode).toBe(200);
      expect((await accept(invite.code, alan.headers)).statusCode).toBe(200);

      const { friends } = (await listFriends(ada.headers)).json();
      expect(friends.map((friend: { name: string }) => friend.name)).toEqual([
        'Alan Turing',
        'Grace Hopper',
      ]);
    });

    it('refuses the inviter accepting their own link', async () => {
      const ada = await signIn('ada');
      const { invite } = (await createInvite(ada.headers)).json();

      const response = await accept(invite.code, ada.headers);

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'self_invite' });
      expect(await app.db.select().from(friendships)).toHaveLength(0);
    });

    it('requires authentication', async () => {
      const ada = await signIn('ada');
      const { invite } = (await createInvite(ada.headers)).json();

      const response = await app.inject({
        method: 'POST',
        url: `/invites/${invite.code}/accept`,
      });

      expect(response.statusCode).toBe(401);
      expect(await app.db.select().from(friendships)).toHaveLength(0);
    });

    it('refuses an expired link', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const { invite } = (await createInvite(ada.headers)).json();

      clock = new Date(clock.getTime() + 3600_001);

      const response = await accept(invite.code, grace.headers);
      expect(response.statusCode).toBe(410);
      expect(response.json()).toEqual({ error: 'invite_expired' });
    });
  });

  describe('GET /friends', () => {
    it('starts empty', async () => {
      const ada = await signIn('ada');
      const response = await listFriends(ada.headers);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ friends: [] });
    });

    it('requires authentication', async () => {
      expect((await app.inject({ method: 'GET', url: '/friends' })).statusCode).toBe(401);
    });
  });

  describe('DELETE /friends/:friendId', () => {
    it('removes the relationship for both users and stays idempotent', async () => {
      const ada = await signIn('ada');
      const grace = await signIn('grace');
      const { invite } = (await createInvite(ada.headers)).json();
      await accept(invite.code, grace.headers);

      const remove = () =>
        app.inject({
          method: 'DELETE',
          url: `/friends/${ada.userId}`,
          headers: grace.headers,
        });

      expect((await remove()).statusCode).toBe(204);
      expect((await remove()).statusCode).toBe(204);

      expect((await listFriends(ada.headers)).json()).toEqual({ friends: [] });
      expect((await listFriends(grace.headers)).json()).toEqual({ friends: [] });
    });

    it('rejects a malformed friend id', async () => {
      const ada = await signIn('ada');
      const response = await app.inject({
        method: 'DELETE',
        url: '/friends/not-a-uuid',
        headers: ada.headers,
      });
      expect(response.statusCode).toBe(400);
    });
  });
});
