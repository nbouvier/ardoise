import { isIP } from 'node:net';

import { z } from 'zod';

/** What Fastify's `trustProxy` option accepts, as far as this project uses it. */
export type TrustProxy = boolean | number | string[];

const PROXY_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

function isProxyAddress(entry: string): boolean {
  if (PROXY_KEYWORDS.has(entry)) {
    return true;
  }
  const [address = '', prefix, ...rest] = entry.split('/');
  const family = isIP(address);
  if (family === 0 || rest.length > 0) {
    return false;
  }
  if (prefix === undefined) {
    return true;
  }
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (family === 4 ? 32 : 128);
}

/**
 * Parse `TRUST_PROXY`: `true` / `false`, a number of proxy hops, or a
 * comma-separated list of proxy addresses / CIDR ranges (`10.0.0.0/8`) and
 * the keywords `loopback`, `linklocal`, `uniquelocal`. `undefined` when the
 * value is none of those.
 */
export function parseTrustProxy(raw: string): TrustProxy | undefined {
  const value = raw.trim().toLowerCase();
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  const entries = value.split(',').map((entry) => entry.trim());
  return entries.every(isProxyAddress) ? entries : undefined;
}

const envSchema = z.object({
  /**
   * Defaults to `production`, not `development`: a deployment that forgets to
   * set it must hit the production checks below, not silently skip them.
   * Local development sets `NODE_ENV=development` in `.env`.
   */
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  /**
   * Postgres connection string. When unset, the server uses an embedded PGlite
   * database (local development and tests) — same SQL dialect, no external
   * service. Required when `NODE_ENV=production`.
   */
  DATABASE_URL: z.url().optional(),
  /** Directory for the embedded PGlite database in development. */
  PGLITE_DATA_DIR: z.string().min(1).default('.pglite'),
  /**
   * Accepted Google OAuth client IDs (comma-separated), one per platform
   * (web, iOS, Android). A Google ID token is only trusted when its audience is
   * one of these.
   */
  GOOGLE_CLIENT_IDS: z
    .string()
    .min(1)
    .transform((value) =>
      value
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0),
    )
    .pipe(z.array(z.string().min(1)).min(1)),
  /** Secret used to sign Ardoise access tokens (JWT HS256). Server-only. */
  AUTH_JWT_SECRET: z.string().min(16),
  /** Access-token lifetime in seconds. */
  AUTH_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  /** Refresh-token lifetime in seconds. */
  AUTH_REFRESH_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 24 * 60 * 60),
  /**
   * Publicly reachable base URL of this API. Invitation links are built from
   * it, so it must be an address the recipient's device can open. Required
   * when `NODE_ENV=production`, where it must not point at the local machine;
   * elsewhere it falls back to `http://localhost:3000`.
   */
  PUBLIC_BASE_URL: z.url().optional(),
  /** Invitation lifetime in seconds, for every kind of invitation. */
  INVITE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 24 * 60 * 60),
  /**
   * Which proxies in front of the server to trust, so `request.ip` is the real
   * client rather than the load balancer (rate limiting and logs key on it).
   * `true` trusts every hop, a number trusts that many hops from the server, a
   * comma-separated list trusts those addresses / CIDR ranges. Required when
   * `NODE_ENV=production` (`false` for a server with no proxy in front);
   * elsewhere it defaults to `false`. See `docs/DEPLOYMENT.md`.
   */
  TRUST_PROXY: z
    .string()
    .transform((raw, ctx) => {
      const parsed = parseTrustProxy(raw);
      if (parsed === undefined) {
        ctx.addIssue({
          code: 'custom',
          message:
            'must be true, false, a number of hops, or a comma-separated list of proxy addresses / CIDR ranges',
        });
        return z.NEVER;
      }
      return parsed;
    })
    .optional(),
  /**
   * Requests per minute and client address. Counted in each server process's
   * memory, so with several instances the effective limit is up to N times
   * these. `GLOBAL` covers the whole API; `AUTH` is shared by every `/auth/*`
   * route and `PUBLIC` by the unauthenticated invitation routes, where the
   * client has nothing to lose by hammering. See `docs/DEPLOYMENT.md`.
   */
  RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_PUBLIC_PER_MINUTE: z.coerce.number().int().positive().default(30),
  /**
   * How long a shutdown (SIGTERM / SIGINT) waits for in-flight requests before
   * exiting anyway. Keep it below the platform's kill timeout (30s on most).
   */
  SHUTDOWN_TIMEOUT_SECONDS: z.coerce.number().positive().default(25),
  /**
   * Sentry DSN of the server project. Unset (local development, tests), nothing is
   * reported. Not a secret in Sentry's sense (it only lets a client send reports), but
   * kept out of the repository like any other deployment value.
   */
  SENTRY_DSN: z.url().optional(),
  /**
   * What reports are filed under: `production` or `staging` (the Compose stack passes
   * its `DEPLOY_ENV`). Defaults to `NODE_ENV`, which is `production` for both.
   */
  SENTRY_ENVIRONMENT: z.string().min(1).optional(),
  /**
   * The running version, baked into the image at build time (`sha-<commit>`). An image
   * built without it (locally) has it empty, which means unknown.
   */
  APP_RELEASE: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  /** App Store listing, shown on the invitation landing page. Unset until published. */
  APP_STORE_URL: z.url().optional(),
  /** Play Store listing, shown on the invitation landing page. Unset until published. */
  PLAY_STORE_URL: z.url().optional(),
  /**
   * Where account-deletion requests made without the app go, shown on the public
   * `/delete-account` page (`docs/specs/account-deletion.md`). Unset, the page only
   * describes the in-app path. Set it before the app is published: Google Play
   * requires a way to ask for deletion without the app.
   */
  ACCOUNT_DELETION_CONTACT: z.email().optional(),
});

