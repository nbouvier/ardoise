import {
  createTransactionRequestSchema,
  recentTransactionsQuerySchema,
  transactionsListScopeSchema,
  updateTransactionRequestSchema,
  DEFAULT_RECENT_TRANSACTIONS,
} from '@ardoise/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { translateGroupAccessError } from '../groups/http.js';
import { createUsersRepository } from '../users/repository.js';

import { TransactionError, type TransactionErrorReason } from './errors.js';
import { createTransactionsRepository } from './repository.js';
import { createTransactionsService, type TransactionsService } from './service.js';

declare module 'fastify' {
  interface FastifyInstance {
    transactions: TransactionsService;
  }
}

export interface TransactionsPluginOptions {
  /** Override the clock (tests). */
  now?: (() => Date) | undefined;
}

const groupParamsSchema = z.object({ groupId: z.uuid() });
const transactionParamsSchema = groupParamsSchema.extend({ transactionId: z.uuid() });

/**
 * `subgroupIds` on `GET .../transactions?scope=subtree` — comma-separated
 * uuids naming which direct sub-groups' branches to include, or the empty
 * string for none. Malformed input is dropped, the same tolerance `scope`
 * itself gets: it narrows the answer, it never changes its shape.
 */
const subgroupIdsQuerySchema = z
  .string()
  .transform((value) => (value.length === 0 ? [] : value.split(',')))
  .pipe(z.array(z.uuid()));

/**
 * HTTP mapping of a refused transaction operation, once the caller's group
 * membership has already been confirmed (that refusal is a `GroupAccessError`
 * — `group_not_found` / `group_archived` — translated the same way `groups`
 * translates its own).
 */
const transactionFailures: Record<TransactionErrorReason, { status: number; error: string }> = {
  not_found: { status: 404, error: 'transaction_not_found' },
  not_group_member: { status: 400, error: 'not_group_member' },
  invalid_split: { status: 400, error: 'invalid_split' },
};

export const transactionsPlugin = fp<TransactionsPluginOptions>(
  async (app, opts) => {
    const transactions = createTransactionsService({
      repository: createTransactionsRepository(app.db),
      groups: app.groups,
      users: createUsersRepository(app.db),
      now: opts.now,
    });

    app.decorate('transactions', transactions);

    /**
     * Turn a refusal into its HTTP answer. Shared with `groups`' own mapping
     * for the membership/archived cases, so a non-member or an archived group
     * refuses a transaction route exactly the way it refuses any other.
     */
    function replyRefused(
      reply: FastifyReply,
      error: unknown,
      userId: string | undefined,
      groupId: string,
    ): FastifyReply {
      const groupFailure = translateGroupAccessError(error);
      if (groupFailure) {
        app.log.info(
          { userId, groupId, reason: groupFailure.reason },
          'groups.access.refused',
        );
        return reply.code(groupFailure.status).send({ error: groupFailure.error });
      }
      if (error instanceof TransactionError) {
        const { status, error: code } = transactionFailures[error.reason];
        app.log.info(
          { userId, groupId, reason: error.reason },
          'transactions.access.refused',
        );
        return reply.code(status).send({ error: code });
      }
      throw error;
    }

    function route<Params extends { groupId: string }>(
      schema: z.ZodType<Params>,
      handler: (args: {
        params: Params;
        userId: string;
        reply: FastifyReply;
        body: unknown;
        query: unknown;
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
            query: request.query,
          });
        } catch (error) {
          return replyRefused(reply, error, request.userId, params.data.groupId);
        }
      };
    }

    const authenticated = { preHandler: app.authenticate };

    /**
     * The caller's own recent transactions, across every group they belong
     * to (`docs/specs/home.md`) — the one route here that is not scoped to a
     * group, hence outside `route()` above and its group-shaped refusals.
     * An unusable `limit` falls back to the default rather than failing: as
     * with `scope` below, it changes how much comes back, not what.
     */
    app.get('/me/transactions', authenticated, async (request, reply) => {
      const query = recentTransactionsQuerySchema.safeParse(request.query ?? {});
      const limit = query.success ? query.data.limit : DEFAULT_RECENT_TRANSACTIONS;
      return reply.send({ transactions: await transactions.recent(request.userId!, limit) });
    });

    app.get(
      '/groups/:groupId/transactions',
      authenticated,
      route(groupParamsSchema, async ({ params, userId, reply, query }) => {
        // An unrecognised scope falls back to the default rather than a 400
        // — nothing about it changes the shape of the answer, only its
        // completeness, so failing softly is kinder than failing loudly.
        const rawQuery = query as Record<string, unknown> | undefined;
        const scope = transactionsListScopeSchema.safeParse(rawQuery?.scope);
        const subgroupIds = subgroupIdsQuerySchema.safeParse(rawQuery?.subgroupIds);
        return reply.send(
          await transactions.list(
            userId,
            params.groupId,
            scope.success ? scope.data : undefined,
            subgroupIds.success ? subgroupIds.data : undefined,
          ),
        );
      }),
    );

    app.get(
      '/groups/:groupId/transactions/balances',
      authenticated,
      route(groupParamsSchema, async ({ params, userId, reply }) =>
        reply.send({ balances: await transactions.balances(userId, params.groupId) }),
      ),
    );

    app.post(
      '/groups/:groupId/transactions',
      authenticated,
      route(groupParamsSchema, async ({ params, userId, reply, body }) => {
        const parsed = createTransactionRequestSchema.safeParse(body);
        if (!parsed.success) {
          return reply.code(400).send({ error: 'invalid_request' });
        }
        const transaction = await transactions.create(userId, params.groupId, parsed.data);
        app.log.info(
          {
            userId,
            groupId: params.groupId,
            transactionId: transaction.id,
            kind: transaction.kind,
            splitMode: transaction.splitMode,
            participantCount: transaction.participants.length,
          },
          'transactions.created',
        );
        return reply.code(201).send({ transaction });
      }),
    );

    app.get(
      '/groups/:groupId/transactions/:transactionId',
      authenticated,
      route(transactionParamsSchema, async ({ params, userId, reply }) =>
        reply.send({
          transaction: await transactions.get(userId, params.groupId, params.transactionId),
        }),
      ),
    );

    app.patch(
      '/groups/:groupId/transactions/:transactionId',
      authenticated,
      route(transactionParamsSchema, async ({ params, userId, reply, body }) => {
        const parsed = updateTransactionRequestSchema.safeParse(body);
        if (!parsed.success) {
          return reply.code(400).send({ error: 'invalid_request' });
        }
        const transaction = await transactions.update(
          userId,
          params.groupId,
          params.transactionId,
          parsed.data,
        );
        app.log.info(
          { userId, groupId: params.groupId, transactionId: transaction.id },
          'transactions.updated',
        );
        return reply.send({ transaction });
      }),
    );

    app.delete(
      '/groups/:groupId/transactions/:transactionId',
      authenticated,
      route(transactionParamsSchema, async ({ params, userId, reply }) => {
        await transactions.remove(userId, params.groupId, params.transactionId);
        app.log.info(
          { userId, groupId: params.groupId, transactionId: params.transactionId },
          'transactions.deleted',
        );
        return reply.code(204).send();
      }),
    );
  },
  { name: 'transactions', dependencies: ['db', 'auth', 'groups'] },
);
