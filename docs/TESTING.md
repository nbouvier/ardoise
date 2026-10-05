# Testing

Living document. Conventions live in `docs/guidelines/TESTING.md`; this file records the
current setup and state.

## Tooling

| Workspace       | Runner    | Command                                     |
| --------------- | --------- | ------------------------------------------- |
| `apps/mobile`   | jest-expo | `npm run test --workspace @ardoise/mobile` |
| `apps/server`   | Vitest    | `npm run test --workspace @ardoise/server` |
| `packages/shared` | Vitest  | `npm run test --workspace @ardoise/shared` |

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

The root `npm test` runs `pretest` first, which builds `@ardoise/shared` so both apps
resolve its compiled output.

## Client tests

`jest-expo` is configured. Import test globals explicitly from `@jest/globals` (ambient
`@types/jest` is not wired). Use `@testing-library/react-native` for component tests.
`transformIgnorePatterns` also transforms `@ardoise/shared`; native modules are mocked
(`__mocks__/`), and injected fakes (`GoogleModule`, `TokenStore`) keep native code out of
`AuthClient` tests. `@expo/ui`'s date picker is mocked the same way
(`__mocks__/@expo/ui/community/datetime-picker.tsx`, mapped explicitly in `moduleNameMapper`
since it's a deep subpath import): pressing the mock reports a fixed date, enough to test
the wiring around it without a real host view, which Jest cannot render. Real calendar
interaction is a device concern.

Gestures and animations run under Jest through `apps/mobile/jest.setup.js`:
gesture-handler's own `jestSetup`, `react-native-worklets` mocked (worklets run as plain
functions) and Reanimated's `setUpTests()`. A gesture is driven with
`fireGestureHandler(getByGestureTestId('…'), [BEGAN, ACTIVE, END events])` from
`react-native-gesture-handler/jest-utils` — the app's own gestures carry test ids
(`pager`, `dismiss-page`, `pull-to-refresh`) — inside `act`, since the result reaches React
through `scheduleOnRN`. The decisions themselves (`pageAfterSwipe`, `dragPosition`,
`dismissesPage`, `refreshesOnRelease`) are pure and tested directly. Under Jest nothing is
laid out, so a `Pager` page is as wide as the window: swipe by a fraction of
`Dimensions.get('window').width`. The pages next to the one shown are drawn but hidden
from accessibility, so default queries only see the page shown; pass
`includeHiddenElements: true` to reach a neighbour. The bottom tabs' navigator
(`PagerTabs`) is driven through `renderRouter` from `expo-router/testing-library`
(its `toHavePathname` / `getPathname` do not survive RNTL v14's async render — assert on
the selected tab and the page shown instead). The drawn pull-to-refresh is Android's;
tests run as iOS, so the screens' own tests drive the native `RefreshControl` and
`PullToRefreshScrollView` is tested directly. What a swipe *feels* like is a device
concern.

## Continuous integration

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

| Job | Runs | Fails the run when |
| --- | --- | --- |
| `secrets` | gitleaks (pinned version, checksum verified) over the whole git history, findings redacted | a secret is found in any reachable commit (see `docs/guidelines/SECURITY.md`) |
| `verify` | `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` (both apps), `deploy/test.sh`, `docker compose config` on both compose files | any of them fails; or a compose file no longer resolves with `deploy/.env.example` (a required variable missing, a typo) |
| `image` | builds the server `Dockerfile` for `linux/amd64` and `linux/arm64` (needs `secrets` and `verify`); on `main` also pushes it to GHCR as `sha-<7 chars>` | the image does not build for one of the two architectures |

These are the same commands as "Validation" in `CLAUDE.md`: a green CI means those pass on
a clean Linux checkout, with no leftover `dist/` or `.env`. Reproduce a CI failure with
`npm ci && npm run lint && npm run typecheck && npm test` from the repo root (`npm ci`
rebuilds `packages/shared`; a stale `dist/` is the usual cause of a local-only pass).

`deploy/test.sh` checks the order and the failure handling of `deploy.sh` / `backup.sh` /
`backup-offsite.sh` against a fake `docker` and `curl` (migration fails → the new server
never starts; unhealthy server → previous image restored; a second concurrent deploy is
refused; backup retention; off-site: the dump just taken is what restic receives, a
failed dump or copy is reported to the monitor and never pruned after, an unreachable
monitor does not fail the backup). It
needs no Docker and runs in a second. What no automated test covers: the compose stack
actually running, and the image under real traffic — that is what staging is for.

