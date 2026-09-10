import { inviteCodeSchema } from '@splitcount/shared';
import type { FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { InviteError, type InviteErrorReason } from './invites.js';
import { createFriendsRepository } from './repository.js';
import { createFriendsService, type FriendsService } from './service.js';

declare module 'fastify' {
  interface FastifyInstance {
    friends: FriendsService;
  }
}

export interface FriendsPluginOptions {
  /** Override the invitation lifetime (tests). */
  inviteTtlSeconds?: number | undefined;
  /** Override the clock (tests). */
  now?: (() => Date) | undefined;
  /** Override the base URL invitation links are built from (tests). */
  publicBaseUrl?: string | undefined;
}

const codeParamsSchema = z.object({ code: inviteCodeSchema });
const friendParamsSchema = z.object({ friendId: z.uuid() });

/** HTTP mapping of an unusable invitation. `410` says "this link is dead", not "wrong". */
const inviteFailures: Record<InviteErrorReason, { status: number; error: string }> = {
  not_found: { status: 404, error: 'invite_not_found' },
  expired: { status: 410, error: 'invite_expired' },
  revoked: { status: 410, error: 'invite_revoked' },
  self_invite: { status: 409, error: 'self_invite' },
};

function replyInviteError(reply: FastifyReply, error: InviteError): FastifyReply {
  const { status, error: code } = inviteFailures[error.reason];
  return reply.code(status).send({ error: code });
}

export const friendsPlugin = fp<FriendsPluginOptions>(
  async (app, opts) => {
    const repository = createFriendsRepository(app.db);
    const friends = createFriendsService({
      repository,
      ttlSeconds: opts.inviteTtlSeconds,
      publicBaseUrl: opts.publicBaseUrl,
      now: opts.now,
    });

    app.decorate('friends', friends);

    app.post('/friends/invite', { preHandler: app.authenticate }, async (request, reply) => {
      const invite = await friends.getOrCreateInvite(request.userId!);
      return reply.send({ invite });
    });

    app.post(
      '/friends/invite/rotate',
      { preHandler: app.authenticate },
      async (request, reply) => {
        const invite = await friends.rotateInvite(request.userId!);
        app.log.info({ userId: request.userId }, 'friends.invite.rotated');
        return reply.send({ invite });
      },
    );

    app.delete('/friends/invite', { preHandler: app.authenticate }, async (request, reply) => {
      await friends.revokeInvite(request.userId!);
      app.log.info({ userId: request.userId }, 'friends.invite.revoked');
      return reply.code(204).send();
    });

    // Unauthenticated on purpose: the recipient must see who is inviting them
    // before deciding to sign in. Exposes name and avatar only.
    app.get('/friends/invites/:code', async (request, reply) => {
      const params = codeParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(404).send({ error: 'invite_not_found' });
      }
      try {
        const inviter = await friends.previewInvite(params.data.code);
        return reply.send({ inviter });
      } catch (error) {
        if (error instanceof InviteError) {
          return replyInviteError(reply, error);
        }
        throw error;
      }
    });

    app.post(
      '/friends/invites/:code/accept',
      { preHandler: app.authenticate },
      async (request, reply) => {
        const params = codeParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(404).send({ error: 'invite_not_found' });
        }
        try {
          const { friend, alreadyFriends, inviterId } = await friends.acceptInvite(
            params.data.code,
            request.userId!,
          );
          if (!alreadyFriends) {
            app.log.info(
              { userId: request.userId, inviterId },
              'friends.invite.accepted',
            );
          }
          return reply.send({ friend, alreadyFriends });
        } catch (error) {
          if (error instanceof InviteError) {
            app.log.info(
              { userId: request.userId, reason: error.reason },
              'friends.invite.rejected',
            );
            return replyInviteError(reply, error);
          }
          throw error;
        }
      },
    );

    app.get('/friends', { preHandler: app.authenticate }, async (request, reply) => {
      const list = await friends.listFriends(request.userId!);
      return reply.send({ friends: list });
    });

    app.delete(
      '/friends/:friendId',
      { preHandler: app.authenticate },
      async (request, reply) => {
        const params = friendParamsSchema.safeParse(request.params);
        if (!params.success) {
          return reply.code(400).send({ error: 'invalid_request' });
        }
        await friends.removeFriend(request.userId!, params.data.friendId);
        app.log.info({ userId: request.userId }, 'friends.removed');
        return reply.code(204).send();
      },
    );
  },
  { name: 'friends', dependencies: ['db', 'auth'] },
);
