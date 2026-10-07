import { authSessionSchema, webAuthSessionSchema, type AuthSession } from '@ardoise/shared';

import { REFRESH_TOKEN_IN_COOKIE } from './auth-transport';
import { ApiError, expectOk, NetworkError, readErrorCode } from './errors';

/**
 * A session as the app holds it. `refreshToken` is `null` on the web, where it
 * lives in an `HttpOnly` cookie the app never sees (`docs/specs/authentication.md`).
 */
export type ClientSession = Omit<AuthSession, 'refreshToken'> & { refreshToken: string | null };

/** Read a session response, whichever way this platform receives the refresh token. */
export function parseSession(body: unknown): ClientSession {
  return REFRESH_TOKEN_IN_COOKIE
    ? { ...webAuthSessionSchema.parse(body), refreshToken: null }
    : authSessionSchema.parse(body);
}

const JSON_HEADERS = { 'content-type': 'application/json' } as const;

interface RequestOptions {
  method: string;
  path: string;
  body?: unknown;
  accessToken?: string | null;
}

/**
 * How long a request may wait for the server's answer before it counts as
 * unreachable. Without it, a request to a server that accepted the connection
 * but never answers (a stuck proxy, a dead mobile link) hangs forever, and so
 * does whatever spinner waits on it.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Low-level fetch: maps a failed connection, or no answer within
 * `REQUEST_TIMEOUT_MS`, to `NetworkError`; never throws on 4xx/5xx.
 */
export async function apiRequest(baseUrl: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    Object.assign(headers, JSON_HEADERS);
  }
  if (options.accessToken) {
    headers.authorization = `Bearer ${options.accessToken}`;
  }
  // On the web, auth calls say so and carry the cookie the refresh token is in.
  const webAuthCall = REFRESH_TOKEN_IN_COOKIE && options.path.startsWith('/auth/');
  if (webAuthCall) {
    headers['x-ardoise-client'] = 'web';
  }

  // `AbortSignal.timeout` is not available on every React Native runtime.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${baseUrl}${options.path}`, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      ...(webAuthCall ? { credentials: 'include' as const } : {}),
      signal: controller.signal,
    });
  } catch (error) {
    throw new NetworkError(error);
  } finally {
    clearTimeout(timer);
  }
}

export async function authenticateWithGoogle(
  baseUrl: string,
  idToken: string,
): Promise<ClientSession> {
  const response = await apiRequest(baseUrl, {
    method: 'POST',
    path: '/auth/google',
    body: { idToken },
  });
  await expectOk(response);
  return parseSession(await response.json());
}

/** Rotate the session: with the token on native, with the cookie on the web (`null`). */
export async function refreshSession(
  baseUrl: string,
  refreshToken: string | null,
): Promise<ClientSession> {
  const response = await apiRequest(baseUrl, {
    method: 'POST',
    path: '/auth/refresh',
    body: refreshToken === null ? undefined : { refreshToken },
  });
  await expectOk(response);
  return parseSession(await response.json());
}

export async function revokeSession(baseUrl: string, refreshToken: string | null): Promise<void> {
  const response = await apiRequest(baseUrl, {
    method: 'POST',
    path: '/auth/logout',
    body: refreshToken === null ? undefined : { refreshToken },
  });
  // A logout that races an expiry is still a successful logout.
  if (!response.ok && response.status !== 401) {
    throw new ApiError(response.status, await readErrorCode(response));
  }
}
