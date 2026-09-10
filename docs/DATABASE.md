# Database

Living document. Update it with every schema decision and migration.

## Ownership

The database is owned exclusively by `apps/server`. The mobile client never connects to
it and never sees connection strings or credentials.

## Chosen stack

- **PostgreSQL** as the store.
- **Drizzle ORM** with **drizzle-kit** as the migration mechanism.
- In local development and tests, an embedded **PGlite** database is used instead of a
  real Postgres server — same SQL dialect, no external service. The driver is selected at
  runtime: `DATABASE_URL` set → `node-postgres`; unset → PGlite
  (`apps/server/src/db/client.ts`).

## Configuration

| Variable          | Purpose                                                             |
| ----------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`    | Postgres connection string. Unset → embedded PGlite. Required in production. |
| `PGLITE_DATA_DIR` | Directory for the PGlite data in development (default `.pglite`, git-ignored). |

## Migrations

SQL migrations live in `apps/server/drizzle/` and are generated from the schema in
`apps/server/src/db/schema.ts`.

```bash
npm run migrate:generate --workspace @splitcount/server   # generate a migration from schema changes
npm run migrate --workspace @splitcount/server            # apply pending migrations (needs DATABASE_URL)
```

- `migrate:generate` only reads the schema file; no database needed.
- The running server applies pending migrations automatically on startup (PGlite in
  development; against `DATABASE_URL` in production, where `npm run migrate` in the deploy
  step is preferred so a failed migration blocks the release).
- Tests apply migrations to a fresh in-memory PGlite per test file
  (`src/test/database.ts`).
- All schema changes go through drizzle-kit migrations — never ad-hoc edits.
- Each migration should leave the schema valid and be reversible where practical.

## Schema

### `users`

A person who has signed in with Google.

| Column       | Type          | Notes                                    |
| ------------ | ------------- | ---------------------------------------- |
| `id`         | uuid PK       | `gen_random_uuid()`                      |
| `google_sub` | text, unique  | Stable Google subject id; sign-in lookup |
| `email`      | text          | From the verified Google token           |
| `name`       | text          | From the verified Google token           |
| `picture`    | text, null    | Avatar URL, may be absent                |
| `created_at` | timestamptz   | `now()`                                  |
| `updated_at` | timestamptz   | `now()`; refreshed on profile change     |

### `sessions`

One row per issued refresh token. Rotation revokes the old row and inserts a new one.

| Column               | Type          | Notes                                          |
| -------------------- | ------------- | ---------------------------------------------- |
| `id`                 | uuid PK       | `gen_random_uuid()`                            |
| `user_id`            | uuid FK       | → `users.id`, `ON DELETE CASCADE`             |
| `refresh_token_hash` | text, unique  | SHA-256 of the opaque refresh token; token itself is never stored |
| `expires_at`         | timestamptz   | Absolute refresh-token expiry                  |
| `created_at`         | timestamptz   | `now()`                                        |
| `last_used_at`       | timestamptz   | Updated on each refresh                        |
| `revoked_at`         | timestamptz null | Set on rotation or sign-out; non-null → unusable |

Index: `sessions_user_id_idx` on `user_id`.

## Current state

- Migration `0000_*` — `users` and `sessions` tables (Google sign-in).
