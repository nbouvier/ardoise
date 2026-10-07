import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { emailCodes, users } from '../../db/schema.js';
import { createTestContext, type TestContext } from '../../test/app.js';
import { createPasswordAccount } from '../../test/auth.js';
import { fakeGoogleVerifier } from '../../test/google.js';
import { memoryMailer, type MemoryMailer } from '../../test/mail.js';

const google = fakeGoogleVerifier({
  grace: { sub: 'google-grace', email: 'grace@example.com', name: 'Grace Hopper' },
});

const PASSWORD = 'correct horse battery';

describe('sign-up with an e-mail code', () => {
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
    mailer.failing = false;
    // Past every per-address window of the previous test.
    clock += 24 * 60 * 60 * 1000;
  });

  const signup = (
    body: { name?: string; email: string; password?: string },
    headers: Record<string, string> = {},
  ) =>
    context.app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { name: 'Ada', password: PASSWORD, ...body },
      headers,
    });

  const verify = (email: string, code: string) =>
    context.app.inject({ method: 'POST', url: '/auth/signup/verify', payload: { email, code } });

  const signIn = (email: string, password: string) =>
    context.app.inject({ method: 'POST', url: '/auth/password', payload: { email, password } });

  /** A code that is not the one sent, for wrong-code cases. */
  const otherThan = (code: string) => (code === '000000' ? '000001' : '000000');

  describe('for a new address', () => {
    it('e-mails a code that creates the account and signs in', async () => {
      const response = await signup({ name: '  Ada  ', email: 'Ada@Example.com' });

      expect(response.statusCode).toBe(202);
      expect(response.body).toBe('');
      const [message] = mailer.to('ada@example.com');
      expect(message?.subject).toMatch(/^Your Ardoise code: \d{6}$/);

      const verified = await verify('ada@example.com', mailer.lastCode('ada@example.com'));

      expect(verified.statusCode).toBe(200);
      expect(verified.json()).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: { email: 'ada@example.com', name: 'Ada', picture: null, hasPassword: true },
      });
      expect((await signIn('ada@example.com', PASSWORD)).statusCode).toBe(200);
    });

    it('creates nothing until the code is entered', async () => {
      await signup({ email: 'ada@example.com' });

      expect(await context.app.db.select().from(users)).toHaveLength(0);
      expect((await signIn('ada@example.com', PASSWORD)).statusCode).toBe(401);
    });

    it('puts nothing the requester typed in the e-mail', async () => {
      await signup({ name: 'Visit evil.example now', email: 'ada@example.com' });

      const [message] = mailer.to('ada@example.com');
      expect(message?.text).not.toContain('evil');
      expect(message?.html).not.toContain('evil');
    });

    it('writes the e-mail in the language the client asks for', async () => {
      await signup({ email: 'ada@example.com' }, { 'accept-language': 'fr-FR,fr;q=0.9' });

      expect(mailer.to('ada@example.com')[0]?.subject).toMatch(/^Votre code Ardoise : \d{6}$/);
    });
  });

  describe('for an address that has an account', () => {
    it('answers exactly as for a new address, and e-mails a note instead of a code', async () => {
      await createPasswordAccount(context.app, { email: 'ada@example.com', password: PASSWORD });

      const known = await signup({ email: 'ada@example.com', password: 'another password' });
      const unknown = await signup({ email: 'bob@example.com', password: 'another password' });

      expect(known.statusCode).toBe(unknown.statusCode);
      expect(known.body).toBe(unknown.body);
      const [message] = mailer.to('ada@example.com');
      expect(message?.subject).toBe('Your Ardoise account');
      expect(message?.text).not.toMatch(/\d{6}/);
      expect((await verify('ada@example.com', '123456')).statusCode).toBe(401);
      // The password stays the one it was.
      expect((await signIn('ada@example.com', PASSWORD)).statusCode).toBe(200);
      expect((await signIn('ada@example.com', 'another password')).statusCode).toBe(401);
    });

    it('adds the password to a Google-only account, keeping its name', async () => {
      const grace = (
        await context.app.inject({
          method: 'POST',
          url: '/auth/google',
          payload: { idToken: 'grace' },
        })
      ).json().user;

      await signup({ name: 'Somebody Else', email: 'grace@example.com' });
      expect(mailer.to('grace@example.com')[0]?.text).toContain('add a password');
      const verified = await verify('grace@example.com', mailer.lastCode('grace@example.com'));

      expect(verified.statusCode).toBe(200);
      expect(verified.json().user).toMatchObject({
        id: grace.id,
        name: 'Grace Hopper',
        hasPassword: true,
      });
      expect(await context.app.db.select().from(users)).toHaveLength(1);
      expect((await signIn('grace@example.com', PASSWORD)).json().user.id).toBe(grace.id);
    });

    it('refuses the code if the account got a password since it was sent', async () => {
      const graceId = (
        await context.app.inject({
          method: 'POST',
          url: '/auth/google',
          payload: { idToken: 'grace' },
        })
      ).json().user.id;
      await signup({ email: 'grace@example.com' });
      const code = mailer.lastCode('grace@example.com');
      await context.app.db
        .update(users)
        .set({ passwordHash: 'scrypt$set$elsewhere$x$y$z' })
        .where(eq(users.id, graceId));

      const response = await verify('grace@example.com', code);

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ error: 'invalid_code' });
    });

    it('drops the pending code with the account when it is deleted', async () => {
      const session = (
        await context.app.inject({
          method: 'POST',
          url: '/auth/google',
          payload: { idToken: 'grace' },
        })
      ).json();
      await signup({ email: 'grace@example.com' });
      expect(await context.app.db.select().from(emailCodes)).toHaveLength(1);

      await context.app.inject({
        method: 'DELETE',
        url: '/me',
        headers: { authorization: `Bearer ${session.accessToken}` },
      });

      expect(await context.app.db.select().from(emailCodes)).toHaveLength(0);
    });
  });

  describe('the code', () => {
    it('is refused when wrong, without telling why', async () => {
      await signup({ email: 'ada@example.com' });
      const code = mailer.lastCode('ada@example.com');

      const wrong = await verify('ada@example.com', otherThan(code));
      const neverAsked = await verify('bob@example.com', code);

      for (const response of [wrong, neverAsked]) {
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ error: 'invalid_code' });
      }
    });

    it('expires after 15 minutes', async () => {
      await signup({ email: 'ada@example.com' });
      const code = mailer.lastCode('ada@example.com');

      clock += 15 * 60 * 1000;

      expect((await verify('ada@example.com', code)).statusCode).toBe(401);
    });

    it('works once', async () => {
      await signup({ email: 'ada@example.com' });
      const code = mailer.lastCode('ada@example.com');

      expect((await verify('ada@example.com', code)).statusCode).toBe(200);
      expect((await verify('ada@example.com', code)).statusCode).toBe(401);
    });

    it('dies after 5 wrong attempts, even if the 6th is right', async () => {
      await signup({ email: 'ada@example.com' });
      const code = mailer.lastCode('ada@example.com');

      for (let i = 0; i < 5; i += 1) {
        expect((await verify('ada@example.com', otherThan(code))).statusCode).toBe(401);
      }

      expect((await verify('ada@example.com', code)).statusCode).toBe(401);
    });

    it('is replaced by asking again', async () => {
      await signup({ email: 'ada@example.com' });
      const first = mailer.lastCode('ada@example.com');
      await signup({ email: 'ada@example.com', name: 'Ada L.' });
      const second = mailer.lastCode('ada@example.com');

      if (first !== second) {
        expect((await verify('ada@example.com', first)).statusCode).toBe(401);
      }
      const verified = await verify('ada@example.com', second);
      expect(verified.json().user.name).toBe('Ada L.');
    });
  });

  describe('limits', () => {
    it('refuses a 6th request in an hour for an address, account or not', async () => {
      await createPasswordAccount(context.app, { email: 'ada@example.com', password: PASSWORD });

      for (const email of ['ada@example.com', 'bob@example.com']) {
        for (let i = 0; i < 5; i += 1) {
          expect((await signup({ email })).statusCode).toBe(202);
        }
        const refused = await signup({ email });
        expect(refused.statusCode).toBe(429);
        expect(refused.json()).toEqual({ error: 'rate_limited' });
      }

      clock += 60 * 60 * 1000;
      expect((await signup({ email: 'bob@example.com' })).statusCode).toBe(202);
    });

    it('refuses a short or overlong password, or a blank name, before sending anything', async () => {
      const responses = [
        await signup({ email: 'ada@example.com', password: '1234567' }),
        await signup({ email: 'ada@example.com', password: 'x'.repeat(129) }),
        await signup({ email: 'ada@example.com', name: '   ' }),
        await signup({ email: 'not-an-address' }),
      ];

      for (const response of responses) {
        expect(response.statusCode).toBe(400);
      }
      expect(mailer.sent).toHaveLength(0);
    });
  });

  it('answers the same when the e-mail cannot be sent', async () => {
    mailer.failing = true;

    const response = await signup({ email: 'ada@example.com' });

    expect(response.statusCode).toBe(202);
  });
});

