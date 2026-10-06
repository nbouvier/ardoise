import {
  createTransactionRequestSchema,
  groupStatisticsQuerySchema,
  recentTransactionsQuerySchema,
  transactionsPageQuerySchema,
  updateTransactionRequestSchema,
  DEFAULT_RECENT_TRANSACTIONS,
} from '@ardoise/shared';
import fp from 'fastify-plugin';
import { z } from 'zod';

import { parseRequest } from '../../http/validation.js';
import { createGroupRoutes } from '../groups/http.js';
import { createUsersRepository } from '../users/repository.js';

import { TransactionError, type TransactionErrorReason } from './errors.js';
import { createTransactionsRepository, type TransactionCursor } from './repository.js';
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
 * A page's `nextCursor` as the client carries it: opaque, the base64url of
 * the position the next page starts after. One that does not decode is
 * refused rather than read as "from the start", which would repeat rows.
 */
function encodeCursor({ occurredOn, createdAt, id }: TransactionCursor): string {
  return Buffer.from(`${occurredOn}|${createdAt}|${id}`).toString('base64url');
}

const cursorSchema = z
  .string()
  .transform((value) => Buffer.from(value, 'base64url').toString('utf8').split('|'))
  .pipe(z.tuple([z.iso.date(), z.iso.datetime(), z.uuid()]))
  .transform(([occurredOn, createdAt, id]): TransactionCursor => ({ occurredOn, createdAt, id }));

const pageQuerySchema = transactionsPageQuerySchema.extend({ cursor: cursorSchema.optional() });

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

    // Group refusals are shared with `groups`' own mapping, so a non-member or
    // an archived group refuses a transaction route exactly the way it
    // refuses any other.
    const { route } = createGroupRoutes(app.log, (error) =>
      error instanceof TransactionError
        ? {
            ...transactionFailures[error.reason],
            reason: error.reason,
            event: 'transactions.access.refused',
          }
        : undefined,
    );

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
        const { limit, cursor } = parseRequest(pageQuerySchema, query ?? {});
        const page = await transactions.list(userId, params.groupId, { limit, after: cursor });
        return reply.send({
          transactions: page.transactions,
          nextCursor: page.next ? encodeCursor(page.next) : null,
        });
      }),
    );

    app.get(
      '/groups/:groupId/statistics',
      authenticated,
      route(groupParamsSchema, async ({ params, userId, reply, query }) =>
        reply.send(
          await transactions.statistics(
            userId,
            params.groupId,
            parseRequest(groupStatisticsQuerySchema, query ?? {}),
          ),
        ),
      ),
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
        const input = parseRequest(createTransactionRequestSchema, body);
        const transaction = await transactions.create(userId, params.groupId, input);
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
        const transaction = await transactions.update(
          userId,
          params.groupId,
          params.transactionId,
          parseRequest(updateTransactionRequestSchema, body),
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
