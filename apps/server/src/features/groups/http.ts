import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';

import { GroupAccessError, type GroupAccessReason } from './membership.js';

/**
 * HTTP mapping of a refused group operation. `not_found` is deliberately what
 * a non-member gets: a `403` would confirm that the group exists. The one
 * exception is `join_required` — a member of a group's immediate parent who
 * has not joined it already knows the group exists, since it is shown to
 * them in the parent's own sub-group list (`docs/specs/groups.md`).
 */
const groupAccessFailures: Record<GroupAccessReason, { status: number; error: string }> = {
  not_found: { status: 404, error: 'group_not_found' },
  join_required: { status: 403, error: 'join_required' },
  not_owner: { status: 403, error: 'not_group_owner' },
  pair_immutable: { status: 409, error: 'pair_group_immutable' },
  archived: { status: 409, error: 'group_archived' },
  owner_cannot_leave: { status: 409, error: 'owner_cannot_leave' },
  cannot_remove_owner: { status: 409, error: 'cannot_remove_owner' },
  not_friends: { status: 400, error: 'not_friends' },
  max_depth_reached: { status: 409, error: 'max_depth_reached' },
  // The caller is a member here, so a placeholder's existence is no secret:
  // gone means claimed or removed by someone else.
  placeholder_not_found: { status: 404, error: 'placeholder_not_found' },
  placeholder_name_taken: { status: 409, error: 'placeholder_name_taken' },
  already_claimed: { status: 409, error: 'already_claimed' },
  balance_not_settled: { status: 409, error: 'balance_not_settled' },
};

export interface GroupAccessFailure {
  status: number;
  error: string;
  reason: GroupAccessReason;
}

/**
 * Translate a `GroupAccessError` into its HTTP answer, or `undefined` when
 * `error` isn't one — shared by the `groups` plugin and every other feature
 * that resolves group membership through `GroupsService` (transactions, so
 * far) and needs to answer a refusal the same way.
 */
export function translateGroupAccessError(error: unknown): GroupAccessFailure | undefined {
  if (!(error instanceof GroupAccessError)) {
    return undefined;
  }
  return { ...groupAccessFailures[error.reason], reason: error.reason };
}

/** A feature's own refusal, answered like a group one and logged as `event`. */
export interface FeatureFailure {
  status: number;
  error: string;
  reason: string;
  event: string;
}

export interface GroupRouteArgs<Params> {
  params: Params;
  userId: string;
  reply: FastifyReply;
  body: unknown;
  query: unknown;
}

/**
 * What every group-scoped route shares: validate the params, act, and
 * translate a refusal — group ones always, and the feature's own through
 * `translateOwn`. Factored so no route can forget the translation and leak a
 * 500 — or, worse, answer a non-member with a 403. Refusals are logged with
 * their reason: a spike means either a bug or someone probing.
 */
export function createGroupRoutes(
  log: FastifyBaseLogger,
  translateOwn: (error: unknown) => FeatureFailure | undefined = () => undefined,
) {
  function replyRefused(
    reply: FastifyReply,
    error: unknown,
    context: { userId: string | undefined; groupId?: string },
  ): FastifyReply {
    const groupFailure = translateGroupAccessError(error);
    const failure = groupFailure
      ? { ...groupFailure, event: 'groups.access.refused' }
      : translateOwn(error);
    if (!failure) {
      throw error;
    }
    log.info({ ...context, reason: failure.reason }, failure.event);
    return reply.code(failure.status).send({ error: failure.error });
  }

  function route<Params extends { groupId: string }>(
    schema: z.ZodType<Params>,
    handler: (args: GroupRouteArgs<Params>) => Promise<unknown>,
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
        return replyRefused(reply, error, {
          userId: request.userId,
          groupId: params.data.groupId,
        });
      }
    };
  }

  return { route, replyRefused };
}
