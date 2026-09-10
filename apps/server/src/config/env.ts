import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  /**
   * Postgres connection string. When unset, the server uses an embedded PGlite
   * database (local development and tests) — same SQL dialect, no external
   * service.
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
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate configuration from an environment source. Throws with a
 * readable message listing every invalid or missing variable, so a
 * misconfigured deployment fails fast instead of at first use.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}

export const env = loadEnv();
