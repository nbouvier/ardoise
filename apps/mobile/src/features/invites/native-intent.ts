import { parseInviteUrl } from './pending-invite';

/**
 * Rewrites the URL the system opens the app with, before expo-router turns it into
 * a route (`src/app/+native-intent.tsx`). An invitation link — `ardoise://invite/<code>`
 * or `https://<API host>/i/<code>` (App Links) — is not a screen: `InviteLinkHandler`
 * captures its code, and the app opens where it would anyway instead of on
 * "Unmatched route". Any other URL is routed as it is.
 *
 * Synchronous on purpose: expo-router calls it without awaiting for the URL the app
 * was launched with.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return parseInviteUrl(path) ? '/' : path;
}
