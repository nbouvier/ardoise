# Testing

Living document. Conventions live in `docs/guidelines/TESTING.md`; this file records the
current setup and state.

## Tooling

| Workspace       | Runner    | Command                                     |
| --------------- | --------- | ------------------------------------------- |
| `apps/mobile`   | jest-expo | `npm run test --workspace @splitcount/mobile` |
| `apps/server`   | Vitest    | `npm run test --workspace @splitcount/server` |
| `packages/shared` | Vitest  | `npm run test --workspace @splitcount/shared` |

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
external service), migrated **once per test file**:

- `createTestContext()` (`src/test/app.ts`) — a ready Fastify instance plus `reset()`.
  Build it in `beforeAll`, call `reset()` in `beforeEach`. This is the default: migrating
  a PGlite database costs a second or two, so one per *test* made the suite five times
  slower for no extra isolation.
- `createTestApp()` — the same without the reset, for a file whose tests write nothing.
- `createTestDatabase()` / `resetDatabase()` (`src/test/database.ts`) — the handle-level
  building blocks.
- `signInAs(app, idToken)` (`src/test/auth.ts`) — a signed-in user and their headers.

Close it in `afterAll` (`app.close()` / `handle.close()`). External boundaries such as
Google token verification are mocked, never contacted.

Vitest's default timeouts are raised (`hookTimeout` 60s, `testTimeout` 30s in
`apps/server/vitest.config.ts`). Every database-backed file starts and migrates its own
PGlite, and the files run concurrently, so on a busy machine that setup alone can exceed
the 10s/5s defaults — a spurious failure that says nothing about the code. The timeouts
are a ceiling for setup, not a licence for slow tests: a *test* that needs seconds is
doing too much.

The root `npm test` runs `pretest` first, which builds `@splitcount/shared` so both apps
resolve its compiled output.

## Client tests

`jest-expo` is configured. Import test globals explicitly from `@jest/globals` (ambient
`@types/jest` is not wired). Use `@testing-library/react-native` for component tests.
`transformIgnorePatterns` also transforms `@splitcount/shared`; native modules are mocked
(`__mocks__/`), and injected fakes (`GoogleModule`, `TokenStore`) keep native code out of
`AuthClient` tests. `@expo/ui`'s date picker is mocked the same way
(`__mocks__/@expo/ui/community/datetime-picker.tsx`, mapped explicitly in `moduleNameMapper`
since it's a deep subpath import): pressing the mock reports a fixed date, enough to test
the wiring around it without a real host view, which Jest cannot render. Real calendar
interaction is a device concern.

## Current state

- `apps/server`: `GET /health` integration test; database migration tests
  (`src/db/client.test.ts`); auth unit + integration tests (`src/features/auth/`);
  invitation code and landing-page tests (`src/features/invites/`), including HTML
  escaping of both an inviter name and a group name; friends integration tests
  (`src/features/friends/`) covering the invitation lifecycle and friendship symmetry;
  groups unit + integration tests (`src/features/groups/`) covering membership
  authorization on every route, archiving, deletion cascades, group invitations, and the
  implicit pair group (idempotence under concurrency, immutability, cascade on unfriend);
  transactions unit + integration tests (`src/features/transactions/`) covering the
  balance calculation (sign convention, sum-to-zero) in isolation, and end-to-end: every
  split shape, the pair-group regression (transactions must **not** be refused by the
  same guard that blocks every other pair-group mutation), archived-group read-only
  behaviour, cross-group transaction access, and cascade deletion.
- `packages/shared`: the split algorithm (`splitByShares`) — the sum invariant across
  many generated totals/weights/group sizes, rounding determinism, tie-breaking — and the
  transaction request schema's shape per kind.
- `apps/mobile`: API clients (`src/lib/api/`, with shared fakes in `src/test-utils/`),
  auth state machine (`src/features/auth/auth-client.test.ts`), auth screens, the
  invitation feature (`src/features/invites/`): pending-invite store and the confirmation
  flow for both kinds of invitation, the friends feature (`src/features/friends/`): list,
  invite sharing and opening the group shared with a friend, the groups feature
  (`src/features/groups/`): list with the archived toggle, creation with friend selection,
  and the detail screen — now transaction-first, with group management behind the
  "Details" sheet, including the pair-group variant where every management action is
  absent **but "Add a transaction" is present**, and the transactions feature
  (`src/features/transactions/`): the split editor (selection, weight stepper, live
  preview, mode switching, the allocation indicator), the add/edit form (defaults, request
  shape for each kind, full-replace edit, transfer validation), the transaction row's
  "my share" calculation, and the date field's local-date conversion (no time-zone shift)
  and its iOS/Android wiring.

### Gotchas

- When faking `useAuth`, return **the same object on every render**. The real context
  memoises its value, so `authorizedFetch` is stable; a fresh `jest.fn()` per render makes
  every `useCallback`/`useEffect` that depends on it re-run, and data-loading screens loop.
- Server tests that depend on time inject a clock (`invites: { now }` / `groups: { now }`
  in `createTestContext`) rather than waiting.
- A screen that navigates needs `expo-router` mocked (`useRouter: () => ({ push })`).
  Assert on the typed object form — `{ pathname: '/groups/[id]', params: { id } }` — since
  that is what the code passes.
- `resetDatabase` truncates `users` and `groups` with `cascade`. Those are the two roots:
  a standard group hangs off no user, so truncating `users` alone would leave it behind.
  A new top-level table needs adding there.
