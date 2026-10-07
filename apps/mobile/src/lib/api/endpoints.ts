import {
  authSessionSchema,
  webAuthSessionSchema,
  type AuthSession,
  type PasswordResetConfirmRequest,
  type SignupRequest,
} from '@ardoise/shared';

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
 * The device's language, so e-mails the server sends in answer (sign-up and
 * reset codes) are in it. A browser says so on its own; React Native does not.
 */
function deviceLanguage(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

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
  const authCall = options.path.startsWith('/auth/');
  const language = authCall ? deviceLanguage() : undefined;
  if (language) {
    headers['accept-language'] = language;
  }
  // On the web, auth calls say so and carry the cookie the refresh token is in.
  const webAuthCall = REFRESH_TOKEN_IN_COOKIE && authCall;
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

/** POST to an unauthenticated `/auth/*` route; throws `ApiError` unless 2xx. */
async function postAuth(baseUrl: string, path: string, body: unknown): Promise<Response> {
  const response = await apiRequest(baseUrl, { method: 'POST', path, body });
  await expectOk(response);
  return response;
}

export async function signInWithPassword(
  baseUrl: string,
  email: string,
  password: string,
): Promise<ClientSession> {
  const response = await postAuth(baseUrl, '/auth/password', { email, password });
  return parseSession(await response.json());
}

/** Ask for a sign-up code. The answer is the same whether the address has an account. */
export async function requestSignup(baseUrl: string, request: SignupRequest): Promise<void> {
  await postAuth(baseUrl, '/auth/signup', request);
}

export async function verifySignup(
  baseUrl: string,
  email: string,
  code: string,
): Promise<ClientSession> {
  const response = await postAuth(baseUrl, '/auth/signup/verify', { email, code });
  return parseSession(await response.json());
}

/** Ask for a password-reset code. The answer is the same whether the address has an account. */
export async function requestPasswordReset(baseUrl: string, email: string): Promise<void> {
  await postAuth(baseUrl, '/auth/password-reset', { email });
}

export async function confirmPasswordReset(
  baseUrl: string,
  request: PasswordResetConfirmRequest,
): Promise<ClientSession> {
  const response = await postAuth(baseUrl, '/auth/password-reset/confirm', request);
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
