import fp from 'fastify-plugin';

import { env } from '../../config/env.js';
import { sendLocalizedPage } from '../../http/html.js';
import { pickLanguage } from '../../http/language.js';
import { createTransactionsRepository } from '../transactions/repository.js';

import { renderDeletionPage } from './page.js';
import { createAccountRepository } from './repository.js';
import { createAccountService } from './service.js';

export interface AccountPluginOptions {
  /** Override the contact address shown on the deletion page (tests). */
  contact?: string | undefined;
}

/**
 * Account deletion (`docs/specs/account-deletion.md`): the preview the Delete
 * account page shows, the deletion itself, and the public page describing it.
 */
export const accountPlugin = fp<AccountPluginOptions>(
  async (app, opts) => {
    const account = createAccountService({
      repository: createAccountRepository(app.db),
      ledger: createTransactionsRepository(app.db),
    });
    const contact = 'contact' in opts ? opts.contact : env.CONTACT_EMAIL;
    const deletionPages = {
      fr: renderDeletionPage({ contact, lang: 'fr' }),
      en: renderDeletionPage({ contact, lang: 'en' }),
    };

    app.get('/me/deletion-preview', { preHandler: app.authenticate }, async (request, reply) => {
      const preview = await account.deletionPreview(request.userId!);
      return reply.send(preview);
    });

    app.delete('/me', { preHandler: app.authenticate }, async (request, reply) => {
      const userId = request.userId!;
      try {
        const summary = await account.deleteAccount(userId);
        // `null`: deleted between the token check and here, by a concurrent
        // request. Either way the account is gone, which is what was asked.
        app.log.info({ userId, ...summary }, 'account.deleted');
      } catch (error) {
        app.log.error({ userId }, 'account.delete.failed');
        throw error;
      }
      return reply.code(204).send();
    });

    // Public: Google Play links to it, and it must be readable without the app.
    app.get('/delete-account', async (request, reply) => {
      const { lang } = request.query as { lang?: unknown };
      return sendLocalizedPage(
        reply,
        deletionPages[pickLanguage(lang, request.headers['accept-language'])],
      );
    });
  },
  { name: 'account', dependencies: ['db', 'auth'] },
);
