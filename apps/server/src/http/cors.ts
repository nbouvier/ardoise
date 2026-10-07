import cors from '@fastify/cors';
import fp from 'fastify-plugin';

export interface CorsPluginOptions {
  /** The web app's origins (`WEB_ORIGINS`); empty, the API answers no browser page. */
  origins: readonly string[];
}

/**
 * CORS for the web app, and nobody else: an allowed origin gets
 * `Access-Control-Allow-Origin` with credentials (the refresh cookie,
 * `docs/specs/authentication.md`), any other gets no CORS header at all, so
 * its scripts cannot read a response nor send the custom header the web
 * session requires.
 */
export const corsPlugin = fp<CorsPluginOptions>(
  async (app, opts) => {
    if (opts.origins.length === 0) {
      return;
    }
    const allowed = {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['authorization', 'content-type', 'accept-language', 'x-ardoise-client'],
      exposedHeaders: ['retry-after'],
      maxAge: 600,
    };
    // Decided per request: with a plain origin list the plugin still sends
    // `Access-Control-Allow-Credentials` to every origin.
    await app.register(cors, {
      delegator: (request, callback) => {
        const origin = request.headers.origin;
        callback(null, origin && opts.origins.includes(origin) ? allowed : { origin: false });
      },
    });
  },
  { name: 'cors' },
);
