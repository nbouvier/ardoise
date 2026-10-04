/**
 * The public page an invitation link points to. It is the only HTML this API
 * serves: everything else is JSON. Kept to a single self-contained document
 * (no assets, no template engine) so it stays fast and dependency-free.
 *
 * One page serves every kind of invitation, because the link format and the
 * code space are shared — only the headline changes.
 *
 * Until the app ships to stores, the code shown on the page is the fallback for
 * "the app is not installed yet": there is no deferred deep linking, so the
 * recipient installs the app and types the code in.
 */

import { createHash } from 'node:crypto';

import type { InvitePreview } from '@ardoise/shared';

/** The mobile app's URL scheme. Must match `scheme` in `apps/mobile/app.json`. */
export const APP_SCHEME = 'ardoise';

export interface LandingLinks {
  appStoreUrl?: string | undefined;
  playStoreUrl?: string | undefined;
}

export interface ValidLandingInput extends LandingLinks {
  preview: InvitePreview;
  code: string;
}

/**
 * Escape text interpolated into HTML. Both the inviter's name (from their
 * Google profile) and a group's name (typed by a user) are user-controlled and
 * must never be trusted as markup.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STYLES = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center;
    justify-content: center; padding: 24px;
    font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #fff; color: #11181c;
  }
  main { width: 100%; max-width: 420px; text-align: center; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { margin: 0 0 16px; color: #687076; }
  .primary {
    display: block; padding: 16px; border-radius: 12px; text-decoration: none;
    font-weight: 600; background: #11181c; color: #fff; margin-bottom: 24px;
  }
  .code {
    display: block; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 18px; letter-spacing: 1px; word-break: break-all;
    padding: 12px; border-radius: 10px; background: #f1f3f5; color: #11181c;
    margin: 8px 0 24px;
  }
  .stores { display: flex; gap: 12px; justify-content: center; }
  .stores a { color: #11181c; font-size: 14px; }
  @media (prefers-color-scheme: dark) {
    body { background: #151718; color: #ecedee; }
    .primary { background: #ecedee; color: #151718; }
    .code { background: #202425; color: #ecedee; }
    .stores a { color: #ecedee; }
  }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

function storeLinks(links: LandingLinks): string {
  const entries = [
    links.appStoreUrl ? `<a href="${escapeHtml(links.appStoreUrl)}">App Store</a>` : '',
    links.playStoreUrl ? `<a href="${escapeHtml(links.playStoreUrl)}">Google Play</a>` : '',
  ].filter(Boolean);

  if (entries.length === 0) {
    return `<p>SplitCount is not on the app stores yet.</p>`;
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
    headline: `${preview.inviter.name} invited you to SplitCount`,
    blurb: 'Share expenses with the people you split with.',
  };
}

/**
 * The Content-Security-Policy to send with one of these pages: nothing is
 * allowed except the page's own inline `<style>` and `<script>`, pinned by
 * hash, so even markup that slipped past `escapeHtml` could not run a script
 * or load anything. The script varies with the invitation code, hence a hash
 * per response rather than a constant.
 */
export function contentSecurityPolicyFor(html: string): string {
  const hashes = (blocks: RegExp): string =>
    [...html.matchAll(blocks)]
      .map((match) => `'sha256-${createHash('sha256').update(match[1] ?? '').digest('base64')}'`)
      .join(' ');

  const directives = ["default-src 'none'"];
  const style = hashes(/<style>([\s\S]*?)<\/style>/g);
  const script = hashes(/<script>([\s\S]*?)<\/script>/g);
  if (style) {
    directives.push(`style-src ${style}`);
  }
  if (script) {
    directives.push(`script-src ${script}`);
  }
  directives.push("base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'");
  return directives.join('; ');
}

/** The page shown for a usable invitation. */
export function renderInvitePage(input: ValidLandingInput): string {
  const { headline, blurb } = describeInvite(input.preview);
  const code = escapeHtml(input.code);
  const deepLink = `${APP_SCHEME}://invite/${code}`;

  return page(
    headline,
    `<h1>${escapeHtml(headline)}</h1>
<p>${escapeHtml(blurb)}</p>
<a class="primary" href="${deepLink}">Open in SplitCount</a>
<p>Already installed the app? Enter this invitation code:</p>
<code class="code">${code}</code>
${storeLinks(input)}
<script>
  // Try the app straight away; the button above stays as the fallback when the
  // scheme is not registered on this device.
  setTimeout(function () { window.location.href = ${JSON.stringify(deepLink)}; }, 100);
</script>`,
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
