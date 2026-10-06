import fp from 'fastify-plugin';
import { z } from 'zod';

import { createGroupsRepository, ensurePairGroup } from '../groups/repository.js';
import { createPairTreeSettlement } from '../groups/settlement.js';
import { createTransactionsRepository } from '../transactions/repository.js';

import { createFriendsRepository } from './repository.js';
import {
  createFriendInviteHandler,
  createFriendsService,
  FriendRemovalError,
  type FriendsService,
  type PairGroups,
} from './service.js';

declare module 'fastify' {
  interface FastifyInstance {
    friends: FriendsService;
  }
}

const friendParamsSchema = z.object({ friendId: z.uuid() });

export const friendsPlugin = fp(
  async (app) => {
    const repository = createFriendsRepository(app.db);
    const ledger = createTransactionsRepository(app.db);
    const groupsRepository = createGroupsRepository(app.db);
    // A friend list is a list of balances as much as a list of people, so it
    // reads the ledger `transactions` owns — the same way `groups` reads
    // `friendships` directly. A repository, not the transactions service:
    // nothing here goes through a group's membership checks, because the
    // aggregate is already scoped to transactions the caller is party to.
    const friends = createFriendsService({
      repository,
      invites: app.invites,
      ledger,
      pairTrees: createPairTreeSettlement(groupsRepository, ledger),
    });

    // Materialising the pair group is a repository-level concern (it already
    // knows how to do this idempotently, under a race), not a reason to
    // depend on the whole `groups` service.
    const pairGroups: PairGroups = { ensure: ensurePairGroup };

    app.decorate('friends', friends);
    app.invites.register('friend', createFriendInviteHandler(repository, pairGroups));

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
        try {
          await friends.removeFriend(request.userId!, params.data.friendId);
        } catch (error) {
          if (error instanceof FriendRemovalError) {
            app.log.info({ userId: request.userId, reason: error.reason }, 'friends.remove.refused');
            return reply.code(409).send({ error: error.reason });
          }
          throw error;
        }
        // Destructive beyond the relationship: the pair's group goes with it.
        app.log.info({ userId: request.userId }, 'friends.removed');
        return reply.code(204).send();
      },
    );
  },
  { name: 'friends', dependencies: ['db', 'auth', 'invites'] },
);
