import { inviteCodeSchema } from '@ardoise/shared';
import type { FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { contentSecurityPolicyFor } from '../../http/html.js';
import { createUsersRepository } from '../users/repository.js';

import { assetLinks, isAndroid, type AndroidApp } from './app-links.js';
import { InviteError, type InviteErrorReason } from './codes.js';
import { renderExpiredPage, renderInvitePage, type LandingLinks } from './landing.js';
import { createInvitesRepository } from './repository.js';
import { createInvitesService, type InvitesService } from './service.js';

declare module 'fastify' {
  interface FastifyInstance {
    invites: InvitesService;
  }
}

export interface InvitesPluginOptions {
  /** Override the invitation lifetime (tests). */
  inviteTtlSeconds?: number | undefined;
  /** Override the clock (tests). */
  now?: (() => Date) | undefined;
  /** Override the base URL invitation links are built from (tests). */
  publicBaseUrl?: string | undefined;
  /** Override the store links shown on the landing page (tests). */
  storeLinks?: LandingLinks | undefined;
  /** Override the Android app invitation links open (tests). */
  androidApp?: AndroidApp | undefined;
}

const codeParamsSchema = z.object({ code: inviteCodeSchema });

/**
 * HTTP mapping of an unusable invitation. `410` says "this link is dead", not
 * "you got it wrong": an unknown code and an expired one lead to the same next
 * step, and neither confirms whether the code ever existed.
 */
const inviteFailures: Record<InviteErrorReason, { status: number; error: string }> = {
  not_found: { status: 404, error: 'invite_not_found' },
  expired: { status: 410, error: 'invite_expired' },
  revoked: { status: 410, error: 'invite_revoked' },
  gone: { status: 410, error: 'invite_gone' },
  self_invite: { status: 409, error: 'self_invite' },
};

function replyInviteError(reply: FastifyReply, error: InviteError): FastifyReply {
  const { status, error: code } = inviteFailures[error.reason];
  return reply.code(status).send({ error: code });
}

/**
 * The invitation code space and its public routes. Deliberately ignorant of
 * what an invitation leads to: `friends` and `groups` each register a handler
 * for their own kind (see `InviteHandler`), which is what lets a single link
 * format, landing page and code space serve both.
 */
export const invitesPlugin = fp<InvitesPluginOptions>(
  async (app, opts) => {
    const invites = createInvitesService({
      repository: createInvitesRepository(app.db),
      users: createUsersRepository(app.db),
      ttlSeconds: opts.inviteTtlSeconds,
      publicBaseUrl: opts.publicBaseUrl,
      now: opts.now,
    });

    const storeLinks: LandingLinks = opts.storeLinks ?? {
      appStoreUrl: env.APP_STORE_URL,
      playStoreUrl: env.PLAY_STORE_URL,
    };

    const androidApp: AndroidApp = opts.androidApp ?? {
      appId: env.ANDROID_APP_ID,
      certFingerprints: env.ANDROID_CERT_FINGERPRINTS,
    };
    const publicBaseUrl = opts.publicBaseUrl ?? env.PUBLIC_BASE_URL;

    app.decorate('invites', invites);

    // Android fetches it when the app is installed, to check that this host lets the
    // app open its links (`app-links.ts`). Not registered without an app to vouch for.
    const statements = assetLinks(androidApp);
    if (statements) {
      app.get('/.well-known/assetlinks.json', async (_request, reply) =>
        reply.header('cache-control', 'public, max-age=3600').send(statements),
      );
    }

    // The public page an invitation link points to. HTML, not JSON: it is what
    // the recipient's browser opens before the app is involved.
    app.get('/i/:code', async (request, reply) => {
      const params = codeParamsSchema.safeParse(request.params);
      // The code is a capability: never let a proxy or the browser keep it.
      reply.header('cache-control', 'no-store').type('text/html; charset=utf-8');

      const sendPage = (html: string, status = 200) =>
        reply
          .code(status)
          .header('content-security-policy', contentSecurityPolicyFor(html))
          .send(html);

      if (params.success) {
        try {
          const preview = await invites.preview(params.data.code);
          const android =
            androidApp.appId && isAndroid(request.headers['user-agent'])
              ? {
                  appId: androidApp.appId,
                  pageUrl: `${publicBaseUrl.replace(/\/+$/, '')}/i/${params.data.code}`,
                }
              : undefined;
          return sendPage(
            renderInvitePage({ preview, code: params.data.code, android, ...storeLinks }),
          );
        } catch (error) {
          if (!(error instanceof InviteError)) {
            throw error;
          }
        }
      }

      return sendPage(renderExpiredPage(storeLinks), 404);
    });

    // Unauthenticated on purpose: the recipient must see who is inviting them,
    // and into what, before deciding to sign in.
    app.get('/invites/:code', async (request, reply) => {
      const params = codeParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(404).send({ error: 'invite_not_found' });
      }
      try {
        return reply.send({ invite: await invites.preview(params.data.code) });
      } catch (error) {
        if (error instanceof InviteError) {
          return replyInviteError(reply, error);
        }
        throw error;
      }
    });

    app.post(
      '/invites/:code/accept',
      { preHandler: app.authenticate },
      async (request, reply) => {
        const params = codeParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(404).send({ error: 'invite_not_found' });
        }
        try {
          const result = await invites.accept(params.data.code, request.userId!);
          app.log.info(
            { userId: request.userId, kind: result.kind },
            'invites.accepted',
          );
          return reply.send({ result });
        } catch (error) {
          if (error instanceof InviteError) {
            app.log.info(
              { userId: request.userId, reason: error.reason },
              'invites.rejected',
            );
            return replyInviteError(reply, error);
          }
          throw error;
        }
      },
    );
  },
  { name: 'invites', dependencies: ['db', 'auth'] },
);
