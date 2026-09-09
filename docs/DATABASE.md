# Database

Living document. Update it with every schema decision and migration.

## Ownership

The database is owned exclusively by `apps/server`. The mobile client never connects to
it and never sees connection strings or credentials.

## Chosen stack

- **PostgreSQL** as the store.
- **Drizzle ORM** with **drizzle-kit** as the migration mechanism.

Not yet installed — added with the first persisted entity, in its own `[server]` commit.

## Current state

No database, schema or migrations exist yet.

## Principles (apply once persistence exists)

- All schema changes go through drizzle-kit migrations — never ad-hoc edits.
- Each migration is reversible where practical and leaves the schema valid.
- Document every table and non-obvious relationship here.
- Credentials come from environment variables (`DATABASE_URL`), documented in
  `apps/server/.env.example`.

## Planned commands (once Drizzle is added)

```bash
npm run migrate --workspace @splitcount/server          # apply pending migrations
npm run migrate:generate --workspace @splitcount/server # generate a migration from schema
```

Update this section with the real command names when Drizzle lands.