/**
 * Settings that have a harmless default for development but would make a
 * production server start "fine" while being wrong. Failing at startup beats
 * discovering it from lost data or from invitation links nobody can open.
 */
const envChecked = envSchema
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') {
      return;
    }
    // An unset DATABASE_URL would silently fall back to an embedded database:
    // the server would start fine and lose every write at the next restart.
    if (!value.DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'is required when NODE_ENV=production',
      });
    }
    // Neither default is safe behind a load balancer: `false` makes every
    // client look like the balancer (one shared rate-limit bucket, useless
    // logs), `true` without one lets any client forge its address. Make the
    // operator say which.
    if (value.TRUST_PROXY === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY'],
        message: 'is required when NODE_ENV=production (use false if no proxy is in front)',
      });
    }
    if (!value.PUBLIC_BASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_BASE_URL'],
        message: 'is required when NODE_ENV=production',
      });
    } else if (isLocalHost(new URL(value.PUBLIC_BASE_URL).hostname)) {
      // Invitation links are built from it and sent to other people's phones.
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_BASE_URL'],
        message: 'must not point at a local address when NODE_ENV=production',
      });
    }
  })
  .transform((value) => ({
    ...value,
    PUBLIC_BASE_URL: value.PUBLIC_BASE_URL ?? 'http://localhost:3000',
    TRUST_PROXY: value.TRUST_PROXY ?? false,
    SENTRY_ENVIRONMENT: value.SENTRY_ENVIRONMENT ?? value.NODE_ENV,
  }));

/** Whether a URL hostname designates the machine itself (`localhost`, loopback). */
function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '[::1]' ||
    hostname === '0.0.0.0' ||
    /^127(\.\d{1,3}){3}$/.test(hostname)
  );
}

export type Env = z.output<typeof envChecked>;

/**
 * Parse and validate configuration from an environment source. Throws with a
 * readable message listing every invalid or missing variable, so a
 * misconfigured deployment fails fast instead of at first use.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envChecked.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}

export const env = loadEnv();
