import rateLimit from '@fastify/rate-limit';
import type { preHandlerAsyncHookHandler, RouteOptions } from 'fastify';
import fp from 'fastify-plugin';

export interface RateLimitPluginOptions {
  /** Requests per minute and client address, across the API. */
  globalPerMinute: number;
  /** Requests per minute and client address, shared by every `/auth/*` route. */
  authPerMinute: number;
  /** Requests per minute and client address, shared by the public invitation routes. */
  publicPerMinute: number;
}

/**
 * The routes anyone can call without being signed in, besides `/auth/*` and
 * `/health`: they are what a stranger can use to guess invitation codes, so
 * they get a budget of their own.
 */
const PUBLIC_INVITE_ROUTES = new Set(['/invites/:code', '/i/:code']);

type Tier = 'global' | 'auth' | 'publicInvites';

function tierFor(route: Pick<RouteOptions, 'url'>): Tier {
  if (route.url.startsWith('/auth/')) {
    return 'auth';
  }
  return PUBLIC_INVITE_ROUTES.has(route.url) ? 'publicInvites' : 'global';
}

/**
 * Per-client-address rate limiting, in three tiers: a generous limit across the
 * API, and tighter ones for the unauthenticated surface (`/auth/*`, the public
 * invitation routes) where the client has nothing to lose by hammering.
 *
 * Each tier is one limiter — one counter per client address — attached to every
 * route of the tier, so rotating between `/auth/google` and `/auth/refresh`
 * does not buy a fresh budget. (`@fastify/rate-limit`'s per-route `config`
 * would give each route a store of its own.)
 *
 * Tiers are assigned here, by route, rather than sprinkled over the feature
 * plugins: a new `/auth/*` route is protected without anyone having to remember
 * to. A route that must not be limited sets `config: { rateLimit: false }`
 * itself (`/health`, so the load balancer's probes are never throttled).
 *
 * Counters live in this process's memory: with several instances behind the
 * load balancer each one enforces the limit on its own, so the effective limit
 * is up to N times higher. Fine for the abuse this guards against; a shared
 * store (Redis) is the upgrade if exact limits ever matter.
 *
 * Must be registered before the routes it covers: the hook below acts when a
 * route is registered.
 */
export const rateLimitPlugin = fp<RateLimitPluginOptions>(
  async (app, opts) => {
    await app.register(rateLimit, { global: false });

    const timeWindow = '1 minute';
    const limiters: Record<Tier, preHandlerAsyncHookHandler> = {
      global: app.rateLimit({ max: opts.globalPerMinute, timeWindow }),
      auth: app.rateLimit({ max: opts.authPerMinute, timeWindow }),
      publicInvites: app.rateLimit({ max: opts.publicPerMinute, timeWindow }),
    };

    app.addHook('onRoute', (route) => {
      if (route.config?.rateLimit === false) {
        return;
      }
      // Ahead of the route's own hooks: a refused request does no other work.
      route.onRequest = [limiters[tierFor(route)], ...[route.onRequest ?? []].flat()];
    });
  },
  { name: 'rate-limit' },
);
