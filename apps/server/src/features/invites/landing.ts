/**
 * The public page an invitation link points to. One of the two HTML pages
 * this API serves (with the account-deletion page); everything else is JSON.
 * The page shell, escaping and policy are shared: `http/html.ts`.
 *
 * One page serves every kind of invitation, because the link format and the
 * code space are shared — only the headline changes.
 *
 * Until the app ships to stores, the code shown on the page is the fallback for
 * "the app is not installed yet": there is no deferred deep linking, so the
 * recipient installs the app and types the code in.
 */

import type { InvitePreview } from '@ardoise/shared';

import { escapeHtml, page } from '../../http/html.js';

/** The mobile app's URL scheme. Must match `scheme` in `apps/mobile/app.json`. */
export const APP_SCHEME = 'ardoise';

export interface LandingLinks {
  appStoreUrl?: string | undefined;
  playStoreUrl?: string | undefined;
}

export interface ValidLandingInput extends LandingLinks {
  preview: InvitePreview;
  code: string;
  /**
   * Set when the page is opened on Android and the deployment names its app: the
   * app's id, and this page's own URL to come back to when it is not installed.
   */
  android?: { appId: string; pageUrl: string } | undefined;
}

/**
 * Where "Open in Ardoise" leads. On Android, an intent naming the app: only Ardoise
 * can receive the code, and Chrome comes back to this page when it is not installed.
 * Elsewhere the `ardoise://` scheme, which any app on the device may have claimed.
 */
function appLink(code: string, android: ValidLandingInput['android']): string {
  if (!android) {
    return `${APP_SCHEME}://invite/${code}`;
  }
  return (
    `intent://invite/${code}#Intent;scheme=${APP_SCHEME};package=${android.appId};` +
    `S.browser_fallback_url=${encodeURIComponent(android.pageUrl)};end`
  );
}

function storeLinks(links: LandingLinks): string {
  const entries = [
    links.appStoreUrl ? `<a href="${escapeHtml(links.appStoreUrl)}">App Store</a>` : '',
    links.playStoreUrl ? `<a href="${escapeHtml(links.playStoreUrl)}">Google Play</a>` : '',
  ].filter(Boolean);

  if (entries.length === 0) {
    return `<p>Ardoise is not on the app stores yet.</p>`;
  }
  return `<p>Don’t have the app?</p><div class="stores">${entries.join('')}</div>`;
}

/** What the invitation leads to, in plain words. Raw text — escaped by callers. */
export function describeInvite(preview: InvitePreview): { headline: string; blurb: string } {
  if (preview.kind === 'group') {
    return {
      headline: `${preview.inviter.name} invited you to “${preview.group.name}”`,
      blurb: 'Join the group and share expenses with everyone in it.',
    };
  }
  return {
    headline: `${preview.inviter.name} invited you to Ardoise`,
    blurb: 'Share expenses with the people you split with.',
  };
}

/** The page shown for a usable invitation. */
export function renderInvitePage(input: ValidLandingInput): string {
  const { headline, blurb } = describeInvite(input.preview);
  const code = escapeHtml(input.code);
  const deepLink = appLink(input.code, input.android);

  // Elsewhere, try the app straight away; the button stays as the fallback when the
  // scheme is not registered. Not on Android: with the app installed and its links
  // verified, this page is never shown, and the intent's way back when the app is
  // missing is this very page — opening it on load would loop.
  const autoOpen = input.android
    ? ''
    : `
<script>
  setTimeout(function () { window.location.href = ${JSON.stringify(deepLink)}; }, 100);
</script>`;

  return page(
    headline,
    `<h1>${escapeHtml(headline)}</h1>
<p>${escapeHtml(blurb)}</p>
<a class="primary" href="${escapeHtml(deepLink)}">Open in Ardoise</a>
<p>Already installed the app? Enter this invitation code:</p>
<code class="code">${code}</code>
${storeLinks(input)}${autoOpen}`,
  );
}

/** The page shown for an unknown, expired or revoked code. */
export function renderExpiredPage(links: LandingLinks): string {
  return page(
    'This invitation link is no longer valid',
    `<h1>This invitation link is no longer valid</h1>
<p>It may have expired or been replaced. Ask the person who invited you for a new link.</p>
${storeLinks(links)}`,
  );
}
