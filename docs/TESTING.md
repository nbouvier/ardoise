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
  caller, with favorited friends first (`docs/specs/favorites.md`). Friend balances
  (`balances.test.ts`): the per-friend SQL aggregate cross-checked against its in-memory
  oracle `computePairwiseBalances` on a ledger with Others on every side, and Others never
  counted between two friends.
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
  - **Others** (`docs/specs/transactions.md`): the spec's 60 € example, an only-Others
    split, Others as payer and at either end of a transfer, income — none of it reaching a
    balance. The generated-ledger property (group balances sum to zero, a member's pairwise
    balances sum back to their group balance) runs with Others as both payer and
    participant. End to end: the API accepts Others everywhere and refuses it twice in a
    split or at both ends of a transfer; the database itself refuses a second Others row;
    an edit keeps it; and on one mixed ledger the group's balances, each member's
    `viewerBalanceCents` (the per-group SQL aggregate) and `/friends` (the per-friend one)
    all agree. These Others tests fail against the pre-Others rules;
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
- **Legal pages** (`src/features/legal/`, `src/http/language.ts`,
  `docs/specs/legal-pages.md`): the language choice (`?lang` over `Accept-Language`, weights
  and order, `q=0`, unsupported languages, no header); each page public, locked down by
  its CSP, cookie-free, `Vary: Accept-Language`, in both languages with the link to the
  other and the four-page footer; the legal notice escapes the configured publisher and
  shows the host; the privacy policy and the terms carry each required statement (the text
  itself is reviewed by reading); no request log line carries the client's address
  (mutation-checked by putting `remoteAddress` back). The production startup check for
  each legal variable is in `config/env.test.ts`.
- **Account deletion** (`src/features/account/`, `docs/specs/account-deletion.md`):
  - generated ledger (`repository.test.ts`): every payer, Others included, against every
    set of concerned parties in both split modes; after deleting one member, every row
    equals the same ledger written with that member as Others from the start (merged
    into an existing Others share, a transfer that became Others to Others gone), every
    transaction still sums to its amount with at most one Others share, and the others'
    balances are unchanged by the rewrite. Breaking the weight merge or keeping the
    Others-to-Others transfers makes it fail;
  - end to end (`plugin.test.ts`): an access token still within its lifetime and the
    refresh token both refused after deletion; friendships end with their pair groups and
    those groups' sub-groups; in a shared group the user's name and id appear nowhere,
    amounts, dates, titles and the other shares are kept, and the remaining balances are
    what Others implies; ownership passes to the earliest-joined member, per group;
    a group left empty goes with its sub-groups; invitation links stop working; only the
    id is kept and a new sign-in is a new account; all-or-nothing, checked by making the
    very last write fail with a trigger; the deletion preview; the public page, in
    English and, for a browser preferring French, in French with the legal footer;
  - the database itself refuses to delete a user still named on a transaction, and a
    write naming an account deleted meanwhile is refused as `not_group_member` rather than
    failing with a server error;
  - the operator command's logic (`deleteAccounts`): deletes, keeps listing an id
    already gone, refuses what is not an id, and repeating it changes nothing.
- **Placeholder members** (`src/features/groups/`, `docs/specs/placeholder-members.md`):
  - generated ledger (`claim.test.ts`): the placeholder, the claimer, another member and
    Others as every payer against every set of concerned parties in both split modes;
    after the claim every row equals the same ledger written with the claimer in the
    placeholder's place from the start (shares merged with the claimer's own, a transfer
    between the two gone), each transaction still sums to its amount with one share per
    person, and every balance is unchanged by the rewrite;
  - end to end (`placeholders.test.ts`): created with a group or later, counted as
    members and flagged, names unique per tree whatever the case, a sub-group taking its
    parent's and adding new ones upward, another tree's refused as a stranger, refused in
    a friendship's tree; paying, sharing and balances; the owner leaving when only
    placeholders remain deletes the group with them, but not when another account
    remains; a group deleted with placeholders still on transactions; never an heir on
    account deletion; the claim list across the tree with counts and per-group balance;
    a claim rewriting transactions and memberships, merging with a former member and
    dropping the self-transfer; one claim per member and per placeholder, two racing
    claims with one winner; refused archived and to a non-member; rename within the
    uniqueness rule; removal from the root turning its part into Others, from a
    sub-group only leaving the branch.
  - Breaking the self-transfer deletion, letting a placeholder inherit ownership, letting
    placeholders keep a group alive, or skipping the claimer's new memberships each makes
    them fail.

### `packages/shared`

- **Splits** (`splitByShares`): the sum invariant across many generated totals, weights
  and group sizes; rounding determinism; tie-breaking, Others last. The transaction request
  schema's shape per kind, and Others (`null`): accepted as participant, payer and either
  transfer end, refused twice, never inferred from a missing `userId`.
- **Balance effect** (`balanceEffectCents`, `memberSharesCents`): the client's statement of
  the balance rule — the spec's Others example, only-Others, an Others payer, income, and
  members summing to zero.
- **Categories**: unique keys, and an emoji, a label and a distinct colour each.
- **Group requests** (`groups.test.ts`): placeholder names are trimmed, never empty and
  never the same twice whatever the case; adding members takes friends, new placeholders
  or both, and refuses a request that adds nobody.
- **Statistics** (`categoryBreakdown`): kind filtering (transfers never count), a
  selected subset of participants counted by their own shares rather than what they paid
  (one member, several summed, an empty selection), ordering, and the two sum invariants —
  amounts to the total, percentages to exactly 100 — across many generated shapes. Others'
  share is never counted, whoever paid, and an Others payer still counts the members'.
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
  screens. Account deletion (`docs/specs/account-deletion.md`): `deleteAccount` signs out
  after a `204`, treats a `401` (already gone) as done, and stays signed in on a failure;
  the Account page opens Delete account from its own row, outside the profile menu; the
  Delete account page states what goes and stays, totals what the user is owed and what they
  owe, each unfolding into its groups (or says none is lost), deletes nothing until the final prompt is confirmed, keeps the page
  with an error on failure, and retries a preview that failed to load. `lib/api/account`
  covers both requests' shapes. Legal pages (`docs/specs/legal-pages.md`): the sign-in
  screen says continuing accepts the terms and its two links open the terms and the
  privacy policy without signing in; the Account page's Legal section opens each of the
  three pages, with no `?lang` (`expo-web-browser` mocked).
- **Placeholder members** (`docs/specs/placeholder-members.md`): New group adds names,
  takes one back off, refuses a duplicate whatever the case, says so when the server finds
  one taken, and offers a sub-group its parent's placeholders; "+ Invite" sends friends and
  names together and refuses a name the tree has; the Manage tab tags a placeholder and
  offers This is me (only while the viewer can still claim), Rename (a prompt holding the
  current name) and Remove (warning that its part becomes Others), each confirming before
  it acts; the owner may leave when only placeholders remain, told they go with the group.
  After joining through a link, the person is asked whether they are one of the tree's
  placeholders, claims one after a confirmation naming what it brings, can say they are
  not on the list, is offered the rest when theirs was claimed meanwhile, and is not asked
  when already a member or unable to claim. `lib/api/groups` covers the new requests.
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
    participant in the request, never listed by "Who paid" / "To" on a new transaction
    or one a member paid, and kept as the payer or the transfer's recipient when a stored
    transaction is edited — listed last there, so picking a member can be undone (a
    stored null payer is not read as the viewer, an unpicked recipient is not read as
    Others);
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
