import {
  addGroupMembersRequestSchema,
  createGroupRequestSchema,
  updateGroupRequestSchema,
} from '@splitcount/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { GroupAccessError, type GroupAccessReason } from './membership.js';
import { createGroupsRepository } from './repository.js';
import {
  createGroupInviteHandler,
  createGroupsService,
  type GroupsService,
} from './service.js';

declare module 'fastify' {
  interface FastifyInstance {
    groups: GroupsService;
  }
}

export interface GroupsPluginOptions {
  /** Override the clock (tests). */
  now?: (() => Date) | undefined;
}

const groupParamsSchema = z.object({ groupId: z.uuid() });
const memberParamsSchema = groupParamsSchema.extend({ userId: z.uuid() });
const friendParamsSchema = z.object({ friendId: z.uuid() });

/**
 * HTTP mapping of a refused group operation. `not_found` is deliberately what a
 * non-member gets: a `403` would confirm that the group exists.
 */
const accessFailures: Record<GroupAccessReason, { status: number; error: string }> = {
  not_found: { status: 404, error: 'group_not_found' },
  not_owner: { status: 403, error: 'not_group_owner' },
  pair_immutable: { status: 409, error: 'pair_group_immutable' },
  archived: { status: 409, error: 'group_archived' },
  owner_cannot_leave: { status: 409, error: 'owner_cannot_leave' },
  cannot_remove_owner: { status: 409, error: 'cannot_remove_owner' },
  not_friends: { status: 400, error: 'not_friends' },
};

export const groupsPlugin = fp<GroupsPluginOptions>(
  async (app, opts) => {
    const repository = createGroupsRepository(app.db);
    const groups = createGroupsService({
      repository,
      invites: app.invites,
      now: opts.now,
    });

    app.decorate('groups', groups);
    app.invites.register('group', createGroupInviteHandler(repository));

    /**
     * Turn a refusal into its HTTP answer. Refusals are logged with their
     * reason: a spike means either a bug or someone probing.
     */
    function replyRefused(
      reply: FastifyReply,
      error: unknown,
      userId: string | undefined,
    ): FastifyReply {
      if (!(error instanceof GroupAccessError)) {
        throw error;
      }
      const { status, error: code } = accessFailures[error.reason];
      app.log.info({ userId, reason: error.reason }, 'groups.access.refused');
      return reply.code(status).send({ error: code });
    }

    /**
     * Every group route shares the same shape: validate the params, act, and
     * translate a refusal. Factored so no route can forget the translation and
     * leak a 500 — or, worse, answer a non-member with a 403.
     */
    function route<Params>(
      schema: z.ZodType<Params>,
      handler: (args: {
        params: Params;
        userId: string;
        reply: FastifyReply;
        body: unknown;
      }) => Promise<unknown>,
    ) {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        const params = schema.safeParse(request.params);
        if (!params.success) {
          return reply.code(404).send({ error: 'group_not_found' });
        }
        try {
          return await handler({
            params: params.data,
            userId: request.userId!,
            reply,
            body: request.body,
          });
        } catch (error) {
          return replyRefused(reply, error, request.userId);
        }
      };
    }

    const authenticated = { preHandler: app.authenticate };

    app.get('/groups', authenticated, async (request, reply) =>
      reply.send({ groups: await groups.list(request.userId!) }),
    );

    app.post('/groups', authenticated, async (request, reply) => {
      const parsed = createGroupRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_request' });
      }
      try {
        const group = await groups.create(request.userId!, parsed.data);
        app.log.info(
          { userId: request.userId, groupId: group.id, memberCount: group.memberCount },
          'groups.created',
        );
        return reply.code(201).send({ group });
      } catch (error) {
        return replyRefused(reply, error, request.userId);
      }
    });

    app.get(
      '/groups/:groupId',
      authenticated,
      route(groupParamsSchema, async ({ params, userId, reply }) =>
        reply.send({ group: await groups.get(userId, params.groupId) }),
      ),
    );

    app.patch(
      '/groups/:groupId',
      authenticated,
      route(groupParamsSchema, async ({ params, userId, reply, body }) => {
        const parsed = updateGroupRequestSchema.safeParse(body);
        if (!parsed.success) {
          return reply.code(400).send({ error: 'invalid_request' });
        }
        const group = await groups.update(userId, params.groupId, parsed.data);
        if (parsed.data.archived !== undefined) {
          app.log.info(
            { userId, groupId: group.id, archived: parsed.data.archived },
            'groups.archive.changed',
          );
        }
        return reply.send({ group });
      }),
    );

    app.delete(
      '/groups/:groupId',
      authenticated,
      route(groupParamsSchema, async ({ params, userId, reply }) => {
        await groups.remove(userId, params.groupId);
        app.log.info({ userId, groupId: params.groupId }, 'groups.deleted');
        return reply.code(204).send();
      }),
    );

    app.post(
      '/groups/:groupId/members',
      authenticated,
      route(groupParamsSchema, async ({ params, userId, reply, body }) => {
        const parsed = addGroupMembersRequestSchema.safeParse(body);
        if (!parsed.success) {
          return reply.code(400).send({ error: 'invalid_request' });
        }
        const group = await groups.addMembers(userId, params.groupId, parsed.data.memberIds);
        app.log.info(
          { userId, groupId: group.id, added: parsed.data.memberIds.length },
          'groups.members.added',
        );
        return reply.send({ group });
      }),
    );

    app.delete(
      '/groups/:groupId/members/:userId',
      authenticated,
      route(memberParamsSchema, async ({ params, userId, reply }) => {
        const { groupDeleted } = await groups.removeMember(
          userId,
          params.groupId,
          params.userId,
        );
        app.log.info(
          {
            userId,
            groupId: params.groupId,
            left: params.userId === userId,
            groupDeleted,
          },
          'groups.members.removed',
        );
        return reply.code(204).send();
      }),
    );

    app.post(
      '/groups/:groupId/invite',
      authenticated,
      route(groupParamsSchema, async ({ params, userId, reply }) =>
        reply.send({ invite: await groups.getOrCreateInvite(userId, params.groupId) }),
      ),
    );

    app.post(
      '/groups/:groupId/invite/rotate',
      authenticated,
      route(groupParamsSchema, async ({ params, userId, reply }) => {
        const invite = await groups.rotateInvite(userId, params.groupId);
        app.log.info({ userId, groupId: params.groupId }, 'groups.invite.rotated');
        return reply.send({ invite });
      }),
    );

    app.delete(
      '/groups/:groupId/invite',
      authenticated,
      route(groupParamsSchema, async ({ params, userId, reply }) => {
        await groups.revokeInvite(userId, params.groupId);
        app.log.info({ userId, groupId: params.groupId }, 'groups.invite.revoked');
        return reply.code(204).send();
      }),
    );

    // Get-or-create, like `POST /friends/invite`: as far as the user is
    // concerned the group they share with a friend has always existed, so the
    // first access materialises it.
    app.post(
      '/groups/pair/:friendId',
      authenticated,
      route(friendParamsSchema, async ({ params, userId, reply }) =>
        reply.send({ group: await groups.getPairGroup(userId, params.friendId) }),
      ),
    );
  },
  { name: 'groups', dependencies: ['db', 'auth', 'invites'] },
);
