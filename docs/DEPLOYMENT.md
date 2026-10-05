# Deployment and server hardening

Living document. What the API server (`apps/server`) requires and guarantees when it runs
in production. Update it whenever a production-relevant setting or behaviour changes.

Not covered here: how a release reaches the machine, the machine's layout, backups and
rollbacks (`docs/OPERATIONS.md`), the schema (`docs/DATABASE.md`), logging
(`docs/LOGGING.md`).

## Container image

The server ships as one image, built from the repository root with the `Dockerfile`:

```bash
docker build -t ardoise-server .
```

- Three stages: production dependencies (`npm ci --omit=dev`), build (`npm run build`:
  `@ardoise/shared`, then the server), and a runtime that copies only
  `node_modules`, the two `dist/` folders and `apps/server/drizzle` (the migrations).
  Base image `node:26-slim` — keep `NODE_VERSION` in step with `.nvmrc`.
- Runs as the unprivileged `node` user, `NODE_ENV=production` (so the production checks
  below apply), listens on `PORT` (3000).
- `HEALTHCHECK` calls `GET /health`, which answers `503` while the server drains.
- **One image, two commands.** The default command starts the server; the release step
  uses the same image: `node apps/server/dist/scripts/migrate.js`. The schema the
  migrations produce is therefore always the one the code was built for.
- `.dockerignore` is an allowlist (root manifests, `apps/server`, `packages/shared`, the
  mobile *manifest*): the mobile app, `docs/`, `.git` and every `.env*` stay out of the
  build context, so a local `.env` can never end up in an image.
- No secret is baked in: all configuration comes from the environment at run time
  (`apps/server/.env.example` lists it). The one value baked in is `APP_RELEASE`, the
  image's own version (`sha-<commit>`, a build argument the CI sets), which error
  reports are filed under.
- The Sentry SDK (`@sentry/node`) accounts for about 90 MB of the image's
  `node_modules`.

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
| `CONTACT_EMAIL`, `LEGAL_PUBLISHER_NAME`, `LEGAL_HOST_NAME`, `LEGAL_HOST_ADDRESS`, `LEGAL_HOST_PHONE` | Required, not blank; `CONTACT_EMAIL` an e-mail address. | The legal pages show them (see below); the law and Google Play need them live. |

Outside production they stay optional (`DATABASE_URL` → embedded PGlite,
`PUBLIC_BASE_URL` → `http://localhost:3000`, `TRUST_PROXY` → `false`).

Error reporting is optional everywhere: `SENTRY_DSN` turns it on (unset, nothing is
reported), `SENTRY_ENVIRONMENT` names what reports are filed under (default: `NODE_ENV`;
the Compose stack passes `DEPLOY_ENV`, so `production` or `staging`). A `SENTRY_DSN` that
is not a URL is refused at startup rather than silently reporting nothing. See
`docs/LOGGING.md`, "Error reporting (Sentry)".

The legal pages (`docs/specs/legal-pages.md`) take who publishes and hosts the service
from the configuration, never from the repository: `LEGAL_PUBLISHER_NAME` (the publisher,
also director of publication), `LEGAL_HOST_NAME`, `LEGAL_HOST_ADDRESS` and
`LEGAL_HOST_PHONE` (the hosting provider, as the legal notice must name it), and
`CONTACT_EMAIL` — the one contact address of every public page, where privacy requests
and account-deletion requests made without the app arrive. Outside production they are
optional and the pages show "(not configured)". Deletion requests are carried out with
the operator command (`docs/OPERATIONS.md`, "Deleted accounts").

## Database migrations

In production the server **does not migrate**. Migrations run once per release, in a
separate step, and every server instance only checks the result:

1. **Release step** — `node apps/server/dist/scripts/migrate.js` (from the repo,
   `npm run migrate:deploy --workspace @ardoise/server`). Needs only `DATABASE_URL`
   (`config/migrate-env.ts`) — not the Google IDs or the JWT secret. Idempotent; exits
   `1` and logs `db.migrate.failed` on any error, which must stop the release before
   any new container starts.