describe('sign-up logs', () => {
  it('report a failed e-mail, and never carry the address, the password or the code', async () => {
    const lines: string[] = [];
    const mailer = memoryMailer();
    const context = await createTestContext({
      auth: { mailer },
      log: { level: 'info', stream: { write: (line) => lines.push(line) } },
    });
    try {
      const send = (url: string, payload: object) =>
        context.app.inject({ method: 'POST', url, payload });

      await send('/auth/signup', { name: 'Ada', email: 'ada@example.com', password: PASSWORD });
      const code = mailer.lastCode('ada@example.com');
      await send('/auth/signup/verify', { email: 'ada@example.com', code: '999999' });
      await send('/auth/signup/verify', { email: 'ada@example.com', code });
      mailer.failing = true;
      await send('/auth/signup', { name: 'Bob', email: 'bob@example.com', password: PASSWORD });
      // The failure is reported once the transport answers, after the response.
      await new Promise((resolve) => setImmediate(resolve));

      const events = lines.map((line) => JSON.parse(line) as { msg: string; purpose?: string });
      expect(events).toContainEqual(
        expect.objectContaining({ msg: 'auth.mail.sent', purpose: 'signup' }),
      );
      expect(events).toContainEqual(
        expect.objectContaining({ msg: 'auth.mail.failed', purpose: 'signup' }),
      );
      expect(events).toContainEqual(expect.objectContaining({ msg: 'auth.account.created' }));
      // Only text values: six digits may well turn up inside a timestamp.
      const texts: string[] = [];
      const collect = (value: unknown): void => {
        if (typeof value === 'string') texts.push(value);
        else if (value && typeof value === 'object') Object.values(value).forEach(collect);
      };
      events.forEach(collect);
      for (const secret of ['ada@example.com', 'bob@example.com', PASSWORD, code]) {
        expect(texts.filter((text) => text.includes(secret))).toEqual([]);
      }
    } finally {
      await context.app.close();
    }
  });
});
