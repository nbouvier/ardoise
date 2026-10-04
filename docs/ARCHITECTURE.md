# Architecture

Living document. Update it whenever a structural decision is made or changed.

## Overview

SplitCount is an npm-workspaces monorepo with a mobile client and a backend API. The
**server is the source of truth** for all shared data; the mobile client reads and writes
exclusively through the HTTP API.

The mobile client runs as an **Expo development build** (embeds `expo-dev-client`), not
the Expo Go sandbox — Google sign-in needs a native SDK Expo Go does not bundle. The web
target still runs without a native build. See
`docs/MOBILE.md`.

## Repository layout

```text
apps/
  mobile/          Expo (SDK 57) / React Native / TypeScript client.
    src/
      app/         Expo Router routes. Files map to screens; _layout.tsx defines navigation.
      components/  Shared presentational building blocks. ui/ holds lower-level primitives.
      hooks/       Reusable hooks. Platform variants use .web.ts / .ios.tsx / .android.tsx.
      constants/   Design tokens (colours, spacing, fonts) in theme.ts.
      features/    One folder per product feature (auth: state, screens, Google, storage;
                   friends: list, invitations, deep-link capture; groups: list,
                   creation, detail, membership; home: the landing screen, which
                   composes other features' rows rather than owning any of its own).
      lib/         Cross-feature building blocks: logger, API client (lib/api).
    assets/        Images and fonts.
    metro.config.js  Monorepo-aware Metro config (watches the repo root).
  server/          Node / Fastify / TypeScript API.
    src/
      index.ts     Process entrypoint: builds the app, starts listening, installs
                   graceful shutdown.
      shutdown.ts  SIGTERM / SIGINT handling: drain, close the database, exit.
      app.ts       buildApp() factory — a configured Fastify instance, no listener.
      config/      Typed environment loading (env.ts, Zod-validated, with the
                   production-only requirements — see docs/DEPLOYMENT.md).
      http/        Cross-cutting HTTP behaviour wired in app.ts: error handler, rate
                   limiting, security headers.
      routes/      Cross-cutting HTTP routes (health). Feature routes live under features/.
      features/    One folder per product feature: routes, services, repository, tests.
      db/          Drizzle schema (schema.ts), client/driver selection (client.ts),
                   Fastify plugin (plugin.ts). SQL migrations in server/drizzle/.
      test/        Test helpers (in-memory DB, ready app).
packages/
  shared/          @splitcount/shared — platform-neutral API contract (Zod schemas +
                   inferred types) shared by both apps. No React Native, no Node-only
                   APIs, no secrets. Built to dist/ (ESM); consumers resolve types
                   straight from src/ so a rebuild is only needed for runtime/bundling.
deploy/            Everything that runs on the server machine: the Compose stack of one
                   environment, the deploy / backup scripts and their tests, and the
                   Caddy proxy (deploy/proxy/). Synced to the machine by every deploy.
                   See docs/OPERATIONS.md.
Dockerfile         The API server's image (built from the repo root).
docs/              Living documentation (this folder). Transverse, stays at the root.
docs/specs/        Feature specifications — source of truth for established behavior.
docs/guidelines/   Authoring conventions.
tsconfig.base.json Shared TypeScript compiler options; each workspace extends it.
```

## Workspace boundaries

- `apps/mobile` and `apps/server` never import from each other.
- Shared code lives in a `packages/*` workspace and must stay platform-neutral: no React
  Native, no Node-only APIs, no server secrets.
- A `packages/*` workspace depends on neither app.
- Adding a workspace requires a justification recorded here.

### Workspaces

| Workspace              | Justification                                                        |
| ---------------------- | ------------------------------------------------------------------- |
| `@splitcount/shared`   | Request and response shapes must stay identical on both sides; duplicated Zod schemas would drift. It also holds the arithmetic both sides must agree on to the cent: the split rounding (`transactions.ts` — the client previews a split live, the server recomputes it as the authority), the category breakdown (`statistics.ts`) and the reimbursement plan (`reimbursements.ts`, derived from balances on the client). One implementation each, never two. Modules: `auth.ts`, `categories.ts`, `friends.ts`, `groups.ts`, `invites.ts`, `reimbursements.ts`, `statistics.ts`, `transactions.ts`. |

## Client / server contract

- REST over HTTP/JSON. Request and response shapes are validated with Zod on the server;
  the schemas live in `@splitcount/shared` and the client validates responses with them.
