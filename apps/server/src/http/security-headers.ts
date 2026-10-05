import helmet from '@fastify/helmet';
import fp from 'fastify-plugin';

/**
 * Security headers on every response, errors and `429`s included.
 *
 * This is a JSON API: nothing it sends is meant to be rendered, framed or
 * scripted, so the default policy forbids all of it (`default-src 'none'`,
 * `frame-ancestors 'none'`). The few HTML pages (the invitation landing, the
 * account-deletion page) set their own narrower policy
 * (`contentSecurityPolicyFor` in `http/html.ts`).
 *
 * Helmet's other defaults stay: `X-Content-Type-Options: nosniff`,
 * `Referrer-Policy: no-referrer` (the invitation code lives in the landing page
 * URL and must not leak to the store links it carries), `X-Frame-Options`,
 * cross-origin isolation headers, no `X-Powered-By`.
 *
 * HSTS is sent but only means something over HTTPS, i.e. once the load balancer
 * terminates TLS; it is not applied to subdomains (the API's host name is not
 * ours to impose that on).
 */
export const securityHeadersPlugin = fp(
  async (app) => {
    await app.register(helmet, {
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      strictTransportSecurity: { maxAge: 15_552_000, includeSubDomains: false },
    });
  },
  { name: 'security-headers' },
);
