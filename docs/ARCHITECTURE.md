# Architecture

Living document. Update it whenever a structural decision is made or changed.

## Overview

SplitCount is an npm-workspaces monorepo with a mobile client and a backend API. The
**server is the source of truth** for all shared data; the mobile client reads and writes
exclusively through the HTTP API.

The mobile client runs as an **Expo development build** (embeds `expo-dev-client`), not
the Expo Go sandbox — it relies on native modules Expo Go does not bundle, and Google
sign-in will need a native SDK. The web target still runs without a native build. See
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
                   creation, detail, membership).
      lib/         Cross-feature building blocks: logger, API client (lib/api).
    assets/        Images and fonts.
    metro.config.js  Monorepo-aware Metro config (watches the repo root).
  server/          Node / Fastify / TypeScript API.
    src/
      index.ts     Process entrypoint: builds the app and starts listening.
      app.ts       buildApp() factory — a configured Fastify instance, no listener.
      config/      Typed environment loading (env.ts, Zod-validated).
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
| `@splitcount/shared`   | The auth feature is the first client/server contract. Request and response shapes (`/auth/google`, `/auth/refresh`, `/auth/me`) and the `UserProfile` / `AuthSession` types must stay identical on both sides; duplicating Zod schemas would drift. Added 2026-09-09 with Google sign-in. Extended 2026-09-10 with the friends contract (`FriendSummary`, invitation responses), 2026-09-11 with the groups contract and the generalised invitation contract, and 2026-09-11 with the transactions contract and split arithmetic (`transactions.ts`) — the first *logic*, not just schemas, in the package: the client needs to preview a split live while composing a transaction, and the server needs to compute the same split as the authority, so the rounding algorithm itself has to be one implementation, not two that could drift. Now `auth.ts`, `friends.ts`, `groups.ts`, `invites.ts`, `transactions.ts`. |

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

## Tooling

| Concern            | Choice                                    |
| ------------------ | ----------------------------------------- |
| Monorepo           | npm workspaces                            |
| Language           | TypeScript (strict, shared base config)   |
| Mobile framework   | Expo Router                               |
| Server framework   | Fastify                                   |
| Server dev runner  | tsx; build via `tsc`                      |
| Validation         | Zod (server; shared schemas later)        |
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
| 2026-09-11 | Pair groups are created lazily, on first access | No backfill for existing friendships, and `friends` needs no write dependency on `groups` |
| 2026-09-11 | A non-member gets `404` for a group, never `403` | A `403` would confirm the group exists |
| 2026-09-11 | One migrated PGlite per *test file*, truncated between tests | A database per test cost seconds each; same isolation, suite down from 92s to 17s |
| 2026-09-11 | Split arithmetic (`splitByShares`, largest-remainder rounding) lives in `@splitcount/shared` | The client's live split preview and the server's authoritative recomputation must always agree; two implementations of cent rounding will eventually drift |
| 2026-09-11 | A shares split defaults every participant to weight 1; there is no separate "equal" mode | An equal split *is* a shares split where everyone is weighted the same — a dedicated mode would just be that one case with its own code path |
| 2026-09-11 | Balances are computed on the fly from `transactions` / `transaction_participants`, not stored | No denormalized total to keep in sync while the feature is new; revisit if querying at scale becomes a real cost (see Open items) |
| 2026-09-11 | Transactions are the one thing that works on a pair group like a standard group | Every other pair-group route is refused by `assertNotPairGroup`; transactions must not share that guard, or the pair group could never hold anything |

## Open items

- Backend deployment target: VPS-style host (e.g. AWS EC2). Needs a managed Postgres and
  `DATABASE_URL` in the environment; `npm run migrate` in the deploy step.
- Access / refresh token lifetimes are first guesses (~15 min / ~60 days); tune before a
  public release.
- Development builds are local (`expo run:*`) for now; EAS Build not set up (see
  `docs/MOBILE.md`).
- `users` is shared domain data: the auth feature owns the writes, everyone else reads
  through `features/users/repository.ts` (extracted 2026-09-11, when `groups` became the
  third reader). `friendships` is now in the same position — `groups` reads it directly
  for the pair group and for "is this person a friend of the caller?", and imports only
  the pure `orderPair` helper from `friends`. If a third reader appears, extract it the
  same way.
- Invitation lifetime (7 days) is a first guess; tune with real usage.
- Group ownership cannot be transferred, so an inactive owner strands a group nobody can
  delete. Deliberate for now; revisit with real usage (`docs/specs/groups.md`).
- Balances are recomputed from the transaction rows on every request. Fine at the volume
  a trip or a flatshare produces; if a long-lived group's history makes that aggregation
  costly, the next step is a denormalized running balance updated on write — not done
  now to avoid keeping a derived total in sync before the read pattern is known.
- The transaction list has no pagination yet (`docs/specs/transactions.md`); revisit once
  a group's history grows large enough to matter.
