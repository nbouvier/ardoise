import { z } from 'zod';

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
  /** Secret used to sign SplitCount access tokens (JWT HS256). Server-only. */
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
  /** App Store listing, shown on the invitation landing page. Unset until published. */
  APP_STORE_URL: z.url().optional(),
  /** Play Store listing, shown on the invitation landing page. Unset until published. */
  PLAY_STORE_URL: z.url().optional(),
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
