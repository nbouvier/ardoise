import type { FastifyInstance } from 'fastify';

import { users } from '../db/schema.js';
import { createPasswordHasher, type ScryptCost } from '../features/auth/passwords.js';

/** A scrypt cost a test can afford many times over; the default is for real passwords. */
export const TEST_SCRYPT_COST: ScryptCost = { N: 2 ** 10, r: 8, p: 1 };

export interface TestUser {
  userId: string;
  name: string;
  headers: { authorization: string };
}

/**
 * Sign a fake Google identity in and return what a test needs to act as them.
 * The token is one of the keys given to `fakeGoogleVerifier`.
 */
export async function signInAs(app: FastifyInstance, idToken: string): Promise<TestUser> {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/google',
    payload: { idToken },
  });
  const body = response.json();
  return {
    userId: body.user.id as string,
    name: body.user.name as string,
    headers: { authorization: `Bearer ${body.accessToken}` },
  };
}

/**
 * Put an account with a password straight into the database, as signing up
 * would leave it, for tests about what comes after.
 */
export async function createPasswordAccount(
  app: FastifyInstance,
  account: { email: string; password: string; name?: string },
): Promise<string> {
  const passwordHash = await createPasswordHasher(TEST_SCRYPT_COST).hash(account.password);
  const [row] = await app.db
    .insert(users)
    .values({ email: account.email, name: account.name ?? 'Test User', passwordHash })
    .returning({ id: users.id });
  return row!.id;
}
