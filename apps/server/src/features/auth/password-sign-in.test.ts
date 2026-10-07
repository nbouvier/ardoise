import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { users } from '../../db/schema.js';
import { createTestContext, type TestContext } from '../../test/app.js';
import { createPasswordAccount } from '../../test/auth.js';
import { fakeGoogleVerifier } from '../../test/google.js';

const google = fakeGoogleVerifier({
  ada: { sub: 'google-ada', email: 'ada@example.com', name: 'Ada Lovelace' },
  'ada-renamed': { sub: 'google-ada', email: 'bob@example.com', name: 'Ada Lovelace' },
  'other-ada': { sub: 'google-other', email: 'ada@example.com', name: 'Someone Else' },
});

describe('password sign-in', () => {
  let context: TestContext;
  let clock = 0;

  beforeAll(async () => {
    context = await createTestContext({ auth: { googleVerifier: google, now: () => clock } });
  });

  afterAll(async () => {
    await context.app.close();
  });

  beforeEach(async () => {
    await context.reset();
    // Past every per-address window of the previous test.
    clock += 24 * 60 * 60 * 1000;
  });

  const signIn = (email: string, password: string) =>
    context.app.inject({ method: 'POST', url: '/auth/password', payload: { email, password } });

  const googleSignIn = (idToken: string) =>
    context.app.inject({ method: 'POST', url: '/auth/google', payload: { idToken } });

  describe('POST /auth/password', () => {
    it('signs in with the right password, whatever the case of the address', async () => {
      const userId = await createPasswordAccount(context.app, {
        email: 'ada@example.com',
        password: 'correct horse battery',
        name: 'Ada',
      });

      const response = await signIn('  Ada@Example.COM ', 'correct horse battery');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: { id: userId, email: 'ada@example.com', name: 'Ada', hasPassword: true },
      });
    });

    it('answers a wrong password, an unknown address and a Google-only account alike', async () => {
      // A Google-only account, moved to an address of its own.
      await googleSignIn('other-ada');
      await context.app.db
        .update(users)
        .set({ email: 'grace@example.com' })
        .where(eq(users.googleSub, 'google-other'));
      await createPasswordAccount(context.app, {
        email: 'ada@example.com',
        password: 'correct horse battery',
      });

      const wrong = await signIn('ada@example.com', 'wrong horse battery');
      const unknown = await signIn('nobody@example.com', 'correct horse battery');
      const googleOnly = await signIn('grace@example.com', 'correct horse battery');

      for (const response of [wrong, unknown, googleOnly]) {
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ error: 'invalid_credentials' });
      }
    });

    it('refuses an address after 10 failures in 15 minutes, account or not, until the window ends', async () => {
      await createPasswordAccount(context.app, {
        email: 'ada@example.com',
        password: 'correct horse battery',
      });

      for (const email of ['ada@example.com', 'nobody@example.com']) {
        for (let i = 0; i < 10; i += 1) {
          expect((await signIn(email, 'wrong horse battery')).statusCode).toBe(401);
        }
        const blocked = await signIn(email, 'correct horse battery');
        expect(blocked.statusCode).toBe(429);
        expect(blocked.json()).toEqual({ error: 'rate_limited' });
        expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      }

      // Another address is not affected.
      await createPasswordAccount(context.app, {
        email: 'bob@example.com',
        password: 'correct horse battery',
      });
      expect((await signIn('bob@example.com', 'correct horse battery')).statusCode).toBe(200);

      clock += 15 * 60 * 1000;
      expect((await signIn('ada@example.com', 'correct horse battery')).statusCode).toBe(200);
    });

    it('refuses a malformed address before looking anything up', async () => {
      const response = await signIn('not-an-address', 'correct horse battery');
      expect(response.statusCode).toBe(400);
    });
  });

  describe('Google sign-in and password accounts', () => {
    it('links Google to the password account with the same address instead of creating one', async () => {
      const userId = await createPasswordAccount(context.app, {
        email: 'Ada@Example.com',
        password: 'correct horse battery',
        name: 'Ada',
      });

      const response = await googleSignIn('ada');

      expect(response.statusCode).toBe(200);
      expect(response.json().user).toMatchObject({ id: userId, hasPassword: true });
      expect(await context.app.db.select().from(users)).toHaveLength(1);
      // Either way in now reaches the account.
      expect((await signIn('ada@example.com', 'correct horse battery')).json().user.id).toBe(
        userId,
      );
      expect((await googleSignIn('ada')).json().user.id).toBe(userId);
    });

    it('creates a Google account without a password', async () => {
      const response = await googleSignIn('ada');

      expect(response.json().user).toMatchObject({ email: 'ada@example.com', hasPassword: false });
    });

    it('keeps the address of a Google account whose new address another account has', async () => {
      const ada = (await googleSignIn('ada')).json().user;
      await createPasswordAccount(context.app, {
        email: 'bob@example.com',
        password: 'correct horse battery',
      });

      const response = await googleSignIn('ada-renamed');

      expect(response.statusCode).toBe(200);
      expect(response.json().user).toMatchObject({ id: ada.id, email: 'ada@example.com' });
    });

    it('follows a Google account to its new address when it is free', async () => {
      const ada = (await googleSignIn('ada')).json().user;

      const response = await googleSignIn('ada-renamed');

      expect(response.json().user).toMatchObject({ id: ada.id, email: 'bob@example.com' });
    });

    it('refuses a second Google identity for an address whose account has one', async () => {
      await googleSignIn('ada');

      const response = await googleSignIn('other-ada');

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ error: 'account_conflict' });
    });
  });

  describe('the users table', () => {
    it('refuses a second account with the same address in another case', async () => {
      await createPasswordAccount(context.app, {
        email: 'ada@example.com',
        password: 'x'.repeat(8),
      });

      await expect(
        createPasswordAccount(context.app, { email: 'ADA@example.com', password: 'x'.repeat(8) }),
      ).rejects.toThrow();
    });

    it('refuses an account with neither a Google identity nor a password', async () => {
      await expect(
        context.app.db.insert(users).values({ email: 'ada@example.com', name: 'Ada' }),
      ).rejects.toThrow();
    });
  });
});
