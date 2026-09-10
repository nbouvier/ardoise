/** A non-2xx API response. `code` is the server's `error` field when present. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(`API request failed (${status}${code ? ` ${code}` : ''})`);
    this.name = 'ApiError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/** The server's `error` field, when the body carries one. */
export async function readErrorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      return body.error;
    }
  } catch {
    // no / non-JSON body
  }
  return null;
}

/** Throw an `ApiError` carrying the server's error code unless the response is 2xx. */
export async function expectOk(response: Response): Promise<void> {
  if (!response.ok) {
    throw new ApiError(response.status, await readErrorCode(response));
  }
}

/** A request that never reached the server (offline, DNS, timeout). */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Could not reach the server');
    this.name = 'NetworkError';
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
