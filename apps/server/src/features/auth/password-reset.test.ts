import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestContext, type TestContext } from '../../test/app.js';
import { createPasswordAccount } from '../../test/auth.js';
import { fakeGoogleVerifier } from '../../test/google.js';
import { memoryMailer, type MemoryMailer } from '../../test/mail.js';

const google = fakeGoogleVerifier({
  grace: { sub: 'google-grace', email: 'grace@example.com', name: 'Grace Hopper' },
});

const PASSWORD = 'correct horse battery';
const NEW_PASSWORD = 'a brand new password';

describe('forgotten and changed passwords', () => {
  let context: TestContext;
  let mailer: MemoryMailer;
  let clock = 0;

  beforeAll(async () => {
    mailer = memoryMailer();
    context = await createTestContext({
      auth: { googleVerifier: google, mailer, now: () => clock },
    });
  });

  afterAll(async () => {
    await context.app.close();
  });

  beforeEach(async () => {
    await context.reset();
    mailer.sent.length = 0;
    clock += 24 * 60 * 60 * 1000;
  });

  const post = (url: string, payload: object, headers: Record<string, string> = {}) =>
    context.app.inject({ method: 'POST', url, payload, headers });

  const signIn = (email: string, password: string) =>
    post('/auth/password', { email, password });

  const requestReset = (email: string) => post('/auth/password-reset', { email });

  const confirmReset = (email: string, code: string, password = NEW_PASSWORD) =>
    post('/auth/password-reset/confirm', { email, code, password });

  const refresh = (refreshToken: string) => post('/auth/refresh', { refreshToken });

  describe('POST /auth/password-reset', () => {
    it('answers a known and an unknown address alike, and e-mails only the known one', async () => {
      await createPasswordAccount(context.app, { email: 'ada@example.com', password: PASSWORD });

      const known = await requestReset('Ada@example.com');
      const unknown = await requestReset('nobody@example.com');

      expect(known.statusCode).toBe(202);
      expect(unknown.statusCode).toBe(202);
      expect(known.body).toBe(unknown.body);
      expect(mailer.to('ada@example.com')).toHaveLength(1);
      expect(mailer.to('nobody@example.com')).toHaveLength(0);
    });

    it('refuses a 6th request in an hour for an address, account or not', async () => {
      await createPasswordAccount(context.app, { email: 'ada@example.com', password: PASSWORD });

      for (const email of ['ada@example.com', 'nobody@example.com']) {
        for (let i = 0; i < 5; i += 1) {
          expect((await requestReset(email)).statusCode).toBe(202);
        }
        expect((await requestReset(email)).statusCode).toBe(429);
      }
    });
  });

  describe('POST /auth/password-reset/confirm', () => {
    it('sets the new password, signs in, and signs every other device out', async () => {
      await createPasswordAccount(context.app, { email: 'ada@example.com', password: PASSWORD });
      const elsewhere = (await signIn('ada@example.com', PASSWORD)).json();
      await requestReset('ada@example.com');

      const response = await confirmReset('ada@example.com', mailer.lastCode('ada@example.com'));

      expect(response.statusCode).toBe(200);
      expect(response.json().user).toMatchObject({ email: 'ada@example.com', hasPassword: true });
      expect((await signIn('ada@example.com', PASSWORD)).statusCode).toBe(401);
      // The old device waking up first must not take the new session with it.
      expect((await refresh(elsewhere.refreshToken)).statusCode).toBe(401);
      expect((await refresh(response.json().refreshToken)).statusCode).toBe(200);
      expect((await signIn('ada@example.com', NEW_PASSWORD)).statusCode).toBe(200);
    });

    it('adds a password to a Google-only account', async () => {
      const grace = (await post('/auth/google', { idToken: 'grace' })).json().user;
      await requestReset('grace@example.com');

      const response = await confirmReset(
        'grace@example.com',
        mailer.lastCode('grace@example.com'),
      );

      expect(response.json().user).toMatchObject({ id: grace.id, hasPassword: true });
      expect((await signIn('grace@example.com', NEW_PASSWORD)).json().user.id).toBe(grace.id);
    });

    it('refuses a wrong code, a sign-up code, and a weak new password', async () => {
      await createPasswordAccount(context.app, { email: 'ada@example.com', password: PASSWORD });
      await requestReset('ada@example.com');
      const code = mailer.lastCode('ada@example.com');

      const wrong = await confirmReset('ada@example.com', code === '000000' ? '000001' : '000000');
      const weak = await confirmReset('ada@example.com', code, 'short');

      expect(wrong.statusCode).toBe(401);
      expect(wrong.json()).toEqual({ error: 'invalid_code' });
      expect(weak.statusCode).toBe(400);
      expect((await signIn('ada@example.com', PASSWORD)).statusCode).toBe(200);

      // A sign-up code for an address does not reset its password.
      await post('/auth/signup', { name: 'Bob', email: 'bob@example.com', password: PASSWORD });
      const signupCode = mailer.lastCode('bob@example.com');
      expect((await confirmReset('bob@example.com', signupCode)).statusCode).toBe(401);
    });
  });

  describe('POST /auth/password/change', () => {
    async function signedIn() {
      await createPasswordAccount(context.app, { email: 'ada@example.com', password: PASSWORD });
      const session = (await signIn('ada@example.com', PASSWORD)).json();
      return { session, headers: { authorization: `Bearer ${session.accessToken}` } };
    }

    const change = (headers: Record<string, string>, currentPassword: string) =>
      post('/auth/password/change', { currentPassword, newPassword: NEW_PASSWORD }, headers);

    it('changes the password, keeps the caller signed in and signs every other device out', async () => {
      const { headers } = await signedIn();
      const elsewhere = (await signIn('ada@example.com', PASSWORD)).json();

      const response = await change(headers, PASSWORD);

      expect(response.statusCode).toBe(200);
      expect((await refresh(elsewhere.refreshToken)).statusCode).toBe(401);
      expect((await refresh(response.json().refreshToken)).statusCode).toBe(200);
      expect((await signIn('ada@example.com', NEW_PASSWORD)).statusCode).toBe(200);
    });

    it('refuses a wrong current password with 403, not 401', async () => {
      const { headers } = await signedIn();

      const response = await change(headers, 'not the password');

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'invalid_password' });
      expect((await signIn('ada@example.com', PASSWORD)).statusCode).toBe(200);
    });

    it('refuses an account without a password', async () => {
      const session = (await post('/auth/google', { idToken: 'grace' })).json();

      const response = await change({ authorization: `Bearer ${session.accessToken}` }, PASSWORD);

      expect(response.statusCode).toBe(403);
    });

    it('counts wrong current passwords against the sign-in budget of the address', async () => {
      const { headers } = await signedIn();

      for (let i = 0; i < 10; i += 1) {
        expect((await change(headers, 'not the password')).statusCode).toBe(403);
      }

      expect((await change(headers, PASSWORD)).statusCode).toBe(429);
      expect((await signIn('ada@example.com', PASSWORD)).statusCode).toBe(429);
    });

    it('requires a session', async () => {
      expect((await change({}, PASSWORD)).statusCode).toBe(401);
    });
  });
});