### Rehearsing a deploy locally

Before changing `Dockerfile`, `deploy/compose.yaml` or the deploy scripts, run the real
`deploy.sh` once with a local Docker — it found a first-deploy race the fake `docker`
cannot see (the Postgres healthcheck, now over TCP). In a throwaway directory holding
copies of the `deploy/` scripts (`*.sh` but `test.sh`) and `compose.yaml`, and a `.env` with
`DEPLOY_ENV=localtest` and a free `SERVER_PORT`:

```bash
docker run -d --rm --name sc-registry -p 127.0.0.1:5000:5000 registry:2
docker build -t localhost:5000/ardoise-server:sha-0000001 .   # from the repo root
docker push localhost:5000/ardoise-server:sha-0000001
./deploy.sh localhost:5000/ardoise-server:sha-0000001          # in the throwaway dir
```

Worth checking: a first deploy on an empty volume, a second deploy (`pending: 0`), an
image whose `CMD` exits (rollback to the previous tag, `release.env` unchanged), and the
restore of `docs/OPERATIONS.md`. Clean up with `./compose.sh down -v` and
`docker stop sc-registry`.

An ARM image rehearses the same way on an x86 machine (Docker Desktop emulates it): build
with `docker buildx build --platform linux/arm64 --load …`, slower but faithful.

`backup-offsite.sh` needs an S3 endpoint: `rclone serve s3` stands in for the bucket
(`rclone/rclone` image, `serve s3 --addr :9000 --auth-key <id>,<secret> /data`, then
`mkdir /data/<bucket>` in the container). Point `RESTIC_REPOSITORY` at
`s3:http://host.docker.internal:9000/<bucket>`, `restic init` once, run the script, then
restore with the commands of `docs/OPERATIONS.md`. Stopping that container shows the
outage path (restic retries ~15 minutes, then the run fails). Under Git Bash, set
`MSYS_NO_PATHCONV=1` or container paths such as `/data` get rewritten.

## Current state

What each suite covers, by workspace and feature. Paths are relative to the workspace.

### `apps/server`

- **Platform and hardening** (`docs/DEPLOYMENT.md`)
  - `GET /health` integration test.
  - `src/config/env.test.ts`: production startup requirements, `TRUST_PROXY` parsing
    (`loadEnv` takes a plain object, no process env to fiddle with).
  - `src/http/`: `error-handler` (no internal message ever reaches the client, the cause
    is logged), `trust-proxy` (`request.ip` under each setting, via
    `app.inject({ remoteAddress })`), `rate-limit` (tiers, shared budgets, per-address
    isolation, `/health` exempt — small limits passed through `createTestApp({ rateLimit })`)
    and `security-headers`.
  - `src/shutdown.test.ts` drives `installGracefulShutdown` with a fake `process` against
    a really listening app: draining, the timeout and the idle-connection sweep over real
    sockets; the timeout and a failed close reported, and queued reports sent before the
    exit.
  - Error reporting (`src/error-reporting.test.ts`, with `@sentry/node` mocked): off
    without a DSN, no data collection, `strict` unhandled rejections, the `Fastify`
    integration removed, the request scrubbed down to method + redacted URL, sensitive
    `extra` fields redacted. `error-handler.test.ts` checks a 5xx is reported under its
    route template and a 4xx is not. The scrubbing was also checked once end to end
    against a fake ingest endpoint (`docs/LOGGING.md`); that check is not automated.
  - Database: migrations (`src/db/client.test.ts`, including the pending-migration count
    the production startup check relies on), the pool error handler
    (`src/db/pool.test.ts`) and the three plugin modes `apply` / `verify` / `skip`
    (`src/db/plugin.test.ts`).
- **Auth** (`src/features/auth/`): unit and integration tests.
- **Invitations** (`src/features/invites/`): invitation codes and the landing page,
  including HTML escaping of both an inviter name and a group name.
- **Friends** (`src/features/friends/`): the invitation lifecycle, friendship symmetry,
  and `GET /friends` carrying the pair group's `groupId` and `favorite`, personal to the
  caller, with favorited friends first (`docs/specs/favorites.md`).