2. **Startup check** — with `NODE_ENV=production` the database plugin runs
   `assertMigrated`: if any migration in `apps/server/drizzle` is newer than the latest
   one recorded in the database, the process exits `1` (`server.start.failed`: "N database
   migration(s) pending"). A new image started against an un-migrated database therefore
   fails loudly instead of at the first query that touches a missing column. A database
   that is *ahead* of the image (a rollback) is accepted.

Why not at startup: with several instances starting together — a rolling deploy, a
restart policy — each would try to apply the same migrations concurrently.

Consequence for writing migrations: they run **before** the new version starts, so for a
moment the previous version serves traffic on the new schema, and a rollback leaves old
code on it. Make every migration backward compatible (see `docs/DATABASE.md`). The step
must run **once at a time**: the deploy scripts serialise it; do not run it by hand while
a deploy is in progress.

Outside production (`development`, `test`) the server still migrates on startup, which
is what a developer with an embedded PGlite expects.

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

## Rate limiting

Per client address (see [Behind a load balancer](#behind-a-load-balancer) — the limits
are only as good as `TRUST_PROXY`), in three tiers, implemented in
`apps/server/src/http/rate-limit.ts`:

| Tier | Routes | Variable | Default / min |
| ---- | ------ | -------- | ------------- |
| global | everything else | `RATE_LIMIT_GLOBAL_PER_MINUTE` | 300 |
| auth | every `/auth/*` route, **one shared budget** | `RATE_LIMIT_AUTH_PER_MINUTE` | 30 |
| public invitations | `GET /invites/:code` and `GET /i/:code`, one shared budget | `RATE_LIMIT_PUBLIC_PER_MINUTE` | 30 |

- `GET /health` is exempt, so load balancer probes are never throttled.
- A route's tier comes from its URL, so a new `/auth/*` route is covered automatically. A
  route that must be exempt sets `config: { rateLimit: false }`.
- Over the limit: `429 { "error": "rate_limited" }` plus `Retry-After`.
- The defaults are first guesses; tune them from the logs (`http.request.rejected`
  with `status: 429`). Many users can legitimately share one address (office, mobile
  carrier NAT), which is why the global limit is generous.
- Counters are in memory, **per server process**: with N instances the effective limit is
  up to N times the configured one, and a restart resets them. Acceptable for abuse
  protection; move to a shared store (Redis) if exact limits are ever needed.
- The tests set the three limits very high in `vitest.config.ts` (every test shares one
  address); `rate-limit.test.ts` passes small ones through `buildApp({ rateLimit })`.

## Database connection errors

When Postgres restarts or a connection drops while idle, `pg.Pool` emits an `error` event.
With no listener Node turns that into an uncaught exception and the API process dies;
`attachPoolErrorHandler` (`apps/server/src/db/client.ts`) listens and logs `db.pool.error`
instead. The pool drops the broken connection and opens a new one on the next query, so a
database restart costs the requests that were in flight, not the process.

## Shutdown

On `SIGTERM` (deploy, scale-down, container stop) or `SIGINT` (Ctrl+C), the server drains
instead of dying mid-request (`apps/server/src/shutdown.ts`):

1. Stops accepting connections; a request arriving on an already-open keep-alive connection
   gets a `503` with `Connection: close`, so the load balancer retries it elsewhere.
2. Lets in-flight requests finish and closes each connection as soon as it goes idle.
3. Closes the database pool, sends any queued error report (at most 2s), then exits `0`.

If that has not finished after `SHUTDOWN_TIMEOUT_SECONDS` (default 25), it logs
`server.shutdown.timeout` and exits `1` — a deploy that hangs is worse than one request cut
short. **Keep this below the platform's kill timeout** (30s by default on Kubernetes and ECS)
so that log line, not a `SIGKILL`, explains the exit. The events are listed in
`docs/LOGGING.md`.

The server cannot know when the load balancer stops routing to it: the usual arrangement
is for the platform to deregister the instance first (or wait a few seconds before sending
`SIGTERM`), so that nothing new arrives while it drains. A health probe that does reach a
draining server (on a connection that is still open) gets the same `503`, which is what
tells the balancer to stop sending traffic.

Signals are a POSIX concept: on Windows `SIGTERM` terminates the process outright, so this
path only runs on the Linux host / container the API is deployed to. The behaviour is
covered by tests that stand in for `process` (`shutdown.test.ts`).

## Security headers

Set on **every** response, errors and `429`s included, by `@fastify/helmet`
(`apps/server/src/http/security-headers.ts`):

| Header | Value | Why |
| ------ | ----- | --- |
| `Content-Security-Policy` | `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` | A JSON API: nothing it returns should be rendered, framed or scripted. |
| `X-Content-Type-Options` | `nosniff` | A response is never reinterpreted as another type. |
| `Referrer-Policy` | `no-referrer` | The invitation code is in the landing page URL; it must not leak to the store links on that page. |
| `Strict-Transport-Security` | `max-age=15552000` (180 days), no `includeSubDomains` | Only meaningful over HTTPS, i.e. once the load balancer terminates TLS. Not applied to subdomains: the API host's siblings are not ours to impose it on. |
| `X-Frame-Options`, `Cross-Origin-*-Policy`, `X-DNS-Prefetch-Control`… | helmet defaults | |
| `X-Powered-By` | removed | |

The HTML documents — the invitation landing page (`GET /i/:code`), the account-deletion
page (`GET /delete-account`) and the legal pages (`GET /privacy`, `/terms`, `/legal`) —
override the CSP for their own response:
`default-src 'none'` plus their inline `<style>` and `<script>` allowed **by SHA-256
hash**, computed from the response body by `contentSecurityPolicyFor` (`http/html.ts`) —
per response, because the landing page's script contains the invitation code. There is no `unsafe-inline`. If you add an inline
block or an external resource to the page, the policy follows automatically for inline
`<style>` / `<script>`; anything else (an image, a font) needs the policy extended there.

The API sets no CORS headers; add them deliberately if a browser client (the Expo web
target) ever needs to call it.

## Error responses

An unexpected failure never reaches the client as-is: `apps/server/src/http/error-handler.ts`
answers any 5xx with `{ "error": "internal_error" }`, logs the cause server-side
(`http.request.failed`, see `docs/LOGGING.md`) and reports it to Sentry, tagged with the
same event name. To investigate a report of an `internal_error`, start from the Sentry
issue (stack trace, route, release), or find the log line by time and request id. Before this existed,
Fastify's default handler sent `error.message` to the client, so a Postgres error could
leak a constraint name or part of a row.
