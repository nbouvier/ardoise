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

The invitation landing page (`GET /i/:code`) is the one HTML document and overrides the
CSP for its own response: `default-src 'none'` plus its single inline `<style>` and
`<script>` allowed **by SHA-256 hash**, computed from the response body by
`contentSecurityPolicyFor` (`features/invites/landing.ts`) — per response, because the
script contains the invitation code. There is no `unsafe-inline`. If you add an inline
block or an external resource to the page, the policy follows automatically for inline
`<style>` / `<script>`; anything else (an image, a font) needs the policy extended there.

The API sets no CORS headers; add them deliberately if a browser client (the Expo web
target) ever needs to call it.

## Error responses

An unexpected failure never reaches the client as-is: `apps/server/src/http/error-handler.ts`
answers any 5xx with `{ "error": "internal_error" }` and logs the cause server-side
(`http.request.failed`, see `docs/LOGGING.md`). To investigate a report of an
`internal_error`, find that log line by time and request id. Before this existed,
Fastify's default handler sent `error.message` to the client, so a Postgres error could
leak a constraint name or part of a row.
