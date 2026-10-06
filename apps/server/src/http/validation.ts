import type { z } from 'zod';

/**
 * A request whose body or parameters do not match their schema. Carries a
 * `400`, so the error handler answers `{ "error": "invalid_request" }` and
 * logs it as a rejected request (`registerErrorHandler`).
 */
export class InvalidRequestError extends Error {
  readonly statusCode = 400;
  readonly code = 'invalid_request';

  constructor() {
    super('Invalid request');
    this.name = 'InvalidRequestError';
  }
}

/**
 * `value` parsed by `schema`, or an {@link InvalidRequestError}. Called inside
 * a handler rather than declared as a route schema: Fastify validates route
 * schemas before `preHandler` hooks, so an unauthenticated request would be
 * told its body is wrong before being told to sign in.
 */
export function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidRequestError();
  }
  return parsed.data;
}
