import Fastify, { type FastifyInstance } from 'fastify';

import { env } from './config/env.js';
import { registerHealthRoutes } from './routes/health.js';

/**
 * Build a fully configured Fastify instance without starting the network
 * listener, so tests can drive it through `app.inject`.
 */
export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  });

  registerHealthRoutes(app);

  return app;
}
