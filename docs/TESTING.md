# Testing

Living document. Conventions live in `docs/guidelines/TESTING.md`; this file records the
current setup and state.

## Tooling

| Workspace       | Runner    | Command                                     |
| --------------- | --------- | ------------------------------------------- |
| `apps/mobile`   | jest-expo | `npm run test --workspace @splitcount/mobile` |
| `apps/server`   | Vitest    | `npm run test --workspace @splitcount/server` |

From the repository root:

```bash
npm test          # runs every workspace's test script
npm run typecheck # tsc --noEmit in every workspace
npm run lint      # expo lint (mobile) + eslint (server)
```

## Layout

Co-locate tests with the code they cover: `foo.ts` → `foo.test.ts`, or a `__tests__/`
folder beside the unit under test. Feature test plans are derived from the feature spec's
acceptance criteria before implementation.

## Server tests

Prefer integration tests that build the Fastify app via `buildApp()` and drive it with
`app.inject(...)` (see `apps/server/src/routes/health.test.ts`). Vitest runs with
`NODE_ENV=test` and a silent logger. Unit-test isolated logic (calculations,
authorization rules) directly.

Database-backed tests use an in-memory **PGlite** instance (real Postgres SQL, no
external service), migrated per test file:

- `createTestDatabase()` (`src/test/database.ts`) — a fresh, migrated handle.
- `createTestApp()` (`src/test/app.ts`) — a ready Fastify instance wired to one.

Close it in `afterAll` (`app.close()` / `handle.close()`). External boundaries such as
Google token verification are mocked, never contacted.

The root `npm test` runs `pretest` first, which builds `@splitcount/shared` so both apps
resolve its compiled output.

## Client tests

`jest-expo` is configured. Import test globals explicitly from `@jest/globals` (ambient
`@types/jest` is not wired). Use `@testing-library/react-native` for component tests.
`transformIgnorePatterns` also transforms `@splitcount/shared`; native modules are mocked
(`__mocks__/`), and injected fakes (`GoogleModule`, `TokenStore`) keep native code out of
`AuthClient` tests.

## Current state

- `apps/server`: `GET /health` integration test; database migration tests
  (`src/db/client.test.ts`); auth unit + integration tests (`src/features/auth/`);
  friends unit + integration tests (`src/features/friends/`), covering invitation
  lifecycle, friendship symmetry and the HTML landing page (including escaping).
- `apps/mobile`: API endpoints (`src/lib/api/`), auth state machine
  (`src/features/auth/auth-client.test.ts`), auth screens, and the friends feature
  (`src/features/friends/`): pending-invite store, friends list, invite sharing and the
  invitation confirmation flow.

### Gotchas

- When faking `useAuth`, return **the same object on every render**. The real context
  memoises its value, so `authorizedFetch` is stable; a fresh `jest.fn()` per render makes
  every `useCallback`/`useEffect` that depends on it re-run, and data-loading screens loop.
- Server tests that depend on time inject a clock (`friends: { now }` in `createTestApp`)
  rather than waiting.