- When a type or schema is needed on both sides, it moves into `@splitcount/shared`
  rather than being duplicated.
- The mobile client treats the server as authoritative: no offline write model yet.
- Auth: the client sends a Google ID token, the server verifies it and returns a
  SplitCount session (short access JWT + rotating refresh token). The client stores the
  refresh token in the OS secure store and refreshes transparently on 401.
- The API is JSON everywhere except `GET /i/:code`, the public invitation landing page,
  which is HTML because a browser opens it before the app is involved.
- Almost every route is authenticated; `GET /invites/:code` is deliberately not, so an
  invited person can see who is inviting them — and into what — before signing in.

## Conventions

- Organise code by feature once features exist. A feature owns its screens, components,
  hooks, state, routes and tests.
- Reuse existing abstractions before adding new ones.
- Avoid speculative abstraction and indirection: add structure at the second concrete use.
- Path alias in mobile: `@/*` → `apps/mobile/src/*`, `@/assets/*` → `apps/mobile/assets/*`.
- Server relative imports use `.js` extensions (NodeNext resolution).
- In a raw `sql` template (`db.execute`), filter a set of ids with drizzle's `inArray()`
  helper, never `= ANY(${array})`: binding a JS array as a single template parameter does
  not reliably produce a Postgres array under the drivers this project runs on (observed
  while adding nested groups' `listOwnedPopulatedDescendants` — it failed at runtime, not
  typecheck, since `db.execute` isn't statically checked against the query text).

## Tooling

| Concern            | Choice                                    |
| ------------------ | ----------------------------------------- |
| Monorepo           | npm workspaces                            |
| Language           | TypeScript (strict, shared base config)   |
| Mobile framework   | Expo Router                               |
| Server framework   | Fastify                                   |
| Server dev runner  | tsx; build via `tsc`                      |
| Validation         | Zod (server, and the shared API contract) |
| Mobile tests       | jest-expo                                 |
| Server tests       | Vitest (`app.inject` integration tests)   |
| Mobile lint        | `eslint-config-expo` (flat)               |
| Server lint        | `typescript-eslint` (flat)                |
| Server logging     | Fastify / pino                            |
| Database           | PostgreSQL + Drizzle ORM (drizzle-kit migrations); PGlite embedded in dev/test |

## Key decisions

| Date       | Decision                                                  | Rationale                                   |
| ---------- | -------------------------------------------------------- | ------------------------------------------- |
| 2026-09-09 | Expo Router for mobile navigation                         | Standard for modern Expo apps               |
| 2026-09-09 | Design tokens centralised in `apps/mobile/src/constants` | Single source for colours/spacing           |
| 2026-09-09 | npm-workspaces monorepo: `apps/mobile` + `apps/server`   | One place to manage client and server       |
| 2026-09-09 | Server is the source of truth; no offline write model    | Simpler data model to start                 |
| 2026-09-09 | Fastify + Zod + REST for the API                          | Light, TS-first, framework-agnostic contract |
| 2026-09-09 | Vitest for server tests                                   | Fast, native TS/ESM                         |
| 2026-09-09 | PostgreSQL + Drizzle; PGlite embedded in dev/test         | SQL-first, strong types; no external service to run tests |
| 2026-09-09 | Mobile runs as an Expo development build, not Expo Go     | Native modules + upcoming Google sign-in     |
| 2026-09-09 | `@splitcount/shared` workspace for the API contract       | First shared client/server contract (auth)   |
| 2026-09-09 | Auth: Google ID token verified server-side → own session | Google tokens are short-lived; we need persistent, revocable sessions |
| 2026-09-09 | Session = short JWT access token + rotating DB refresh token | Persistent sign-in + real server-side sign-out / revocation |
| 2026-09-10 | Invitation links hosted by the API (`GET /i/:code`) + `splitcount://` scheme | No domain or store presence yet; Universal/App Links slot in later without changing the contract |
| 2026-09-10 | No deferred deep linking: the landing page shows a code to type in | A third-party attribution SDK (Branch, AppsFlyer) is not worth it before the app is in stores |
| 2026-09-10 | Friendships stored once per pair, in a canonical order | The unique constraint alone rules out duplicates, including under concurrent acceptance |
| 2026-09-10 | `FriendSummary` (no email) is how another user is exposed | A public invitation preview must not leak the inviter's email address |
| 2026-09-11 | One `invites` table and one code space for every kind of invitation | The client captures a code before it can know what it leads to; one link format, one landing page, one preview route |
| 2026-09-11 | `friends` and `groups` register an `InviteHandler` rather than `invites` knowing them | Keeps the two features independent of each other while sharing the code lifecycle |
| 2026-09-11 | A `users` read module shared by `friends`, `groups` and `invites` | The open item below came due: a third feature needed `users` |
| 2026-09-11 | The pair group is keyed by the friendship (`groups.friendship_id`, unique) | "One group per pair, gone with the friendship" becomes a database guarantee, not application logic |
| 2026-09-11 | ~~Pair groups are created lazily, on first access~~ — **superseded** 2026-09-14: created eagerly, the moment the friendship is (see below) | No backfill for existing friendships, and `friends` needs no write dependency on `groups` |
| 2026-09-14 | Pair groups are created eagerly, the moment a friendship is — `friends` calls `groupsRepository.createPairGroup` directly (instantiated in `friendsPlugin`, the same "borrow a repository" pattern `ledger` already uses), not through the `groups` service | The Friends list is sourced from the pair group itself (id, favorite marker) rather than a parallel query, so the group must already exist by the time a friendship is listed — a get-or-create on every read was the alternative, and a write on a `GET` is worse than creating it once, up front |
| 2026-09-11 | A non-member gets `404` for a group, never `403` | A `403` would confirm the group exists |
| 2026-09-11 | One migrated PGlite per *test file*, truncated between tests | A database per test cost seconds each; same isolation, suite down from 92s to 17s |
| 2026-09-11 | Split arithmetic (`splitByShares`, largest-remainder rounding) lives in `@splitcount/shared` | The client's live split preview and the server's authoritative recomputation must always agree; two implementations of cent rounding will eventually drift |
| 2026-09-11 | A shares split defaults every participant to weight 1; there is no separate "equal" mode | An equal split *is* a shares split where everyone is weighted the same — a dedicated mode would just be that one case with its own code path |
| 2026-09-11 | Balances are computed on the fly from `transactions` / `transaction_participants`, not stored | No denormalized total to keep in sync while the feature is new; revisit if querying at scale becomes a real cost (see Open items) |
| 2026-09-11 | Transactions are the one thing that works on a pair group like a standard group | Every other direct pair-group route is refused by `assertNotPairGroup`; transactions must not share that guard, or the pair group could never hold anything. (Creating a *sub-group* under it is a second, later exception — 2026-09-12 below — since that acts on the new group, not the pair group itself) |
| 2026-09-11 | The balance between two people is attributed transaction by transaction (payer credited, concerned member debited), never derived from group balances | A group balance is a net against the *group*: it cannot say who owes whom. Deriving a per-person figure from settle-up suggestions instead would make the number move when an unrelated third party spends |
| 2026-09-11 | The per-friend balance is aggregated in SQL, while a group's stays an in-application sum | A group is bounded (a trip ends); the per-friend figure spans the caller's whole history across every group, so loading rows into Node is the wrong shape there |
| 2026-09-11 | The per-friend aggregate filters on "both people are on the transaction", with no group filter at all | Being on a transaction already implies having shared its group. Filtering on *current* membership instead would silently drop the debt of someone who left a shared group |
| 2026-09-11 | Each friend's balance rides on `GET /friends` rather than its own route; `friendSummarySchema` is left untouched | The friend list has no useful state without the amounts, and a second call would show names before figures. The summary shape is reused by group members, transaction participants and invitation previews, none of which have a balance |
| 2026-09-11 | The transaction date field uses `@expo/ui`'s `community/datetime-picker`, not a new dependency | `@expo/ui` was already a dependency but not yet linked into the native build; reusing it (SwiftUI `DatePicker` on iOS, a Material dialog on Android) needs the same native rebuild a brand-new picker library would have, for zero added dependency footprint |
| 2026-09-12 | A group's per-category breakdown is derived on the client, from the transactions the group screen already holds — no endpoint, no stored aggregate | It is the same call the screen already makes, and a second round trip would show a chart after the list it summarises. Valid only while the list is unpaginated (see Open items) |
| 2026-09-12 | The breakdown itself (`categoryBreakdown`) lives in `@splitcount/shared`, not in the mobile app | Same reasoning as the split arithmetic: the rule for what counts as spending, and the percentage rounding, must have one definition — and moving it behind an endpoint later is then an import change, not a rewrite |
| 2026-09-12 | Each category carries its own colour in the shared preset list | A chart and its legend describing different colours for the same category is a defect the type system can prevent; the colour is part of the category, not of the screen |
| 2026-09-12 | The donut is drawn with `react-native-svg` rather than stacked views | Thirteen arcs, exact hit-testing per slice and one implementation across iOS, Android and web. It is a native dependency, so it costs a dev-build rebuild (`docs/MOBILE.md`) |
| 2026-09-12 | Groups can nest via a single nullable `groups.parent_id`, not a materialised path or a closure table | The write path (create, delete) is simple and the read path (ancestors, descendants) is a bounded recursive query, since depth is capped; a closure table would trade that simplicity for write-time upkeep this scale does not need yet |
| 2026-09-12 | A group's parent is immutable after creation — no re-parenting endpoint | Removes cycle detection entirely: the tree is acyclic by construction, not by validation. Every tree computation (membership propagation, effective-archive, the statistics sub-tree scope) is then a straightforward top-down or bottom-up walk instead of an open-ended graph problem |
| 2026-09-12 | Nesting depth is capped at five levels (`groups.depth`, 0-4), enforced at creation | Bounds every recursive tree query and rules out pathological chains, at a depth generous enough for any real trip/household structure; `depth` is stored (not recomputed) because it is fixed at creation and lets the cap be a simple check rather than a query |
| 2026-09-12 | Membership in a group implies membership in every ancestor, enforced at every write path (add, invite acceptance, join) rather than checked lazily on read | Makes "who can see this group's transactions" answerable from that group's own membership row alone, with no need to walk up the tree on every read — the invariant is paid for once, at the few places membership changes, not on every access |
| 2026-09-12 | A member of a group's immediate parent who has not joined it gets `403 join_required`, not `404`, when asking for that group | The one deliberate exception to "non-membership is always 404": the caller already legitimately knows the group exists, because it is shown to them in the parent's own sub-group list. Kept narrow — it never applies transitively to a sibling's or grandchild's existence |
| 2026-09-12 | ~~A group's rolled-up balance and its statistics' "including sub-groups" scope are both resolved to "the group plus only the descendants the caller is a member of", entirely server-side~~ — **superseded**: balances no longer roll up at all (see 2026-09-12, below); the rule still holds for the statistics scope, the only sub-tree view left | Consistent with `docs/specs/groups.md`'s visibility rule: a sub-group being *visible* must never leak into what its statistics disclose about it |
| 2026-09-12 | `GroupDetail.readOnly` is a derived boolean ("this group or any ancestor of it is archived"), not a second stored flag | One field the client (and `transactions`' `requireActive`) can check without walking the tree itself; a root group's `readOnly` always equals its own `archivedAt !== null`, so nothing changes for the common case |
| 2026-09-12 | `join_required` is thrown from `requireMembership` itself, the single choke point almost every group route already shares, rather than added route by route | Every group route gets the exception uniformly for free, and there is exactly one place that can get it wrong |
| 2026-09-12 | Leaving or removing someone from a group cascades to every descendant via `removeMemberWithDescendants`, and any of those left with nobody in it is deleted in the same statement | Mirrors the existing single-group "last member leaving deletes it" rule, applied at every level the removal reaches; deleting a group still cascades its own remaining sub-tree through the database FK, so nothing recurses in application code |
| 2026-09-12 | The owner-cannot-leave guard extends to "would this cascade strand a sub-group the person solely owns", checked for both self-leave and forced removal | The failure mode (a sub-group left with an absent owner and other members still in it) is identical either way; scoping the guard to only self-leave would leave the forced-removal path free to create exactly the orphaned group the original guard exists to prevent |
| 2026-09-12 | `groups` reads a group's balance through a narrow `GroupBalances` interface (`balancesByGroup`) backed by `transactions`' own repository, injected at the plugin level rather than through `app.transactions` | The same `CounterpartyBalances`-over-a-repository pattern `friends` already uses for the per-friend total, for the same reason: `transactions`' Fastify plugin already depends on `groups`, so `groups` depending back on it would be circular at registration time |
| 2026-09-12 | `GET /groups` computes one `balancesByGroup` call for every group it lists, not one call per group — and `GET /groups/:groupId` one for the group plus each joined sub-group it shows | A user's account-wide group count is small and bounded, unlike the per-friend aggregate's account-wide *transaction history* scan (see Open items); batching still avoids N ledger round-trips for N groups on every load |
| 2026-09-12 | `transactions`' `requireActive` checks `GroupDetail.readOnly` instead of `archivedAt !== null` | Closes a gap the sub-groups work otherwise left open: a sub-group's own transactions were still writable while only an ancestor was archived, contradicting "a group is read-only exactly when it or any ancestor of it is archived" |
| 2026-09-12 | `GET /groups/:groupId/transactions` gains `?scope=group\|subtree` and an `excludedSubgroupCount` response field, rather than a dedicated statistics endpoint | The group-statistics breakdown is still computed client-side from a transaction list (`docs/ARCHITECTURE.md`'s earlier decision); nesting only changes *which* transactions that list contains, so it belongs on the existing list route, not a new one |
| 2026-09-12 | `scope=subtree` is resolved via `groups.subtreeScope` — a `GroupsService` method returning both the caller's member descendant ids and how many were excluded — computed from the `listDescendantIds` / `filterMemberGroupIds` repository primitives | One definition of "which of a group's descendants does this caller actually belong to". It is now the statistics scope's alone, since balances no longer cross into sub-groups at all |
| 2026-09-12 | The statistics sheet fetches its own transactions (`useTransactions(groupId, scope)`) instead of reusing the group screen's plain list | Its default scope (including sub-groups) usually differs from the plain list's (one group only); a group with no sub-groups still uses its own call, for consistency and because the extra request is cheap |
| 2026-09-12 | A pair group can now be a parent (`assertNotPairGroup` dropped from the create-sub-group guard); every group in that sub-tree is capped at the friendship's own two people by a service-level `pairCeiling` check on every membership-adding path, not by a schema constraint | A `CHECK` on `groups` cannot see who is a member; the invariant that actually matters ("this tree never grows a third person") only exists at the point membership rows are inserted |
| 2026-09-12 | An invitation link is refused outright (`getOrCreateInvite`/`rotateInvite`) for a `pairRooted` group, rather than checked on acceptance | An invite has no friendship check at all, unlike adding a friend directly — refusing generation is the only thing that actually closes the path, since acceptance already has no gate to add one to |
| 2026-09-12 | `GroupDetail.pairRooted` is a derived boolean (`ancestors[0] ?? group).kind === 'pair'`), not a second stored flag | Same shape as `readOnly`: one field the client reads to hide "add friends"/"share an invitation link" and skip the friend picker, without re-deriving the ancestor walk itself |
| 2026-09-12 | Creating a sub-group under a `pairRooted` parent defaults its members to the ceiling's own two people instead of leaving the second friend to join later | The self-join toggle already existed for the general "unjoined sub-group" case, but here it is pure friction: `pairCeiling` already resolves the only two ids such a sub-group could ever hold, so there is nothing to pick and nothing worth deferring |
| 2026-09-12 | Every group balance is scoped to **that group alone**; the sub-tree roll-up built earlier the same day was removed, `viewerBalanceCents` kept with the narrower meaning | The rolled-up figure could not be reconciled with anything on screen: no list inside a group accounted for it. Containment also deletes a whole class of question (whose descendants count, what a visible-but-unjoined one contributes) instead of answering it — `listDescendants` and `reimbursementScope` went with it |
| 2026-09-12 | The reimbursement plan is derived **client-side** from a group's balances by `planReimbursements` in `packages/shared`; the `GET .../reimbursements` route, its service method and `computeBalancesByGroup` were removed | Once the plan covers one group, it is a pure function of figures the client already has. Deriving it where they are read makes the plan and the balance list structurally incapable of disagreeing, needs no authorization of its own, and matches how the statistics breakdown already works |
| 2026-09-12 | The plan is greedy (exact matches first, then largest debtor against largest creditor), documented as "at most n−1 payments", never as minimal | A provably minimal set of payments is NP-hard; the product needs a short, deterministic, explainable plan, and a claim of optimality would be false |
| 2026-09-12 | A suggested payment carries no source group, and positions carry no per-group breakdown | Both were artefacts of the sub-tree scope. Within one group there is nothing to attribute: the group's own transaction list is the breakdown |
| 2026-09-12 | Recording a suggested payment reuses `POST /groups/:groupId/transactions` with `kind: "transfer"` and a client-side `TransactionPrefill`, with no settlement record and no "mark as settled" | The ledger stays the single source of truth: a settled flag nothing backs would drift from the transactions that define every balance in this product |
| 2026-10-02 | `NODE_ENV` defaults to `production`; in production `DATABASE_URL` and a non-local `PUBLIC_BASE_URL` are mandatory, checked at startup in `config/env.ts` | The previous defaults (development, optional database, localhost base URL) let a misconfigured deployment start cleanly on an in-memory PGlite and lose all data at restart, or mail out invitation links pointing at `localhost`. A server that cannot be configured correctly now fails fast, with every problem listed. Local development already needs a `.env` (Google client IDs, JWT secret), which sets `NODE_ENV=development` |
| 2026-10-02 | `TRUST_PROXY` is required in production; the client address (`request.ip`) is the one rate limits and logs key on | Behind a load balancer, `false` collapses every client onto the balancer's address and `true` lets clients forge theirs. The operator must state which one applies |
| 2026-10-02 | Rate limiting uses `@fastify/rate-limit` with in-process counters, in three tiers (global / `/auth/*` / public invitation routes) assigned by route in `http/rate-limit.ts` | Protects sign-in and invitation-code guessing, the only unauthenticated surface, without new infrastructure. Per-instance counters are accepted: the limits guard against abuse, not billing. A shared (Redis) store is the upgrade if exact limits across instances ever matter |
| 2026-10-02 | Security headers come from `@fastify/helmet` with a deny-everything default CSP; the invitation landing page overrides it per response with a hash-pinned CSP (`contentSecurityPolicyFor`), not `unsafe-inline` | The API serves JSON only, so nothing needs to be allowed. The landing page is the one HTML document and needs its inline style and script; its script embeds the invitation code, so the hash is computed per response. `Referrer-Policy: no-referrer` also keeps the code (in the URL) from leaking to the store links |
| 2026-10-02 | Graceful shutdown on SIGTERM / SIGINT (`shutdown.ts`): `app.close()` plus a periodic sweep of idle keep-alive connections, bounded by `SHUTDOWN_TIMEOUT_SECONDS` | A deploy or scale-down must not cut requests in half. Fastify alone leaves a connection that was busy at shutdown open for its 72s keep-alive timeout — found by the tests, and exactly what a load balancer's connections look like — so the sweep is what makes the drain finish in milliseconds instead of hitting the timeout |
| 2026-10-02 | The Postgres pool has an `error` listener that logs `db.pool.error` (`db/client.ts`) | `pg.Pool` emits `error` for a broken idle connection; unhandled, that crashes the process on any database restart or failover |
| 2026-10-03 | In production, migrations are a separate release step (`src/scripts/migrate.ts`); the server only verifies the schema is current (`migrations: 'verify'` in `db/plugin.ts`) and refuses to start otherwise | Migrating at startup lets N instances race on the same migrations. One explicit step, run once before the new version starts, also makes a failed migration block the release. The check turns "new image on an old schema" into a startup error instead of runtime 500s. Development and tests keep migrating at startup |
| 2026-10-03 | The server runs as a Docker image on a VPS: Compose stack per environment (Postgres + server) behind one Caddy proxy; `deploy.sh` backs up, migrates once, starts the server and rolls back if it is unhealthy | Nothing may depend on a hosting provider: a Linux box with Docker is the lowest common denominator. Compose over an orchestrator because there is one machine and one server instance. Scripts (tested against a fake `docker`, `deploy/test.sh`) rather than ad-hoc commands, so the order and the failure handling are reviewed code. Details and limits: `docs/OPERATIONS.md` |
| 2026-10-03 | Two environments, production and staging, both on the VPS; staging deploys on every merge to `main`, production promotes the image staging already ran | CI must not push straight to production. Promoting the same image means production never runs a build nobody has seen. No demo environment (decided: not worth it) |
| 2026-10-03 | Mobile releases are built on EAS (profiles `staging`, `production`, `production-apk`), triggered manually from GitHub Actions; JavaScript-only changes ship as EAS Update on a channel per profile, with `runtimeVersion` = the `appVersion` policy. Android only | Reproducible builds with a keystore held by EAS, and fixes without store review. Manual because builds are metered and an update is live in minutes. `appVersion` over `fingerprint` for predictability with the monorepo and local dev builds, at the cost of a rule to remember (bump `version` with any native change) — see `docs/MOBILE.md` |
| 2026-10-03 | The application id is `APP_ID` (`app.config.ts`), and a `production*` EAS build refuses the template's `com.anonymous…` placeholder | The id is permanent once published and the name is not final: keep it one value, and make publishing under the placeholder impossible rather than unlikely |
| 2026-10-04 | Off-machine backups go to S3-compatible object storage located in Europe | A dump on the machine's own disk does not survive losing the machine; keeping the copy in Europe keeps users' data there too |

## Open items

- No uptime monitor or alerting yet; the deployment itself stays provider-independent
  (`docs/OPERATIONS.md`).
- Access / refresh token lifetimes are first guesses (~15 min / ~60 days); tune before a
  public release.
- Development builds are local (`expo run:*`). Release builds and OTA updates are
  configured for EAS but not yet *used*: the Expo account, `eas init`, the EAS environment
  variables, `EXPO_TOKEN` and the final `APP_ID` are still to be done (checklist in
  `docs/MOBILE.md`).
- The product name and the application id (`APP_ID`) are not final; the id must be chosen
  before the first production build, and the Google OAuth Android client created for it.
- `users` is shared domain data: the auth feature owns the writes, everyone else reads
  through `features/users/repository.ts` (extracted 2026-09-11, when `groups` became the
  third reader). `friendships` is now in the same position — `groups` reads it directly
  for the pair group and for "is this person a friend of the caller?", and imports only
  the pure `orderPair` helper from `friends`. If a third reader appears, extract it the
  same way. Since 2026-09-11 `friends` is in that position with the ledger: it builds
  `GET /friends`'s per-friend balance from `transactions`' own repository
  (`balancesWith`), behind a narrow `CounterpartyBalances` interface declared on its
  service — read-only, and not through the transactions *service*, since the aggregate is
  already scoped to transactions the caller is party to and needs no group membership
  check. `transactions` stays the owner of those tables and of the rule. Since 2026-09-14
  `friends` also holds a narrow *write* dependency on `groups`: `friendsPlugin`
  instantiates `createGroupsRepository(app.db)` directly (not through the `groups`
  service) and calls its `createPairGroup` to materialise the implicit pair group the
  moment a friendship is created — `groups` itself has no dependency back on `friends`,
  so this stays one-directional.
- Invitation lifetime (7 days) is a first guess; tune with real usage.
- Group ownership cannot be transferred, so an inactive owner strands a group nobody can
  delete. Deliberate for now; revisit with real usage (`docs/specs/groups.md`).
- Balances are recomputed from the transaction rows on every request, both per group and
  per friend (`docs/specs/balances.md`). Fine at the volume a trip or a flatshare
  produces, and deliberately so: a stored total is a duplicate that every write path
  (create, edit, delete, group deletion, friendship removal) must keep correct, and a
  drifted money figure is the worst failure this product can have.
  **The per-friend aggregate is the one to watch**: a group's history is bounded by the
  trip that ends it, but that query spans the caller's entire history and grows with the
  lifetime of the account. Revisit when it is measured slow, not before. The right shape
  then is a `pair_balances(user_a, user_b, amount_cents)` table written in the same SQL
  transaction as every transaction write — it matches the read pattern exactly, one
  indexed row per friend — with the current computation kept as the recompute oracle.
- The transaction list has no pagination yet (`docs/specs/transactions.md`); revisit once
  a group's history grows large enough to matter. **Paginating it breaks the group
  statistics silently**: the client-side breakdown would then describe only the loaded
  page while still reading as the whole group. Whoever paginates the list moves
  `categoryBreakdown` behind a `GET /groups/:groupId/transactions/statistics` route,
  carrying the same `scope` parameter nesting adds, in the same change — the function is
  already shared and server-ready.
- **Nested groups, added 2026-09-12** (`docs/specs/groups.md`): re-parenting a sub-group
  and promoting one to a root group are both deliberately out of scope. Adding either
  later needs cycle detection (parent is no longer fixed at creation) and a rule for what
  happens to a sub-group's existing memberships when its ancestor set changes — someone
  could end up a member of a sub-group without being a member of its new parent, which
  the current design makes structurally impossible.
- **`GET /groups`'s balances** are one aggregate over the caller's own root groups,
  bounded by how many groups a user has rather than by the account's whole history, so
  they do not carry the growth risk of the per-friend aggregate above. Cheaper since the
  sub-tree roll-up was dropped: there is no descendant walk left in it.
