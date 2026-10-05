import fp from 'fastify-plugin';

import { env } from '../../config/env.js';
import { sendLocalizedPage } from '../../http/html.js';
import { pickLanguage, type Language } from '../../http/language.js';

import { legalIdentityFromEnv, type LegalIdentity } from './identity.js';
import { renderLegalNotice } from './notice.js';
import { renderPrivacyPolicy } from './privacy.js';
import { renderTerms } from './terms.js';

export interface LegalPluginOptions {
  /** Override who publishes and hosts the service (tests). Default: from the environment. */
  identity?: LegalIdentity | undefined;
}

const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * The public legal pages (`docs/specs/legal-pages.md`): privacy policy, terms
 * of use and legal notice, each in French and English. Static apart from the
 * configuration, so each is rendered once per language.
 */
export const legalPlugin = fp<LegalPluginOptions>(
  async (app, opts) => {
    const identity = opts.identity ?? legalIdentityFromEnv();
    const sessionDays = Math.round(env.AUTH_REFRESH_TTL_SECONDS / SECONDS_PER_DAY);

    const routes: Record<string, (lang: Language) => string> = {
      '/privacy': (lang) => renderPrivacyPolicy(identity, { sessionDays }, lang),
      '/terms': (lang) => renderTerms(identity, lang),
      '/legal': (lang) => renderLegalNotice(identity, lang),
    };

    for (const [path, render] of Object.entries(routes)) {
      const pages: Record<Language, string> = { fr: render('fr'), en: render('en') };
      app.get(path, async (request, reply) => {
        const { lang } = request.query as { lang?: unknown };
        return sendLocalizedPage(reply, pages[pickLanguage(lang, request.headers['accept-language'])]);
      });
    }
  },
  { name: 'legal' },
);
