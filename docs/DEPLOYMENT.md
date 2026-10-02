# Deployment and server hardening

Living document. What the API server (`apps/server`) requires and guarantees when it runs
in production. Update it whenever a production-relevant setting or behaviour changes.

Not covered here: the hosting platform itself (not chosen yet — see the open items in
`docs/ARCHITECTURE.md`), database migrations (`docs/DATABASE.md`), logging
(`docs/LOGGING.md`).

## Startup configuration

Configuration is read once, at startup, by `apps/server/src/config/env.ts`. An invalid
configuration makes the process exit with a message listing **every** problem.

`NODE_ENV` defaults to **`production`** when unset. A deployment that forgets the variable
therefore gets the production checks instead of silently skipping them; local development
sets `NODE_ENV=development` in `.env` (see `.env.example`).

When `NODE_ENV=production`, on top of the variables that are always required
(`GOOGLE_CLIENT_IDS`, `AUTH_JWT_SECRET`):

| Variable          | Requirement                                                       | Why |
| ----------------- | ----------------------------------------------------------------- | --- |
| `DATABASE_URL`    | Required.                                                         | Unset means an embedded in-memory PGlite: the server would start fine and lose every write at the next restart. |
| `PUBLIC_BASE_URL` | Required, and must not be `localhost` / a loopback / `0.0.0.0`.   | Invitation links are built from it and sent to other people's phones. |

Outside production both stay optional (`DATABASE_URL` → embedded PGlite,
`PUBLIC_BASE_URL` → `http://localhost:3000`).

## Error responses

An unexpected failure never reaches the client as-is: `apps/server/src/http/error-handler.ts`
answers any 5xx with `{ "error": "internal_error" }` and logs the cause server-side
(`http.request.failed`, see `docs/LOGGING.md`). To investigate a report of an
`internal_error`, find that log line by time and request id. Before this existed,
Fastify's default handler sent `error.message` to the client, so a Postgres error could
leak a constraint name or part of a row.
