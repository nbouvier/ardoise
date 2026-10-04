import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { reportError } from '../error-reporting.js';

/**
 * Error codes for the failures Fastify itself raises before a route handler
 * runs (malformed JSON, oversized body, wrong content type…), keyed by HTTP
 * status. They follow the API's `{ "error": "<code>" }` convention
 * (`docs/API.md`); anything not listed is a plain `invalid_request`.
 */
const clientErrorCodes: Record<number, string> = {
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  429: 'rate_limited',
};

/**
 * What a failed request is allowed to tell the client.
 *
 * Fastify's default handler sends `error.message` for every error, 5xx
 * included. For an unexpected failure that message belongs to a driver or a
 * library — a Postgres error carries constraint names and fragments of the
 * offending value — so it is logged (and reported to Sentry) here and never
 * sent. A client only ever learns `{ "error": "internal_error" }`.
 *
 * Handlers that expect a failure answer it themselves with a specific code
 * (`group_not_found`, `invalid_request`…); this is the net under them.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      const status = error.statusCode ?? 500;

      if (status >= 400 && status < 500) {
        request.log.info({ status, code: error.code }, 'http.request.rejected');
        return reply
          .code(status)
          .send({ error: clientErrorCodes[status] ?? 'invalid_request' });
      }

      // Not `err`: pino's serializer for that key copies every property of the
      // error, and a driver error's `detail` holds the offending value.
      request.log.error(
        {
          error: {
            type: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack,
          },
        },
        'http.request.failed',
      );
      // The route's template (`/groups/:groupId`), never the raw URL: an invitation
      // URL carries its code.
      reportError(error, 'http.request.failed', {
        method: request.method,
        route: request.routeOptions.url,
        status,
      });
      return reply.code(status >= 500 ? status : 500).send({ error: 'internal_error' });
    },
  );
}
