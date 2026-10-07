import {
  addGroupMembersRequestSchema,
  createGroupRequestSchema,
  renamePlaceholderRequestSchema,
  updateGroupRequestSchema,
} from '@ardoise/shared';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { parseRequest } from '../../http/validation.js';
import { createTransactionsRepository } from '../transactions/repository.js';

import { createGroupRoutes } from './http.js';
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
const placeholderParamsSchema = groupParamsSchema.extend({ placeholderId: z.uuid() });

export const groupsPlugin = fp<GroupsPluginOptions>(
  async (app, opts) => {
    const repository = createGroupsRepository(app.db);
    // A group's balance is a client of the ledger `transactions`
    // owns — the same way `friends` reads it for the per-friend total. A
    // repository, not the transactions *service*: nothing here goes through
    // a group's own membership checks, and `groups` must not depend on the
    // `transactions` plugin, which itself depends on `groups`.
    const ledger = createTransactionsRepository(app.db);
    const groups = createGroupsService({
      repository,
      invites: app.invites,
      ledger,
      now: opts.now,
    });

    app.decorate('groups', groups);
    app.invites.register('group', createGroupInviteHandler(repository, ledger));

    const { route, replyRefused } = createGroupRoutes(app.log);

    const authenticated = { preHandler: app.authenticate };

    app.get('/groups', authenticated, async (request, reply) =>
      reply.send({ groups: await groups.list(request.userId!) }),
    );

    // Declared before `/groups/:groupId` reads: a static segment always wins
    // over a parametric one in Fastify's router, but the order here says so
    // to the reader too.
    app.get('/groups/favorites', authenticated, async (request, reply) =>
      reply.send({ groups: await groups.listFavorites(request.userId!) }),
    );

    app.post('/groups', authenticated, async (request, reply) => {
      const input = parseRequest(createGroupRequestSchema, request.body);
      try {
        const group = await groups.create(request.userId!, input);
        app.log.info(
          {
            userId: request.userId,
            groupId: group.id,
            memberCount: group.memberCount,
            placeholdersCreated: input.placeholderNames?.length ?? 0,
            parentId: group.parentId,
          },
          'groups.created',
        );
        return reply.code(201).send({ group });
      } catch (error) {
        return replyRefused(reply, error, { userId: request.userId });
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
        const input = parseRequest(updateGroupRequestSchema, body);
        const group = await groups.update(userId, params.groupId, input);
        if (input.archived !== undefined) {
          app.log.info(
            { userId, groupId: group.id, archived: input.archived },
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
        const input = parseRequest(addGroupMembersRequestSchema, body);
        const group = await groups.addMembers(userId, params.groupId, input);
        app.log.info(
          {
            userId,
            groupId: group.id,
            added: input.memberIds?.length ?? 0,
            placeholdersCreated: input.placeholderNames?.length ?? 0,
          },
          'groups.members.added',
        );
        return reply.send({ group });
      }),
    );

    // Placeholder members (`docs/specs/placeholder-members.md`). Their names
    // are personal data typed by members: logged by id only.
    app.get(
      '/groups/:groupId/placeholders',
      authenticated,
      route(groupParamsSchema, async ({ params, userId, reply }) =>
        reply.send(await groups.listPlaceholders(userId, params.groupId)),
      ),
    );

    app.patch(
      '/groups/:groupId/placeholders/:placeholderId',
      authenticated,
      route(placeholderParamsSchema, async ({ params, userId, reply, body }) => {
        const { name } = parseRequest(renamePlaceholderRequestSchema, body);
        const group = await groups.renamePlaceholder(
          userId,
          params.groupId,
          params.placeholderId,
          name,
        );
        app.log.info(
          { userId, groupId: params.groupId, placeholderId: params.placeholderId },
          'groups.placeholder.renamed',
        );
        return reply.send({ group });
      }),
    );

    app.post(
      '/groups/:groupId/placeholders/:placeholderId/claim',
      authenticated,
      route(placeholderParamsSchema, async ({ params, userId, reply }) => {
        const { group, claimed } = await groups.claimPlaceholder(
          userId,
          params.groupId,
          params.placeholderId,
        );
        app.log.info(
          { userId, groupId: params.groupId, placeholderId: params.placeholderId, ...claimed },
          'groups.placeholder.claimed',
        );
        return reply.send({ group });
      }),
    );

    app.delete(
      '/groups/:groupId/members/:userId',
      authenticated,
      route(memberParamsSchema, async ({ params, userId, reply }) => {
        const { groupDeleted, removedFromDescendantCount, placeholderRemoved } =
          await groups.removeMember(userId, params.groupId, params.userId);
        if (placeholderRemoved) {
          app.log.info(
            {
              userId,
              groupId: params.groupId,
              placeholderId: params.userId,
              transactionsAnonymised: placeholderRemoved.transactionsRewritten,
              transfersDeleted: placeholderRemoved.transfersDeleted,
            },
            'groups.placeholder.removed',
          );
          return reply.code(204).send();
        }
        app.log.info(
          {
            userId,
            groupId: params.groupId,
            left: params.userId === userId,
            groupDeleted,
            removedFromDescendantCount,
          },
          'groups.members.removed',
        );
        return reply.code(204).send();
      }),
    );

    // Personal to the caller, independent of the group's own archived state
    // (`docs/specs/favorites.md`). Idempotent: setting an already-favorited
    // group favorite again, or clearing one that isn't, changes nothing.
    app.put(
      '/groups/:groupId/favorite',
      authenticated,
      route(groupParamsSchema, async ({ params, userId, reply }) => {
        const group = await groups.setFavorite(userId, params.groupId, true);
        app.log.info({ userId, groupId: group.id, favorite: true }, 'groups.favorite.changed');
        return reply.send({ group });
      }),
    );

    app.delete(
      '/groups/:groupId/favorite',
      authenticated,
      route(groupParamsSchema, async ({ params, userId, reply }) => {
        const group = await groups.setFavorite(userId, params.groupId, false);
        app.log.info({ userId, groupId: group.id, favorite: false }, 'groups.favorite.changed');
        return reply.send({ group });
      }),
    );

    // A sub-group visible in a group the caller already belongs to; lighter
    // than an invitation link (no friendship check, docs/specs/groups.md).
    app.post(
      '/groups/:groupId/join',
      authenticated,
      route(groupParamsSchema, async ({ params, userId, reply }) => {
        const group = await groups.join(userId, params.groupId);
        app.log.info({ userId, groupId: group.id }, 'groups.joined');
        return reply.send({ group });
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
  },
  { name: 'groups', dependencies: ['db', 'auth', 'invites'] },
);
