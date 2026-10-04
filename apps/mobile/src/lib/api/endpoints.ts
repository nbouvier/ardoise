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

/** Low-level fetch: maps a failed connection to `NetworkError`, never throws on 4xx/5xx. */
export async function apiRequest(baseUrl: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    Object.assign(headers, JSON_HEADERS);
  }
  if (options.accessToken) {
    headers.authorization = `Bearer ${options.accessToken}`;
  }

  try {
    return await fetch(`${baseUrl}${options.path}`, {
      method: options.method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    throw new NetworkError(error);
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
