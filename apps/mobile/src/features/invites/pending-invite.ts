import { inviteCodeSchema } from '@ardoise/shared';

/**
 * The invitation code the app was opened with, held outside React so it
 * survives the sign-in screen: someone who follows a link without an account
 * signs in (or signs up) first, and the invitation is picked up right after.
 *
 * A manually typed code feeds the same store, so both entry points lead to the
 * same confirmation screen.
 */

/** The app's own URL scheme. Must match `scheme` in `app.json`. */
const APP_SCHEME = 'splitcount';
/** Path of the invitation landing page served by the API. */
const LANDING_PREFIX = '/i/';

/**
 * Extract an invitation code from a deep link or a landing-page URL, or return
 * null when the URL is about something else.
 *
 * Recognised: `splitcount://invite/<code>` and `https://<host>/i/<code>`.
 */
export function parseInviteUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  const withoutQuery = url.split(/[?#]/)[0]!;
  const schemeMatch = withoutQuery.match(
    new RegExp(`^${APP_SCHEME}://(?:.*?/)?invite/([^/]+)/?$`, 'i'),
  );
  const candidate =
    schemeMatch?.[1] ??
    (withoutQuery.includes(LANDING_PREFIX)
      ? withoutQuery.slice(withoutQuery.lastIndexOf(LANDING_PREFIX) + LANDING_PREFIX.length)
      : null);

  if (!candidate) {
    return null;
  }

  const parsed = inviteCodeSchema.safeParse(decodeURIComponent(candidate.replace(/\/$/, '')));
  return parsed.success ? parsed.data : null;
}

let pendingCode: string | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export const pendingInvite = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): string | null {
    return pendingCode;
  },

  /** Remember a code. A malformed one is ignored rather than surfaced. */
  set(code: string | null): void {
    const next = code ? (inviteCodeSchema.safeParse(code.trim()).data ?? null) : null;
    if (next === pendingCode) {
      return;
    }
    pendingCode = next;
    notify();
  },

  clear(): void {
    pendingInvite.set(null);
  },
};
