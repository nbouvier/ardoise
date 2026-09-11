import { expectOk } from './errors';

/**
 * A request signed with the current session, refreshing transparently on 401.
 * `AuthClient.authorizedFetch` implements it; tests pass a fake.
 */
export type AuthorizedFetch = (
  path: string,
  init?: { method?: string; body?: unknown },
) => Promise<Response>;

/** Throw on a non-2xx response, then validate the body against the contract. */
export async function parsedJson<T>(
  response: Response,
  schema: { parse: (value: unknown) => T },
): Promise<T> {
  await expectOk(response);
  return schema.parse(await response.json());
}

/** A call whose success is the status code alone. */
export async function expectNoContent(response: Response): Promise<void> {
  await expectOk(response);
}