- **Groups** (`src/features/groups/`), unit and integration:
  - membership authorization on every route, archiving, deletion cascades, group
    invitations;
  - the implicit pair group: created eagerly with the friendship, a single group under a
    race, immutability, cascade on unfriend;
  - favorites (`docs/specs/favorites.md`): toggling, idempotence, personal to the caller,
    unaffected by archived state, refused for a non-member, dropped with the membership,
    favorite-first ordering in the group list's active and archived sections and among a
    parent's joined sub-groups;
  - `GET /groups/favorites` (`docs/specs/home.md`): all three kinds at once,
    active-then-alphabetical ordering with a pair group sorted under the other member's
    name, a sub-group's ancestors and own balance, empty for a caller who starred
    nothing, never another member's;
  - balances (`plugin.test.ts`), including **containment**: a sub-group's figure stays in
    the sub-group, a parent's is its own, every level of a nested tree carries its own,
    and an unjoined sub-group shows `0` — the regression guarding the removed sub-tree
    roll-up.
- **Transactions** (`src/features/transactions/`), unit and integration:
  - the balance calculation in isolation (sign convention, sum to zero);
  - end to end: every split shape, archived-group read-only behaviour, cross-group
    transaction access, cascade deletion;
  - the pair-group regression: transactions must **not** be refused by the guard that
    blocks every other pair-group mutation;
  - the category field: round-trips, defaults to Other, an unknown value is refused,
    resets to Other when none is given;
  - `GET /me/transactions` (`docs/specs/home.md`): the involvement filter from both sides
    (paid by the caller, concerning the caller — and, the one that must **not** appear, a
    transaction between two other members of the caller's group), the membership
    boundary (a group the caller has left serves nothing, even where they are still a
    participant), and the cap with same-day ties in recording order.

### `packages/shared`

- **Splits** (`splitByShares`): the sum invariant across many generated totals, weights
  and group sizes; rounding determinism; tie-breaking. The transaction request schema's
  shape per kind.
- **Categories**: unique keys, and an emoji, a label and a distinct colour each.
- **Statistics** (`categoryBreakdown`): kind filtering (transfers never count), a
  selected subset of participants counted by their own shares rather than what they paid
  (one member, several summed, an empty selection), ordering, and the two sum invariants —
  amounts to the total, percentages to exactly 100 — across many generated shapes.
- **Reimbursements** (`planReimbursements`): the clearing property and the payment-count
  bound over 200 generated balance sets, exact-match pairing, a chain of debts collapsing
  into one payment, zero-balance people left out, independence from input order.

### `apps/mobile`

- **Error reporting** (`src/lib/error-reporting.test.ts`, `src/lib/logger.test.ts`,
  `@sentry/react-native`, `expo-constants` and `expo-updates` mocked): off without a DSN,
  the environment from the update channel, which errors are reportable, breadcrumbs and
  events scrubbed (sensitive keys, invitation codes), the logger's routing of each level,
  and `errorFields` staying printable while carrying the original error. The module keeps
  "started" state, so each test loads a fresh copy (`jest.isolateModules`); the pure
  functions are imported normally, since an isolated copy would see different error
  classes and break `instanceof`.
- **Shared building blocks**: API clients (`src/lib/api/`, shared fakes in
  `src/test-utils/`); `src/lib/stable-order.test.ts`, the order-preserving merge behind
  "a row does not jump when I favorite it" — known ids keep their position, a fresh field
  value applies without moving the row, a new id is appended, a dropped one disappears,
  an empty previous order keeps the fresh data as-is.
- **Auth** (`src/features/auth/`): the state machine (`auth-client.test.ts`) and the
  screens.
- **Invitations** (`src/features/invites/`): the pending-invite store and the
  confirmation flow for both kinds of invitation.
- **Friends** (`src/features/friends/`): the list; the one "New friend" page (invite link
  and code entry together, a typed code handed off, the chevron that closes it); opening
  the group shared with a friend directly by its known id, with no request first; the
  favorite star on a friend's row, toggling through the same `setGroupFavorite` a group
  uses and pinning favorited friends first.
- **Groups** (`src/features/groups/`):
  - the list with the archived toggle; the one "New group" page (creation with friend
    selection, joining by code — a pasted link cut down to its code — and the chevron
    that closes it);
  - the detail screen's four tabs (Transactions by default, Balances, Statistics, Manage),
    with group management on Manage, and the pair-group variant where every management
    action is absent **but "Add a transaction" is present**;
  - the favorite star on the group list row, on the group screen's header (pair groups
    included) and on a joined sub-group's row, including the notify-then-refetch path a
    sub-group's own toggle relies on;
  - on both the group list and the friend list: starring a row moves it across the
    divider rule at once (no rule while nothing is a favorite), and a *later* refresh
    (another change notifying the same `groupsChanged` signal) brings the server's order
    into view.
