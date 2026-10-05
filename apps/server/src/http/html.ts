/**
 * The few HTML pages this API serves — the invitation landing
 * (`features/invites/landing.ts`) and the account-deletion page
 * (`features/account/page.ts`) — share one shell: a single self-contained
 * document, so they stay fast and dependency-free, and a Content-Security-Policy
 * pinned to their own inline blocks.
 */

import { createHash } from 'node:crypto';

/**
 * Escape text interpolated into HTML. An inviter's name (from their Google
 * profile), a group's name (typed by a user) and any configured value are
 * never to be trusted as markup.
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

/** A complete, self-contained document: no assets, no template engine. */
export function page(title: string, body: string): string {
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
