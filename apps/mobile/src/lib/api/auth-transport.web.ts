/**
 * On the web the refresh token is an `HttpOnly` cookie: the page's scripts,
 * this app's included, never see it (`docs/specs/authentication.md`).
 */
export const REFRESH_TOKEN_IN_COOKIE: boolean = true;