- **Home** (`src/features/home/`): the identity block; both sections' empty states;
  favorites of every kind, with a sub-group's breadcrumb; a star taking its row *out* of
  that section (rather than moving it, as everywhere else); the latest list naming the
  group of each transaction and opening that group rather than the transaction; both
  sections re-reading when something changes elsewhere (`transactionsChanged` /
  `groupsChanged`); one section failing and retrying without taking the other or the
  identity down.
- **Transactions** (`src/features/transactions/`):
  - the split editor: selection, weight stepper, live preview, mode switching, the
    allocation indicator; **Others** as the last row in both modes (never "Me", not
    concerned by default, sent as `userId: null`, zero removes it, counted in "left to
    allocate", alone in a split);
  - the add/edit form: defaults (Other as the category), the request shape for each
    kind, full-replace edit, transfer validation, the category badge that opens the
    picker sheet and updates without a separate save step; **Others** as a split
    participant in the request, never listed by "Who paid" / "To", and kept as the
    payer or the transfer's recipient when a stored transaction is edited (a stored
    null payer is not read as the viewer, an unpicked recipient is not read as Others);
  - the category picker: selection, every category reachable, none with a "clear"
    behaviour;
  - `transaction-request.ts` (rebuilding a split for the form), the row's "my share"
    calculation (the spec's 60 € example reads +20 for the payer, an Others payer reads
    "Others" and "—") and category emoji, the date field's local-date conversion (no time-zone
    shift) and its iOS / Android wiring.
- **Statistics** (`src/features/statistics/`): the donut geometry (the ring always
  closes, a sliver stays visible, a full ring is drawn as two halves) and the sheet —
  totals and legend, one arc per category, the type toggle, narrowing and summing the
  per-member selection, the "select at least one" empty state, selecting and deselecting a
  slice, each empty state saying *which* view is empty; a transaction partly or wholly for
  Others counting members' shares only, and Others never in the participant checklist.
- **Reimbursements** (`src/features/reimbursements/`): a chain of debts shown as one
  payment; each payment worded from the viewer's point of view, their own first;
  recording one by tapping it; the explained (not silent) refusal on an archived group or
  with a former member; the settled state; the states derived from balances — their
  spinner while loading, their retry on failure, never a "settled" read produced by a
  failure. On the group screen: the plan opening from the header and handing a pre-filled
  transfer to the transaction form (the debtor as payer, not the viewer).

### Gotchas

- Each database-backed test file starts its own PGlite (WASM, memory-hungry). When the
  machine is short on memory, workers die with `Array buffer allocation failed` /
  `Worker exited unexpectedly` and unrelated files fail at random — that is memory, not a
  regression. Re-run with fewer workers: `npx vitest run --maxWorkers=3`.
- Rate limits are set to a million per minute in `apps/server/vitest.config.ts`: every
  test shares one client address. A test that needs to hit a limit passes small ones
  (`createTestApp({ rateLimit: { authPerMinute: 3 } })`) and uses a fresh
  `remoteAddress` per test so counters never carry over.
- Hooks (`onClose`, …) must be added before `app.listen()`; a test that listens on a real
  port and needs one takes it through a `configure` callback. An `onClose` hook that
  throws *synchronously* escapes as an uncaught exception — reject asynchronously.

- When faking `useAuth`, return **the same object on every render**. The real context
  memoises its value, so `authorizedFetch` is stable; a fresh `jest.fn()` per render makes
  every `useCallback`/`useEffect` that depends on it re-run, and data-loading screens loop.
- `toHaveTextContent('…')` compares the element's **whole** text, not a substring (RNTL
  v14). Pass a regex (`toHaveTextContent(/Travel/)`) when the element also renders an
  emoji or a suffix.
- Server tests that depend on time inject a clock (`invites: { now }` / `groups: { now }`
  in `createTestContext`) rather than waiting.
- A screen that navigates needs `expo-router` mocked (`useRouter: () => ({ push })`).
  Assert on the typed object form — `{ pathname: '/groups/[id]', params: { id } }` — since
  that is what the code passes.
- `resetDatabase` truncates `users` and `groups` with `cascade`. Those are the two roots:
  a standard group hangs off no user, so truncating `users` alone would leave it behind.
  A new top-level table needs adding there.
