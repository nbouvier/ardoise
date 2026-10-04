# SplitCount

An app for sharing expenses among friends, family or flatmates, with nested sub-groups,
expense tracking, reimbursement plans and advanced statistics.

The backend is the source of truth; the mobile client reads and writes through the API.
What the product does today is summarised in `docs/PRODUCT.md`.

## Stack

- **Monorepo** — npm workspaces
- **`apps/mobile`** — [Expo](https://expo.dev) SDK 57, React Native, TypeScript, Expo Router
- **`apps/server`** — Node, [Fastify](https://fastify.dev), TypeScript, PostgreSQL (Drizzle)
- **`packages/shared`** — the platform-neutral API contract shared by both

## Getting started

Prerequisites: Node.js 22 or later (`.nvmrc` pins the recommended version), and a Google Cloud
project with OAuth client IDs — sign-in is Google only (`docs/specs/authentication.md`).

```bash
npm install
```

Backend API — in development it runs on an embedded PGlite database, no Postgres needed:

```bash
cp apps/server/.env.example apps/server/.env    # then set GOOGLE_CLIENT_IDS and AUTH_JWT_SECRET
npm run server
```

Mobile client — runs as a **development build** (not Expo Go), or on the web:

```bash
cp apps/mobile/.env.example apps/mobile/.env    # then set the Google client IDs
npm run mobile:web        # browser, no native build needed
npm run mobile:android    # build + install the dev build, then serve (needs the Android SDK)
npm run mobile:ios        # macOS + Xcode only
npm run mobile            # dev server, once a dev build is installed
```

Expo Go is not supported: the app uses native modules it does not bundle, including the
Google sign-in SDK. See `docs/MOBILE.md`.

## Validation

Run from the repository root; each script fans out to every workspace:

```bash
npm run lint
npm run typecheck
npm test
```

## Project layout

- `apps/mobile/` — Expo client (`src/app/` routes, `src/features/`, `src/components/`, `src/lib/`)
- `apps/server/` — Fastify API (`src/app.ts` factory, `src/features/`, `src/config/`, `drizzle/` migrations)
- `packages/shared/` — API contract and shared arithmetic (Zod schemas, splits, statistics)
- `.github/` — CI workflows
- `docs/` — living documentation (architecture, product, API, mobile, testing, database, logging, design, deployment)
- `docs/specs/` — feature specifications, the source of truth for established behavior
- `docs/guidelines/` — authoring conventions for specs, testing, observability and secrets

`CLAUDE.md` is the working agreement every change follows, by people and coding agents alike.

## License

[GNU Affero General Public License v3.0](LICENSE) or later. You may run, study, modify
and self-host it; if you distribute a modified version, or let other people use one over a
network, you must publish its source under the same license. See `NOTICE` for
third-party material.
