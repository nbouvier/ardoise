import type { FastifyInstance } from 'fastify';

/**
 * Liveness endpoint used by the hosting platform and by monitoring. Must stay
 * dependency-free so it keeps answering even when downstreams are unavailable.
 */
export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health', () => ({ status: 'ok' as const }));
}
