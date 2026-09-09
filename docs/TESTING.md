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

## Client tests

`jest-expo` is configured. `react-test-renderer` is deprecated under React 19; use
`@testing-library/react-native` for component tests (add it with the first one).

## Current state

- `apps/server`: one integration test covering `GET /health`.
- `apps/mobile`: no tests yet (`jest --passWithNoTests`); real suites arrive with the
  first feature.
