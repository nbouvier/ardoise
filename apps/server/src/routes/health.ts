import type { FastifyInstance } from 'fastify';

/**
 * Liveness endpoint used by the hosting platform and by monitoring. Must stay
 * dependency-free so it keeps answering even when downstreams are unavailable.
 */
export function registerHealthRoutes(app: FastifyInstance): void {
  // Never rate limited: the load balancer probes it from one address, often.
  app.get('/health', { config: { rateLimit: false } }, () => ({ status: 'ok' as const }));
}
