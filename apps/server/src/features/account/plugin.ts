import fp from 'fastify-plugin';

import { env } from '../../config/env.js';
import { contentSecurityPolicyFor } from '../../http/html.js';
import { createTransactionsRepository } from '../transactions/repository.js';

import { renderDeletionPage } from './page.js';
import { createAccountRepository } from './repository.js';
import { createAccountService } from './service.js';

export interface AccountPluginOptions {
  /** Override the contact address shown on the deletion page (tests). */
  deletionContact?: string | undefined;
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
    const deletionPage = renderDeletionPage({
      contact: 'deletionContact' in opts ? opts.deletionContact : env.ACCOUNT_DELETION_CONTACT,
    });

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
    app.get('/delete-account', async (_request, reply) => {
      return reply
        .type('text/html; charset=utf-8')
        .header('content-security-policy', contentSecurityPolicyFor(deletionPage))
        .send(deletionPage);
    });
  },
  { name: 'account', dependencies: ['db', 'auth'] },
);
