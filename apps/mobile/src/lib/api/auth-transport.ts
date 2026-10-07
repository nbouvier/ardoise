/**
 * Whether this platform's refresh token travels in an `HttpOnly` cookie
 * (`docs/specs/authentication.md`). Not on native: there it travels in the
 * body and lives in the OS secure store. The web build swaps in
 * `auth-transport.web.ts`.
 */
export const REFRESH_TOKEN_IN_COOKIE: boolean = false;
