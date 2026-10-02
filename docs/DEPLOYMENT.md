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
| `TRUST_PROXY`     | Required (`false` when no proxy is in front).                     | See [Behind a load balancer](#behind-a-load-balancer): both silent defaults are wrong in production. |

Outside production they stay optional (`DATABASE_URL` → embedded PGlite,
`PUBLIC_BASE_URL` → `http://localhost:3000`, `TRUST_PROXY` → `false`).

## Behind a load balancer

The server is meant to run behind a load balancer. The balancer opens the connection to the
server, so without help `request.ip` is the balancer's address for every client; the real
one arrives in the `X-Forwarded-For` header, which a client can also set itself.
`TRUST_PROXY` tells Fastify whose `X-Forwarded-For` entries to believe (`trustProxy` in
`apps/server/src/app.ts`):

| Value                   | Meaning                                                              | Use when |
| ----------------------- | -------------------------------------------------------------------- | -------- |
| `false`                 | Ignore `X-Forwarded-For`; `request.ip` is the socket peer.           | The server is reachable directly, no proxy. |
| a number, e.g. `1`      | Trust that many proxy hops, counting from the server.                | The number of proxies is fixed and known (one load balancer → `1`). **Preferred.** |
| CIDRs, e.g. `10.0.0.0/8`| Trust proxies at those addresses (also `loopback`, `linklocal`, `uniquelocal`). | The balancer has a stable address range. |
| `true`                  | Trust every hop, so the leftmost `X-Forwarded-For` entry wins.       | Avoid: any client can forge its address and slip past per-IP rate limits. |

It is **required** in production because neither guess is safe: `false` behind a balancer
puts every user in one rate-limit bucket (and every log line on one address), `true`
without one lets clients choose their own address. Make sure the balancer *overwrites or
appends to* `X-Forwarded-For` rather than passing a client-supplied value through
untouched; with a hop count that is what makes the count meaningful.

## Error responses

An unexpected failure never reaches the client as-is: `apps/server/src/http/error-handler.ts`
answers any 5xx with `{ "error": "internal_error" }` and logs the cause server-side
(`http.request.failed`, see `docs/LOGGING.md`). To investigate a report of an
`internal_error`, find that log line by time and request id. Before this existed,
Fastify's default handler sent `error.message` to the client, so a Postgres error could
leak a constraint name or part of a row.
