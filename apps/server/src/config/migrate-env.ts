import { z } from 'zod';

/**
 * Configuration of the migration release step (`src/scripts/migrate.ts`). It
 * needs the database and nothing else: it must not demand the Google client
 * IDs or the JWT secret just to alter a schema, which would also hand it
 * secrets it has no use for.
 */
const migrateEnvSchema = z.object({
  DATABASE_URL: z.url(),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
});

export type MigrateEnv = z.output<typeof migrateEnvSchema>;

/** Parse the release step's configuration; throws a message naming every problem. */
export function loadMigrateEnv(source: NodeJS.ProcessEnv = process.env): MigrateEnv {
  const result = migrateEnvSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  return result.data;
}
