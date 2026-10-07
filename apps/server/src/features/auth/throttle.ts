/**
 * Counts attempts per key (an e-mail address) in fixed windows, refusing the
 * key once it reaches `limit` within `windowMs`. It complements the
 * per-client-address rate limit (`http/rate-limit.ts`), which a guesser
 * spreading over many addresses gets past: this one follows the target.
 *
 * Counts live in this process's memory, like the rate limit's: with several
 * instances each enforces it on its own. An expired window is forgotten the
 * next time the map is swept, so the map holds only recent keys.
 */
export class AttemptThrottle {
  private readonly windows = new Map<string, { count: number; resetsAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Seconds until `key` may try again; `0` when it may now. */
  retryAfterSeconds(key: string): number {
    const window = this.windows.get(key);
    const at = this.now();
    if (!window || window.resetsAt <= at || window.count < this.limit) {
      return 0;
    }
    return Math.ceil((window.resetsAt - at) / 1000);
  }

  /** Count one attempt for `key`. */
  record(key: string): void {
    const at = this.now();
    const window = this.windows.get(key);
    if (window && window.resetsAt > at) {
      window.count += 1;
      return;
    }
    if (this.windows.size >= 10_000) {
      this.sweep(at);
    }
    this.windows.set(key, { count: 1, resetsAt: at + this.windowMs });
  }

  private sweep(at: number): void {
    for (const [key, window] of this.windows) {
      if (window.resetsAt <= at) {
        this.windows.delete(key);
      }
    }
  }
}

/** Raised when an address has used up its attempts for now. */
export class ThrottledError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`Too many attempts, retry in ${retryAfterSeconds}s`);
    this.name = 'ThrottledError';
  }
}
