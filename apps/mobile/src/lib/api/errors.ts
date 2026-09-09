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
