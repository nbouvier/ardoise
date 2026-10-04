# SplitCount

An app for sharing expenses between people. SplitCount is designed as a successor to
Tricount, adding stronger organisation and better expense tracking.

The backend is the source of truth; the mobile client reads and writes through the API.

## Stack

- **Monorepo** — npm workspaces
- **`apps/mobile`** — [Expo](https://expo.dev) SDK 57, React Native, TypeScript, Expo Router
- **`apps/server`** — Node, [Fastify](https://fastify.dev), TypeScript
- **`packages/*`** — shared, platform-neutral code (added on demand)

## Getting started

```bash
npm install
```

Mobile client — runs as a **development build** (not Expo Go), or on the web:

```bash
npm run mobile:web        # browser, no native build needed
npm run mobile:android    # build + install the dev build, then serve (needs Android SDK)
npm run mobile:ios        # macOS + Xcode only
npm run mobile            # dev server, once a dev build is installed
```

Expo Go is not supported (the app uses native modules it does not bundle, and Google
sign-in will need a native SDK). See `docs/MOBILE.md`.

Backend API:

```bash
cp apps/server/.env.example apps/server/.env
npm run server        # or: npm run dev --workspace @splitcount/server
```

## Validation

Run from the repository root; each script fans out to every workspace:

```bash
npm run lint
npm run typecheck
npm test
```

## Project layout

- `apps/mobile/` — Expo client (`src/app/` routes, `src/components/`, `src/hooks/`, `src/constants/`)
- `apps/server/` — Fastify API (`src/app.ts` factory, `src/routes/`, `src/config/`)
- `packages/` — shared code, created when something is genuinely shared
- `docs/` — living documentation (architecture, product, API, mobile, testing, database, logging, design)
- `docs/specs/` — feature specifications, the source of truth for established behavior
- `docs/guidelines/` — authoring conventions for specs, testing, observability and secrets

See `CLAUDE.md` for the full working agreement.
