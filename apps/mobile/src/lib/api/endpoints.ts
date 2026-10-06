import {
  authSessionSchema,
  meResponseSchema,
  type AuthSession,
  type MeResponse,
} from '@ardoise/shared';

import { ApiError, expectOk, NetworkError, readErrorCode } from './errors';

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

  // `AbortSignal.timeout` is not available on every React Native runtime.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${baseUrl}${options.path}`, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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
): Promise<AuthSession> {
  const response = await apiRequest(baseUrl, {
    method: 'POST',
    path: '/auth/google',
    body: { idToken },
  });
  await expectOk(response);
  return authSessionSchema.parse(await response.json());
}

export async function refreshSession(
  baseUrl: string,
  refreshToken: string,
): Promise<AuthSession> {
  const response = await apiRequest(baseUrl, {
    method: 'POST',
    path: '/auth/refresh',
    body: { refreshToken },
  });
  await expectOk(response);
  return authSessionSchema.parse(await response.json());
}

export async function revokeSession(baseUrl: string, refreshToken: string): Promise<void> {
  const response = await apiRequest(baseUrl, {
    method: 'POST',
    path: '/auth/logout',
    body: { refreshToken },
  });
  // A logout that races an expiry is still a successful logout.
  if (!response.ok && response.status !== 401) {
    throw new ApiError(response.status, await readErrorCode(response));
  }
}

export async function fetchMe(baseUrl: string, accessToken: string): Promise<MeResponse> {
  const response = await apiRequest(baseUrl, {
    method: 'GET',
    path: '/auth/me',
    accessToken,
  });
  await expectOk(response);
  return meResponseSchema.parse(await response.json());
}
