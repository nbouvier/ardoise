import type { AuthSession } from '@ardoise/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';

/** What a web client sends on every `/auth/*` call. */
export const WEB_CLIENT_HEADER = 'x-ardoise-client';
/** Where a web client's refresh token lives. */
export const REFRESH_COOKIE = 'ardoise_refresh';

export function isWebClient(request: FastifyRequest): boolean {
  return request.headers[WEB_CLIENT_HEADER] === 'web';
}

export interface WebSessionOptions {
  /** The web app's origins (`WEB_ORIGINS`). */
  origins: readonly string[];
  refreshTtlSeconds: number;
}

/**
 * The web side of sessions (`docs/specs/authentication.md`): a browser page
 * cannot keep a secret from its own scripts, so a web client's refresh token
 * travels in an `HttpOnly` cookie, scoped to `/auth`, instead of the body.
 *
 * The cookie is only read when the request carries `X-Ardoise-Client: web`. A
 * custom header is something a page of another site cannot send without the
 * browser asking first (CORS preflight), and only the allowed origins are
 * answered; the header's requests are checked against them on top. A form
 * another site submits carries no such header, so its cookie is ignored.
 */
export function createWebSession(options: WebSessionOptions) {
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'strict' as const,
    path: '/auth',
  };

  return {
    /** Refuse a web client's request from an origin that is not the web app's. */
    allowedOrigin(request: FastifyRequest): boolean {
      const origin = request.headers.origin;
      return origin !== undefined && options.origins.includes(origin);
    },

    /** Answer with a session: as is to a native client, the refresh token in the cookie to a web one. */
    send(request: FastifyRequest, reply: FastifyReply, session: AuthSession): FastifyReply {
      if (!isWebClient(request)) {
        return reply.code(200).send(session);
      }
      const { refreshToken, ...rest } = session;
      reply.setCookie(REFRESH_COOKIE, refreshToken, {
        ...cookieOptions,
        maxAge: options.refreshTtlSeconds,
      });
      return reply.code(200).send(rest);
    },

    /** A web client's refresh token, if its cookie has one. */
    refreshTokenOf(request: FastifyRequest): string | undefined {
      return request.cookies[REFRESH_COOKIE] || undefined;
    },

    clear(reply: FastifyReply): void {
      reply.clearCookie(REFRESH_COOKIE, cookieOptions);
    },
  };
}
