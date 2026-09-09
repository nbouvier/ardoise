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
| `@splitcount/shared`   | The auth feature is the first client/server contract. Request and response shapes (`/auth/google`, `/auth/refresh`, `/auth/me`) and the `UserProfile` / `AuthSession` types must stay identical on both sides; duplicating Zod schemas would drift. Added 2026-09-09 with Google sign-in. |

## Client / server contract

- REST over HTTP/JSON. Request and response shapes are validated with Zod on the server.
- When a type or schema is needed on both sides, it moves into a `packages/*` workspace
  rather than being duplicated.
- The mobile client treats the server as authoritative: no offline write model yet.

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

## Open items

- Backend deployment target: VPS-style host (e.g. AWS EC2). Needs a managed Postgres and
  `DATABASE_URL` in the environment; `npm run migrate` in the deploy step.
- Access / refresh token lifetimes are first guesses (~15 min / ~60 days); tune before a
  public release.
- Development builds are local (`expo run:*`) for now; EAS Build not set up (see
  `docs/MOBILE.md`).
