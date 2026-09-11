import type { FastifyInstance } from 'fastify';

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
