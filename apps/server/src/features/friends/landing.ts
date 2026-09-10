/**
 * The public page an invitation link points to. It is the only HTML this API
 * serves: everything else is JSON. Kept to a single self-contained document
 * (no assets, no template engine) so it stays fast and dependency-free.
 *
 * Until the app ships to stores, the code shown on the page is the fallback for
 * "the app is not installed yet": there is no deferred deep linking, so the
 * recipient installs the app and types the code in.
 */

/** The mobile app's URL scheme. Must match `scheme` in `apps/mobile/app.json`. */
export const APP_SCHEME = 'splitcount';

export interface LandingLinks {
  appStoreUrl?: string | undefined;
  playStoreUrl?: string | undefined;
}

export interface ValidLandingInput extends LandingLinks {
  inviterName: string;
  code: string;
}

/**
 * Escape text interpolated into HTML. The inviter's name comes from their
 * Google profile — it is user-controlled and must never be trusted as markup.
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

/** The page shown for a usable invitation. */
export function renderInvitePage(input: ValidLandingInput): string {
  const name = escapeHtml(input.inviterName);
  const code = escapeHtml(input.code);
  const deepLink = `${APP_SCHEME}://invite/${code}`;

  return page(
    `${input.inviterName} invited you to SplitCount`,
    `<h1>${name} invited you to SplitCount</h1>
<p>Share expenses with the people you split with.</p>
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
