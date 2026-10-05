/**
 * The few HTML pages this API serves — the invitation landing
 * (`features/invites/landing.ts`), the account-deletion page
 * (`features/account/page.ts`) and the legal pages (`features/legal/`) — share
 * one shell: a single self-contained document, so they stay fast and
 * dependency-free, and a Content-Security-Policy pinned to their own inline
 * blocks.
 */

import { createHash } from 'node:crypto';

import type { FastifyReply } from 'fastify';

import type { Language } from './language.js';

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
  /* A page that is mostly text reads better left-aligned and a little wider. */
  main:has(.prose) { max-width: 560px; text-align: left; }
  .prose h2 { font-size: 16px; margin: 24px 0 8px; }
  .prose ul { margin: 0 0 16px; padding-left: 20px; color: #687076; }
  .prose li { margin-bottom: 8px; }
  .prose a { color: #11181c; }
  footer {
    margin-top: 32px; padding-top: 16px; border-top: 1px solid #e6e8eb;
    font-size: 13px;
  }
  footer p { margin: 0 0 8px; }
  footer a { color: inherit; }
  @media (prefers-color-scheme: dark) {
    body { background: #151718; color: #ecedee; }
    .primary { background: #ecedee; color: #151718; }
    .code { background: #202425; color: #ecedee; }
    .stores a { color: #ecedee; }
    .prose a { color: #ecedee; }
    footer { border-top-color: #2b2f31; }
  }
`;

export interface PageOptions {
  /** The document's language. Default: English. */
  lang?: Language | undefined;
  /** Markup closing the page, after its body (`legalFooter`). */
  footer?: string | undefined;
}

/** A complete, self-contained document: no assets, no template engine. */
export function page(
  title: string,
  body: string,
  { lang = 'en', footer = '' }: PageOptions = {},
): string {
  return `<!doctype html>
<html lang="${lang}">
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
${footer}
</main>
</body>
</html>`;
}

/** The public pages each legal page links to, in the footer's order. */
const LEGAL_LINKS: readonly { path: string; label: Record<Language, string> }[] = [
  { path: '/privacy', label: { fr: 'Politique de confidentialité', en: 'Privacy policy' } },
  { path: '/terms', label: { fr: 'Conditions d’utilisation', en: 'Terms of use' } },
  { path: '/legal', label: { fr: 'Mentions légales', en: 'Legal notice' } },
  { path: '/delete-account', label: { fr: 'Supprimer son compte', en: 'Delete your account' } },
];

/** A calendar day (`YYYY-MM-DD`) written out: "5 octobre 2026" / "5 October 2026". */
export function formatDay(day: string, lang: Language): string {
  return new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

/**
 * The footer of the legal pages and of the deletion page
 * (`docs/specs/legal-pages.md`): links to the four pages in the same
 * language, when this page last changed, and this page in the other language.
 */
export function legalFooter(path: string, lang: Language, updatedOn: string): string {
  const other: Language = lang === 'fr' ? 'en' : 'fr';
  const links = LEGAL_LINKS.map(
    (link) => `<a href="${link.path}?lang=${lang}">${escapeHtml(link.label[lang])}</a>`,
  ).join(' · ');
  const updated =
    lang === 'fr'
      ? `Dernière mise à jour&nbsp;: ${formatDay(updatedOn, lang)}`
      : `Last updated: ${formatDay(updatedOn, lang)}`;
  const switchLabel = other === 'fr' ? 'Version française' : 'English version';
  return `<footer>
<p>${links}</p>
<p>${updated} · <a href="${path}?lang=${other}" hreflang="${other}" lang="${other}">${switchLabel}</a></p>
</footer>`;
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

/**
 * Send one of the bilingual public pages: its own Content-Security-Policy, and
 * `Vary: Accept-Language`, since without `?lang` the browser's language picks it.
 */
export function sendLocalizedPage(reply: FastifyReply, html: string): FastifyReply {
  return reply
    .type('text/html; charset=utf-8')
    .header('content-security-policy', contentSecurityPolicyFor(html))
    .header('vary', 'Accept-Language')
    .send(html);
}
